import { supabase } from './supabase';

export const REPORT_IMAGES_BUCKET = 'report-images';
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const SENSITIVE_IMAGE_FOLDER = 'sensitive';
export const NORMAL_SIGNED_URL_TTL_SECONDS = 300;
export const SENSITIVE_SIGNED_URL_TTL_SECONDS = 60;

export const isSensitiveImagePath = (value?: string | null): boolean => {
  if (!value) return false;
  const parts = value.split('/');
  return parts.length >= 3 && parts[1] === SENSITIVE_IMAGE_FOLDER;
};

const getSignedUrlTtl = (pathOrUrl?: string | null, expiresIn?: number): number => {
  const maximum = isSensitiveImagePath(pathOrUrl)
    ? SENSITIVE_SIGNED_URL_TTL_SECONDS
    : NORMAL_SIGNED_URL_TTL_SECONDS;
  return Math.max(1, Math.min(expiresIn ?? maximum, maximum));
};

const getCacheSafetyMarginMs = (ttlSeconds: number): number =>
  Math.min(30_000, Math.max(5_000, Math.floor(ttlSeconds * 1000 * 0.1)));

/**
 * Validates file type and size.
 */
export const validateImageFile = (file: File): { valid: boolean; error?: string } => {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'Please select a valid image format: JPG, PNG, or WebP.'
    };
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: 'Image is too large. Maximum allowed file size is 5 MB.'
    };
  }

  return { valid: true };
};

/**
 * Checks if a string is a storage path (as opposed to external https:// URL or data: URI).
 */
export const isStoragePath = (value?: string | null): boolean => {
  if (!value) return false;
  return (
    !value.startsWith('http://') &&
    !value.startsWith('https://') &&
    !value.startsWith('data:') &&
    !value.startsWith('blob:')
  );
};

// In-memory cache for signed URLs to minimize Supabase Storage API requests:
// maps storagePath -> { url: string, expiresAt: number }
interface CachedSignedUrl {
  url: string;
  expiresAt: number;
}
const signedUrlCache = new Map<string, CachedSignedUrl>();

/**
 * Clears the signed URL cache (e.g., on sign out).
 */
export const clearSignedUrlCache = (): void => {
  signedUrlCache.clear();
};

/**
 * Generates a unique, collision-resistant storage path inside the user's dedicated folder:
 * format: {userId}/{timestamp}-{randomId}.{ext}
 */
export const generateStoragePath = (userId: string, file: File, sensitive = false): string => {
  const rawExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const cleanExt = ['jpg', 'jpeg', 'png', 'webp'].includes(rawExt) ? rawExt : 'jpg';
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const folder = sensitive ? `${SENSITIVE_IMAGE_FOLDER}/` : '';
  return `${userId}/${folder}${uniqueId}.${cleanExt}`;
};

/**
 * Uploads an image file to the private `report-images` bucket under the user's folder.
 */
export const uploadReportImage = async (
  file: File,
  userId: string,
  sensitive = false
): Promise<{ path?: string; error?: string }> => {
  if (!supabase) {
    return { error: 'Supabase client is not available.' };
  }

  const validation = validateImageFile(file);
  if (!validation.valid) {
    return { error: validation.error };
  }

  const storagePath = generateStoragePath(userId, file, sensitive);

  try {
    const { error: uploadError } = await supabase.storage
      .from(REPORT_IMAGES_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      if (uploadError.message?.toLowerCase().includes('bucket not found')) {
        return {
          error: "Storage bucket 'report-images' not found. Please apply the storage migration in Supabase SQL Editor."
        };
      }
      return { error: uploadError.message };
    }

    return { path: storagePath };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Unexpected error during image upload.'
    };
  }
};

/**
 * Deletes an image from the `report-images` bucket given its storage path.
 */
export const deleteReportImage = async (
  path: string
): Promise<{ success: boolean; error?: string }> => {
  if (!supabase || !isStoragePath(path)) {
    return { success: true };
  }

  try {
    const { error } = await supabase.storage
      .from(REPORT_IMAGES_BUCKET)
      .remove([path]);

    if (error) {
      return { success: false, error: error.message };
    }

    signedUrlCache.delete(path);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete image.'
    };
  }
};

/**
 * Obtains a temporary signed URL for a private storage image.
 * Normal images: max 300s. Sensitive images: max 60s.
 */
export const getReportImageSignedUrl = async (
  pathOrUrl?: string | null,
  expiresIn?: number
): Promise<string | null> => {
  if (!pathOrUrl) return null;

  // External URLs or local preview URLs don't need signed URL resolution
  if (!isStoragePath(pathOrUrl)) {
    return pathOrUrl;
  }

  const ttl = getSignedUrlTtl(pathOrUrl, expiresIn);
  const safetyMargin = getCacheSafetyMarginMs(ttl);
  const cached = signedUrlCache.get(pathOrUrl);
  const now = Date.now();
  if (cached && cached.expiresAt > now + safetyMargin) {
    return cached.url;
  }

  if (!supabase) return null;

  try {
    const { data, error } = await supabase.storage
      .from(REPORT_IMAGES_BUCKET)
      .createSignedUrl(pathOrUrl, ttl);

    if (error || !data?.signedUrl) {
      return null;
    }

    signedUrlCache.set(pathOrUrl, {
      url: data.signedUrl,
      expiresAt: now + ttl * 1000
    });

    return data.signedUrl;
  } catch {
    return null;
  }
};

/**
 * Batch resolves signed URLs for normal report images only.
 * Sensitive images must be signed individually.
 */
export const batchResolveSignedUrls = async (
  paths: string[],
  expiresIn?: number
): Promise<Map<string, string>> => {
  const result = new Map<string, string>();
  const normalPaths = paths.filter(path => !isSensitiveImagePath(path));
  if (!supabase || normalPaths.length === 0) return result;

  const ttl = getSignedUrlTtl(undefined, expiresIn);
  const safetyMargin = getCacheSafetyMarginMs(ttl);
  const now = Date.now();
  const missingPaths: string[] = [];

  // Check cache first
  for (const path of normalPaths) {
    const cached = signedUrlCache.get(path);
    if (cached && cached.expiresAt > now + safetyMargin) {
      result.set(path, cached.url);
    } else {
      missingPaths.push(path);
    }
  }

  if (missingPaths.length === 0) return result;

  try {
    const { data, error } = await supabase.storage
      .from(REPORT_IMAGES_BUCKET)
      .createSignedUrls(missingPaths, ttl);

    if (!error && Array.isArray(data)) {
      data.forEach(item => {
        if (item.signedUrl && item.path) {
          result.set(item.path, item.signedUrl);
          signedUrlCache.set(item.path, {
            url: item.signedUrl,
            expiresAt: now + ttl * 1000
          });
        }
      });
    }
  } catch {
    // Graceful fallback: return whatever was resolved from cache
  }

  return result;
};

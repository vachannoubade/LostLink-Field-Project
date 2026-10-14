import { supabase } from './supabase';

export const REPORT_IMAGES_BUCKET = 'report-images';
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
export const generateStoragePath = (userId: string, file: File): string => {
  const rawExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const cleanExt = ['jpg', 'jpeg', 'png', 'webp'].includes(rawExt) ? rawExt : 'jpg';
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  return `${userId}/${uniqueId}.${cleanExt}`;
};

/**
 * Uploads an image file to the private `report-images` bucket under the user's folder.
 */
export const uploadReportImage = async (
  file: File,
  userId: string
): Promise<{ path?: string; error?: string }> => {
  if (!supabase) {
    return { error: 'Supabase client is not available.' };
  }

  const validation = validateImageFile(file);
  if (!validation.valid) {
    return { error: validation.error };
  }

  const storagePath = generateStoragePath(userId, file);

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
 * Returns cached URL if still fresh (with 5-minute safety margin).
 */
export const getReportImageSignedUrl = async (
  pathOrUrl?: string | null,
  expiresIn = 3600
): Promise<string | null> => {
  if (!pathOrUrl) return null;

  // External URLs or local preview URLs don't need signed URL resolution
  if (!isStoragePath(pathOrUrl)) {
    return pathOrUrl;
  }

  const cached = signedUrlCache.get(pathOrUrl);
  const now = Date.now();
  if (cached && cached.expiresAt > now + 300 * 1000) {
    return cached.url;
  }

  if (!supabase) return null;

  try {
    const { data, error } = await supabase.storage
      .from(REPORT_IMAGES_BUCKET)
      .createSignedUrl(pathOrUrl, expiresIn);

    if (error || !data?.signedUrl) {
      return null;
    }

    signedUrlCache.set(pathOrUrl, {
      url: data.signedUrl,
      expiresAt: now + expiresIn * 1000
    });

    return data.signedUrl;
  } catch {
    return null;
  }
};

/**
 * Batch resolves signed URLs for a list of storage paths in a single network round-trip.
 */
export const batchResolveSignedUrls = async (
  paths: string[],
  expiresIn = 3600
): Promise<Map<string, string>> => {
  const result = new Map<string, string>();
  if (!supabase || paths.length === 0) return result;

  const now = Date.now();
  const missingPaths: string[] = [];

  // Check cache first
  for (const path of paths) {
    const cached = signedUrlCache.get(path);
    if (cached && cached.expiresAt > now + 300 * 1000) {
      result.set(path, cached.url);
    } else {
      missingPaths.push(path);
    }
  }

  if (missingPaths.length === 0) return result;

  try {
    const { data, error } = await supabase.storage
      .from(REPORT_IMAGES_BUCKET)
      .createSignedUrls(missingPaths, expiresIn);

    if (!error && Array.isArray(data)) {
      data.forEach(item => {
        if (item.signedUrl && item.path) {
          result.set(item.path, item.signedUrl);
          signedUrlCache.set(item.path, {
            url: item.signedUrl,
            expiresAt: now + expiresIn * 1000
          });
        }
      });
    }
  } catch {
    // Graceful fallback: return whatever was resolved from cache
  }

  return result;
};

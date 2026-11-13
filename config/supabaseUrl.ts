export interface SupabaseUrlValidationOptions {
  allowLocalhost?: boolean
}

export type SupabaseUrlValidationResult =
  | { valid: true; url: string }
  | { valid: false; error: string }

const SUPABASE_HOST_SUFFIX = '.supabase.co'
const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const ALLOWED_PATHS = new Set(['', '/', '/rest/v1', '/rest/v1/'])

const containsControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || codePoint === 0x7f
  })

const containsNonAsciiCharacter = (value: string): boolean =>
  [...value].some((character) => (character.codePointAt(0) ?? 0) > 0x7f)

const isLocalhost = (hostname: string): boolean => LOCALHOST_HOSTS.has(hostname)

const isValidHostname = (hostname: string): boolean => {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return true
  }
  if (!hostname || hostname.length > 253) {
    return false
  }

  return hostname.split('.').every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  )
}

const isSupabaseHostname = (hostname: string): boolean =>
  hostname.length > SUPABASE_HOST_SUFFIX.length && hostname.endsWith(SUPABASE_HOST_SUFFIX)

export const validateSupabaseUrl = (
  value: string | undefined,
  options: SupabaseUrlValidationOptions = {}
): SupabaseUrlValidationResult => {
  const candidate = value?.trim()
  if (!candidate) {
    return { valid: false, error: 'VITE_SUPABASE_URL is required.' }
  }

  if (candidate.includes('\\')) {
    return { valid: false, error: 'VITE_SUPABASE_URL must not contain backslashes.' }
  }

  if (/\s/.test(candidate) || containsControlCharacter(candidate)) {
    return {
      valid: false,
      error: 'VITE_SUPABASE_URL must not contain whitespace or control characters.'
    }
  }

  if (containsNonAsciiCharacter(candidate)) {
    return { valid: false, error: 'VITE_SUPABASE_URL must contain only ASCII characters.' }
  }

  if (candidate.includes('@')) {
    return {
      valid: false,
      error: 'VITE_SUPABASE_URL must not contain user-info syntax, including username or password credentials.'
    }
  }

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return { valid: false, error: 'VITE_SUPABASE_URL must be a valid absolute URL.' }
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: 'VITE_SUPABASE_URL must not contain username or password credentials.'
    }
  }

  if (parsed.search) {
    return { valid: false, error: 'VITE_SUPABASE_URL must not contain query parameters.' }
  }

  if (parsed.hash) {
    return { valid: false, error: 'VITE_SUPABASE_URL must not contain a fragment.' }
  }

  const hostname = parsed.hostname.toLowerCase()
  if (!isValidHostname(hostname)) {
    return { valid: false, error: 'VITE_SUPABASE_URL must contain a valid hostname.' }
  }

  const localhost = isLocalhost(hostname)
  if (localhost) {
    if (!options.allowLocalhost) {
      return {
        valid: false,
        error: 'VITE_SUPABASE_URL must use a Supabase project hostname outside local development.'
      }
    }
  } else if (!isSupabaseHostname(hostname)) {
    return { valid: false, error: 'VITE_SUPABASE_URL must use a *.supabase.co hostname.' }
  }

  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && localhost && options.allowLocalhost)) {
    return {
      valid: false,
      error: 'VITE_SUPABASE_URL must use HTTPS. HTTP is allowed only for localhost development.'
    }
  }

  if (!localhost && parsed.port !== '') {
    return {
      valid: false,
      error: 'VITE_SUPABASE_URL must use the standard HTTPS port.'
    }
  }

  if (!ALLOWED_PATHS.has(parsed.pathname)) {
    return {
      valid: false,
      error: 'VITE_SUPABASE_URL must be a Supabase project origin without an unsupported path.'
    }
  }

  return { valid: true, url: parsed.origin }
}

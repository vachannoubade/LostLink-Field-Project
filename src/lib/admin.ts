export interface TrustedRoleSource {
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}

export type TrustedRole = 'admin' | 'desk_operator' | 'staff' | 'student';

export const INITIAL_ADMIN_EMAIL = 'vachannoubade@gmail.com';

export const isAuthorizedInitialAdminEmail = (email?: string | null): boolean => {
  return typeof email === 'string' && email.trim().toLowerCase() === INITIAL_ADMIN_EMAIL.toLowerCase();
};

/**
 * Validates that an internal redirect target starts with '/' and prevents
 * protocol-relative URLs (//evil.com), backslash tricks, or protocol injection.
 */
export const getSafeInternalDestination = (target?: string | null, fallback = '/admin'): string => {
  if (target && target.startsWith('/') && !target.startsWith('//') && !target.includes('\\') && !target.includes('://')) {
    return target;
  }
  return fallback;
};

/**
 * Operational permissions must derive from server-controlled app_metadata.
 * Never allow users to grant themselves staff, desk_operator or admin privileges
 * using user_metadata, URL parameters or client requests.
 */
export const getTrustedRole = (user?: TrustedRoleSource | null): TrustedRole => {
  const role = user?.app_metadata?.role;
  if (typeof role === 'string') {
    if (role === 'admin') return 'admin';
    if (role === 'desk_operator') return 'desk_operator';
    if (role === 'staff') return 'staff';
  }
  return 'student';
};

export const isTrustedAdminUser = (user?: TrustedRoleSource | null): boolean => {
  if (getTrustedRole(user) !== 'admin') {
    return false;
  }
  if (user && typeof user.email === 'string') {
    return isAuthorizedInitialAdminEmail(user.email);
  }
  return true;
};

export const isTrustedDeskOperator = (user?: TrustedRoleSource | null): boolean => {
  const role = getTrustedRole(user);
  return role === 'admin' || role === 'desk_operator';
};

export const isTrustedStaffUser = (user?: TrustedRoleSource | null): boolean => {
  const role = getTrustedRole(user);
  return role === 'admin' || role === 'desk_operator' || role === 'staff';
};

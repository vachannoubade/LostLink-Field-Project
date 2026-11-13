export interface TrustedRoleSource {
  app_metadata?: Record<string, unknown> | null;
}

export type TrustedRole = 'admin' | 'student';

/**
 * Administrative identity must only come from Supabase app_metadata, which is
 * server-controlled. Never derive admin access from user_metadata, local
 * storage, or a profiles row that the user can edit.
 */
export const getTrustedRole = (user?: TrustedRoleSource | null): TrustedRole => {
  const role = user?.app_metadata?.role;
  return typeof role === 'string' && role === 'admin' ? 'admin' : 'student';
};

export const isTrustedAdminUser = (user?: TrustedRoleSource | null): boolean =>
  getTrustedRole(user) === 'admin';

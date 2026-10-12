import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authProvider: 'supabase' | 'node-backend';
  accessToken: string | null;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signup: (name: string, email: string, password: string) => Promise<{ error?: string; needsEmailVerification?: boolean }>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error?: string; message?: string; resetUrl?: string }>;
  confirmPasswordReset: (email: string, token: string, newPassword: string) => Promise<{ error?: string; message?: string }>;
  updateAuthenticatedProfile: (updates: Partial<User>) => Promise<{ error?: string; user?: User }>;
  authorizeBackendAction: (action: string, resourceOwnerId?: string) => Promise<{ authorized: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'lostlink_v2_jwt';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const authProvider = isSupabaseConfigured ? 'supabase' : 'node-backend';

  // Map Supabase user metadata to LostLink User interface
  const mapSupabaseUser = (sbUser: any): User => ({
    id: sbUser.id,
    name: sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0] || 'Campus Member',
    email: sbUser.email || '',
    role: sbUser.user_metadata?.role || 'Verified Campus Member',
    department: sbUser.user_metadata?.department || 'Campus Community',
    studentId: sbUser.user_metadata?.student_id || `ID-${sbUser.id.slice(0, 6).toUpperCase()}`,
    bio: sbUser.user_metadata?.bio || 'Member of the LostLink Campus Kindness Network.',
    phone: sbUser.user_metadata?.phone || '',
    karmaPoints: sbUser.user_metadata?.karma_points ?? 100,
    reunionsHelped: sbUser.user_metadata?.reunions_helped ?? 0
  });

  // Restore session on mount
  useEffect(() => {
    let mounted = true;

    async function initSession() {
      setIsLoading(true);
      try {
        if (isSupabaseConfigured && supabase) {
          const { data, error } = await supabase.auth.getSession();
          if (!error && data.session?.user && mounted) {
            setCurrentUser(mapSupabaseUser(data.session.user));
            setAccessToken(data.session.access_token);
          }
        } else {
          const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
          const headers: Record<string, string> = {};
          if (savedToken) {
            headers['Authorization'] = `Bearer ${savedToken}`;
          }
          const res = await fetch('/api/auth/me', {
            method: 'GET',
            headers,
            credentials: 'include'
          });
          if (res.ok) {
            const data = await res.json();
            if (mounted && data.user) {
              setCurrentUser(data.user);
              if (data.session?.accessToken) {
                setAccessToken(data.session.accessToken);
                localStorage.setItem(TOKEN_STORAGE_KEY, data.session.accessToken);
              }
            }
          } else {
            localStorage.removeItem(TOKEN_STORAGE_KEY);
            if (mounted) {
              setCurrentUser(null);
              setAccessToken(null);
            }
          }
        }
      } catch {
        // Network error or offline
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initSession();

    if (isSupabaseConfigured && supabase) {
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        if (session?.user) {
          setCurrentUser(mapSupabaseUser(session.user));
          setAccessToken(session.access_token);
        } else {
          setCurrentUser(null);
          setAccessToken(null);
        }
      });
      return () => {
        mounted = false;
        listener.subscription.unsubscribe();
      };
    }

    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email: string, password: string): Promise<{ error?: string }> => {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (error) {
          return { error: error.message };
        }
        if (data.user) {
          setCurrentUser(mapSupabaseUser(data.user));
          setAccessToken(data.session?.access_token || null);
        }
        return {};
      }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || 'Login failed. Please check your credentials.' };
      }

      setCurrentUser(data.user);
      if (data.session?.accessToken) {
        setAccessToken(data.session.accessToken);
        localStorage.setItem(TOKEN_STORAGE_KEY, data.session.accessToken);
      }
      return {};
    } catch {
      return { error: 'Network error: Unable to reach the authentication server. Please check your connection.' };
    }
  };

  const signup = async (
    name: string,
    email: string,
    password: string
  ): Promise<{ error?: string; needsEmailVerification?: boolean }> => {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: name.trim(),
              role: 'Verified Campus Member',
              karma_points: 100,
              reunions_helped: 0
            }
          }
        });
        if (error) {
          return { error: error.message };
        }
        if (data.user && !data.session) {
          return { needsEmailVerification: true };
        }
        if (data.user && data.session) {
          setCurrentUser(mapSupabaseUser(data.user));
          setAccessToken(data.session.access_token);
        }
        return {};
      }

      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || 'Registration failed. Please try again.' };
      }

      setCurrentUser(data.user);
      if (data.session?.accessToken) {
        setAccessToken(data.session.accessToken);
        localStorage.setItem(TOKEN_STORAGE_KEY, data.session.accessToken);
      }
      return {};
    } catch {
      return { error: 'Network error: Unable to reach the authentication server. Please try again.' };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      if (isSupabaseConfigured && supabase) {
        await supabase.auth.signOut();
      } else {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include'
        });
      }
    } finally {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      setCurrentUser(null);
      setAccessToken(null);
    }
  };

  const requestPasswordReset = async (
    email: string
  ): Promise<{ error?: string; message?: string; resetUrl?: string }> => {
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`
        });
        if (error) return { error: error.message };
        return {
          message: 'If an account is registered with that email, a password recovery link has been sent to your inbox.'
        };
      }

      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || 'Could not process password reset request.' };
      }
      return { message: data.message, resetUrl: data.resetUrl };
    } catch {
      return { error: 'Network error while requesting password reset.' };
    }
  };

  const confirmPasswordReset = async (
    email: string,
    token: string,
    newPassword: string
  ): Promise<{ error?: string; message?: string }> => {
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) return { error: error.message };
        return { message: 'Your password has been updated! You can now sign in.' };
      }

      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, newPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || 'Failed to reset password.' };
      }
      return { message: data.message };
    } catch {
      return { error: 'Network error while resetting password.' };
    }
  };

  const updateAuthenticatedProfile = async (
    updates: Partial<User>
  ): Promise<{ error?: string; user?: User }> => {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.updateUser({
          data: {
            full_name: updates.name,
            role: updates.role,
            department: updates.department,
            student_id: updates.studentId,
            bio: updates.bio,
            phone: updates.phone,
            karma_points: updates.karmaPoints,
            reunions_helped: updates.reunionsHelped
          }
        });
        if (error) return { error: error.message };
        if (data.user) {
          const updated = mapSupabaseUser(data.user);
          setCurrentUser(updated);
          return { user: updated };
        }
        return {};
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || 'Unauthorized to update profile.' };
      }
      setCurrentUser(data.user);
      return { user: data.user };
    } catch {
      return { error: 'Network error while updating profile.' };
    }
  };

  const authorizeBackendAction = useCallback(
    async (action: string, resourceOwnerId?: string): Promise<{ authorized: boolean; error?: string }> => {
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.user) {
          return { authorized: false, error: 'Please log in to perform this action.' };
        }
        if (action === 'delete_report' && resourceOwnerId && resourceOwnerId !== data.session.user.id) {
          return { authorized: false, error: 'You can only delete reports that you created.' };
        }
        return { authorized: true };
      }

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

        const res = await fetch('/api/reports/authorize', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ action, resourceOwnerId })
        });
        const data = await res.json();
        if (!res.ok) {
          return { authorized: false, error: data.error || 'Unauthorized operation.' };
        }
        return { authorized: true };
      } catch {
        return { authorized: false, error: 'Unable to verify authorization with backend server.' };
      }
    },
    [accessToken]
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: Boolean(currentUser),
        isLoading,
        authProvider,
        accessToken,
        login,
        signup,
        logout,
        requestPasswordReset,
        confirmPasswordReset,
        updateAuthenticatedProfile,
        authorizeBackendAction
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Session, AuthError } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { User } from '../types';
import { demoUser } from './seedData';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SignUpResult {
  error: AuthError | Error | null;
  needsEmailConfirmation?: boolean;
  hasSession?: boolean;
}

export interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  isConfigured: boolean;
  isDemoMode: boolean;
  isDemo: boolean;
  isAuthenticated: boolean;
  isPasswordRecovery: boolean;
  signUp: (email: string, password: string, name: string) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | Error | null }>;
  updatePassword: (password: string) => Promise<{ error: AuthError | Error | null }>;
  resendConfirmation: (email: string) => Promise<{ error: AuthError | Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(() => {
    // If Supabase is not configured, initialize with demo user
    return !isSupabaseConfigured ? demoUser : null;
  });
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);

  const isDemoMode = !isSupabaseConfigured || (!loading && !session && Boolean(user?.isDemo));
  const isAuthenticated = Boolean(!loading && session && user && !user.isDemo);
  const isDemo = isDemoMode;

  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      return (
        hash.includes('type=recovery') ||
        search.includes('type=recovery') ||
        search.includes('mode=update-password')
      );
    }
    return false;
  });

  const loadProfile = useCallback(async (currentSession: Session): Promise<User> => {
    const userId = currentSession.user.id;
    const userEmail = currentSession.user.email || '';
    let userName = currentSession.user.user_metadata?.name || 
                   currentSession.user.user_metadata?.full_name || 
                   '';

    if (!userName && userEmail) {
      userName = userEmail.split('@')[0];
    }

    // Call database RPC ensure_profile_exists (takes zero arguments in SQL schema)
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('ensure_profile_exists');
        if (!error && data && typeof data === 'object') {
          const profileData = data as { name?: string };
          if (profileData.name) {
            userName = profileData.name;
          }
        } else if (error) {
          // Graceful fallback: try direct select from profiles if RPC had issues
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', userId)
            .maybeSingle();

          if (profileRow?.name) {
            userName = profileRow.name;
          }
        }
      } catch {
        // Safe catch to prevent infinite loading state
      }
    }

    return {
      id: userId,
      name: userName || 'Campus Student',
      email: userEmail,
      isDemo: false
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session) {
      const updatedUser = await loadProfile(session);
      setUser(updatedUser);
    }
  }, [session, loadProfile]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    let initialSyncDone = false;

    // Listen for auth state transitions (sign in, sign out, token refresh, password recovery)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!isMounted) return;

        initialSyncDone = true;
        setSession(currentSession);
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        }

        if (currentSession) {
          const profileUser = await loadProfile(currentSession);
          if (isMounted) {
            setUser(profileUser);
            setLoading(false);
          }
        } else {
          setUser(null);
          setLoading(false);
        }
      }
    );

    // Initial session retrieval fallback in case onAuthStateChange is delayed
    supabase.auth.getSession().then(async ({ data: { session: initialSession }, error }) => {
      if (!isMounted || initialSyncDone) return;

      if (error || !initialSession) {
        if (isMounted) {
          setLoading(false);
        }
        return;
      }

      setSession(initialSession);
      const profileUser = await loadProfile(initialSession);
      if (isMounted) {
        setUser(profileUser);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signUp = async (email: string, password: string, name: string): Promise<SignUpResult> => {
    if (!supabase) {
      return { error: new Error('Supabase is not configured. Running in Demo Mode.'), hasSession: false, needsEmailConfirmation: false };
    }

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            name: name.trim(),
            full_name: name.trim()
          }
        }
      });

      if (error) {
        return { error, hasSession: false, needsEmailConfirmation: false };
      }

      if (data.session) {
        setSession(data.session);
        const profileUser = await loadProfile(data.session);
        setUser(profileUser);
        return { error: null, hasSession: true, needsEmailConfirmation: false };
      }

      // If user was created but session is null, Supabase requires email verification
      return {
        error: null,
        hasSession: false,
        needsEmailConfirmation: Boolean(data.user && !data.session)
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err : new Error('An unexpected error occurred during signup.'),
        hasSession: false,
        needsEmailConfirmation: false
      };
    }
  };

  const signIn = async (email: string, password: string) => {
    if (!supabase) {
      return { error: new Error('Supabase is not configured. Running in Demo Mode.') };
    }

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });

      if (error) {
        return { error };
      }

      if (data.session) {
        setSession(data.session);
        const profileUser = await loadProfile(data.session);
        setUser(profileUser);
      }

      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('An unexpected error occurred during signin.') };
    }
  };

  const resetPassword = async (email: string): Promise<{ error: AuthError | Error | null }> => {
    if (!supabase) {
      return { error: new Error('Supabase is not configured. Running in Demo Mode.') };
    }

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const redirectUrl = `${window.location.origin}/auth?mode=update-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: redirectUrl
      });

      return { error };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Failed to send password reset request.') };
    }
  };

  const updatePassword = async (password: string): Promise<{ error: AuthError | Error | null }> => {
    if (!supabase) {
      return { error: new Error('Supabase is not configured. Running in Demo Mode.') };
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password
      });

      if (!error) {
        setIsPasswordRecovery(false);
      }

      return { error };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Failed to update password.') };
    }
  };

  const resendConfirmation = async (email: string): Promise<{ error: AuthError | Error | null }> => {
    if (!supabase) {
      return { error: new Error('Supabase is not configured. Running in Demo Mode.') };
    }

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail
      });

      return { error };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Failed to resend confirmation email.') };
    }
  };

  const signOut = async () => {
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // Ignore signout network errors
      }
    }
    setSession(null);
    setIsPasswordRecovery(false);
    if (!isSupabaseConfigured) {
      setUser(demoUser);
    } else {
      setUser(null);
    }
  };

  const profile: UserProfile | null = user ? {
    id: user.id,
    name: user.name,
    email: user.email,
    role: 'student'
  } : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        isConfigured: isSupabaseConfigured,
        isDemoMode,
        isDemo,
        isAuthenticated,
        isPasswordRecovery,
        signUp,
        signIn,
        signOut,
        resetPassword,
        updatePassword,
        resendConfirmation,
        refreshProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

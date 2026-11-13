import React, { useState, useEffect, useCallback } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, PackageSearch, ShieldAlert, AlertTriangle, RefreshCw, LogOut } from 'lucide-react';
import { useAuth } from '../store/AuthContext';
import { supabase } from '../lib/supabase';
import { isTrustedAdminUser } from '../lib/admin';

// Strict validation of internal redirect destinations (blocks open redirects)
const getSafeInternalDestination = (pathname: string, search: string): string => {
  const full = pathname + search;
  if (full.startsWith('/') && !full.startsWith('//') && !full.includes('\\') && !full.includes('://')) {
    return full;
  }
  return '/admin';
};

export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, loading: authLoading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [verifying, setVerifying] = useState<boolean>(true);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const verifyServerAuthorization = useCallback(async () => {
    if (!session) {
      setIsAuthorized(false);
      setVerifying(false);
      return;
    }

    setVerifying(true);
    setVerificationError(null);

    try {
      // 1. Initial client-side filter
      if (!isTrustedAdminUser(session.user)) {
        setIsAuthorized(false);
        setVerifying(false);
        return;
      }

      // 2. Authoritative server-side authorization check (never relies on client metadata)
      if (!supabase) {
        setVerificationError('Supabase client connection unavailable.');
        setIsAuthorized(false);
        setVerifying(false);
        return;
      }

      const { data, error } = await supabase.rpc('can_access_admin_portal');
      if (error) {
        setVerificationError(error.message);
        setIsAuthorized(false);
      } else {
        setIsAuthorized(Boolean(data));
      }
    } catch (err) {
      setVerificationError(err instanceof Error ? err.message : 'Administrative authorization check failed.');
      setIsAuthorized(false);
    } finally {
      setVerifying(false);
    }
  }, [session]);

  useEffect(() => {
    if (!authLoading) {
      void verifyServerAuthorization();
    }
  }, [authLoading, verifyServerAuthorization]);

  // 1. Loading / Verifying state
  if (authLoading || (session && verifying)) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: '16px'
        }}
        aria-live="polite"
        aria-busy="true"
      >
        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '16px',
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <PackageSearch size={30} />
        </motion.div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.92rem', fontWeight: 500 }}>
          Verifying administrative authorization...
        </div>
      </div>
    );
  }

  // 2. Not authenticated -> redirect to admin login with validated destination
  if (!session) {
    const destination = getSafeInternalDestination(location.pathname, location.search);
    const redirectUrl = `/admin/login?redirectTo=${encodeURIComponent(destination)}`;
    return <Navigate to={redirectUrl} replace />;
  }

  // 3. Server verification error (network or temporary database failure)
  if (verificationError) {
    return (
      <div style={{ maxWidth: '520px', margin: '60px auto', padding: '0 20px' }}>
        <div className="card" style={{ padding: '36px 28px', textAlign: 'center', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              backgroundColor: 'var(--danger-light)',
              color: 'var(--danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}
          >
            <AlertTriangle size={28} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 650, color: 'var(--text-main)', marginBottom: '8px' }}>
            Authorization Verification Failed
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', lineHeight: 1.5, marginBottom: '20px' }}>
            {verificationError}
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void verifyServerAuthorization()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem' }}
            >
              <RefreshCw size={14} /> Retry Verification
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/')}
              style={{ fontSize: '0.84rem' }}
            >
              Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Authenticated but unauthorized (student or non-admin account)
  if (!isAuthorized) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ maxWidth: '540px', margin: '56px auto', padding: '0 20px' }}
      >
        <div className="card" style={{ padding: '40px 32px', textAlign: 'center', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              backgroundColor: 'var(--danger-light)',
              color: 'var(--danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px'
            }}
          >
            <ShieldAlert size={28} />
          </div>
          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
            RESTRICTED AUDIT CONSOLE
          </div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 650, color: 'var(--text-main)', marginBottom: '8px', letterSpacing: '-0.02em' }}>
            Administrator Access Denied
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.55, marginBottom: '24px' }}>
            Your account does not possess active, server-verified administrator credentials. Access to this console is strictly audited.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                await signOut();
                navigate('/admin/login');
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem' }}
            >
              <LogOut size={14} /> Switch Account
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem' }}
            >
              <ArrowLeft size={14} /> Return to LostLink
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // 5. Authenticated and verified administrator
  return <>{children}</>;
};

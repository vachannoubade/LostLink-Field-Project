import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, PackageSearch, ShieldAlert } from 'lucide-react';
import { useAuth } from '../store/AuthContext';

export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, loading, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) {
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
          animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <PackageSearch size={32} />
        </motion.div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 500 }}>
          Verifying administrative session...
        </div>
      </div>
    );
  }

  if (!session) {
    const redirectUrl = `/login?redirectTo=${encodeURIComponent(location.pathname + location.search)}`;
    return <Navigate to={redirectUrl} replace />;
  }

  if (!isAdmin) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ maxWidth: '560px', margin: '48px auto', paddingBottom: '40px' }}
      >
        <div className="card" style={{ padding: '40px 32px', textAlign: 'center' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '18px',
              backgroundColor: 'var(--danger-light)',
              color: 'var(--danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px'
            }}
          >
            <ShieldAlert size={30} />
          </div>
          <div className="mono-token mono-token-subtle" style={{ marginBottom: '10px' }}>
            RESTRICTED REGISTRY
          </div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '8px', letterSpacing: '-0.03em' }}>
            Administrator access required
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: '24px' }}>
            This area contains archived and sensitive campus records. Your current
            session does not carry the server-issued administrator role.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <ArrowLeft size={16} />
            Return to Dashboard
          </button>
        </div>
      </motion.div>
    );
  }

  return <>{children}</>;
};

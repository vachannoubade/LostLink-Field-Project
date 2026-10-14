import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { Mail, Shield, User as UserIcon, LogOut, CheckCircle2, AlertCircle, Database, LogIn } from 'lucide-react';

export const Profile: React.FC = () => {
  const { user, profile, isDemo, isConfigured, isAuthenticated, signOut } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      setLoggingOut(true);
      setError(null);
      await signOut();
      navigate('/login');
    } catch (err: any) {
      setError(err?.message || 'Failed to sign out. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  };

  const displayName = profile?.name || user?.name || 'Student User';
  const displayEmail = profile?.email || user?.email || 'student@university.edu';
  const displayId = profile?.id || user?.id || '—';
  const avatarLetter = displayName.charAt(0).toUpperCase() || 'U';

  return (
    <div style={{ paddingBottom: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '4px' }}>Account & Profile</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>Manage your student identity and active session settings.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isAuthenticated && (
            <button
              onClick={handleSignOut}
              disabled={loggingOut}
              className="btn btn-outline"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderColor: 'var(--danger)',
                color: 'var(--danger)'
              }}
            >
              <LogOut size={16} />
              <span>{loggingOut ? 'Signing out...' : 'Sign Out'}</span>
            </button>
          )}

          {isDemo && isConfigured && (
            <button
              onClick={() => navigate('/login')}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <LogIn size={16} />
              <span>Sign In with Real Account</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '14px 18px',
          backgroundColor: '#FEE2E2',
          border: '1px solid #FCA5A5',
          borderRadius: '12px',
          color: '#991B1B',
          marginBottom: '24px',
          fontSize: '0.95rem'
        }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Account Type Banner */}
      {isDemo ? (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px',
          padding: '16px 20px',
          backgroundColor: '#FEF3C7',
          border: '1px solid #FCD34D',
          borderRadius: '12px',
          color: '#92400E',
          marginBottom: '24px',
          fontSize: '0.92rem',
          lineHeight: 1.5
        }}>
          <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px', color: '#D97706' }} />
          <div>
            <strong style={{ display: 'block', marginBottom: '2px' }}>Currently Browsing in Demo Mode</strong>
            <span>
              You are currently using the local demo profile (Alex Johnson). Reports and changes are saved locally in browser storage.
              {isConfigured ? ' Supabase is configured: you can sign in or create a student account at any time.' : ' Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment to activate live authentication.'}
            </span>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '14px 18px',
          backgroundColor: '#ECFDF5',
          border: '1px solid #A7F3D0',
          borderRadius: '12px',
          color: '#065F46',
          marginBottom: '24px',
          fontSize: '0.92rem'
        }}>
          <CheckCircle2 size={20} style={{ color: '#10B981', flexShrink: 0 }} />
          <div>
            <strong>Supabase Authenticated Session:</strong> You are logged in with verified credentials and row-level security is active.
          </div>
        </div>
      )}

      <div className="card" style={{ maxWidth: '680px' }}>
        <div style={{
          padding: '40px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          backgroundColor: '#FAFBFC'
        }}>
          <div style={{
            width: '96px',
            height: '96px',
            borderRadius: '50%',
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.5rem',
            fontWeight: 700,
            marginBottom: '16px',
            boxShadow: '0 8px 16px rgba(81, 70, 229, 0.15)'
          }}>
            {avatarLetter}
          </div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '6px', color: 'var(--text-main)', fontWeight: 700 }}>
            {displayName}
          </h2>
          <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', marginBottom: '12px' }}>
            <Mail size={16} />
            <span>{displayEmail}</span>
          </div>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: '999px',
            fontSize: '0.8rem',
            fontWeight: 600,
            backgroundColor: isDemo ? '#FEF3C7' : '#ECFDF5',
            color: isDemo ? '#B45309' : '#047857',
            border: `1px solid ${isDemo ? '#FDE68A' : '#A7F3D0'}`
          }}>
            {isDemo ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
            {isDemo ? 'Demo User' : 'Authenticated Student'}
          </span>
        </div>

        <div style={{ padding: '32px' }}>
          <h3 style={{ fontSize: '1.125rem', marginBottom: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserIcon size={20} style={{ color: 'var(--primary)' }} />
            Account Information
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label className="form-label" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Full Name</label>
              <input
                type="text"
                className="form-control"
                value={displayName}
                readOnly
                disabled
                style={{ backgroundColor: '#F8F9FC', borderColor: 'var(--border)' }}
              />
            </div>

            <div>
              <label className="form-label" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>University Email</label>
              <input
                type="text"
                className="form-control"
                value={displayEmail}
                readOnly
                disabled
                style={{ backgroundColor: '#F8F9FC', borderColor: 'var(--border)' }}
              />
            </div>

            <div>
              <label className="form-label" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>User Identifier (UUID / ID)</label>
              <input
                type="text"
                className="form-control"
                value={displayId}
                readOnly
                disabled
                style={{ backgroundColor: '#F8F9FC', borderColor: 'var(--border)', fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
            </div>

            <div>
              <label className="form-label" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Security & Provider</label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 14px',
                borderRadius: '8px',
                backgroundColor: '#F8F9FC',
                border: '1px solid var(--border)',
                fontSize: '0.9rem',
                color: 'var(--text-main)'
              }}>
                <Shield size={16} style={{ color: 'var(--primary)' }} />
                <span>
                  {isAuthenticated ? 'Supabase Auth (JWT with RLS Enforcement)' : 'Local Storage Demo Authentication'}
                </span>
              </div>
            </div>
          </div>

          <div style={{
            marginTop: '32px',
            paddingTop: '24px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <Database size={16} />
              <span>Backend status: {isConfigured ? 'Supabase Connected' : 'Demo Local Mode'}</span>
            </div>

            {isAuthenticated && (
              <button
                onClick={handleSignOut}
                disabled={loggingOut}
                className="btn btn-outline"
                style={{ borderColor: 'var(--border)', color: 'var(--text-main)', fontSize: '0.9rem' }}
              >
                {loggingOut ? 'Signing out...' : 'Sign Out of Account'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

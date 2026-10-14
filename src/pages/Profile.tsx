import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { 
  Mail, Shield, User as UserIcon, LogOut, CheckCircle2, 
  AlertCircle, Database, LogIn, FolderOpen, Sparkles, ChevronRight 
} from 'lucide-react';

export const Profile: React.FC = () => {
  const { user, profile, isDemo, isConfigured, isAuthenticated, signOut } = useAuth();
  const { reports, matches } = useData();
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

  const userReports = reports.filter(r => r.userId === (user?.id || ''));
  const pendingMatches = matches.filter(m => m.status === 'pending');

  return (
    <div style={{ paddingBottom: '48px', maxWidth: '820px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span className="mono-token mono-token-amber">STUDENT REGISTRY</span>
            <span className="mono-token mono-token-subtle">IDENTITY CREDENTIAL</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.5rem', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '-0.025em', margin: 0, lineHeight: 1.15 }}>
            Student Dossier & Credentials
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.98rem', marginTop: '6px', maxWidth: '620px', lineHeight: 1.5 }}>
            Verified campus identity, session parameters, and cryptographic access credentials.
          </p>
        </div>

        <div className="profile-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
          {isAuthenticated && (
            <button
              onClick={handleSignOut}
              disabled={loggingOut}
              className="btn btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderColor: '#FCA5A5',
                color: '#991B1B',
                fontSize: '0.84rem',
                padding: '8px 16px'
              }}
            >
              <LogOut size={15} />
              <span>{loggingOut ? 'Signing out...' : 'Sign Out'}</span>
            </button>
          )}

          {isDemo && isConfigured && (
            <button
              onClick={() => navigate('/login')}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', padding: '8px 18px' }}
            >
              <LogIn size={15} />
              <span>Connect Live Account</span>
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
          borderRadius: '8px',
          color: '#991B1B',
          marginBottom: '24px',
          fontSize: '0.9rem'
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Account Type Banner */}
      {isDemo ? (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px',
          padding: '18px 20px',
          backgroundColor: '#FEF3C7',
          border: '1px solid #FDE68A',
          borderRadius: '8px',
          color: '#92400E',
          marginBottom: '24px',
          fontSize: '0.88rem',
          lineHeight: 1.55
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px', color: '#B45309' }} />
          <div>
            <strong style={{ display: 'block', marginBottom: '2px', color: '#78350F', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              DEMO CREDENTIAL MODE ACTIVE
            </strong>
            <span>
              Operating under local demonstration profile ({displayName}). Reports and changes are preserved locally in browser session storage.
              {isConfigured ? ' Live Supabase instance connected — you can sign in with your campus account at any time.' : ' Configure environment parameters to enable live multi-user persistence.'}
            </span>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '16px 20px',
          backgroundColor: '#ECFDF5',
          border: '1px solid #A7F3D0',
          borderRadius: '8px',
          color: '#065F46',
          marginBottom: '24px',
          fontSize: '0.88rem'
        }}>
          <CheckCircle2 size={18} style={{ color: '#047857', flexShrink: 0 }} />
          <div>
            <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              AUTHENTICATED LIVE SESSION:
            </strong> Logged in via Supabase Auth with Row-Level Security active.
          </div>
        </div>
      )}

      {/* Quick Navigation Cards */}
      <div className="profile-nav-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div 
          onClick={() => navigate('/my-reports')}
          className="card"
          style={{
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            backgroundColor: 'var(--bg-card)',
            backdropFilter: 'var(--blur-glass)',
            WebkitBackdropFilter: 'var(--blur-glass)',
            boxShadow: 'var(--glass-specular), var(--shadow-sm)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--glass-specular-soft)' }}>
              <FolderOpen size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 650, fontSize: '0.94rem', color: 'var(--text-main)', letterSpacing: '-0.01em' }}>My Reported Items</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{userReports.length} {userReports.length === 1 ? 'item' : 'items'} reported</div>
            </div>
          </div>
          <ChevronRight size={17} color="var(--text-muted)" />
        </div>

        <div 
          onClick={() => navigate('/ai-matches')}
          className="card"
          style={{
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            backgroundColor: 'var(--bg-card)',
            backdropFilter: 'var(--blur-glass)',
            WebkitBackdropFilter: 'var(--blur-glass)',
            boxShadow: 'var(--glass-specular), var(--shadow-sm)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--glass-specular-soft)' }}>
              <Sparkles size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 650, fontSize: '0.94rem', color: 'var(--text-main)', letterSpacing: '-0.01em' }}>AI Match Feed</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{pendingMatches.length} pending {pendingMatches.length === 1 ? 'match' : 'matches'}</div>
            </div>
          </div>
          <ChevronRight size={17} color="var(--text-muted)" />
        </div>
      </div>

      {/* Main Profile Card */}
      <div className="card" style={{
        backgroundColor: 'var(--bg-card)',
        backdropFilter: 'var(--blur-glass)',
        WebkitBackdropFilter: 'var(--blur-glass)',
        boxShadow: 'var(--glass-specular), var(--shadow-sm)'
      }}>
        <div style={{
          padding: '36px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'rgba(255, 255, 255, 0.5)'
        }}>
          <div style={{
            width: '88px',
            height: '88px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary) 0%, #3B82F6 100%)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.4rem',
            fontWeight: 700,
            marginBottom: '16px',
            boxShadow: '0 8px 24px rgba(24, 90, 219, 0.25), inset 0 1px 1px 0 rgba(255, 255, 255, 0.5)'
          }}>
            {avatarLetter}
          </div>
          <h2 style={{ fontSize: '1.45rem', marginBottom: '6px', color: 'var(--text-main)', fontWeight: 700, letterSpacing: '-0.02em' }}>
            {displayName}
          </h2>
          <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.92rem', marginBottom: '14px' }}>
            <Mail size={15} />
            <span>{displayEmail}</span>
          </div>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 14px',
            borderRadius: '999px',
            fontSize: '0.78rem',
            fontWeight: 650,
            backgroundColor: isDemo ? 'rgba(254, 243, 199, 0.9)' : 'rgba(240, 253, 244, 0.9)',
            color: isDemo ? '#B45309' : '#15803D',
            border: `1px solid ${isDemo ? 'rgba(217, 119, 6, 0.25)' : 'rgba(22, 163, 74, 0.25)'}`,
            backdropFilter: 'blur(12px)',
            boxShadow: 'var(--glass-specular-soft)'
          }}>
            {isDemo ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
            {isDemo ? 'Demo User Profile' : 'Verified Campus Student'}
          </span>
        </div>

        <div style={{ padding: '32px' }}>
          <h3 style={{ fontSize: '1.08rem', marginBottom: '20px', fontWeight: 650, display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '-0.015em' }}>
            <UserIcon size={18} style={{ color: 'var(--primary)' }} />
            Account Information
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label className="form-label" style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Full Name</label>
              <input
                type="text"
                className="form-control"
                value={displayName}
                readOnly
                disabled
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.7)', borderColor: 'var(--border)' }}
              />
            </div>

            <div>
              <label className="form-label" style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>University Email</label>
              <input
                type="text"
                className="form-control"
                value={displayEmail}
                readOnly
                disabled
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.7)', borderColor: 'var(--border)' }}
              />
            </div>

            <div>
              <label className="form-label" style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>User Identifier (UUID / ID)</label>
              <input
                type="text"
                className="form-control"
                value={displayId}
                readOnly
                disabled
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.7)', borderColor: 'var(--border)', fontFamily: 'monospace', fontSize: '0.82rem' }}
              />
            </div>

            <div>
              <label className="form-label" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Security & Session Provider</label>
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
                type="button"
                onClick={handleSignOut}
                disabled={loggingOut}
                className="btn btn-secondary"
                style={{ borderColor: 'var(--border)', color: 'var(--text-main)', fontSize: '0.88rem' }}
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

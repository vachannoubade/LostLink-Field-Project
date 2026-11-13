import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import { 
  Mail, User as UserIcon, LogOut, CheckCircle2, 
  AlertCircle, FolderOpen, Sparkles, ChevronRight, ShieldCheck 
} from 'lucide-react';

export const Profile: React.FC = () => {
  const { user, profile, isAuthenticated, signOut } = useAuth();
  const { reports, matches } = useData();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      setLoggingOut(true);
      setError(null);
      const wasAdmin = Boolean(profile?.isAdmin);
      await signOut();
      navigate(wasAdmin ? '/admin/login' : '/login');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sign out. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  };

  const displayName = profile?.name || user?.name || 'Campus Student';
  const displayEmail = profile?.email || user?.email || 'student@sguk.ac.in';
  const avatarLetter = displayName.charAt(0).toUpperCase() || 'U';

  const userReports = reports.filter(r => r.userId === (user?.id || ''));
  const pendingMatches = matches.filter(m => m.status === 'pending');

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', paddingBottom: '48px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">
            Account profile
          </h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Your university identity and account settings.
          </p>
        </div>

        {isAuthenticated && (
          <button
            onClick={handleSignOut}
            disabled={loggingOut}
            className="btn btn-secondary btn-sm"
            style={{ color: 'var(--danger)' }}
          >
            <LogOut size={14} />
            <span>{loggingOut ? 'Signing out...' : 'Sign Out'}</span>
          </button>
        )}
      </div>

      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          backgroundColor: 'var(--danger-light)',
          border: '1px solid var(--danger-border)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--danger)',
          marginBottom: '20px',
          fontSize: '0.88rem'
        }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Main Profile Identity Card */}
      <div className="card" style={{ padding: '28px', backgroundColor: 'var(--bg-surface)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'var(--primary)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.6rem',
            fontWeight: 600
          }}>
            {avatarLetter}
          </div>

          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                {displayName}
              </h2>
              <span className={profile?.isAdmin ? 'badge badge-found' : 'badge badge-resolved'}>
                <CheckCircle2 size={12} />
                {profile?.isAdmin ? 'Administrator' : 'Verified Student'}
              </span>
            </div>

            <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Mail size={14} />
              <span>{displayEmail}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div 
          onClick={() => navigate('/my-reports')}
          className="card"
          style={{
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            backgroundColor: 'var(--bg-surface)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FolderOpen size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>My Reported Items</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{userReports.length} {userReports.length === 1 ? 'item' : 'items'}</div>
            </div>
          </div>
          <ChevronRight size={16} color="var(--text-muted)" />
        </div>

        <div 
          onClick={() => navigate('/ai-matches')}
          className="card"
          style={{
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            backgroundColor: 'var(--bg-surface)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--warning-light)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>Potential Matches</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{pendingMatches.length} pending</div>
            </div>
          </div>
          <ChevronRight size={16} color="var(--text-muted)" />
        </div>

        {profile?.isAdmin && (
          <div 
            onClick={() => navigate('/admin')}
            className="card"
            style={{
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              backgroundColor: 'var(--bg-surface)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>Admin Dashboard</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Campus operations</div>
              </div>
            </div>
            <ChevronRight size={16} color="var(--text-muted)" />
          </div>
        )}
      </div>

      {/* Account Details Details List */}
      <div className="card" style={{ padding: '24px', backgroundColor: 'var(--bg-surface)' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserIcon size={16} />
          <span>Account information</span>
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label className="form-label" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>Full name</label>
            <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-main)' }}>{displayName}</div>
          </div>
          <div style={{ height: '1px', backgroundColor: 'var(--border)' }} />
          <div>
            <label className="form-label" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>Email address</label>
            <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-main)' }}>{displayEmail}</div>
          </div>
          <div style={{ height: '1px', backgroundColor: 'var(--border)' }} />
          <div>
            <label className="form-label" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>Account role</label>
            <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-main)' }}>
              {profile?.isAdmin ? 'Campus Administrator' : 'Student Member'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

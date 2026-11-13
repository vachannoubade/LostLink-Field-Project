import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { INITIAL_ADMIN_EMAIL, isTrustedAdminUser } from '../lib/admin';
import { ShieldCheck, Lock, AlertCircle, CheckCircle2, Loader2, ArrowLeft, KeyRound } from 'lucide-react';

export const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState(INITIAL_ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const handleAdminSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (!supabase) {
        setError('Supabase client is not configured.');
        setLoading(false);
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      if (!data.user) {
        setError('Unable to authenticate administrative session.');
        setLoading(false);
        return;
      }

      // Check trusted server-controlled app_metadata.role
      if (!isTrustedAdminUser(data.user)) {
        await supabase.auth.signOut();
        setError('Access Denied: Account exists but is not provisioned with server-controlled administrative privileges (app_metadata.role = "admin").');
        setLoading(false);
        return;
      }

      // Administrator authenticated successfully
      setSuccessMessage('Administrator session verified. Redirecting to Admin Portal...');
      setTimeout(() => {
        navigate('/admin');
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during administrative login.');
      setLoading(false);
    }
  };

  const handleSendPasswordSetup = async () => {
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (!supabase) {
        setError('Supabase client is not configured.');
        setLoading(false);
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/admin/login`
      });

      if (resetError) {
        setError(resetError.message);
      } else {
        setResetSent(true);
        setSuccessMessage(`A secure credential setup link has been dispatched to ${normalizedEmail}. Please check your inbox.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send credential setup email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg-color)',
      padding: '24px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '440px',
        backgroundColor: '#FFFFFF',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        padding: '36px 32px',
        boxShadow: 'var(--shadow-md)'
      }}>
        {/* Navigation back */}
        <button
          onClick={() => navigate('/')}
          className="btn btn-ghost"
          style={{
            marginBottom: '16px',
            padding: '4px 8px',
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <ArrowLeft size={14} /> Back to LostLink
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '8px',
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px'
          }}>
            <ShieldCheck size={26} />
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 650, color: 'var(--text-main)', margin: '0 0 6px 0' }}>
            Administrative Portal
          </h1>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0 }}>
            Restricted access for Sanjay Ghodawat University operations
          </p>
        </div>

        {/* Security Warning Callout */}
        <div style={{
          padding: '12px 14px',
          backgroundColor: 'var(--bg-color)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          fontSize: '0.78rem',
          color: 'var(--text-secondary)',
          marginBottom: '20px',
          lineHeight: 1.45
        }}>
          <strong>Notice:</strong> This interface is restricted to authorized operators. Access attempts are audited. Administrators are provisioned via server-side database administration only.
        </div>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '10px 12px',
            backgroundColor: 'var(--danger-light)',
            color: 'var(--danger)',
            borderRadius: '4px',
            fontSize: '0.82rem',
            marginBottom: '18px',
            lineHeight: 1.4
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '10px 12px',
            backgroundColor: 'var(--success-light)',
            color: 'var(--success)',
            borderRadius: '4px',
            fontSize: '0.82rem',
            marginBottom: '18px',
            lineHeight: 1.4
          }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleAdminSignIn}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>
                Administrator Email
              </label>
              <input
                type="email"
                required
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vachannoubade@gmail.com"
                style={{ fontSize: '0.88rem' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600, margin: 0 }}>
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleSendPasswordSetup}
                  disabled={loading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary)',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    padding: 0,
                    textDecoration: 'underline'
                  }}
                >
                  Setup / Forgot Password?
                </button>
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="password"
                  required
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={{ fontSize: '0.88rem', paddingLeft: '34px' }}
                />
                <Lock size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '10px' }} />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '0.9rem',
                marginTop: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Verifying Credentials...
                </>
              ) : (
                <>
                  <KeyRound size={16} />
                  Sign In to Admin Portal
                </>
              )}
            </button>
          </div>
        </form>

        {resetSent && (
          <div style={{ marginTop: '16px', fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            Check your email for the password setup link, complete credential establishment, then return here to log in.
          </div>
        )}
      </div>
    </div>
  );
};

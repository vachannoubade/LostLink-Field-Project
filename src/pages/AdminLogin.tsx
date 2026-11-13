import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { isTrustedAdminUser } from '../lib/admin';
import { ShieldCheck, Lock, AlertCircle, CheckCircle2, Loader2, ArrowLeft, KeyRound, Eye, EyeOff } from 'lucide-react';

// Strict validation of internal redirect destinations (blocks open redirects)
const getSafeInternalDestination = (target: string | null): string => {
  if (target && target.startsWith('/') && !target.startsWith('//') && !target.includes('\\') && !target.includes('://')) {
    return target;
  }
  return '/admin';
};

export const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = getSafeInternalDestination(searchParams.get('redirectTo'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
        setError('Supabase connection is not available.');
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

      // Initial client-side filter
      if (!isTrustedAdminUser(data.user)) {
        await supabase.auth.signOut();
        setError('Access Denied: This account is not authorized for administrative access.');
        setLoading(false);
        return;
      }

      // Authoritative server-side authorization check (never relies on client metadata alone)
      const { data: serverAuthorized, error: rpcErr } = await supabase.rpc('can_access_admin_portal');
      if (rpcErr || !serverAuthorized) {
        await supabase.auth.signOut();
        setError('Access Denied: Administrative membership is unverified, expired, or suspended.');
        setLoading(false);
        return;
      }

      setSuccessMessage('Administrator session verified. Redirecting to Admin Portal...');
      setTimeout(() => {
        navigate(redirectTo, { replace: true });
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during administrative login.');
      setLoading(false);
    }
  };

  const handleSendPasswordSetup = async () => {
    setError(null);
    setSuccessMessage(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Please enter your administrator email address above to receive password setup instructions.');
      return;
    }

    setLoading(true);

    try {
      if (!supabase) {
        setError('Supabase connection is not available.');
        setLoading(false);
        return;
      }

      // Send to dedicated recovery endpoint with redirect to /admin
      const recoveryUrl = `${window.location.origin}/auth?mode=update-password&redirectTo=/admin`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: recoveryUrl
      });

      if (resetError) {
        // Generic message if rate-limited or failed, to avoid account enumeration
        if (resetError.message.toLowerCase().includes('rate limit')) {
          setError(resetError.message);
        } else {
          setResetSent(true);
          setSuccessMessage('If an account matching this email exists, a password setup link has been dispatched to your inbox.');
        }
      } else {
        setResetSent(true);
        setSuccessMessage('If an account matching this email exists, a password setup link has been dispatched to your inbox.');
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
          <h1 style={{ fontSize: '1.35rem', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 6px 0' }}>
            Administrator sign in
          </h1>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0 }}>
            Restricted access for Sanjay Ghodawat University operations
          </p>
        </div>

        {/* Security Notice Callout */}
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
          <strong>Notice:</strong> This console is restricted to authorized operators. Access attempts are audited. Administrators are provisioned via secure server administration only.
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
              <label htmlFor="admin-email" className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>
                Administrator Email
              </label>
              <input
                id="admin-email"
                type="email"
                required
                autoComplete="email"
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                style={{ fontSize: '0.88rem' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label htmlFor="admin-password" className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600, margin: 0 }}>
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
                  Set up / Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={{ fontSize: '0.88rem', paddingLeft: '34px', paddingRight: '36px' }}
                />
                <Lock size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '10px' }} />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
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
                  <Loader2 size={16} className="spin-loader" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <KeyRound size={16} />
                  <span>Sign in</span>
                </>
              )}
            </button>
          </div>
        </form>

        {resetSent && (
          <div style={{ marginTop: '16px', fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.45 }}>
            Check your email for the password setup link, complete credential establishment, then return here to log in.
          </div>
        )}
      </div>
    </div>
  );
};

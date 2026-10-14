import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { 
  PackageSearch, Mail, Lock, User, Eye, EyeOff, 
  AlertCircle, CheckCircle2, ArrowRight, ArrowLeft,
  KeyRound, RefreshCw, Info
} from 'lucide-react';
import { motion } from 'framer-motion';

export const Auth: React.FC<{ defaultMode?: 'login' | 'signup' }> = ({ defaultMode = 'login' }) => {
  const [searchParams] = useSearchParams();
  const searchMode = searchParams.get('mode');

  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'update-password'>(() => {
    if (searchMode === 'update-password' || searchMode === 'forgot' || searchMode === 'signup') {
      return searchMode;
    }
    return defaultMode;
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showResendAction, setShowResendAction] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);

  const { 
    signIn, 
    signUp, 
    resetPassword, 
    updatePassword, 
    resendConfirmation, 
    isConfigured, 
    isAuthenticated, 
    isPasswordRecovery, 
    loading 
  } = useAuth();

  const navigate = useNavigate();
  const rawRedirectTo = searchParams.get('redirectTo') || '/';
  const redirectTo = (!rawRedirectTo || rawRedirectTo.startsWith('/login') || rawRedirectTo.startsWith('/signup') || rawRedirectTo.startsWith('/auth')) ? '/' : rawRedirectTo;

  // Automatically switch to password recovery mode if detected from URL or Supabase event
  useEffect(() => {
    if (isPasswordRecovery || searchMode === 'update-password') {
      setMode('update-password');
    }
  }, [isPasswordRecovery, searchMode]);

  // If already authenticated and NOT currently resetting password, redirect to destination
  useEffect(() => {
    if (!loading && isAuthenticated && !isPasswordRecovery && mode !== 'update-password') {
      navigate(redirectTo, { replace: true });
    }
  }, [loading, isAuthenticated, isPasswordRecovery, mode, navigate, redirectTo]);

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
          Checking session...
        </div>
      </div>
    );
  }

  const handleResendConfirmation = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your email address to resend confirmation.');
      return;
    }

    setResendingEmail(true);
    try {
      const { error } = await resendConfirmation(trimmedEmail);
      if (error) {
        const msg = error.message?.toLowerCase() || '';
        if (msg.includes('rate limit') || msg.includes('after')) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage(`Could not resend confirmation: ${error.message}`);
        }
      } else {
        setSuccessMessage(`A confirmation email has been sent to ${trimmedEmail}. Please check your inbox and spam folder.`);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to resend confirmation email.');
    } finally {
      setResendingEmail(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowResendAction(false);

    const trimmedEmail = email.trim().toLowerCase();

    // Mode-specific validation
    if (mode === 'update-password') {
      if (password.length < 6) {
        setErrorMessage('New password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match. Please re-enter.');
        return;
      }
    } else {
      if (!trimmedEmail) {
        setErrorMessage('Please enter your university email address.');
        return;
      }

      if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
        setErrorMessage('Please enter a valid email address.');
        return;
      }

      if (mode === 'signup' && !name.trim()) {
        setErrorMessage('Please enter your full name.');
        return;
      }

      if ((mode === 'signup' || mode === 'login') && password.length < 6) {
        setErrorMessage('Password must be at least 6 characters long.');
        return;
      }
    }

    setSubmitting(true);

    try {
      // 1. SIGN UP
      if (mode === 'signup') {
        const result = await signUp(trimmedEmail, password, name.trim());
        if (result.error) {
          const err = result.error;
          const msg = err.message?.toLowerCase() || '';
          if (msg.includes('rate limit')) {
            setErrorMessage('Supabase email rate limit exceeded. Please wait a moment before trying again.');
          } else {
            setErrorMessage(err.message);
          }
        } else if (result.needsEmailConfirmation) {
          setSuccessMessage(
            `Account created! A confirmation email was sent to ${trimmedEmail}. Please verify your email before logging in.`
          );
          setShowResendAction(true);
          setMode('login');
        } else {
          setSuccessMessage('Account created and signed in! Redirecting...');
          setTimeout(() => {
            navigate(redirectTo);
          }, 800);
        }
      } 
      // 2. SIGN IN
      else if (mode === 'login') {
        const { error } = await signIn(trimmedEmail, password);
        if (error) {
          const rawMsg = error.message || '';
          const msg = rawMsg.toLowerCase();
          const errCode = 'code' in error ? String(error.code) : '';

          // A. Network or offline error
          if (!navigator.onLine || msg.includes('failed to fetch') || msg.includes('network')) {
            setErrorMessage('Unable to connect to authentication server. Please check your internet connection.');
          }
          // B. Rate limit error
          else if (errCode === 'over_email_send_rate_limit' || errCode === 'over_request_rate_limit' || msg.includes('rate limit')) {
            setErrorMessage('Too many sign-in attempts. Please wait a moment before trying again.');
          }
          // C. Explicit unconfirmed email error
          else if (errCode === 'email_not_confirmed' || msg.includes('email not confirmed')) {
            setErrorMessage('Your email address has not been confirmed yet. Please verify your email before signing in.');
            setShowResendAction(true);
          }
          // D. Invalid credentials (in Supabase this happens when password is wrong, OR account is unconfirmed with enumeration protection active)
          else if (errCode === 'invalid_credentials' || msg.includes('invalid login credentials')) {
            setErrorMessage(
              'Invalid login credentials. Please check your email and password, or verify your email if you registered recently.'
            );
            setShowResendAction(true);
          }
          // E. General or configuration error
          else {
            setErrorMessage(rawMsg);
          }
        } else {
          navigate(redirectTo);
        }
      }
      // 3. FORGOT PASSWORD (REQUEST RESET LINK)
      else if (mode === 'forgot') {
        const { error } = await resetPassword(trimmedEmail);
        if (error) {
          const msg = error.message?.toLowerCase() || '';
          if (msg.includes('rate limit') || msg.includes('after')) {
            setErrorMessage(error.message);
          } else {
            setErrorMessage(`Failed to send password reset: ${error.message}`);
          }
        } else {
          setSuccessMessage(
            `If an account exists for ${trimmedEmail}, a password reset link has been sent. Please check your inbox and click the link to set a new password.`
          );
        }
      }
      // 4. UPDATE PASSWORD (SET NEW PASSWORD FROM RECOVERY LINK)
      else if (mode === 'update-password') {
        const { error } = await updatePassword(password);
        if (error) {
          setErrorMessage(error.message);
        } else {
          setSuccessMessage('Password updated successfully! Redirecting...');
          setTimeout(() => {
            navigate(redirectTo);
          }, 1200);
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Authentication operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '480px', margin: '20px auto 40px', padding: '0 16px' }}>
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div 
          style={{ 
            width: '56px', 
            height: '56px', 
            borderRadius: '16px', 
            backgroundColor: 'var(--primary)', 
            color: 'white', 
            display: 'inline-flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            boxShadow: '0 8px 16px rgba(81, 70, 229, 0.25)',
            marginBottom: '16px' 
          }}
        >
          {mode === 'forgot' || mode === 'update-password' ? (
            <KeyRound size={30} />
          ) : (
            <PackageSearch size={32} />
          )}
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
          {mode === 'login' && 'Welcome Back'}
          {mode === 'signup' && 'Create Campus Account'}
          {mode === 'forgot' && 'Reset Password'}
          {mode === 'update-password' && 'Set New Password'}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          {mode === 'login' && 'Sign in to manage your reports and review item matches.'}
          {mode === 'signup' && 'Join LostLink to report lost belongings or return found items.'}
          {mode === 'forgot' && 'Enter your university email to receive a secure password reset link.'}
          {mode === 'update-password' && 'Enter and confirm your new account password.'}
        </p>
      </div>

      {/* Demo Mode Notice */}
      {!isConfigured && (
        <div 
          className="card" 
          style={{ 
            padding: '16px 20px', 
            marginBottom: '20px', 
            backgroundColor: 'var(--primary-light)', 
            borderColor: 'rgba(81, 70, 229, 0.2)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px'
          }}
        >
          <Info size={20} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
            <strong>Demo Mode Active:</strong> Supabase environment variables are not yet configured. You can explore the platform as the default campus student account.
            <div style={{ marginTop: '8px' }}>
              <button 
                type="button"
                className="btn btn-primary" 
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                onClick={() => navigate(redirectTo)}
              >
                Continue in Demo Mode
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth Card */}
      <motion.div 
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="card auth-card" 
        style={{ padding: '32px' }}
      >
        {/* Tab Switcher (Visible on Sign In / Create Account) */}
        {(mode === 'login' || mode === 'signup') && (
          <div 
            style={{ 
              display: 'flex', 
              backgroundColor: 'var(--bg-color)', 
              padding: '4px', 
              borderRadius: 'var(--radius-sm)',
              marginBottom: '24px' 
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMessage(null);
                setShowResendAction(false);
              }}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: '8px',
                fontSize: '0.9rem',
                fontWeight: 600,
                backgroundColor: mode === 'login' ? 'var(--bg-card)' : 'transparent',
                color: mode === 'login' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: mode === 'login' ? 'var(--shadow-sm)' : 'none',
                transition: 'var(--transition)'
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMessage(null);
                setShowResendAction(false);
              }}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: '8px',
                fontSize: '0.9rem',
                fontWeight: 600,
                backgroundColor: mode === 'signup' ? 'var(--bg-card)' : 'transparent',
                color: mode === 'signup' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: mode === 'signup' ? 'var(--shadow-sm)' : 'none',
                transition: 'var(--transition)'
              }}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Back navigation for Forgot Password / Reset */}
        {(mode === 'forgot' || mode === 'update-password') && (
          <div style={{ marginBottom: '20px' }}>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--primary)',
                fontSize: '0.875rem',
                fontWeight: 600,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0
              }}
            >
              <ArrowLeft size={16} />
              Back to Sign In
            </button>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div 
            style={{ 
              backgroundColor: 'var(--danger-light)', 
              color: 'var(--danger)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.875rem',
              marginBottom: '20px'
            }}
            role="alert"
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1, lineHeight: 1.45 }}>{errorMessage}</div>
            </div>

            {/* Resend verification email action inside error card */}
            {showResendAction && (
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={resendingEmail}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--danger)',
                    textDecoration: 'underline',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  <RefreshCw size={13} className={resendingEmail ? 'animate-spin' : ''} />
                  {resendingEmail ? 'Resending verification email...' : 'Resend verification email'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div 
            style={{ 
              backgroundColor: 'var(--success-light)', 
              color: 'var(--success)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.875rem',
              marginBottom: '20px'
            }}
            role="status"
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1, lineHeight: 1.45 }}>{successMessage}</div>
            </div>

            {/* Resend button if confirmation was required */}
            {showResendAction && (
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(34, 197, 94, 0.2)' }}>
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={resendingEmail}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--success)',
                    textDecoration: 'underline',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  <RefreshCw size={13} className={resendingEmail ? 'animate-spin' : ''} />
                  {resendingEmail ? 'Resending email...' : 'Did not receive it? Resend confirmation email'}
                </button>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Full Name (Sign Up only) */}
          {mode === 'signup' && (
            <div className="form-group">
              <label className="form-label" htmlFor="auth-name">Full Name *</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <User size={18} style={{ position: 'absolute', left: '16px', color: 'var(--text-muted)' }} />
                <input
                  id="auth-name"
                  type="text"
                  required
                  placeholder="e.g. Jordan Smith"
                  className="form-control"
                  style={{ paddingLeft: '44px' }}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
          )}

          {/* Email (Login, Signup, Forgot) */}
          {mode !== 'update-password' && (
            <div className="form-group">
              <label className="form-label" htmlFor="auth-email">University Email *</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Mail size={18} style={{ position: 'absolute', left: '16px', color: 'var(--text-muted)' }} />
                <input
                  id="auth-email"
                  type="email"
                  required
                  placeholder="student@university.edu"
                  className="form-control"
                  style={{ paddingLeft: '44px' }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
          )}

          {/* Password (Login and Signup) */}
          {(mode === 'login' || mode === 'signup') && (
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="form-label" htmlFor="auth-password" style={{ marginBottom: 0 }}>Password *</label>
                {mode === 'login' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--primary)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      fontWeight: 500
                    }}
                  >
                    Forgot password?
                  </button>
                ) : (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Min. 6 characters</span>
                )}
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Lock size={18} style={{ position: 'absolute', left: '16px', color: 'var(--text-muted)' }} />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  className="form-control"
                  style={{ paddingLeft: '44px', paddingRight: '44px' }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '14px',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px'
                  }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          {/* Password Reset Update Fields */}
          {mode === 'update-password' && (
            <>
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className="form-label" htmlFor="new-password" style={{ marginBottom: 0 }}>New Password *</label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Min. 6 characters</span>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Lock size={18} style={{ position: 'absolute', left: '16px', color: 'var(--text-muted)' }} />
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    className="form-control"
                    style={{ paddingLeft: '44px', paddingRight: '44px' }}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '14px',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px'
                    }}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="confirm-password">Confirm New Password *</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Lock size={18} style={{ position: 'absolute', left: '16px', color: 'var(--text-muted)' }} />
                  <input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    className="form-control"
                    style={{ paddingLeft: '44px' }}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>
            </>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px', padding: '14px' }}
            disabled={submitting}
          >
            {submitting ? (
              <span>
                {mode === 'login' && 'Signing in...'}
                {mode === 'signup' && 'Creating account...'}
                {mode === 'forgot' && 'Sending reset link...'}
                {mode === 'update-password' && 'Updating password...'}
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                {mode === 'login' && 'Sign In'}
                {mode === 'signup' && 'Create Account'}
                {mode === 'forgot' && 'Send Reset Link'}
                {mode === 'update-password' && 'Save New Password'}
                <ArrowRight size={18} />
              </span>
            )}
          </button>
        </form>

        {/* Mode Switch Footnote */}
        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          {mode === 'login' && (
            <>
              Don't have an account yet?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setErrorMessage(null);
                  setShowResendAction(false);
                }}
                style={{ color: 'var(--primary)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Sign up
              </button>
            </>
          )}
          {mode === 'signup' && (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMessage(null);
                  setShowResendAction(false);
                }}
                style={{ color: 'var(--primary)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Sign in
              </button>
            </>
          )}
          {mode === 'forgot' && (
            <>
              Remembered your credentials?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMessage(null);
                }}
                style={{ color: 'var(--primary)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </motion.div>

      {/* Back to Browse link */}
      <div style={{ textAlign: 'center', marginTop: '24px' }}>
        <Link 
          to="/browse" 
          style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textDecoration: 'none' }}
        >
          ← Continue browsing items publicly
        </Link>
      </div>
    </div>
  );
};


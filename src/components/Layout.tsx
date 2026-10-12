import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { ItemDetailModal } from './ItemDetailModal';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Search, FilePlus, User,
  Bell, Sparkles, FolderOpen, ShieldCheck,
  PackageSearch, Menu, X, Home, Sun, Moon,
  HeartHandshake, CheckCheck, LogIn, UserPlus, LogOut
} from 'lucide-react';

interface NavItemProps {
  to: string;
  icon: any;
  label: string;
  badge?: number;
  mobile?: boolean;
  currentPathname: string;
  onSelect?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({
  to,
  icon: Icon,
  label,
  badge = 0,
  mobile = false,
  currentPathname,
  onSelect
}) => {
  const isActive = currentPathname === to;
  return (
    <NavLink
      to={to}
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: mobile ? 'center' : 'space-between',
        flexDirection: mobile ? 'column' : 'row',
        gap: mobile ? '4px' : '12px',
        padding: mobile ? '8px 0' : '11px 16px',
        borderRadius: mobile ? '0' : '14px',
        margin: mobile ? '0' : '2px 16px',
        color: isActive ? 'var(--primary)' : 'var(--text-muted)',
        backgroundColor: isActive && !mobile ? 'var(--primary-light)' : 'transparent',
        fontWeight: isActive ? 700 : 500,
        transition: 'var(--transition)',
        flex: mobile ? 1 : 'none',
        position: 'relative'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? '4px' : '12px', flexDirection: mobile ? 'column' : 'row' }}>
        <Icon size={mobile ? 22 : 20} strokeWidth={isActive ? 2.4 : 2} />
        <span style={{ fontSize: mobile ? '0.68rem' : '0.95rem' }}>{label}</span>
      </div>
      {badge > 0 && !mobile && (
        <span style={{
          padding: '2px 8px',
          borderRadius: '999px',
          fontSize: '0.72rem',
          fontWeight: 700,
          backgroundColor: 'var(--primary)',
          color: 'white'
        }}>
          {badge}
        </span>
      )}
      {badge > 0 && mobile && (
        <span style={{
          position: 'absolute',
          top: '4px',
          right: '24%',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: 'var(--accent-warm)'
        }} />
      )}
    </NavLink>
  );
};

export const Layout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const {
    user,
    notifications,
    matches,
    markNotificationRead,
    markAllNotificationsRead,
    theme,
    toggleTheme,
    toastMessage,
    showToast
  } = useData();
  const { isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const unreadCount = notifications.filter(n => !n.read).length;
  const pendingMatchesCount = matches.filter(m => m.status === 'pending').length;

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    await logout();
    showToast('👋 You have been logged out safely.');
    navigate('/login');
  };

  return (
    <div className="app-container">
      {/* Desktop Sidebar */}
      <aside className="sidebar">
        <div
          style={{ padding: '28px 24px 20px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-warm) 100%)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 14px var(--primary-glow)'
          }}>
            <PackageSearch size={24} />
          </div>
          <div>
            <span className="serif-accent" style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.5px', display: 'block', lineHeight: 1.1 }}>
              LostLink
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Campus Kindness Network
            </span>
          </div>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '8px' }}>
          <NavItem to="/" icon={LayoutDashboard} label="Campus Hub" currentPathname={location.pathname} />
          <NavItem to="/browse" icon={Search} label="Explore Items" currentPathname={location.pathname} />

          <div style={{ padding: '18px 24px 6px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Take Action
          </div>
          <NavItem to="/report/lost" icon={FilePlus} label="I Lost Something" currentPathname={location.pathname} />
          <NavItem to="/report/found" icon={HeartHandshake} label="I Found Something" currentPathname={location.pathname} />

          <div style={{ padding: '18px 24px 6px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Your Activity
          </div>
          <NavItem to="/ai-matches" icon={Sparkles} label="Smart Matches" badge={pendingMatchesCount} currentPathname={location.pathname} />
          <NavItem to="/my-reports" icon={FolderOpen} label="My Reports" currentPathname={location.pathname} />
        </nav>

        {/* Community Karma Card in Sidebar */}
        {isAuthenticated && (
          <div style={{
            margin: '0 16px 12px',
            padding: '14px 16px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, var(--amber-light) 0%, var(--primary-light) 100%)',
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                🌟 Kindness Karma
              </span>
              <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--primary)' }}>
                {user.karmaPoints || 100} pts
              </span>
            </div>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              {user.reunionsHelped || 0} campus items reunited with your help!
            </p>
          </div>
        )}

        <div style={{ padding: '8px 0 20px', borderTop: '1px solid var(--border)' }}>
          {isAuthenticated ? (
            <>
              <NavItem to="/profile" icon={User} label="Profile & Passport" currentPathname={location.pathname} />
              <NavItem to="/admin" icon={ShieldCheck} label="Demo Controls" currentPathname={location.pathname} />
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '11px 16px',
                  borderRadius: '14px',
                  margin: '2px 16px',
                  width: 'calc(100% - 32px)',
                  color: 'var(--danger)',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  transition: 'var(--transition)'
                }}
              >
                <LogOut size={20} />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <>
              <NavItem to="/login" icon={LogIn} label="Login" currentPathname={location.pathname} />
              <NavItem to="/signup" icon={UserPlus} label="Sign Up" currentPathname={location.pathname} />
            </>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Desktop Top Nav */}
        <header className="top-nav">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '420px', display: 'flex', alignItems: 'center' }}>
              <Search size={18} style={{ position: 'absolute', left: '16px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search lost earbuds, blue bottle, Library..."
                className="form-control"
                style={{
                  paddingLeft: '44px',
                  borderRadius: '999px',
                  backgroundColor: 'var(--bg-subtle)',
                  border: '1px solid var(--border)',
                  paddingTop: '10px',
                  paddingBottom: '10px'
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    navigate(`/browse?q=${encodeURIComponent(e.currentTarget.value)}`);
                  }
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '999px', backgroundColor: 'var(--success-light)', border: '1px solid var(--success-border)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--success)' }}>
              <span className="live-dot" />
              <span>24 students active on campus</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
            {/* Theme Toggle */}
            <button
              className="btn btn-ghost"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Switch to Cozy Night Mode' : 'Switch to Warm Daylight Mode'}
              style={{ padding: '9px', borderRadius: '50%', border: '1px solid var(--border)' }}
            >
              {theme === 'light' ? <Moon size={19} /> : <Sun size={19} color="#FBBF24" />}
            </button>

            {/* Notifications Button */}
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-ghost"
                style={{ position: 'relative', padding: '9px', borderRadius: '50%', border: '1px solid var(--border)' }}
                onClick={() => setNotifOpen(!notifOpen)}
                aria-label="Notifications"
              >
                <Bell size={19} />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    width: '10px',
                    height: '10px',
                    backgroundColor: 'var(--accent-warm)',
                    borderRadius: '50%',
                    border: '2px solid var(--bg-card)'
                  }} />
                )}
              </button>

              {/* Notification Popover */}
              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '50px',
                      width: '360px',
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: '20px',
                      boxShadow: 'var(--shadow-lg)',
                      zIndex: 70,
                      overflow: 'hidden'
                    }}
                  >
                    <div style={{
                      padding: '16px 20px',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: 'var(--bg-subtle)'
                    }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                        Campus Alerts ({unreadCount} new)
                      </span>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllNotificationsRead}
                          style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <CheckCheck size={14} /> Mark all read
                        </button>
                      )}
                    </div>

                    <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                      {notifications.length === 0 ? (
                        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                          You're all caught up!
                        </div>
                      ) : (
                        notifications.map(n => (
                          <div
                            key={n.id}
                            onClick={() => {
                              markNotificationRead(n.id);
                              setNotifOpen(false);
                              if (n.link) navigate(n.link);
                            }}
                            style={{
                              padding: '14px 20px',
                              borderBottom: '1px solid var(--border)',
                              backgroundColor: n.read ? 'transparent' : 'var(--primary-light)',
                              cursor: 'pointer',
                              transition: 'var(--transition)'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)' }}>{n.title}</span>
                              {!n.read && (
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />
                              )}
                            </div>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{n.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Auth Controls in Top Navbar */}
            {isAuthenticated ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    padding: '5px 12px 5px 6px',
                    borderRadius: '999px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-subtle)'
                  }}
                  onClick={() => navigate('/profile')}
                >
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-warm) 100%)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.9rem'
                  }}>
                    {user.name.charAt(0)}
                  </div>
                  <div style={{ lineHeight: 1.2 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {user.name.split(' ')[0]}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--amber)', fontWeight: 700 }}>
                      ✨ {user.karmaPoints || 100} Karma
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="btn btn-secondary"
                  style={{ padding: '8px 14px', fontSize: '0.84rem', borderRadius: '999px' }}
                  title="Sign out"
                >
                  <LogOut size={15} />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Link
                  to="/login"
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '0.86rem', borderRadius: '999px' }}
                >
                  <LogIn size={15} />
                  <span>Login</span>
                </Link>
                <Link
                  to="/signup"
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '0.86rem', borderRadius: '999px' }}
                >
                  <UserPlus size={15} />
                  <span>Sign Up</span>
                </Link>
              </div>
            )}
          </div>
        </header>

        {/* Mobile Header */}
        <header className="mobile-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => navigate('/')}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-warm) 100%)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <PackageSearch size={18} />
            </div>
            <span className="serif-accent" style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.5px' }}>
              LostLink
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {!isAuthenticated && (
              <Link
                to="/login"
                className="btn btn-primary"
                style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: '999px' }}
              >
                Login
              </Link>
            )}
            <button className="btn btn-ghost" style={{ padding: '8px' }} onClick={toggleTheme}>
              {theme === 'light' ? <Moon size={19} /> : <Sun size={19} color="#FBBF24" />}
            </button>
            <button className="btn btn-ghost" style={{ padding: '8px', position: 'relative' }} onClick={() => setNotifOpen(!notifOpen)}>
              <Bell size={20} />
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: '6px', right: '8px', width: '8px', height: '8px', backgroundColor: 'var(--accent-warm)', borderRadius: '50%' }} />
              )}
            </button>
            <button className="btn btn-ghost" style={{ padding: '8px' }} onClick={() => setMobileMenuOpen(true)}>
              <Menu size={24} />
            </button>
          </div>
        </header>

        {/* Mobile Drawer Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 60 }}
              onClick={() => setMobileMenuOpen(false)}
            >
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: '82%',
                  maxWidth: '310px',
                  backgroundColor: 'var(--bg-card)',
                  padding: '24px 0',
                  display: 'flex',
                  flexDirection: 'column'
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px 20px', borderBottom: '1px solid var(--border)' }}>
                  {isAuthenticated ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-warm) 100%)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700
                      }}>
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{user.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--amber)', fontWeight: 700 }}>
                          ✨ {user.karmaPoints || 100} Kindness Karma
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Campus Account</div>
                  )}
                  <button onClick={() => setMobileMenuOpen(false)} style={{ padding: '8px', color: 'var(--text-muted)' }}>
                    <X size={24} />
                  </button>
                </div>

                <div style={{ padding: '16px 0', flex: 1 }}>
                  <NavItem to="/report/lost" icon={FilePlus} label="Report Lost Item" currentPathname={location.pathname} onSelect={() => setMobileMenuOpen(false)} />
                  <NavItem to="/report/found" icon={HeartHandshake} label="Report Found Item" currentPathname={location.pathname} onSelect={() => setMobileMenuOpen(false)} />
                  <div style={{ margin: '16px 24px', height: '1px', backgroundColor: 'var(--border)' }} />
                  {isAuthenticated ? (
                    <>
                      <NavItem to="/profile" icon={User} label="Profile & Passport" currentPathname={location.pathname} onSelect={() => setMobileMenuOpen(false)} />
                      <NavItem to="/admin" icon={ShieldCheck} label="Demo Controls" currentPathname={location.pathname} onSelect={() => setMobileMenuOpen(false)} />
                      <button
                        type="button"
                        onClick={handleLogout}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '12px 16px',
                          margin: '8px 16px',
                          color: 'var(--danger)',
                          fontWeight: 700,
                          fontSize: '0.95rem'
                        }}
                      >
                        <LogOut size={20} />
                        <span>Logout</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <NavItem to="/login" icon={LogIn} label="Login" currentPathname={location.pathname} onSelect={() => setMobileMenuOpen(false)} />
                      <NavItem to="/signup" icon={UserPlus} label="Sign Up" currentPathname={location.pathname} onSelect={() => setMobileMenuOpen(false)} />
                    </>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Toast Feedback */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              style={{
                position: 'fixed',
                bottom: '84px',
                right: '24px',
                zIndex: 90,
                backgroundColor: 'var(--text-main)',
                color: 'var(--bg-card)',
                padding: '14px 20px',
                borderRadius: '16px',
                boxShadow: 'var(--shadow-lg)',
                fontWeight: 600,
                fontSize: '0.9rem',
                maxWidth: '380px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <span>{toastMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Item Detail Modal */}
        <ItemDetailModal />

        <div className="page-container">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="mobile-nav">
        <NavItem to="/" icon={Home} label="Hub" mobile currentPathname={location.pathname} />
        <NavItem to="/browse" icon={Search} label="Explore" mobile currentPathname={location.pathname} />
        <div style={{ position: 'relative', top: '-22px', padding: '0 8px' }}>
          <button
            onClick={() => navigate('/report/lost')}
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-warm) 100%)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px var(--primary-glow)'
            }}
          >
            <FilePlus size={26} />
          </button>
        </div>
        <NavItem to="/ai-matches" icon={Sparkles} label="Matches" badge={pendingMatchesCount} mobile currentPathname={location.pathname} />
        <NavItem to="/my-reports" icon={FolderOpen} label="My Items" mobile currentPathname={location.pathname} />
      </nav>
    </div>
  );
};

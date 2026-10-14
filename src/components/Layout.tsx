import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, Search, FilePlus, User,
  Bell, Sparkles, FolderOpen, ShieldCheck,
  PackageSearch, Menu, X, Home, LogIn, LogOut, type LucideIcon
} from 'lucide-react';

interface NavItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  mobile?: boolean;
  onNavigate?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon: Icon, label, mobile = false, onNavigate }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: mobile ? 'center' : 'flex-start',
        flexDirection: mobile ? 'column' : 'row',
        gap: mobile ? '4px' : '12px',
        padding: mobile ? '8px 0' : '12px 16px',
        borderRadius: mobile ? '0' : '12px',
        margin: mobile ? '0' : '4px 16px',
        color: isActive ? 'var(--primary)' : 'var(--text-muted)',
        backgroundColor: isActive && !mobile ? 'var(--primary-light)' : 'transparent',
        fontWeight: isActive ? 600 : 500,
        transition: 'var(--transition)',
        flex: mobile ? 1 : 'none',
        textDecoration: 'none',
      }}
    >
      <Icon size={mobile ? 24 : 20} strokeWidth={isActive ? 2.5 : 2} />
      <span style={{ fontSize: mobile ? '0.65rem' : '1rem' }}>{label}</span>
    </NavLink>
  );
};

export const Layout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { notifications } = useData();
  const { user, profile, isAuthenticated, isDemo, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const unreadCount = notifications.filter(n => !n.read).length;

  const displayName = profile?.name || user?.name || (isDemo ? 'Alex Johnson' : 'Student');
  const avatarLetter = displayName.charAt(0).toUpperCase() || 'U';

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch {
      // Continue navigation even on error
      navigate('/login');
    }
  };

  return (
    <div className="app-container">
      {/* Desktop Sidebar */}
      <aside className="sidebar">
        <div style={{ padding: '32px 24px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PackageSearch size={24} />
          </div>
          <div>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.5px', display: 'block', lineHeight: 1.1 }}>LostLink</span>
            {isDemo && (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#D97706', letterSpacing: '0.08em' }}>
                Demo Mode
              </span>
            )}
          </div>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '16px' }}>
          <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
          <NavItem to="/browse" icon={Search} label="Browse Items" />
          <div style={{ padding: '16px 24px 8px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Report</div>
          <NavItem to="/report/lost" icon={FilePlus} label="Report Lost" />
          <NavItem to="/report/found" icon={FilePlus} label="Report Found" />
          <div style={{ padding: '16px 24px 8px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Personal</div>
          <NavItem to="/my-reports" icon={FolderOpen} label="My Reports" />
          <NavItem to="/ai-matches" icon={Sparkles} label="AI Matches" />
        </nav>

        <div style={{ padding: '24px 0', borderTop: '1px solid var(--border)' }}>
          <NavItem to="/profile" icon={User} label="Profile" />
          <NavItem to="/admin" icon={ShieldCheck} label="Admin Demo" />

          {isAuthenticated ? (
            <button
              onClick={handleSignOut}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 16px',
                margin: '8px 16px 0',
                borderRadius: '12px',
                border: 'none',
                background: 'transparent',
                color: 'var(--danger)',
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: 500,
                width: 'calc(100% - 32px)',
                textAlign: 'left'
              }}
            >
              <LogOut size={20} />
              <span>Sign Out</span>
            </button>
          ) : (
            <NavItem to="/login" icon={LogIn} label="Sign In" />
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Desktop Top Nav */}
        <header className="top-nav">
          <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '400px', display: 'flex', alignItems: 'center' }}>
              <Search size={18} style={{ position: 'absolute', left: '16px', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search items..." 
                className="form-control"
                style={{ paddingLeft: '44px', borderRadius: '999px', backgroundColor: 'var(--bg-color)', border: 'none' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate(`/browse?q=${e.currentTarget.value}`);
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Demo indicator badge */}
            {isDemo && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 10px',
                borderRadius: '999px',
                backgroundColor: '#FEF3C7',
                color: '#B45309',
                border: '1px solid #FDE68A',
                fontSize: '0.75rem',
                fontWeight: 600
              }}>
                Demo Mode
              </span>
            )}

            <button 
              className="btn btn-ghost" 
              style={{ position: 'relative', padding: '8px' }} 
              onClick={() => navigate('/notifications')}
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            >
              <Bell size={22} />
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: '6px', right: '8px', width: '10px', height: '10px', backgroundColor: 'var(--danger)', borderRadius: '50%', border: '2px solid var(--bg-card)' }} />
              )}
            </button>

            {isAuthenticated ? (
              <div 
                style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                onClick={() => navigate('/profile')}
                title={`Logged in as ${displayName}`}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary-light)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: '1rem'
                }}>
                  {avatarLetter}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, textAlign: 'left' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>{displayName}</span>
                  <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>● Online</span>
                </div>
              </div>
            ) : isDemo ? (
              <div 
                style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                onClick={() => navigate('/profile')}
                title="Demo Account (Alex Johnson)"
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: '#FEF3C7',
                  color: '#B45309',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: '1rem',
                  border: '1px solid #FDE68A'
                }}>
                  {avatarLetter}
                </div>
              </div>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '0.9rem' }}
              >
                <LogIn size={16} />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </header>

        {/* Mobile Header */}
        <header className="mobile-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PackageSearch size={18} />
            </div>
            <div>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.5px' }}>LostLink</span>
              {isDemo && (
                <span style={{ marginLeft: '6px', fontSize: '0.65rem', fontWeight: 600, color: '#D97706' }}>Demo</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              className="btn btn-ghost" 
              style={{ padding: '8px', position: 'relative' }} 
              onClick={() => navigate('/notifications')}
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            >
              <Bell size={20} />
              {unreadCount > 0 && <span style={{ position: 'absolute', top: '6px', right: '8px', width: '8px', height: '8px', backgroundColor: 'var(--danger)', borderRadius: '50%' }} />}
            </button>
            <button className="btn btn-ghost" style={{ padding: '8px' }} onClick={() => setMobileMenuOpen(true)}>
              <Menu size={24} />
            </button>
          </div>
        </header>

        {/* Mobile Nav Overlay Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 60 }}
              onClick={() => setMobileMenuOpen(false)}
            >
              <motion.div 
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '80%', maxWidth: '300px', backgroundColor: 'var(--bg-card)', padding: '24px 0', display: 'flex', flexDirection: 'column' }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px 24px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: isDemo ? '#FEF3C7' : 'var(--primary-light)', color: isDemo ? '#B45309' : 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                      {avatarLetter}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{displayName}</div>
                      <div style={{ fontSize: '0.75rem', color: isDemo ? '#B45309' : 'var(--text-muted)' }}>
                        {isDemo ? 'Demo Mode' : profile?.email || user?.email || 'Student'}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setMobileMenuOpen(false)} style={{ padding: '8px', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                    <X size={24} />
                  </button>
                </div>
                <div style={{ padding: '16px 0', flex: 1, overflowY: 'auto' }}>
                  <NavItem to="/report/lost" icon={FilePlus} label="Report Lost Item" onNavigate={() => setMobileMenuOpen(false)} />
                  <NavItem to="/report/found" icon={FilePlus} label="Report Found Item" onNavigate={() => setMobileMenuOpen(false)} />
                  <div style={{ margin: '16px 24px', height: '1px', backgroundColor: 'var(--border)' }} />
                  <NavItem to="/profile" icon={User} label="Profile" onNavigate={() => setMobileMenuOpen(false)} />
                  <NavItem to="/admin" icon={ShieldCheck} label="Admin Demo" onNavigate={() => setMobileMenuOpen(false)} />
                  <div style={{ margin: '16px 24px', height: '1px', backgroundColor: 'var(--border)' }} />
                  {isAuthenticated ? (
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleSignOut();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 16px',
                        margin: '4px 16px',
                        borderRadius: '12px',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--danger)',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        fontWeight: 500,
                        width: 'calc(100% - 32px)',
                        textAlign: 'left'
                      }}
                    >
                      <LogOut size={20} />
                      <span>Sign Out</span>
                    </button>
                  ) : (
                    <NavItem
                      to="/login"
                      icon={LogIn}
                      label="Sign In"
                      onNavigate={() => setMobileMenuOpen(false)}
                    />
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
        <NavItem to="/" icon={Home} label="Home" mobile />
        <NavItem to="/browse" icon={Search} label="Browse" mobile />
        <div style={{ position: 'relative', top: '-24px', padding: '0 8px' }}>
          <button 
            onClick={() => navigate('/report/lost')}
            style={{ 
              width: '56px', height: '56px', borderRadius: '50%', 
              backgroundColor: 'var(--primary)', color: 'white', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 16px rgba(81, 70, 229, 0.4)',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <FilePlus size={28} />
          </button>
        </div>
        <NavItem to="/ai-matches" icon={Sparkles} label="Matches" mobile />
        <NavItem to="/my-reports" icon={FolderOpen} label="My Items" mobile />
      </nav>
    </div>
  );
};

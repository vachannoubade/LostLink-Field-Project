import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { CustomCursor } from './CustomCursor';
import { 
  LayoutDashboard, Search, FilePlus, User,
  Bell, Sparkles, FolderOpen, ChevronRight,
  PackageSearch, Menu, X, Home, LogIn, LogOut, type LucideIcon
} from 'lucide-react';

interface NavItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  mobile?: boolean;
  badge?: number;
  onNavigate?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon: Icon, label, mobile = false, badge, onNavigate }) => {
  const location = useLocation();
  const isActive = location.pathname === to || (to === '/browse' && location.pathname.startsWith('/browse'));

  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: mobile ? 'center' : 'flex-start',
        flexDirection: mobile ? 'column' : 'row',
        gap: mobile ? '3px' : '11px',
        padding: mobile ? '6px 4px' : '9px 14px',
        borderRadius: mobile ? '8px' : 'var(--radius-sm)',
        margin: mobile ? '0' : '1px 14px',
        color: isActive ? (mobile ? 'var(--primary)' : 'var(--text-main)') : 'var(--text-secondary)',
        backgroundColor: isActive && !mobile ? '#FFFFFF' : 'transparent',
        boxShadow: isActive && !mobile ? '0 1px 3px rgba(18, 19, 22, 0.05), 0 1px 2px rgba(18, 19, 22, 0.03)' : 'none',
        border: isActive && !mobile ? '1px solid var(--border)' : '1px solid transparent',
        fontWeight: isActive ? 650 : 500,
        fontSize: mobile ? '0.68rem' : '0.88rem',
        letterSpacing: '-0.01em',
        transition: 'var(--transition-fast)',
        flex: mobile ? 1 : 'none',
        minHeight: mobile ? '46px' : 'auto',
        textDecoration: 'none',
        position: 'relative'
      }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={mobile ? 20 : 17} strokeWidth={isActive ? 2.4 : 1.7} color={isActive ? 'var(--primary)' : 'currentColor'} />
        {typeof badge === 'number' && badge > 0 && mobile && (
          <span style={{
            position: 'absolute',
            top: '-3px',
            right: '-6px',
            minWidth: '15px',
            height: '15px',
            fontSize: '0.62rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            borderRadius: '999px',
            backgroundColor: 'var(--primary)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
          }}>
            {badge}
          </span>
        )}
      </div>
      <span style={{ fontSize: mobile ? '0.68rem' : '0.88rem', color: isActive ? 'var(--primary)' : 'var(--text-muted)' }}>{label}</span>
      {typeof badge === 'number' && badge > 0 && !mobile && (
        <span style={{
          marginLeft: 'auto',
          fontSize: '0.68rem',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          padding: '2px 7px',
          borderRadius: '999px',
          backgroundColor: 'var(--primary)',
          color: '#FFFFFF'
        }}>
          {badge}
        </span>
      )}
    </NavLink>
  );
};

export const Layout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const { notifications, matches } = useData();
  const { user, profile, isAuthenticated, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const unreadCount = notifications.filter(n => !n.read).length;
  const pendingMatchCount = matches.filter(m => m.status === 'pending').length;

  const displayName = profile?.name || user?.name || 'Student';
  const avatarLetter = displayName.charAt(0).toUpperCase() || 'U';

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch {
      navigate('/login');
    }
  };

  return (
    <div className="app-container">
      {/* Desktop Contextual Pointer Follower */}
      <CustomCursor />

      {/* Desktop Editorial Registry Sidebar */}
      <aside className="sidebar">
        {/* Brand Header */}
        <div style={{ padding: '28px 24px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ 
            width: '36px', 
            height: '36px', 
            borderRadius: '9px', 
            backgroundColor: 'var(--text-main)', 
            color: '#FFFFFF', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(18, 19, 22, 0.15)'
          }}>
            <PackageSearch size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                LostLink
              </span>
            </div>
            <span style={{ fontSize: '0.64rem', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
              Campus Registry
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '12px' }}>
          <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
          <NavItem to="/browse" icon={Search} label="Browse Items" />
          
          <div style={{ padding: '16px 24px 6px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Report Items
          </div>
          <NavItem to="/report/lost" icon={FilePlus} label="Report Lost" />
          <NavItem to="/report/found" icon={FilePlus} label="Report Found" />

          <div style={{ padding: '16px 24px 6px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Personal Space
          </div>
          <NavItem to="/my-reports" icon={FolderOpen} label="My Items" />
          <NavItem to="/ai-matches" icon={Sparkles} label="AI Matches" badge={pendingMatchCount} />
        </nav>

        {/* User / Sign Out Footer */}
        <div style={{ padding: '18px 0', borderTop: '1px solid var(--border)' }}>
          <NavItem to="/profile" icon={User} label="Profile & Settings" />

          {isAuthenticated ? (
            <button
              onClick={handleSignOut}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '9px 14px',
                margin: '4px 14px 0',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: 'transparent',
                color: 'var(--danger)',
                cursor: 'pointer',
                fontSize: '0.92rem',
                fontWeight: 500,
                width: 'calc(100% - 28px)',
                textAlign: 'left',
                transition: 'var(--transition)'
              }}
            >
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          ) : (
            <NavItem to="/login" icon={LogIn} label="Sign In" />
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Desktop Liquid Glass Top Nav */}
        <header className="top-nav">
          <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '380px', display: 'flex', alignItems: 'center' }}>
              <Search size={16} style={{ position: 'absolute', left: '16px', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search campus items... (Press Enter)" 
                className="form-control"
                style={{ 
                  paddingLeft: '42px', 
                  paddingRight: '64px',
                  borderRadius: '999px', 
                  backgroundColor: 'rgba(255, 255, 255, 0.7)', 
                  border: '1px solid var(--border)',
                  fontSize: '0.88rem',
                  height: '40px',
                  boxShadow: 'var(--shadow-sm)'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate(`/browse?q=${encodeURIComponent(e.currentTarget.value)}`);
                }}
              />
              <span style={{ 
                position: 'absolute', 
                right: '12px', 
                fontSize: '0.72rem', 
                fontWeight: 600, 
                color: 'var(--text-tertiary)', 
                backgroundColor: 'rgba(0,0,0,0.05)', 
                padding: '2px 6px', 
                borderRadius: '4px' 
              }}>
                ↵
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>

            <button 
              className="btn btn-ghost" 
              style={{ position: 'relative', width: '38px', height: '38px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }} 
              onClick={() => navigate('/notifications')}
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span style={{ 
                  position: 'absolute', 
                  top: '8px', 
                  right: '8px', 
                  width: '8px', 
                  height: '8px', 
                  backgroundColor: 'var(--danger)', 
                  borderRadius: '50%', 
                  border: '1.5px solid #FFFFFF' 
                }} />
              )}
            </button>

            {isAuthenticated ? (
              <div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '9px', 
                  cursor: 'pointer',
                  padding: '4px 12px 4px 6px',
                  borderRadius: '999px',
                  backgroundColor: 'rgba(255, 255, 255, 0.75)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'var(--transition)'
                }}
                onClick={() => navigate('/profile')}
                title={`Logged in as ${displayName}`}
              >
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--primary) 0%, #0F3FA8 100%)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.82rem'
                }}>
                  {avatarLetter}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)' }}>{displayName.split(' ')[0]}</span>
                  <span style={{ fontSize: '0.68rem', color: '#16A34A', fontWeight: 600 }}>Online</span>
                </div>
              </div>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', fontSize: '0.85rem' }}
              >
                <LogIn size={15} />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </header>

        {/* Mobile Liquid Glass Header */}
        <header className="mobile-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'linear-gradient(145deg, var(--primary) 0%, #0F3FA8 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(24, 90, 219, 0.3)' }}>
              <PackageSearch size={18} />
            </div>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-main)' }}>LostLink</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              className="btn btn-ghost" 
              style={{ padding: '8px', position: 'relative' }} 
              onClick={() => navigate('/notifications')}
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            >
              <Bell size={20} />
              {unreadCount > 0 && <span style={{ position: 'absolute', top: '7px', right: '7px', width: '7px', height: '7px', backgroundColor: 'var(--danger)', borderRadius: '50%' }} />}
            </button>
            <button className="btn btn-ghost" style={{ padding: '8px' }} onClick={() => setMobileMenuOpen(true)}>
              <Menu size={22} />
            </button>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: 60 }}
              onClick={() => setMobileMenuOpen(false)}
            >
              <motion.div 
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                style={{ 
                  position: 'absolute', 
                  top: 0, 
                  right: 0, 
                  bottom: 0, 
                  width: '82%', 
                  maxWidth: '310px', 
                  backgroundColor: 'var(--bg-glass-heavy)', 
                  backdropFilter: 'var(--blur-nav)',
                  WebkitBackdropFilter: 'var(--blur-nav)',
                  borderLeft: '1px solid var(--border)',
                  boxShadow: 'var(--glass-specular), -8px 0 32px rgba(0,0,0,0.12)',
                  padding: '24px 0', 
                  display: 'flex', 
                  flexDirection: 'column' 
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.95rem' }}>
                      {avatarLetter}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{displayName}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {profile?.email || user?.email || 'Campus Student'}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setMobileMenuOpen(false)} style={{ padding: '6px', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                    <X size={20} />
                  </button>
                </div>

                <div style={{ padding: '16px 0', flex: 1, overflowY: 'auto' }}>
                  <NavItem to="/" icon={LayoutDashboard} label="Dashboard" onNavigate={() => setMobileMenuOpen(false)} />
                  <NavItem to="/browse" icon={Search} label="Browse Items" onNavigate={() => setMobileMenuOpen(false)} />
                  <div style={{ margin: '14px 20px', height: '1px', backgroundColor: 'var(--border)' }} />
                  <NavItem to="/report/lost" icon={FilePlus} label="Report Lost Item" onNavigate={() => setMobileMenuOpen(false)} />
                  <NavItem to="/report/found" icon={FilePlus} label="Report Found Item" onNavigate={() => setMobileMenuOpen(false)} />
                  <div style={{ margin: '14px 20px', height: '1px', backgroundColor: 'var(--border)' }} />
                  <NavItem to="/my-reports" icon={FolderOpen} label="My Items" onNavigate={() => setMobileMenuOpen(false)} />
                  <NavItem to="/ai-matches" icon={Sparkles} label="AI Matches" badge={pendingMatchCount} onNavigate={() => setMobileMenuOpen(false)} />
                  <NavItem to="/profile" icon={User} label="Profile" onNavigate={() => setMobileMenuOpen(false)} />
                  <div style={{ margin: '14px 20px', height: '1px', backgroundColor: 'var(--border)' }} />
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
                        padding: '10px 14px',
                        margin: '2px 14px',
                        borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--danger)',
                        cursor: 'pointer',
                        fontSize: '0.92rem',
                        fontWeight: 500,
                        width: 'calc(100% - 28px)',
                        textAlign: 'left'
                      }}
                    >
                      <LogOut size={18} />
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

        {/* Page Content Container with Smooth Subtle Fade */}
        <div className="page-container">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Refined Docked Mobile Navigation Bar */}
      <nav className="mobile-nav" aria-label="Mobile Navigation">
        <NavItem to="/" icon={Home} label="Home" mobile />
        <NavItem to="/browse" icon={Search} label="Browse" mobile />
        
        {/* Report Action Button */}
        <button
          type="button"
          onClick={() => setReportSheetOpen(true)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            padding: '4px 6px',
            flex: 1,
            minHeight: '46px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer'
          }}
          aria-label="Report lost or found item"
        >
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: location.pathname.startsWith('/report')
              ? 'linear-gradient(135deg, var(--primary) 0%, #0E3485 100%)'
              : 'rgba(21, 69, 168, 0.1)',
            color: location.pathname.startsWith('/report') ? '#FFFFFF' : 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: location.pathname.startsWith('/report') ? '0 2px 8px var(--primary-glow)' : 'none',
            transition: 'var(--transition-fast)'
          }}>
            <FilePlus size={18} strokeWidth={2.2} />
          </div>
          <span style={{ 
            fontSize: '0.68rem', 
            fontWeight: location.pathname.startsWith('/report') ? 700 : 500,
            color: location.pathname.startsWith('/report') ? 'var(--primary)' : 'var(--text-muted)'
          }}>
            Report
          </span>
        </button>

        <NavItem to="/ai-matches" icon={Sparkles} label="Matches" mobile badge={pendingMatchCount} />
        <NavItem to="/profile" icon={User} label="Profile" mobile />
      </nav>

      {/* Refined Mobile Report Action Bottom Sheet */}
      <AnimatePresence>
        {reportSheetOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(18, 19, 22, 0.45)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              zIndex: 90,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center'
            }}
            onClick={() => setReportSheetOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              style={{
                width: '100%',
                maxWidth: '520px',
                backgroundColor: '#FFFFFF',
                borderTopLeftRadius: '22px',
                borderTopRightRadius: '22px',
                padding: '16px 20px calc(24px + env(safe-area-inset-bottom))',
                boxShadow: '0 -10px 36px rgba(0,0,0,0.18)',
                borderTop: '1px solid var(--border)'
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag/Pull Handle */}
              <div style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--border)', margin: '0 auto 16px' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    CAMPUS REGISTRY INTAKE
                  </div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)', margin: '2px 0 0', letterSpacing: '-0.02em' }}>
                    What would you like to report?
                  </h3>
                </div>
                <button 
                  type="button"
                  onClick={() => setReportSheetOpen(false)} 
                  style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--bg-secondary)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}
                  aria-label="Close report sheet"
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setReportSheetOpen(false);
                    navigate('/report/lost');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(217, 119, 6, 0.25)',
                    backgroundColor: 'rgba(254, 243, 199, 0.5)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'var(--transition)'
                  }}
                >
                  <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B45309', flexShrink: 0 }}>
                    <FilePlus size={22} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                      <span style={{ fontSize: '0.96rem', fontWeight: 700, color: '#92400E' }}>I Lost an Item</span>
                      <span className="mono-token mono-token-amber" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>SEARCH</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#78350F', lineHeight: 1.35 }}>
                      File a lost inquiry to automatically match with recovered campus items.
                    </div>
                  </div>
                  <ChevronRight size={18} color="#92400E" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setReportSheetOpen(false);
                    navigate('/report/found');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(13, 122, 95, 0.25)',
                    backgroundColor: 'rgba(236, 253, 245, 0.5)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'var(--transition)'
                  }}
                >
                  <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#D1FAE5', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#047857', flexShrink: 0 }}>
                    <PackageSearch size={22} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                      <span style={{ fontSize: '0.96rem', fontWeight: 700, color: '#065F46' }}>I Found an Item</span>
                      <span className="mono-token mono-token-emerald" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>CUSTODY</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#064E3B', lineHeight: 1.35 }}>
                      Log a recovered article to help return it to its rightful campus owner.
                    </div>
                  </div>
                  <ChevronRight size={18} color="#065F46" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

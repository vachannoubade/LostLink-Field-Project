import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { 
  LayoutDashboard, Search, FilePlus, User,
  Bell, Sparkles, FolderOpen, 
  PackageSearch, Menu, X, Home, LogIn, LogOut, ShieldCheck, type LucideIcon
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
        gap: mobile ? '3px' : '10px',
        padding: mobile ? '6px 4px' : '9px 12px',
        borderRadius: 'var(--radius-sm)',
        margin: mobile ? '0' : '1px 12px',
        color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
        backgroundColor: isActive && !mobile ? 'var(--primary-light)' : 'transparent',
        fontWeight: isActive ? 600 : 500,
        fontSize: mobile ? '0.72rem' : '0.88rem',
        textDecoration: 'none',
        transition: 'var(--transition-fast)',
        flex: mobile ? 1 : 'none',
        minHeight: mobile ? '46px' : 'auto',
        position: 'relative'
      }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={mobile ? 20 : 18} strokeWidth={isActive ? 2.2 : 1.7} />
        {typeof badge === 'number' && badge > 0 && mobile && (
          <span style={{
            position: 'absolute',
            top: '-3px',
            right: '-6px',
            minWidth: '15px',
            height: '15px',
            fontSize: '0.65rem',
            fontWeight: 700,
            borderRadius: '999px',
            backgroundColor: 'var(--primary)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px'
          }}>
            {badge}
          </span>
        )}
      </div>
      <span>{label}</span>
      {typeof badge === 'number' && badge > 0 && !mobile && (
        <span style={{
          marginLeft: 'auto',
          fontSize: '0.72rem',
          fontWeight: 600,
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
    const wasAdmin = Boolean(profile?.isAdmin);
    try {
      await signOut();
      navigate(wasAdmin ? '/admin/login' : '/login');
    } catch {
      navigate(wasAdmin ? '/admin/login' : '/login');
    }
  };

  return (
    <div className="app-container">
      {/* Desktop Navigation Sidebar */}
      <aside className="sidebar">
        {/* Brand Header */}
        <div style={{ padding: '24px 20px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ 
            width: '36px', 
            height: '36px', 
            borderRadius: 'var(--radius-sm)', 
            backgroundColor: 'var(--primary)', 
            color: '#FFFFFF', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center'
          }}>
            <PackageSearch size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              LostLink
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Sanjay Ghodawat Univ.
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 0', overflowY: 'auto' }}>
          <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
          <NavItem to="/browse" icon={Search} label="Browse Items" />

          <div style={{ padding: '16px 20px 6px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Report
          </div>
          <NavItem to="/report/lost" icon={FilePlus} label="Report Lost Item" />
          <NavItem to="/report/found" icon={FilePlus} label="Report Found Item" />

          <div style={{ padding: '16px 20px 6px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Personal
          </div>
          <NavItem to="/my-reports" icon={FolderOpen} label="My Items" />
          <NavItem to="/ai-matches" icon={Sparkles} label="AI Matches" badge={pendingMatchCount} />

          {profile?.isAdmin && (
            <>
              <div style={{ padding: '16px 20px 6px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Administration
              </div>
              <NavItem to="/admin" icon={ShieldCheck} label="Admin Dashboard" />
            </>
          )}
        </nav>

        {/* Footer / Account Area */}
        <div style={{ padding: '12px 0 16px', borderTop: '1px solid var(--border)' }}>
          {isAuthenticated ? (
            <>
              <NavItem to="/profile" icon={User} label="Profile & Settings" />
              <button
                onClick={handleSignOut}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  margin: '2px 12px 0',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--danger)',
                  cursor: 'pointer',
                  fontSize: '0.88rem',
                  fontWeight: 500,
                  width: 'calc(100% - 24px)',
                  textAlign: 'left',
                  transition: 'var(--transition-fast)'
                }}
              >
                <LogOut size={18} />
                <span>Sign Out</span>
              </button>
            </>
          ) : (
            <>
              <NavItem to="/login" icon={LogIn} label="Sign In" />
              {/* Mandatory Admin Sign In Entry Point */}
              <NavLink
                to="/admin/login"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  margin: '2px 12px 0',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.84rem',
                  fontWeight: 500,
                  textDecoration: 'none',
                  transition: 'var(--transition-fast)'
                }}
              >
                <ShieldCheck size={18} />
                <span>Admin sign in</span>
              </NavLink>
            </>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Desktop Top Navigation Bar */}
        <header className="top-nav">
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, maxWidth: '420px', marginRight: 'auto' }}>
            <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
              <Search size={16} style={{ position: 'absolute', left: '14px', color: 'var(--text-tertiary)' }} />
              <input 
                type="text" 
                placeholder="Search campus items... (Press Enter)" 
                className="form-control"
                style={{ 
                  paddingLeft: '38px', 
                  borderRadius: 'var(--radius-full)', 
                  height: '38px',
                  backgroundColor: 'var(--bg-secondary)',
                  fontSize: '0.85rem'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate(`/browse?q=${encodeURIComponent(e.currentTarget.value)}`);
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                  width: '7px', 
                  height: '7px', 
                  backgroundColor: 'var(--danger)', 
                  borderRadius: '50%'
                }} />
              )}
            </button>

            {isAuthenticated ? (
              <div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  cursor: 'pointer',
                  padding: '4px 10px 4px 6px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-surface)'
                }}
                onClick={() => navigate('/profile')}
                title={`Logged in as ${displayName}`}
              >
                <div style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: '0.78rem'
                }}>
                  {avatarLetter}
                </div>
                <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-main)' }}>
                  {displayName.split(' ')[0]}
                </span>
              </div>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="btn btn-primary"
                style={{ padding: '6px 14px', fontSize: '0.84rem' }}
              >
                <LogIn size={15} />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </header>

        {/* Mobile Header */}
        <header className="mobile-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ 
              width: '30px', 
              height: '30px', 
              borderRadius: 'var(--radius-xs)', 
              backgroundColor: 'var(--primary)', 
              color: '#FFFFFF', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <PackageSearch size={18} />
            </div>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-main)' }}>
              LostLink
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button 
              className="btn btn-ghost" 
              style={{ padding: '8px', position: 'relative' }} 
              onClick={() => navigate('/notifications')}
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span style={{ 
                  position: 'absolute', 
                  top: '7px', 
                  right: '7px', 
                  width: '7px', 
                  height: '7px', 
                  backgroundColor: 'var(--danger)', 
                  borderRadius: '50%' 
                }} />
              )}
            </button>
            <button 
              className="btn btn-ghost" 
              style={{ padding: '8px' }} 
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
          </div>
        </header>

        {/* Mobile Slide Drawer Menu */}
        {mobileMenuOpen && (
          <div 
            style={{ 
              position: 'fixed', 
              inset: 0, 
              backgroundColor: 'rgba(0,0,0,0.3)', 
              zIndex: 70 
            }}
            onClick={() => setMobileMenuOpen(false)}
          >
            <div 
              style={{ 
                position: 'absolute', 
                top: 0, 
                right: 0, 
                bottom: 0, 
                width: '80%', 
                maxWidth: '300px', 
                backgroundColor: 'var(--bg-surface)', 
                borderLeft: '1px solid var(--border)',
                padding: '20px 0', 
                display: 'flex', 
                flexDirection: 'column' 
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 18px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.9rem' }}>
                    {avatarLetter}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{displayName}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {profile?.email || user?.email || 'Campus Student'}
                    </div>
                  </div>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} style={{ padding: '6px', color: 'var(--text-muted)' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '12px 0', flex: 1, overflowY: 'auto' }}>
                <NavItem to="/" icon={LayoutDashboard} label="Dashboard" onNavigate={() => setMobileMenuOpen(false)} />
                <NavItem to="/browse" icon={Search} label="Browse Items" onNavigate={() => setMobileMenuOpen(false)} />
                <div style={{ margin: '10px 18px', height: '1px', backgroundColor: 'var(--border)' }} />
                <NavItem to="/report/lost" icon={FilePlus} label="Report Lost Item" onNavigate={() => setMobileMenuOpen(false)} />
                <NavItem to="/report/found" icon={FilePlus} label="Report Found Item" onNavigate={() => setMobileMenuOpen(false)} />
                <div style={{ margin: '10px 18px', height: '1px', backgroundColor: 'var(--border)' }} />
                <NavItem to="/my-reports" icon={FolderOpen} label="My Items" onNavigate={() => setMobileMenuOpen(false)} />
                <NavItem to="/ai-matches" icon={Sparkles} label="AI Matches" badge={pendingMatchCount} onNavigate={() => setMobileMenuOpen(false)} />
                <NavItem to="/profile" icon={User} label="Profile & Settings" onNavigate={() => setMobileMenuOpen(false)} />
                
                {profile?.isAdmin && (
                  <>
                    <div style={{ margin: '10px 18px', height: '1px', backgroundColor: 'var(--border)' }} />
                    <NavItem to="/admin" icon={ShieldCheck} label="Admin Dashboard" onNavigate={() => setMobileMenuOpen(false)} />
                  </>
                )}

                {!isAuthenticated && (
                  <>
                    <div style={{ margin: '10px 18px', height: '1px', backgroundColor: 'var(--border)' }} />
                    <NavItem to="/admin/login" icon={ShieldCheck} label="Admin sign in" onNavigate={() => setMobileMenuOpen(false)} />
                  </>
                )}

                <div style={{ margin: '10px 18px', height: '1px', backgroundColor: 'var(--border)' }} />
                {isAuthenticated ? (
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleSignOut();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '9px 14px',
                      margin: '2px 14px',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--danger)',
                      cursor: 'pointer',
                      fontSize: '0.88rem',
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
            </div>
          </div>
        )}

        {/* Page Content Viewport */}
        <div className="page-container">
          <Outlet />
        </div>
      </main>

      {/* Docked Mobile Navigation Bar */}
      <nav className="mobile-nav" aria-label="Mobile Navigation">
        <NavItem to="/" icon={Home} label="Home" mobile />
        <NavItem to="/browse" icon={Search} label="Browse" mobile />
        
        {/* Report Chooser Trigger */}
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
          aria-label="Report item"
        >
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-xs)',
            backgroundColor: location.pathname.startsWith('/report') ? 'var(--primary)' : 'var(--primary-light)',
            color: location.pathname.startsWith('/report') ? '#FFFFFF' : 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <FilePlus size={18} strokeWidth={2.2} />
          </div>
          <span style={{ 
            fontSize: '0.72rem', 
            fontWeight: location.pathname.startsWith('/report') ? 600 : 500,
            color: location.pathname.startsWith('/report') ? 'var(--primary)' : 'var(--text-muted)'
          }}>
            Report
          </span>
        </button>

        <NavItem to="/ai-matches" icon={Sparkles} label="Matches" mobile badge={pendingMatchCount} />
        <NavItem to="/profile" icon={User} label="Profile" mobile />
      </nav>

      {/* Mobile Report Chooser Sheet */}
      {reportSheetOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            zIndex: 90,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
          onClick={() => setReportSheetOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              backgroundColor: 'var(--bg-surface)',
              borderRadius: '16px 16px 0 0',
              padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
              borderTop: '1px solid var(--border)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: '36px', height: '4px', backgroundColor: 'var(--border)', borderRadius: '999px', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px', textAlign: 'center' }}>
              Report an Item
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '20px' }}>
              Select what type of report you want to file
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  setReportSheetOpen(false);
                  navigate('/report/lost');
                }}
                className="btn btn-secondary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  justifyContent: 'flex-start',
                  minHeight: '52px'
                }}
              >
                <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-xs)', backgroundColor: 'var(--warning-light)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FilePlus size={18} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>Report a Lost Item</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>You are searching for something you misplaced</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setReportSheetOpen(false);
                  navigate('/report/found');
                }}
                className="btn btn-secondary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  justifyContent: 'flex-start',
                  minHeight: '52px'
                }}
              >
                <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-xs)', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PackageSearch size={18} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>I Found Something</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>You discovered an item on campus and want to return it</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

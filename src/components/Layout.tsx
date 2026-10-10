import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, Search, FilePlus, User,
  Bell, Sparkles, FolderOpen, ShieldCheck,
  PackageSearch, Menu, X, Home
} from 'lucide-react';

export const Layout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, notifications } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const unreadCount = notifications.filter(n => !n.read).length;

  const NavItem = ({ to, icon: Icon, label, mobile = false }: any) => (
    <NavLink
      to={to}
      onClick={() => setMobileMenuOpen(false)}
      style={({ isActive }) => ({
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
      })}
    >
      <Icon size={mobile ? 24 : 20} strokeWidth={useLocation().pathname === to ? 2.5 : 2} />
      <span style={{ fontSize: mobile ? '0.65rem' : '1rem' }}>{label}</span>
    </NavLink>
  );

  return (
    <div className="app-container">
      {/* Desktop Sidebar */}
      <aside className="sidebar">
        <div style={{ padding: '32px 24px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PackageSearch size={24} />
          </div>
          <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>LostLink</span>
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

        <div style={{ padding: '24px 0' }}>
          <NavItem to="/profile" icon={User} label="Profile" />
          <NavItem to="/admin" icon={ShieldCheck} label="Admin Demo" />
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <button className="btn btn-ghost" style={{ position: 'relative', padding: '8px' }} onClick={() => navigate('/notifications')}>
              <Bell size={22} />
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: '6px', right: '8px', width: '10px', height: '10px', backgroundColor: 'var(--danger)', borderRadius: '50%', border: '2px solid var(--bg-card)' }} />
              )}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => navigate('/profile')}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '1rem' }}>
                {user.name.charAt(0)}
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="mobile-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PackageSearch size={18} />
            </div>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.5px' }}>LostLink</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="btn btn-ghost" style={{ padding: '8px', position: 'relative' }} onClick={() => navigate('/notifications')}>
              <Bell size={20} />
              {unreadCount > 0 && <span style={{ position: 'absolute', top: '6px', right: '8px', width: '8px', height: '8px', backgroundColor: 'var(--danger)', borderRadius: '50%' }} />}
            </button>
            <button className="btn btn-ghost" style={{ padding: '8px' }} onClick={() => setMobileMenuOpen(true)}>
              <Menu size={24} />
            </button>
          </div>
        </header>

        {/* Mobile Nav Overlay Menu (for items not in bottom bar) */}
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
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{user.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user.email}</div>
                    </div>
                  </div>
                  <button onClick={() => setMobileMenuOpen(false)} style={{ padding: '8px', color: 'var(--text-muted)' }}>
                    <X size={24} />
                  </button>
                </div>
                <div style={{ padding: '16px 0', flex: 1 }}>
                  <NavItem to="/report/lost" icon={FilePlus} label="Report Lost Item" />
                  <NavItem to="/report/found" icon={FilePlus} label="Report Found Item" />
                  <div style={{ margin: '16px 24px', height: '1px', backgroundColor: 'var(--border)' }} />
                  <NavItem to="/profile" icon={User} label="Profile" />
                  <NavItem to="/admin" icon={ShieldCheck} label="Admin Demo" />
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
              boxShadow: '0 8px 16px rgba(81, 70, 229, 0.4)'
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

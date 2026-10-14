import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { ItemCard } from '../components/ItemCard';
import { 
  PackageSearch, FilePlus, 
  ChevronRight, Filter, MapPin, RotateCcw, ArrowUpRight 
} from 'lucide-react';
import { motion } from 'framer-motion';
import { getCategoryIllustration } from '../utils/categoryArt';

const CAMPUS_ZONES = [
  'Main Library',
  'Student Union',
  'Science Building',
  'Dining Hall',
  'Sports Complex',
  'Hostel Quad'
];

interface LedgerItemProps {
  label: string;
  count: number;
  sublabel: string;
  color: string;
  onClick?: () => void;
  active?: boolean;
}

const LedgerItem: React.FC<LedgerItemProps> = ({ 
  label, 
  count, 
  sublabel, 
  color, 
  onClick, 
  active = false 
}) => (
  <motion.div
    whileHover={onClick ? { backgroundColor: 'rgba(18, 19, 22, 0.02)' } : {}}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    } : undefined}
    style={{
      flex: 1,
      minWidth: '150px',
      padding: '18px 20px',
      cursor: onClick ? 'pointer' : 'default',
      position: 'relative',
      backgroundColor: active ? 'rgba(18, 19, 22, 0.03)' : 'transparent',
      transition: 'background-color 0.15s ease'
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: `var(--${color}, var(--primary))` }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
    <div style={{ fontSize: '1.9rem', fontFamily: 'var(--font-display)', fontWeight: 800, lineHeight: 1.1, color: 'var(--text-main)', letterSpacing: '-0.03em' }}>
      {count}
    </div>
    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
      {sublabel}
    </div>
  </motion.div>
);

export const Dashboard: React.FC = () => {
  const { user, reports, matches } = useData();
  const navigate = useNavigate();

  const [feedTypeFilter, setFeedTypeFilter] = useState<'all' | 'lost' | 'found'>('all');
  const [selectedZone, setSelectedZone] = useState<string>('All');

  const lostCount = reports.filter(r => r.type === 'lost' && r.status === 'lost').length;
  const foundCount = reports.filter(r => r.type === 'found' && r.status === 'found').length;
  const recoveredCount = reports.filter(r => r.status === 'resolved').length;
  const matchCount = matches.filter(m => m.status === 'pending').length;

  const filteredReports = reports
    .filter(r => feedTypeFilter === 'all' || r.type === feedTypeFilter)
    .filter(r => {
      if (selectedZone === 'All') return true;
      const zoneLower = selectedZone.toLowerCase();
      const matchZone = Boolean(r.campusZone && r.campusZone.toLowerCase() === zoneLower);
      const matchLocation = Boolean(r.location && r.location.toLowerCase().includes(zoneLower));
      return matchZone || matchLocation;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const hasActiveFilters = feedTypeFilter !== 'all' || selectedZone !== 'All';

  const resetFilters = () => {
    setFeedTypeFilter('all');
    setSelectedZone('All');
  };

  const leadReport = filteredReports.length > 0 ? filteredReports[0] : null;
  const subsequentReports = filteredReports.slice(1, 7);

  const filterTabs = [
    { id: 'all' as const, label: `All Items (${reports.length})` },
    { id: 'lost' as const, label: `Lost (${lostCount})`, alert: true },
    { id: 'found' as const, label: `Found (${foundCount})`, custody: true }
  ];

  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* Editorial Masthead */}
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16A34A', display: 'inline-block' }} />
            CAMPUS LIVING REGISTRY • ACTIVE RECOVERY PULSE
          </div>
          <h1 className="page-title">
            Good morning, {user.name.split(' ')[0]}
          </h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Live record of items reported, verified, and reconnected across campus grounds.
          </p>
        </div>

        <div className="dashboard-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-primary" 
            style={{ padding: '10px 18px', fontSize: '0.88rem' }} 
            onClick={() => navigate('/report/lost')}
          >
            <FilePlus size={16} />
            Report Lost
          </button>
          <button 
            className="btn btn-secondary" 
            style={{ padding: '10px 18px', fontSize: '0.88rem' }} 
            onClick={() => navigate('/report/found')}
          >
            <PackageSearch size={16} />
            Report Found
          </button>
        </div>
      </div>

      {/* Unified Campus Registry Ledger */}
      <div 
        className="dashboard-ledger"
        style={{ 
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexWrap: 'wrap',
          marginBottom: '28px',
          overflow: 'hidden'
        }}
      >
        <LedgerItem 
          label="Active Inquiries" 
          count={lostCount} 
          sublabel="Lost items searching for owners"
          color="warning" 
          active={feedTypeFilter === 'lost'}
          onClick={() => setFeedTypeFilter(prev => prev === 'lost' ? 'all' : 'lost')} 
        />
        <div className="dashboard-ledger-divider" style={{ width: '1px', backgroundColor: 'var(--border)' }} />
        <LedgerItem 
          label="Secured Custody" 
          count={foundCount} 
          sublabel="Items awaiting owner verification"
          color="success" 
          active={feedTypeFilter === 'found'}
          onClick={() => setFeedTypeFilter(prev => prev === 'found' ? 'all' : 'found')} 
        />
        <div className="dashboard-ledger-divider" style={{ width: '1px', backgroundColor: 'var(--border)' }} />
        <LedgerItem 
          label="Active Match Signals" 
          count={matchCount} 
          sublabel="Algorithmic pairings under review"
          color="primary" 
          onClick={() => navigate('/ai-matches')} 
        />
        <div className="dashboard-ledger-divider" style={{ width: '1px', backgroundColor: 'var(--border)' }} />
        <LedgerItem 
          label="Archived Reunions" 
          count={recoveredCount} 
          sublabel="Successfully reconnected to students"
          color="text-main" 
          onClick={() => navigate('/browse')} 
        />
      </div>

      {/* Interactive Controls & Zone Bar */}
      <div style={{ 
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border)', 
        borderRadius: 'var(--radius)', 
        boxShadow: 'var(--shadow-sm)',
        padding: '14px 18px', 
        marginBottom: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {/* Animated Segmented Filter using Framer Motion layoutId */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Registry Feed:
            </span>
            <div style={{
              display: 'inline-flex',
              padding: '3px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '999px',
              border: '1px solid var(--border)',
              position: 'relative'
            }}>
              {filterTabs.map(tab => {
                const isSelected = feedTypeFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFeedTypeFilter(tab.id)}
                    style={{
                      position: 'relative',
                      padding: '5px 14px',
                      borderRadius: '999px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: 'none',
                      background: 'transparent',
                      color: isSelected ? 'var(--text-main)' : 'var(--text-secondary)',
                      transition: 'color 0.15s ease',
                      zIndex: 1
                    }}
                  >
                    {isSelected && (
                      <motion.div
                        layoutId="activeFeedPill"
                        style={{
                          position: 'absolute',
                          inset: 0,
                          backgroundColor: '#FFFFFF',
                          borderRadius: '999px',
                          boxShadow: '0 1px 3px rgba(18, 19, 22, 0.08)',
                          zIndex: -1
                        }}
                        transition={{ type: 'spring', damping: 26, stiffness: 340 }}
                      />
                    )}
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.76rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--primary)',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '4px',
                backgroundColor: 'var(--primary-light)',
                border: '1px solid var(--primary-border)',
                transition: 'var(--transition)'
              }}
            >
              <RotateCcw size={11} /> Reset Filter
            </button>
          )}
        </div>

        {/* Campus Zone Scroller */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }} className="hide-scrollbar">
          <span style={{ fontSize: '0.76rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0, textTransform: 'uppercase' }}>
            <MapPin size={12} color="var(--primary)" /> Zone:
          </span>
          <button
            type="button"
            onClick={() => setSelectedZone('All')}
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              cursor: 'pointer',
              transition: 'var(--transition)',
              backgroundColor: selectedZone === 'All' ? 'var(--text-main)' : 'transparent',
              color: selectedZone === 'All' ? '#FFFFFF' : 'var(--text-secondary)',
              border: `1px solid ${selectedZone === 'All' ? 'var(--text-main)' : 'var(--border)'}`
            }}
          >
            ALL ZONES
          </button>
          {CAMPUS_ZONES.map(zone => {
            const isSelected = selectedZone === zone;
            return (
              <button
                key={zone}
                type="button"
                onClick={() => setSelectedZone(zone)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  cursor: 'pointer',
                  transition: 'var(--transition)',
                  backgroundColor: isSelected ? 'var(--primary)' : 'transparent',
                  color: isSelected ? '#FFFFFF' : 'var(--text-secondary)',
                  border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`
                }}
              >
                {zone.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Asymmetric Section: Lead Campus Bulletin + Grid */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Campus Bulletins {hasActiveFilters ? `(${filteredReports.length})` : ''}
          </h2>
          <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', backgroundColor: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '4px' }}>
            CHRONOLOGICAL LOG
          </span>
        </div>
        <button className="btn btn-ghost" onClick={() => navigate('/browse')} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.84rem' }}>
          Browse All <ChevronRight size={14} />
        </button>
      </div>

      {/* Featured Lead Bulletin (Asymmetric composition breaking the generic card grid) */}
      {leadReport && (
        <div 
          className="card dashboard-lead-card"
          data-cursor="EXAMINE DOSSIER"
          onClick={() => navigate(`/items/${leadReport.id}`)}
          style={{
            marginBottom: '24px',
            cursor: 'pointer',
            padding: '24px',
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '24px',
            alignItems: 'center'
          }}
        >
          {/* Specimen Media on Left */}
          <div style={{
            height: '240px',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            background: getCategoryIllustration(leadReport.category).bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--border)',
            position: 'relative'
          }}>
            {leadReport.imageUrl ? (
              <img 
                src={leadReport.imageUrl} 
                alt={leadReport.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '3.8rem', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.06))' }}>
                  {getCategoryIllustration(leadReport.category).emoji}
                </span>
                <div style={{ fontSize: '0.74rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {leadReport.category}
                </div>
              </div>
            )}
            <div style={{ position: 'absolute', top: '12px', left: '12px' }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '3px',
                backgroundColor: leadReport.type === 'lost' ? 'rgba(254, 243, 199, 0.95)' : 'rgba(236, 253, 245, 0.95)',
                color: leadReport.type === 'lost' ? '#92400E' : '#065F46',
                border: `1px solid ${leadReport.type === 'lost' ? 'rgba(217, 119, 6, 0.3)' : 'rgba(13, 122, 95, 0.3)'}`
              }}>
                {leadReport.type === 'lost' ? '● RECENT INQUIRY' : '◆ RECENT CUSTODY'}
              </span>
            </div>
          </div>

          {/* Dossier Information on Right */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="docket-meta">
                REF #LL-{leadReport.id.slice(-4).toUpperCase()}
              </span>
              <span style={{ color: 'var(--border)' }}>•</span>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {new Date(leadReport.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>

            <h3 style={{ fontSize: '1.45rem', fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.025em', lineHeight: 1.2 }}>
              {leadReport.title}
            </h3>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              <MapPin size={14} color="var(--primary)" />
              <span>{leadReport.campusZone ? `${leadReport.campusZone} • ${leadReport.location}` : leadReport.location}</span>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: '4px' }}>
              {leadReport.description}
            </p>

            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', fontWeight: 600, fontSize: '0.84rem' }}>
              Examine Complete Dossier <ArrowUpRight size={15} />
            </div>
          </div>
        </div>
      )}

      {/* Subsequent Reports in Dense Grid */}
      <div className="grid grid-cols-3 gap-6">
        {subsequentReports.map(report => (
          <ItemCard key={report.id} item={report} onClick={() => navigate(`/items/${report.id}`)} />
        ))}

        {reports.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '64px 24px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <PackageSearch size={44} color="var(--text-muted)" style={{ margin: '0 auto 16px', opacity: 0.6 }} />
            <h3 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>No items recorded in registry</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Be the first student to log an active lost inquiry or found custody report.</p>
          </div>
        )}

        {reports.length > 0 && filteredReports.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '56px 24px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <Filter size={38} color="var(--text-muted)" style={{ margin: '0 auto 12px', opacity: 0.6 }} />
            <h3 style={{ fontSize: '1.15rem', marginBottom: '6px' }}>No matching registry reports</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
              No {feedTypeFilter !== 'all' ? feedTypeFilter : ''} items match {selectedZone !== 'All' ? `"${selectedZone}"` : 'the active filters'}.
            </p>
            <button className="btn btn-secondary" onClick={resetFilters} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
              <RotateCcw size={14} /> Clear Active Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};


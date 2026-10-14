import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { ItemCard } from '../components/ItemCard';
import { Search, Filter, X, Loader2, AlertCircle, RotateCcw, Compass } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Category } from '../types';
import { getCategoryIllustration } from '../utils/categoryArt';

export const BrowseItems: React.FC = () => {
  const { reports, loading, error } = useData();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const searchTerm = searchParams.get('q') || '';
  const [statusFilter, setStatusFilter] = useState<'all' | 'lost' | 'found'>('all');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'All'>('All');

  const categories: (Category | 'All')[] = ['All', 'Electronics', 'ID Cards', 'Bags', 'Books', 'Accessories', 'Keys', 'Other'];

  // Deep-link resolution for ?id= query parameter
  useEffect(() => {
    const idParam = searchParams.get('id');
    if (idParam) {
      const exists = reports.some(r => r.id === idParam);
      if (exists) {
        navigate(`/items/${idParam}`, { replace: true });
      }
    }
  }, [searchParams, reports, navigate]);

  const handleSearchChange = (value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value.trim()) {
        next.set('q', value);
      } else {
        next.delete('q');
      }
      return next;
    }, { replace: true });
  };

  const handleClearSearch = () => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('q');
      return next;
    }, { replace: true });
  };

  const resetAllFilters = () => {
    handleClearSearch();
    setStatusFilter('all');
    setCategoryFilter('All');
  };

  const hasActiveFilters = Boolean(searchTerm.trim()) || statusFilter !== 'all' || categoryFilter !== 'All';

  const lostCount = reports.filter(r => r.type === 'lost' && r.status === 'lost').length;
  const foundCount = reports.filter(r => r.type === 'found' && r.status === 'found').length;

  const filteredReports = reports.filter(report => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = !term || 
      report.title.toLowerCase().includes(term) || 
      report.description.toLowerCase().includes(term) ||
      report.location.toLowerCase().includes(term) ||
      (report.campusZone && report.campusZone.toLowerCase().includes(term));
    const matchesStatus = statusFilter === 'all' || report.type === statusFilter;
    const matchesCategory = categoryFilter === 'All' || report.category === categoryFilter;
    
    return matchesSearch && matchesStatus && matchesCategory;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div style={{ paddingBottom: '48px' }}>
      {/* Editorial Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span className="mono-token mono-token-amber">REGISTRY CATALOG</span>
            <span className="mono-token mono-token-subtle">VOL. 2026 // CAMPUS SPECIMEN INDEX</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.5rem', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '-0.025em', margin: 0, lineHeight: 1.15 }}>
            Browse Specimen Index
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.98rem', marginTop: '6px', maxWidth: '640px', lineHeight: 1.5 }}>
            Live catalog of lost possessions and recovered articles currently tracked across campus zones.
          </p>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetAllFilters}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.82rem',
              fontWeight: 650,
              padding: '8px 16px',
              marginTop: '4px'
            }}
          >
            <RotateCcw size={14} /> Clear Active Filters
          </button>
        )}
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', fontWeight: 500, marginBottom: '20px' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Tactile Search & Filter Console */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        padding: '20px',
        marginBottom: '28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px'
      }}>
        {/* Top Search Input & Sliding Type Segmented Control */}
        <div className="browse-controls-row" style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ position: 'relative', flex: '1 1 340px' }} className="browse-search-wrapper">
            <Search size={17} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search by keywords, location, zone, or details..." 
              className="form-control" 
              style={{ 
                paddingLeft: '44px', 
                paddingRight: searchTerm ? '42px' : '16px',
                height: '46px',
                borderRadius: '8px', 
                backgroundColor: 'var(--bg-canvas)', 
                border: '1px solid var(--border)', 
                fontSize: '0.92rem',
                fontFamily: 'var(--font-sans)',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)'
              }}
              value={searchTerm}
              onChange={e => handleSearchChange(e.target.value)}
            />
            {searchTerm && (
              <button 
                type="button"
                onClick={handleClearSearch} 
                style={{ 
                  position: 'absolute', 
                  right: '12px', 
                  top: '50%', 
                  transform: 'translateY(-50%)', 
                  color: 'var(--text-muted)', 
                  cursor: 'pointer', 
                  background: 'rgba(0, 0, 0, 0.06)', 
                  border: 'none',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                aria-label="Clear search input"
              >
                <X size={14} />
              </button>
            )}
          </div>
          
          {/* Framer Motion Sliding Status Type Control */}
          <div className="browse-status-tabs" style={{
            display: 'inline-flex',
            position: 'relative',
            padding: '4px',
            backgroundColor: 'var(--bg-canvas)',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            gap: '2px',
            flexWrap: 'wrap'
          }}>
            {[
              { id: 'all', label: `All Docket (${reports.length})`, shortLabel: `All (${reports.length})`, color: 'var(--text-main)' },
              { id: 'lost', label: `Active Search (${lostCount})`, shortLabel: `Lost (${lostCount})`, color: '#B45309' },
              { id: 'found', label: `In Custody (${foundCount})`, shortLabel: `Found (${foundCount})`, color: '#047857' }
            ].map(tab => {
              const isSelected = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id as 'all' | 'lost' | 'found')}
                  style={{
                    position: 'relative',
                    padding: '8px 16px',
                    borderRadius: '7px',
                    fontSize: '0.82rem',
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    color: isSelected ? tab.color : 'var(--text-secondary)',
                    backgroundColor: 'transparent',
                    border: 'none',
                    zIndex: 1,
                    transition: 'color 0.15s ease'
                  }}
                  className="browse-tab-btn"
                >
                  {isSelected && (
                    <motion.div
                      layoutId="browseStatusPill"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundColor: '#FFFFFF',
                        borderRadius: '7px',
                        boxShadow: 'var(--shadow-sm), inset 0 1px 0 rgba(255,255,255,1)',
                        zIndex: -1
                      }}
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}
                  <span className="desktop-only-inline">{tab.label}</span>
                  <span className="mobile-only-inline">{tab.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Category Taxonomy Chips */}
        <div className="browse-category-scroller hide-scrollbar" style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: '4px', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
            <Filter size={13} color="var(--text-muted)" />
            <span>TAXONOMY:</span>
          </div>
          {categories.map(cat => {
            const catArt = cat === 'All' ? { emoji: '🔍' } : getCategoryIllustration(cat);
            const isSelected = categoryFilter === cat;

            return (
              <button 
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                style={{ 
                  padding: '6px 14px', 
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: isSelected ? 650 : 500,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: isSelected ? 'var(--text-main)' : 'var(--bg-canvas)',
                  color: isSelected ? '#FFFFFF' : 'var(--text-secondary)',
                  border: `1px solid ${isSelected ? 'var(--text-main)' : 'var(--border)'}`,
                  boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
                  transition: 'all 0.15s ease',
                  cursor: 'pointer'
                }}
              >
                <span>{catArt.emoji}</span>
                <span>{cat}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Results Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ fontSize: '1.15rem', color: 'var(--text-main)', fontWeight: 700, margin: 0 }}>
            {hasActiveFilters ? `Filtered Ledger (${filteredReports.length})` : `All Indexed Items (${reports.length})`}
          </h2>
          <span className="mono-token mono-token-subtle" style={{ fontSize: '0.72rem' }}>
            {filteredReports.length} RECORD{filteredReports.length === 1 ? '' : 'S'}
          </span>
        </div>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          SORT: CHRONOLOGICAL DESCENDING
        </span>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-4 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredReports.map((report, idx) => (
            <motion.div
              key={report.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.22, delay: Math.min(idx * 0.04, 0.3) }}
            >
              <ItemCard 
                item={report} 
                onClick={() => navigate(`/items/${report.id}`)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      
      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 24px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px', color: 'var(--text-main)' }} />
          <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>SYNCING CAMPUS ARCHIVE REGISTRY...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '72px 24px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px dashed var(--border)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--bg-canvas)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', color: 'var(--text-muted)' }}>
            <Compass size={30} />
          </div>
          <div className="mono-token mono-token-subtle" style={{ marginBottom: '8px' }}>ZERO MATCHES</div>
          <h3 style={{ fontSize: '1.25rem', color: 'var(--text-main)', marginBottom: '8px', fontWeight: 700 }}>No specimens match active criteria</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto 20px', fontSize: '0.92rem', lineHeight: 1.55 }}>
            No {statusFilter !== 'all' ? statusFilter : ''} reports were found matching {searchTerm ? `"${searchTerm}"` : 'the selected filters'}. Check your query or reset the catalog view.
          </p>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={resetAllFilters}
            style={{ padding: '8px 20px', fontSize: '0.88rem' }}
          >
            <RotateCcw size={14} /> Clear All Filters
          </button>
        </div>
      ) : null}
    </div>
  );
};


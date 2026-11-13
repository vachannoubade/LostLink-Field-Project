import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { ItemCard } from '../components/ItemCard';
import { Search, X, Loader2, AlertCircle, RotateCcw, PackageSearch } from 'lucide-react';
import type { Category } from '../types';

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
    <div style={{ maxWidth: '1040px', margin: '0 auto', paddingBottom: '48px' }}>
      {/* Clean Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">
            Browse campus items
          </h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Search and filter lost belongings and found items across campus grounds.
          </p>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetAllFilters}
            className="btn btn-secondary btn-sm"
          >
            <RotateCcw size={14} /> Clear filters
          </button>
        )}
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: 'var(--danger-light)', border: '1px solid var(--danger-border)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', marginBottom: '20px' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar Container */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        padding: '16px',
        marginBottom: '28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 300px' }}>
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input 
              type="text" 
              placeholder="Search by keywords, location, or details..." 
              className="form-control" 
              style={{ 
                paddingLeft: '38px', 
                paddingRight: searchTerm ? '38px' : '14px',
                height: '42px',
                fontSize: '0.88rem'
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
                  right: '10px', 
                  top: '50%', 
                  transform: 'translateY(-50%)', 
                  color: 'var(--text-muted)', 
                  cursor: 'pointer', 
                  background: 'var(--bg-secondary)', 
                  border: 'none',
                  borderRadius: '50%',
                  width: '22px',
                  height: '22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                aria-label="Clear search input"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Type Segmented Control: All · Lost · Found */}
          <div className="tabs-container" role="tablist" aria-label="Filter by report status">
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === 'all'}
              className={`tab-btn ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All items ({reports.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === 'lost'}
              className={`tab-btn ${statusFilter === 'lost' ? 'active' : ''}`}
              onClick={() => setStatusFilter('lost')}
            >
              Lost ({lostCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === 'found'}
              className={`tab-btn ${statusFilter === 'found' ? 'active' : ''}`}
              onClick={() => setStatusFilter('found')}
            >
              Found ({foundCount})
            </button>
          </div>
        </div>

        {/* Category Pill Filters */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginRight: '4px', fontWeight: 500 }}>Category:</span>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.78rem',
                fontWeight: 500,
                border: '1px solid',
                borderColor: categoryFilter === cat ? 'var(--primary)' : 'var(--border)',
                backgroundColor: categoryFilter === cat ? 'var(--primary-light)' : 'transparent',
                color: categoryFilter === cat ? 'var(--primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'var(--transition-fast)'
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <Loader2 size={32} className="spin-loader" style={{ margin: '0 auto 12px', color: 'var(--primary)' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading items...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div style={{
          padding: '64px 20px',
          textAlign: 'center',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)'
        }}>
          <PackageSearch size={36} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
            {hasActiveFilters ? 'Nothing matches your search.' : 'No items reported yet.'}
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '380px', margin: '0 auto 18px' }}>
            {hasActiveFilters
              ? 'Try searching with different keywords or clearing your active filters.'
              : 'When items are reported on campus, they will appear here.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="btn btn-secondary btn-sm"
            >
              <RotateCcw size={14} /> Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3" style={{ gap: '20px' }}>
          {filteredReports.map(report => (
            <ItemCard
              key={report.id}
              item={report}
              onClick={() => navigate(`/items/${report.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

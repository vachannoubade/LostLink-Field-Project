import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { ItemCard } from '../components/ItemCard';
import { 
  Search, FilePlus, PackageSearch, ArrowRight,
  RotateCcw
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { reports } = useData();
  const navigate = useNavigate();

  const [typeFilter, setTypeFilter] = useState<'all' | 'lost' | 'found'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const lostCount = reports.filter(r => r.type === 'lost' && r.status === 'lost').length;
  const foundCount = reports.filter(r => r.type === 'found' && r.status === 'found').length;
  const resolvedCount = reports.filter(r => r.status === 'resolved').length;

  const categories = ['All', 'Electronics', 'ID Cards', 'Bags', 'Books', 'Accessories', 'Keys', 'Other'];

  const filteredReports = reports
    .filter(r => {
      if (typeFilter === 'all') return true;
      return r.type === typeFilter;
    })
    .filter(r => {
      if (selectedCategory === 'All') return true;
      return r.category === selectedCategory;
    })
    .filter(r => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q) ||
        (r.campusZone && r.campusZone.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/browse?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div style={{ maxWidth: '1040px', margin: '0 auto', paddingBottom: '48px' }}>
      {/* Calm, Apple-Grade Hero Section */}
      <section style={{
        padding: '36px 0 28px',
        borderBottom: '1px solid var(--border)',
        marginBottom: '32px'
      }}>
        <h1 className="hero-title">
          Lost something? Let's find it.
        </h1>
        <p className="hero-subtitle">
          Report lost or found items and reconnect belongings with their owners on campus.
        </p>

        {/* Primary Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <button
            onClick={() => navigate('/report/lost')}
            className="btn btn-primary"
            style={{ padding: '11px 22px', fontSize: '0.92rem', borderRadius: 'var(--radius-sm)' }}
          >
            <FilePlus size={18} />
            <span>Report a lost item</span>
          </button>
          <button
            onClick={() => navigate('/report/found')}
            className="btn btn-secondary"
            style={{ padding: '11px 22px', fontSize: '0.92rem', borderRadius: 'var(--radius-sm)' }}
          >
            <PackageSearch size={18} />
            <span>I found something</span>
          </button>
        </div>

        {/* Compact Integrated Search Bar */}
        <form onSubmit={handleSearchSubmit} style={{ maxWidth: '520px', position: 'relative' }}>
          <Search size={17} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            placeholder="Search by item name, category or campus location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-control"
            style={{
              paddingLeft: '40px',
              paddingRight: '80px',
              height: '44px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.9rem'
            }}
          />
          <button
            type="submit"
            className="btn btn-ghost"
            style={{
              position: 'absolute',
              right: '6px',
              top: '50%',
              transform: 'translateY(-50%)',
              padding: '6px 12px',
              fontSize: '0.82rem',
              color: 'var(--primary)',
              fontWeight: 500
            }}
          >
            Search
          </button>
        </form>

        {/* Small Truthful Campus Overview Indicators */}
        <div style={{
          display: 'flex',
          gap: '24px',
          flexWrap: 'wrap',
          marginTop: '28px',
          fontSize: '0.84rem',
          color: 'var(--text-secondary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--warning)' }} />
            <span><strong>{lostCount}</strong> active lost inquiries</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />
            <span><strong>{foundCount}</strong> items in campus custody</span>
          </div>
          {resolvedCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success)' }} />
              <span><strong>{resolvedCount}</strong> belongings reunited</span>
            </div>
          )}
        </div>
      </section>

      {/* Browse Section Header & Segmented Filters */}
      <section>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px'
        }}>
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>
              Recently reported
            </h2>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
              Latest items registered across university grounds
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Clean Segmented Filter: All · Lost · Found */}
            <div className="tabs-container" role="tablist" aria-label="Item Type Filter">
              <button
                type="button"
                role="tab"
                aria-selected={typeFilter === 'all'}
                className={`tab-btn ${typeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setTypeFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={typeFilter === 'lost'}
                className={`tab-btn ${typeFilter === 'lost' ? 'active' : ''}`}
                onClick={() => setTypeFilter('lost')}
              >
                Lost ({lostCount})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={typeFilter === 'found'}
                className={`tab-btn ${typeFilter === 'found' ? 'active' : ''}`}
                onClick={() => setTypeFilter('found')}
              >
                Found ({foundCount})
              </button>
            </div>

            {/* Simple Category Selector */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="form-select"
              style={{
                width: 'auto',
                minWidth: '130px',
                height: '36px',
                padding: '4px 10px',
                fontSize: '0.82rem'
              }}
              aria-label="Filter by category"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Reports Grid */}
        {filteredReports.length === 0 ? (
          <div style={{
            padding: '64px 20px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)'
          }}>
            <PackageSearch size={36} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
              {searchQuery.trim() ? 'Nothing matches your search.' : typeFilter !== 'all' ? 'No items found in this filter.' : 'No items reported yet.'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '380px', margin: '0 auto 18px' }}>
              {searchQuery.trim()
                ? 'Try adjusting your search keywords or switching filters.'
                : 'Items reported on campus will appear here in chronological order.'}
            </p>
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setSelectedCategory('All'); setTypeFilter('all'); }}
                className="btn btn-secondary btn-sm"
              >
                <RotateCcw size={14} /> Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3" style={{ gap: '20px' }}>
            {filteredReports.slice(0, 9).map((report) => (
              <ItemCard
                key={report.id}
                item={report}
                onClick={() => navigate(`/items/${report.id}`)}
              />
            ))}
          </div>
        )}

        {/* View All In Browse Link */}
        {filteredReports.length > 9 && (
          <div style={{ textAlign: 'center', marginTop: '32px' }}>
            <button
              onClick={() => navigate('/browse')}
              className="btn btn-secondary"
              style={{ padding: '10px 24px' }}
            >
              <span>View all reported items</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

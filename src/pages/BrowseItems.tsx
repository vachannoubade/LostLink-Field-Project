import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { ItemCard } from '../components/ItemCard';
import { Search, Filter, X, Loader2, AlertCircle } from 'lucide-react';
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

  const filteredReports = reports.filter(report => {
    const matchesSearch = report.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          report.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || report.type === statusFilter;
    const matchesCategory = categoryFilter === 'All' || report.category === categoryFilter;
    
    return matchesSearch && matchesStatus && matchesCategory;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div style={{ paddingBottom: '32px' }}>
      <h1 className="page-title">Browse Items</h1>
      <p className="page-subtitle">Search through reported lost and found items on campus.</p>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', fontWeight: 500, marginBottom: '16px' }}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 280px' }}>
            <Search size={18} style={{ position: 'absolute', left: '16px', top: '14px', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search items by name or description..." 
              className="form-control"
              style={{ paddingLeft: '44px', borderRadius: 'var(--radius-lg)' }}
              value={searchTerm}
              onChange={e => handleSearchChange(e.target.value)}
            />
            {searchTerm && (
              <button 
                onClick={handleClearSearch} 
                style={{ position: 'absolute', right: '12px', top: '14px', color: 'var(--text-muted)' }}
                aria-label="Clear search input"
              >
                <X size={18} />
              </button>
            )}
          </div>
          
          <select 
            className="form-control" 
            style={{ width: 'auto', flex: '0 0 auto', borderRadius: 'var(--radius-lg)', paddingRight: '36px', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2370758A\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            aria-label="Filter by report status"
          >
            <option value="all">All Types</option>
            <option value="lost">Lost Only</option>
            <option value="found">Found Only</option>
          </select>
        </div>

        {/* Horizontally scrollable chips */}
        <div className="hide-scrollbar" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', margin: '0 -16px', padding: '0 16px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '0.875rem', marginRight: '8px', flexShrink: 0 }}>
            <Filter size={16} />
            <span>Categories:</span>
          </div>
          {categories.map(cat => (
            <button 
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              style={{ 
                padding: '8px 16px', 
                borderRadius: '999px',
                fontSize: '0.875rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                backgroundColor: categoryFilter === cat ? 'var(--text-main)' : 'var(--bg-card)',
                color: categoryFilter === cat ? 'white' : 'var(--text-main)',
                border: `1px solid ${categoryFilter === cat ? 'var(--text-main)' : 'var(--border)'}`,
                transition: 'var(--transition)'
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {filteredReports.map(report => (
          <ItemCard 
            key={report.id} 
            item={report} 
            onClick={() => navigate(`/items/${report.id}`)}
          />
        ))}
      </div>
      
      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 24px', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <Loader2 size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px', color: 'var(--primary)' }} />
          <p style={{ color: 'var(--text-muted)' }}>Loading reports...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 24px', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--bg-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Search size={32} color="var(--text-muted)" />
          </div>
          <h3 style={{ fontSize: '1.25rem', color: 'var(--text-main)', marginBottom: '8px' }}>No items found</h3>
          <p style={{ color: 'var(--text-muted)' }}>Try adjusting your filters or search term to find what you're looking for.</p>
        </div>
      ) : null}
    </div>
  );
};

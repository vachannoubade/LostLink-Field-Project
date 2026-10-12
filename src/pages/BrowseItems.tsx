import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { CAMPUS_ZONES } from '../store/seedData';
import { ItemCard } from '../components/ItemCard';
import { Search, Filter, X, MapPin, RotateCcw } from 'lucide-react';
import type { Category } from '../types';

const CATEGORY_META: { label: Category | 'All'; emoji: string }[] = [
  { label: 'All', emoji: '✨' },
  { label: 'Electronics', emoji: '🎧' },
  { label: 'ID Cards', emoji: '🪪' },
  { label: 'Accessories', emoji: '💧' },
  { label: 'Keys', emoji: '🔑' },
  { label: 'Books', emoji: '📓' },
  { label: 'Bags', emoji: '🎒' },
  { label: 'Other', emoji: '📦' }
];

export const BrowseItems: React.FC = () => {
  const { reports, setSelectedReportId } = useData();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState<'all' | 'lost' | 'found' | 'resolved'>(
    (searchParams.get('type') as any) || 'all'
  );
  const [categoryFilter, setCategoryFilter] = useState<Category | 'All'>('All');
  const [zoneFilter, setZoneFilter] = useState<string>('All');

  useEffect(() => {
    const q = searchParams.get('q');
    const type = searchParams.get('type');
    const id = searchParams.get('id');
    if (q !== null) setSearchTerm(q);
    if (type === 'lost' || type === 'found' || type === 'resolved') setStatusFilter(type);
    if (id) setSelectedReportId(id);
  }, [searchParams, setSelectedReportId]);

  const filteredReports = reports
    .filter(report => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        !q ||
        report.title.toLowerCase().includes(q) ||
        report.description.toLowerCase().includes(q) ||
        report.location.toLowerCase().includes(q) ||
        (report.reporterName && report.reporterName.toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'resolved'
          ? report.status === 'resolved'
          : report.type === statusFilter && report.status !== 'resolved';

      const matchesCategory = categoryFilter === 'All' || report.category === categoryFilter;
      const matchesZone =
        zoneFilter === 'All' ||
        report.campusZone === zoneFilter ||
        report.location.toLowerCase().includes(zoneFilter.toLowerCase());

      return matchesSearch && matchesStatus && matchesCategory && matchesZone;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const clearAllFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setCategoryFilter('All');
    setZoneFilter('All');
    setSearchParams({});
  };

  const hasActiveFilters =
    searchTerm !== '' || statusFilter !== 'all' || categoryFilter !== 'All' || zoneFilter !== 'All';

  return (
    <div style={{ paddingBottom: '36px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title serif-accent">Explore Campus Items</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Browse reported items, share a sighting, or help a fellow student reunite with their gear.
          </p>
        </div>

        {/* Status Segmented Tabs */}
        <div style={{
          display: 'inline-flex',
          padding: '5px',
          borderRadius: '14px',
          backgroundColor: 'var(--bg-subtle)',
          border: '1px solid var(--border)',
          gap: '4px',
          flexWrap: 'wrap'
        }}>
          {[
            { id: 'all', label: 'All Items' },
            { id: 'lost', label: '🔍 Lost' },
            { id: 'found', label: '🙌 Found' },
            { id: 'resolved', label: '🎉 Reunited' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '0.84rem',
                fontWeight: 700,
                backgroundColor: statusFilter === tab.id ? 'var(--bg-card)' : 'transparent',
                color: statusFilter === tab.id ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: statusFilter === tab.id ? 'var(--shadow-sm)' : 'none',
                transition: 'var(--transition)'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search & Zone Filter Bar */}
      <div className="card" style={{ padding: '20px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 280px' }}>
            <Search size={18} style={{ position: 'absolute', left: '16px', top: '15px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by item name, sticker, location, or student name..."
              className="form-control"
              style={{ paddingLeft: '44px', borderRadius: '14px' }}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{ position: 'absolute', right: '14px', top: '15px', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            )}
          </div>

          <div style={{ position: 'relative', minWidth: '210px' }}>
            <MapPin size={16} style={{ position: 'absolute', left: '14px', top: '16px', color: 'var(--accent-warm)', pointerEvents: 'none' }} />
            <select
              className="form-control"
              style={{
                paddingLeft: '38px',
                paddingRight: '36px',
                borderRadius: '14px',
                appearance: 'none',
                backgroundImage:
                  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2378716C\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center'
              }}
              value={zoneFilter}
              onChange={e => setZoneFilter(e.target.value)}
            >
              <option value="All">All Campus Zones</option>
              {CAMPUS_ZONES.map(z => (
                <option key={z.id} value={z.id}>
                  {z.icon} {z.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category Chips */}
        <div className="hide-scrollbar" style={{ display: 'flex', gap: '8px', overflowX: 'auto', alignItems: 'center', paddingBottom: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600, marginRight: '4px', flexShrink: 0 }}>
            <Filter size={14} />
            <span>Category:</span>
          </div>
          {CATEGORY_META.map(cat => {
            const active = categoryFilter === cat.label;
            return (
              <button
                key={cat.label}
                onClick={() => setCategoryFilter(cat.label)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '999px',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: active ? 'var(--primary)' : 'var(--bg-subtle)',
                  color: active ? 'white' : 'var(--text-main)',
                  border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                  transition: 'var(--transition)'
                }}
              >
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Results Count & Active Filter Reset */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
        <span>
          Showing <strong style={{ color: 'var(--text-main)' }}>{filteredReports.length}</strong> campus {filteredReports.length === 1 ? 'report' : 'reports'}
        </span>
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', fontWeight: 700, fontSize: '0.84rem' }}
          >
            <RotateCcw size={14} /> Reset all filters
          </button>
        )}
      </div>

      <div className="grid grid-cols-4">
        {filteredReports.map(report => (
          <ItemCard key={report.id} item={report} />
        ))}
      </div>

      {filteredReports.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '72px 24px',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)'
        }}>
          <div style={{
            width: '76px',
            height: '76px',
            borderRadius: '50%',
            backgroundColor: 'var(--bg-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 18px',
            fontSize: '2rem'
          }}>
            🔍
          </div>
          <h3 style={{ fontSize: '1.25rem', color: 'var(--text-main)', marginBottom: '8px' }}>
            No matching items spotted yet
          </h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 20px' }}>
            Try broadening your search filters, or post a report so our campus AI can alert you the moment a match appears.
          </p>
          <button className="btn btn-secondary" onClick={clearAllFilters}>
            Clear Search Filters
          </button>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { useData } from '../store/DataContext';
import { RotateCcw, AlertTriangle } from 'lucide-react';

export const Admin: React.FC = () => {
  const { reports, matches, resetDemoData } = useData();

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Admin Demo Mode</h1>
        <span className="badge" style={{ backgroundColor: 'var(--warning-light)', color: '#C05621' }}>Demo Only</span>
      </div>
      <p className="page-subtitle">Manage all system data and review metrics. Not for production use.</p>

      <div className="card" style={{ padding: '24px', marginBottom: '32px', display: 'flex', flexDirection: 'column', gap: '20px', backgroundColor: '#FFFAF0', borderColor: '#FEEBC8' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <AlertTriangle color="#DD6B20" size={28} style={{ flexShrink: 0 }} />
          <div>
            <h3 style={{ fontSize: '1.125rem', color: '#9C4221', marginBottom: '4px' }}>Demo Data Management</h3>
            <p style={{ color: '#C05621', fontSize: '0.9rem', lineHeight: 1.5 }}>Resetting the data will restore the initial set of fictional reports and clear all user-submitted data. This action cannot be undone.</p>
          </div>
        </div>
        <button className="btn" onClick={() => {
          if (window.confirm('Are you sure you want to reset all data to initial state?')) {
            resetDemoData();
          }
        }} style={{ backgroundColor: 'white', border: '1px solid #FBD38D', color: '#C05621', alignSelf: 'flex-start' }}>
          <RotateCcw size={18} />
          Reset Demo Data
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6" style={{ marginBottom: '32px' }}>
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>Total Reports</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-main)' }}>{reports.length}</div>
        </div>
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>Matches Found</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-main)' }}>{matches.length}</div>
        </div>
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>Resolved Items</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-main)' }}>{reports.filter(r => r.status === 'resolved').length}</div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', backgroundColor: 'var(--bg-color)', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-main)' }}>
          All System Reports
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>ID</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Type</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Title</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Status</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Date Added</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(report => (
                <tr key={report.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '16px 24px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>{report.id.substring(0, 8)}</td>
                  <td style={{ padding: '16px 24px' }}>
                    <span className={`badge ${report.type === 'lost' ? 'badge-lost' : 'badge-found'}`}>{report.type}</span>
                  </td>
                  <td style={{ padding: '16px 24px', fontSize: '0.9rem', fontWeight: 600 }}>{report.title}</td>
                  <td style={{ padding: '16px 24px' }}>
                    <span className={`badge ${report.status === 'resolved' ? 'badge-match' : (report.status === 'lost' ? 'badge-lost' : 'badge-found')}`}>{report.status}</span>
                  </td>
                  <td style={{ padding: '16px 24px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>{new Date(report.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

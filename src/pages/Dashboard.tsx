import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { ItemCard } from '../components/ItemCard';
import { AlertCircle, CheckCircle, PackageSearch, Sparkles, FilePlus, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

export const Dashboard: React.FC = () => {
  const { user, reports, matches } = useData();
  const navigate = useNavigate();

  const lostCount = reports.filter(r => r.type === 'lost' && r.status === 'lost').length;
  const foundCount = reports.filter(r => r.type === 'found' && r.status === 'found').length;
  const recoveredCount = reports.filter(r => r.status === 'resolved').length;
  const matchCount = matches.filter(m => m.status === 'pending').length;

  const recentReports = [...reports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 4);

  const SummaryCard = ({ title, count, icon: Icon, color, bg = 'var(--bg-card)' }: any) => (
    <motion.div 
      className="card" 
      style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: bg }}
      whileHover={{ y: -2, boxShadow: 'var(--shadow-md)' }}
    >
      <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: `var(--${color}-light, #f1f5f9)`, color: `var(--${color}, #64748b)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={24} />
      </div>
      <div>
        <div style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2, color: 'var(--text-main)' }}>{count}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.02em' }}>{title}</div>
      </div>
    </motion.div>
  );

  return (
    <div style={{ paddingBottom: '32px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 className="page-title">Good morning, {user.name.split(' ')[0]}</h1>
        <p className="page-subtitle">Campus recovery overview for today.</p>
      </div>

      <div className="grid grid-cols-2" style={{ gap: '16px', marginBottom: '32px' }}>
        <SummaryCard title="Lost Items" count={lostCount} icon={AlertCircle} color="danger" />
        <SummaryCard title="Found Items" count={foundCount} icon={PackageSearch} color="success" />
        <SummaryCard title="Potential Matches" count={matchCount} icon={Sparkles} color="primary" bg="var(--primary-light)" />
        <SummaryCard title="Recovered" count={recoveredCount} icon={CheckCircle} color="text-main" />
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '40px', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" style={{ flex: 1, minWidth: '160px', padding: '16px', fontSize: '1rem' }} onClick={() => navigate('/report/lost')}>
          <FilePlus size={20} />
          Report Lost
        </button>
        <button className="btn btn-secondary" style={{ flex: 1, minWidth: '160px', padding: '16px', fontSize: '1rem' }} onClick={() => navigate('/report/found')}>
          <PackageSearch size={20} />
          Report Found
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Recently Reported</h2>
        <button className="btn btn-ghost" onClick={() => navigate('/browse')} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          View All <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {recentReports.map(report => (
          <ItemCard key={report.id} item={report} onClick={() => navigate(`/items/${report.id}`)} />
        ))}
        {recentReports.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '64px 24px', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <PackageSearch size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <h3 style={{ fontSize: '1.125rem', marginBottom: '8px' }}>No items reported</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Be the first to report a lost or found item on campus.</p>
          </div>
        )}
      </div>
    </div>
  );
};

import React from 'react';
import { useData } from '../store/DataContext';
import { ItemCard } from '../components/ItemCard';
import { FolderOpen } from 'lucide-react';
import { motion } from 'framer-motion';

export const MyReports: React.FC = () => {
  const { reports, user } = useData();

  const myReports = reports.filter(r => r.userId === user.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div style={{ paddingBottom: '32px' }}>
      <h1 className="page-title">My Items</h1>
      <p className="page-subtitle">Manage items you have reported as lost or found.</p>

      {myReports.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card" 
          style={{ padding: '80px 24px', textAlign: 'center' }}
        >
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--bg-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--text-muted)' }}>
            <FolderOpen size={40} />
          </div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>No reports yet</h3>
          <p style={{ color: 'var(--text-muted)' }}>You haven't reported any lost or found items.</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-4 gap-6">
          {myReports.map(report => (
            <ItemCard key={report.id} item={report} />
          ))}
        </div>
      )}
    </div>
  );
};

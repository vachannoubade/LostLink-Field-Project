import React from 'react';
import { useData } from '../store/DataContext';
import { Sparkles, Check, X as CloseIcon, ChevronRight } from 'lucide-react';
import type { Report } from '../types';
import { motion } from 'framer-motion';

export const AIMatches: React.FC = () => {
  const { matches, reports, verifyMatch, rejectMatch } = useData();

  const pendingMatches = matches.filter(m => m.status === 'pending');

  const MatchItemCard = ({ item, title }: { item: Report, title: string }) => (
    <div style={{ flex: 1, backgroundColor: '#FAFBFC', borderRadius: 'var(--radius-sm)', padding: '20px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
        {title}
      </div>
      {item.imageUrl && (
        <img src={item.imageUrl} alt={item.title} style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px', marginBottom: '16px' }} />
      )}
      <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px' }}>{item.title}</h4>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
        {item.location} • {new Date(item.date).toLocaleDateString()}
      </div>
      <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.5 }}>{item.description}</p>
    </div>
  );

  return (
    <div style={{ paddingBottom: '32px' }}>
      <h1 className="page-title">Potential Matches</h1>
      <p className="page-subtitle">Our intelligent system has identified these potential matches between lost and found reports.</p>

      {pendingMatches.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card" 
          style={{ padding: '80px 24px', textAlign: 'center' }}
        >
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Sparkles size={36} />
          </div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>No pending matches</h3>
          <p style={{ color: 'var(--text-muted)' }}>We haven't found any new matches yet. We'll notify you when we do.</p>
        </motion.div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {pendingMatches.map((match, index) => {
            const lost = reports.find(r => r.id === match.lostReportId);
            const found = reports.find(r => r.id === match.foundReportId);
            
            if (!lost || !found) return null;

            return (
              <motion.div 
                key={match.id} 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="card" 
                style={{ padding: '32px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)', padding: '8px 16px', borderRadius: '999px', fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Sparkles size={18} />
                      {match.score.score}% Match Confidence
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', width: '100%', flex: '1 1 auto', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={() => rejectMatch(match.id)} style={{ flex: '1 1 auto', maxWidth: '160px' }}>
                      <CloseIcon size={18} /> Reject
                    </button>
                    <button className="btn btn-primary" onClick={() => verifyMatch(match.id)} style={{ flex: '1 1 auto', maxWidth: '160px' }}>
                      <Check size={18} /> Verify Match
                    </button>
                  </div>
                </div>

                <div className="grid mobile-form-grid" style={{ gridTemplateColumns: '1fr auto 1fr', gap: '20px', alignItems: 'center' }}>
                  <MatchItemCard item={lost} title="Lost Report" />
                  
                  <div style={{ display: 'flex', alignItems: 'center', color: 'var(--border)', justifySelf: 'center', transform: 'rotate(90deg)' }} className="mobile-chevron">
                    {/* Use CSS to rotate on mobile if needed, or hide on very small screens */}
                    <ChevronRight size={32} />
                  </div>
                  
                  <MatchItemCard item={found} title="Found Report" />
                </div>

                <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '12px' }}>Why this is a match:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    {match.score.reasons.map((reason, i) => (
                      <span key={i} style={{ backgroundColor: '#F1F3F9', padding: '6px 14px', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

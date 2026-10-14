import React, { useState } from 'react';
import { useData } from '../store/DataContext';
import { Sparkles, Check, X as CloseIcon, ChevronRight, MapPin, Calendar, Tag, CheckCircle2, Link2 } from 'lucide-react';
import type { Report } from '../types';
import { motion } from 'framer-motion';
import { getCategoryIllustration } from '../utils/categoryArt';

interface MatchItemCardProps {
  item: Report;
  title: string;
}

const MatchItemCard: React.FC<MatchItemCardProps> = ({ item, title }) => {
  const [imageError, setImageError] = useState(false);
  const catArt = getCategoryIllustration(item.category);

  return (
    <div style={{
      flex: 1,
      backgroundColor: 'var(--bg-canvas)',
      borderRadius: '8px',
      padding: '20px',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>
          {title}
        </span>
        <span className={`mono-token ${item.type === 'lost' ? 'mono-token-amber' : 'mono-token-emerald'}`}>
          {item.type === 'lost' ? '● SEARCH ACTIVE' : '◆ IN CUSTODY'}
        </span>
      </div>

      {/* Image or Category Art Thumbnail */}
      <div style={{
        height: '140px',
        borderRadius: '6px',
        overflow: 'hidden',
        background: catArt.bg,
        marginBottom: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        border: '1px solid var(--border)'
      }}>
        {item.imageUrl && !imageError ? (
          <img 
            src={item.imageUrl} 
            alt={item.title} 
            onError={() => setImageError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '2.5rem', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.06))' }}>{catArt.emoji}</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>
              {catArt.label}
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', fontFamily: 'var(--font-mono)' }}>
        <Tag size={12} />
        <span>{item.category}</span>
      </div>

      <h4 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-main)', letterSpacing: '-0.015em' }}>
        {item.title}
      </h4>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MapPin size={13} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.campusZone ? `${item.campusZone} • ${item.location}` : item.location}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calendar size={13} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{new Date(item.date).toLocaleDateString()}</span>
        </div>
      </div>

      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 'auto', margin: 0 }}>
        {item.description}
      </p>
    </div>
  );
};

export const AIMatches: React.FC = () => {
  const { matches, reports, verifyMatch, rejectMatch } = useData();

  const pendingMatches = matches.filter(m => m.status === 'pending');

  return (
    <div style={{ paddingBottom: '48px', maxWidth: '1040px', margin: '0 auto' }}>
      {/* Editorial Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span className="mono-token mono-token-amber">PROBABILISTIC CORRELATIONS</span>
          <span className="mono-token mono-token-subtle">CROSS-REFERENCE MATRIX</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.5rem', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '-0.025em', margin: 0, lineHeight: 1.15 }}>
          Specimen Correlation Matrix
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.98rem', marginTop: '6px', maxWidth: '640px', lineHeight: 1.5 }}>
          Automated algorithmic comparison pairing newly found items with registered lost inquiries based on taxonomy, spatio-temporal coordinates, and textual descriptors.
        </p>
      </div>

      {pendingMatches.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ 
            padding: '80px 24px', 
            textAlign: 'center',
            backgroundColor: '#FFFFFF',
            borderRadius: 'var(--radius)',
            border: '1px dashed var(--border)'
          }}
        >
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--bg-canvas)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <Link2 size={30} />
          </div>
          <div className="mono-token mono-token-subtle" style={{ marginBottom: '8px' }}>ZERO ACTIVE CORRELATIONS</div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '8px', color: 'var(--text-main)', letterSpacing: '-0.02em', fontWeight: 700 }}>
            No pending correlations detected
          </h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto', fontSize: '0.92rem', lineHeight: 1.55 }}>
            When students file complementary lost and found records matching spatial or descriptive criteria, cross-referenced correlation dossiers will be generated here automatically.
          </p>
        </motion.div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          {pendingMatches.map((match, index) => {
            const lost = reports.find(r => r.id === match.lostReportId);
            const found = reports.find(r => r.id === match.foundReportId);
            
            if (!lost || !found) return null;

            return (
              <motion.div 
                key={match.id} 
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                className="ai-match-card"
                style={{ 
                  padding: '28px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                {/* Dossier Header */}
                <div className="ai-match-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="mono-token mono-token-amber" style={{ fontSize: '0.82rem', padding: '6px 14px' }}>
                      <Sparkles size={13} style={{ marginRight: '6px', verticalAlign: '-1px' }} />
                      {match.score.score}% CORRELATION CONFIDENCE
                    </span>
                    <span className="mono-token mono-token-subtle" style={{ fontSize: '0.72rem' }}>
                      PAIRING #{match.id.slice(0, 8).toUpperCase()}
                    </span>
                  </div>

                  <div className="ai-match-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button 
                      type="button"
                      className="btn btn-secondary" 
                      onClick={() => rejectMatch(match.id)} 
                      style={{ padding: '8px 16px', fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <CloseIcon size={15} /> Reject Correlation
                    </button>
                    <button 
                      type="button"
                      className="btn btn-primary" 
                      onClick={() => verifyMatch(match.id)} 
                      style={{ padding: '8px 20px', fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Check size={15} /> Confirm Specimen & Connect
                    </button>
                  </div>
                </div>

                {/* Specimen Comparison */}
                <div className="ai-match-comparison" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '18px', alignItems: 'center' }}>
                  <MatchItemCard item={lost} title="INQUIRY // LOST SPECIMEN" />
                  
                  <div className="ai-match-connector" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', padding: '0 4px' }}>
                    <ChevronRight size={28} />
                    <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', marginTop: '2px', fontWeight: 700 }}>MATCH</span>
                  </div>
                  
                  <MatchItemCard item={found} title="RECOVERED // FOUND SPECIMEN" />
                </div>

                {/* Algorithmic Factors Footnote */}
                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <CheckCircle2 size={14} color="#047857" /> VERIFIED CORRELATION FACTORS:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {match.score.reasons.map((reason, i) => (
                      <span key={i} className="mono-token mono-token-subtle" style={{ fontSize: '0.74rem', padding: '4px 10px' }}>
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


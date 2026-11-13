import React, { useState } from 'react';
import { useData } from '../store/DataContext';
import { Sparkles, Check, X as CloseIcon, MapPin, Calendar, PackageSearch } from 'lucide-react';
import type { Report } from '../types';
import { getCategoryIllustration } from '../utils/categoryArt';

interface MatchItemCardProps {
  item: Report;
  roleTitle: string;
}

const MatchItemCard: React.FC<MatchItemCardProps> = ({ item, roleTitle }) => {
  const [imageError, setImageError] = useState(false);
  const catArt = getCategoryIllustration(item.category);

  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      backgroundColor: 'var(--bg-secondary)',
      borderRadius: 'var(--radius)',
      padding: '16px',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '6px' }}>
        <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {roleTitle}
        </span>
        <span className={item.type === 'lost' ? 'badge badge-lost' : 'badge badge-found'}>
          {item.type === 'lost' ? 'Lost' : 'Found'}
        </span>
      </div>

      {/* Image / Icon container */}
      <div style={{
        height: '130px',
        borderRadius: 'var(--radius-xs)',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-surface)',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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
            <span style={{ fontSize: '2.2rem' }}>{catArt.emoji}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {item.category}
            </span>
          </div>
        )}
      </div>

      <h4 style={{ fontSize: '0.98rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-main)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
        {item.title}
      </h4>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MapPin size={13} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.campusZone ? `${item.campusZone} • ${item.location}` : item.location}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calendar size={13} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
          <span>{new Date(item.date).toLocaleDateString()}</span>
        </div>
      </div>

      {item.description && (
        <p style={{
          fontSize: '0.82rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.45,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          marginTop: 'auto',
          margin: 0
        }}>
          {item.description}
        </p>
      )}
    </div>
  );
};

export const AIMatches: React.FC = () => {
  const { matches, reports, verifyMatch, rejectMatch } = useData();

  const pendingMatches = matches.filter(m => m.status === 'pending');

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', paddingBottom: '48px' }}>
      {/* Clean Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 className="page-title">
          Potential matches
        </h1>
        <p className="page-subtitle" style={{ marginBottom: 0 }}>
          Items that share similar categories, campus locations, and descriptions.
        </p>
      </div>

      {pendingMatches.length === 0 ? (
        <div style={{ 
          padding: '64px 20px', 
          textAlign: 'center',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)'
        }}>
          <PackageSearch size={36} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
            No possible matches found.
          </h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto', fontSize: '0.88rem', lineHeight: 1.5 }}>
            When matching lost and found reports are filed across campus, paired suggestions will appear here automatically.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {pendingMatches.map((match) => {
            const lost = reports.find(r => r.id === match.lostReportId);
            const found = reports.find(r => r.id === match.foundReportId);
            
            if (!lost || !found) return null;

            return (
              <div 
                key={match.id} 
                className="card"
                style={{ 
                  padding: '22px',
                  backgroundColor: 'var(--bg-surface)'
                }}
              >
                {/* Header with Match Percentage & Action Buttons */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                  marginBottom: '16px',
                  paddingBottom: '14px',
                  borderBottom: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="badge badge-found" style={{ fontSize: '0.82rem', padding: '4px 10px' }}>
                      <Sparkles size={13} />
                      {match.score.score}% Match
                    </span>
                    {match.score.reasons && match.score.reasons.length > 0 && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {match.score.reasons.slice(0, 2).join(' · ')}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      type="button"
                      className="btn btn-secondary btn-sm" 
                      onClick={() => rejectMatch(match.id)}
                    >
                      <CloseIcon size={14} /> Dismiss
                    </button>
                    <button 
                      type="button"
                      className="btn btn-primary btn-sm" 
                      onClick={() => verifyMatch(match.id)}
                    >
                      <Check size={14} /> Confirm Match
                    </button>
                  </div>
                </div>

                {/* Paired Comparison Cards */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '14px'
                }}>
                  <MatchItemCard item={lost} roleTitle="Reported Lost" />
                  <MatchItemCard item={found} roleTitle="Reported Found" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import type { Report } from '../types';
import { MapPin, Calendar, Tag, ChevronRight } from 'lucide-react';
import { getCategoryIllustration } from '../utils/categoryArt';

export interface ItemCardProps {
  item: Report;
  onClick?: () => void;
  actions?: React.ReactNode;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item, onClick, actions }) => {
  const [imageError, setImageError] = useState(false);
  const catArt = getCategoryIllustration(item.category);

  const isResolved = item.status === 'resolved';
  const isLost = item.type === 'lost';

  const formattedDate = (() => {
    try {
      const d = new Date(item.date);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return item.date;
    }
  })();

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-surface)'
      }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
      aria-label={onClick ? `View details for ${item.title}` : undefined}
    >
      {/* Media / Illustration Container */}
      <div
        style={{
          height: '180px',
          width: '100%',
          backgroundColor: 'var(--bg-secondary)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid var(--border)'
        }}
      >
        {item.imageUrl && !imageError ? (
          <img
            src={item.imageUrl}
            alt={item.title}
            onError={() => setImageError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
            <span style={{ fontSize: '2.5rem' }}>{catArt.emoji}</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>{item.category}</span>
          </div>
        )}

        {/* Status Badge */}
        <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '6px' }}>
          {isResolved ? (
            <span className="badge badge-resolved">Reunited</span>
          ) : isLost ? (
            <span className="badge badge-lost">Lost</span>
          ) : (
            <span className="badge badge-found">Found</span>
          )}
        </div>
      </div>

      {/* Card Content */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {/* Category */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
          <Tag size={13} />
          <span>{item.category}</span>
        </div>

        {/* Title */}
        <h3 style={{
          fontSize: '1rem',
          fontWeight: 600,
          color: 'var(--text-main)',
          marginBottom: '8px',
          lineHeight: 1.35,
          overflowWrap: 'anywhere'
        }}>
          {item.title}
        </h3>

        {/* Description snippet */}
        {item.description && (
          <p style={{
            fontSize: '0.84rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.45,
            marginBottom: '14px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}>
            {item.description}
          </p>
        )}

        {/* Location & Date Metadata */}
        <div style={{
          marginTop: 'auto',
          paddingTop: '10px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={14} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.campusZone ? `${item.campusZone}${item.location ? ` • ${item.location}` : ''}` : (item.location || 'Campus')}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
              <span>{formattedDate}</span>
            </div>

            {onClick && !actions && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: 'var(--primary)', fontSize: '0.78rem', fontWeight: 500 }}>
                Details <ChevronRight size={14} />
              </span>
            )}
          </div>
        </div>

        {/* Optional Actions container (for MyReports, etc.) */}
        {actions && (
          <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

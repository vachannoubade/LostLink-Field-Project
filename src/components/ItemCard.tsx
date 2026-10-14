import React from 'react';
import type { Report } from '../types';
import { MapPin, Calendar, Tag, Image as ImageIcon } from 'lucide-react';
import { motion } from 'framer-motion';

export const ItemCard: React.FC<{ item: Report; onClick?: () => void; actions?: React.ReactNode }> = ({ item, onClick, actions }) => {
  const [imageError, setImageError] = React.useState(false);

  return (
    <motion.div 
      className="card" 
      style={{ cursor: onClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', height: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }} 
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
      whileHover={onClick ? { y: -4, boxShadow: 'var(--shadow-lg)' } : {}}
      transition={{ duration: 0.2 }}
    >
      <div style={{ height: '180px', backgroundColor: '#F1F3F9', position: 'relative', overflow: 'hidden' }}>
        {item.imageUrl && !imageError ? (
          <img 
            src={item.imageUrl} 
            alt={item.title} 
            onError={() => setImageError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#CBD5E1', flexDirection: 'column', gap: '8px' }}>
            <ImageIcon size={48} strokeWidth={1.5} />
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>No Image</span>
          </div>
        )}
        <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '8px' }}>
          <span className={`badge ${item.status === 'lost' ? 'badge-lost' : item.status === 'found' ? 'badge-found' : 'badge-match'}`} style={{ backdropFilter: 'blur(4px)' }}>
            {item.status.toUpperCase()}
          </span>
        </div>
      </div>
      
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
          <Tag size={12} />
          <span>{item.category}</span>
        </div>
        
        <h3 style={{ fontSize: '1.15rem', marginBottom: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-main)' }}>
          {item.title}
        </h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            <MapPin size={16} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.location}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            <Calendar size={16} />
            <span>{new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>
        
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.6 }}>
          {item.description}
        </p>

        {actions && (
          <div 
            style={{ 
              marginTop: '16px', 
              paddingTop: '16px', 
              borderTop: '1px solid var(--border)',
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              alignItems: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        )}
      </div>
    </motion.div>
  );
};

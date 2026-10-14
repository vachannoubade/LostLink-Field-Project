import React, { useState } from 'react';
import type { Report } from '../types';
import { MapPin, Calendar, Tag, ShieldCheck, Lock, AlertTriangle, Eye, Coffee, CheckCircle2 } from 'lucide-react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { getCategoryIllustration } from '../utils/categoryArt';

export interface ItemCardProps {
  item: Report;
  onClick?: () => void;
  actions?: React.ReactNode;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item, onClick, actions }) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [3.5, -3.5]), { damping: 25, stiffness: 280 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-3.5, 3.5]), { damping: 25, stiffness: 280 });

  const imageError = Boolean(item.imageUrl && failedUrl === item.imageUrl);
  const catArt = getCategoryIllustration(item.category);
  const docketId = `REF #LL-${item.id.slice(-4).toUpperCase()}`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    x.set(0);
    y.set(0);
  };

  const isResolved = item.status === 'resolved';
  const isLost = item.status === 'lost';

  return (
    <div style={{ perspective: 1000, height: '100%' }}>
      <motion.div 
        className="card" 
        data-cursor={onClick ? (isResolved ? 'ARCHIVED' : isLost ? 'VIEW INQUIRY' : 'VIEW CUSTODY') : undefined}
        style={{ 
          cursor: onClick ? 'pointer' : 'default', 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100%', 
          border: '1px solid var(--border)', 
          borderRadius: 'var(--radius)',
          backgroundColor: '#FFFFFF',
          boxShadow: isHovered && onClick ? 'var(--shadow-card-hover)' : 'var(--shadow-sm)',
          position: 'relative',
          overflow: 'hidden',
          rotateX: onClick ? rotateX : 0,
          rotateY: onClick ? rotateY : 0,
          transformStyle: 'preserve-3d',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
        }} 
        onClick={onClick}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
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
        {/* Top Archival Indicator Hairline */}
        <div 
          style={{ 
            height: '3px', 
            width: '100%', 
            backgroundColor: isResolved ? 'var(--success)' : isLost ? 'var(--warning)' : 'var(--primary)',
            opacity: 0.85
          }} 
        />

        {/* Media or Category Artwork Fallback Header */}
        <div 
          style={{ 
            height: '185px', 
            background: catArt.bg, 
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
              onError={() => {
                if (item.imageUrl) setFailedUrl(item.imageUrl);
              }}
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'cover',
                transform: isHovered && onClick ? 'scale(1.03)' : 'scale(1)',
                transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
              }} 
            />
          ) : (
            <div 
              style={{ 
                width: '100%', 
                height: '100%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                flexDirection: 'column', 
                gap: '6px',
                transform: isHovered && onClick ? 'scale(1.03)' : 'scale(1)',
                transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            >
              <span style={{ fontSize: '3rem', filter: 'drop-shadow(0 4px 8px rgba(18,19,22,0.06))' }}>
                {catArt.emoji}
              </span>
              <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#52545A', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {catArt.label}
              </span>
            </div>
          )}

          {/* Status and Characteristic Badges */}
          <div style={{ position: 'absolute', top: '10px', left: '10px', right: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', pointerEvents: 'none' }}>
            {isResolved ? (
              <span className="archival-stamp">
                <CheckCircle2 size={11} /> REUNITED
              </span>
            ) : isLost ? (
              <span 
                style={{ 
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  borderRadius: '3px',
                  backgroundColor: 'rgba(254, 243, 199, 0.95)',
                  border: '1px solid rgba(217, 119, 6, 0.3)',
                  color: '#92400E',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                }}
              >
                ● ACTIVE SEARCH
              </span>
            ) : (
              <span 
                style={{ 
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  borderRadius: '3px',
                  backgroundColor: 'rgba(236, 253, 245, 0.95)',
                  border: '1px solid rgba(13, 122, 95, 0.3)',
                  color: '#065F46',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                }}
              >
                ◆ IN CUSTODY
              </span>
            )}

            {item.hasPrivateVerification && item.status === 'found' ? (
              <span
                style={{
                  backgroundColor: '#121316',
                  color: '#FFFFFF',
                  padding: '3px 7px',
                  borderRadius: '3px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.15)'
                }}
              >
                <Lock size={10} /> VERIFIED LOCK
              </span>
            ) : item.urgency === 'high' && !isResolved ? (
              <span
                style={{
                  backgroundColor: 'rgba(220, 38, 38, 0.95)',
                  color: '#FFFFFF',
                  padding: '3px 7px',
                  borderRadius: '3px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  boxShadow: '0 1px 4px rgba(220, 38, 38, 0.25)'
                }}
              >
                <AlertTriangle size={10} /> URGENT
              </span>
            ) : (
              <span 
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.66rem',
                  color: '#52545A',
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  border: '1px solid rgba(0,0,0,0.06)',
                  fontWeight: 600
                }}
              >
                {docketId}
              </span>
            )}
          </div>
        </div>
        
        {/* Card Content Body */}
        <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--primary)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <Tag size={11} />
              <span>{item.category}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '0.74rem', fontFamily: 'var(--font-mono)' }}>
              <Calendar size={11} />
              <span>{new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            </div>
          </div>
          
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-main)', letterSpacing: '-0.02em', lineHeight: 1.25 }}>
            {item.title}
          </h3>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '8px' }}>
            <MapPin size={13} style={{ flexShrink: 0, color: 'var(--primary)' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.campusZone ? `${item.campusZone} • ${item.location}` : item.location}
            </span>
          </div>
          
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5, marginBottom: '12px', flex: 1 }}>
            {item.description}
          </p>

          {/* Gratitude note if present */}
          {item.gratitudeNote && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              backgroundColor: 'var(--warning-light)',
              color: '#9C4221',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--warning-border)',
              fontSize: '0.76rem',
              marginBottom: '10px'
            }}>
              <Coffee size={12} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.gratitudeNote}
              </span>
            </div>
          )}

          {/* Real Reporter Metadata */}
          {item.reporterName && (
            <div style={{
              paddingTop: '8px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginTop: 'auto'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--text-main)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.64rem',
                  fontWeight: 700,
                  flexShrink: 0
                }}>
                  {item.reporterName.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.reporterName}
                </span>
                {item.reporterVerified && (
                  <ShieldCheck size={12} color="var(--success)" style={{ flexShrink: 0 }} />
                )}
              </div>
              {typeof item.helpfulCount === 'number' && item.helpfulCount > 0 && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'var(--font-mono)' }}>
                  <Eye size={11} />
                  <span>{item.helpfulCount}</span>
                </span>
              )}
            </div>
          )}

          {/* Preserved Actions Slot */}
          {actions && (
            <div 
              style={{ 
                marginTop: item.reporterName ? '8px' : '12px', 
                paddingTop: '10px', 
                borderTop: item.reporterName ? 'none' : '1px solid var(--border)',
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
    </div>
  );
};



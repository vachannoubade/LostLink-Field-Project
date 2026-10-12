import React from 'react';
import type { Report } from '../types';
import { MapPin, Calendar, Tag, Eye, MessageCircle, ShieldCheck, Coffee, AlertTriangle, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useData } from '../store/DataContext';
import { getCategoryIllustration, formatClaimStatusLabel } from './ItemDetailModal';

export const ItemCard: React.FC<{ item: Report; onClick?: () => void }> = ({ item, onClick }) => {
  const { setSelectedReportId, toggleHelpful, helpedIds, user, mySubmittedClaims } = useData();
  const isHelped = helpedIds.includes(item.id);
  const catArt = getCategoryIllustration(item.category);

  const existingUserClaim = mySubmittedClaims.find(
    c => c.itemId === item.id && c.status !== 'rejected'
  );
  const isEligibleFoundItem = item.type === 'found' && item.status === 'found' && item.userId !== user.id;

  const handleCardClick = () => {
    setSelectedReportId(item.id);
    if (onClick) onClick();
  };

  const reporterInitial = (item.reporterName || 'Campus Member').charAt(0).toUpperCase();

  return (
    <motion.div
      className="card"
      style={{
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        position: 'relative'
      }}
      onClick={handleCardClick}
      whileHover={{ y: -5, boxShadow: 'var(--shadow-lg)' }}
      transition={{ duration: 0.22 }}
    >
      {/* Card Image or Warm Category Illustration */}
      <div style={{ height: '188px', background: catArt.bg, position: 'relative', overflow: 'hidden' }}>
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s ease' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '3.2rem', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.08))' }}>{catArt.emoji}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#57534E', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {catArt.label}
            </span>
          </div>
        )}

        {/* Top Badges */}
        <div style={{ position: 'absolute', top: '12px', left: '12px', right: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
          <span
            className={`badge ${
              item.status === 'lost' ? 'badge-lost' : item.status === 'found' ? 'badge-found' : 'badge-match'
            }`}
            style={{ backdropFilter: 'blur(8px)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          >
            {item.status === 'lost' ? '🔍 Lost' : item.status === 'found' ? '🙌 Found' : '🎉 Reunited'}
          </span>

          {item.type === 'found' && item.status === 'found' && item.hasPrivateVerification ? (
            <span
              className="badge"
              style={{
                backgroundColor: 'rgba(13, 107, 88, 0.92)',
                color: '#FFFFFF',
                border: '1px solid rgba(255,255,255,0.25)',
                backdropFilter: 'blur(4px)',
                fontSize: '0.7rem'
              }}
            >
              <Lock size={11} /> Ownership Lock
            </span>
          ) : item.urgency === 'high' && item.status !== 'resolved' ? (
            <span
              className="badge"
              style={{
                backgroundColor: 'rgba(254, 243, 199, 0.95)',
                color: '#B45309',
                border: '1px solid #FDE68A',
                backdropFilter: 'blur(4px)'
              }}
            >
              <AlertTriangle size={11} /> Urgent
            </span>
          ) : null}
        </div>
      </div>

      {/* Card Body */}
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--primary)', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Tag size={12} />
            <span>{item.category}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            <Calendar size={12} />
            <span>{new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          </div>
        </div>

        <h3 style={{ fontSize: '1.08rem', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-main)' }}>
          {item.title}
        </h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.84rem', fontWeight: 600, marginBottom: '10px' }}>
          <MapPin size={14} color="var(--accent-warm)" style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.location}</span>
        </div>

        <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.55, marginBottom: '12px', flex: 1 }}>
          {item.description}
        </p>

        {/* Gratitude / Finder mini note */}
        {item.gratitudeNote && (
          <div className="gratitude-box" style={{ marginBottom: '12px', padding: '8px 10px', fontSize: '0.77rem' }}>
            <Coffee size={14} color="var(--amber)" style={{ flexShrink: 0, marginTop: '1px' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.gratitudeNote}
            </span>
          </div>
        )}

        {/* Quick Claim / Status Banner on Found Cards */}
        {existingUserClaim ? (
          <div
            style={{
              marginBottom: '12px',
              padding: '7px 11px',
              borderRadius: '10px',
              backgroundColor: formatClaimStatusLabel(existingUserClaim.status).bg,
              color: formatClaimStatusLabel(existingUserClaim.status).color,
              fontSize: '0.76rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px'
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <ShieldCheck size={13} />
              Your Claim: {formatClaimStatusLabel(existingUserClaim.status).label}
            </span>
          </div>
        ) : isEligibleFoundItem ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={e => {
              e.stopPropagation();
              setSelectedReportId(item.id);
            }}
            style={{
              width: '100%',
              marginBottom: '12px',
              padding: '8px 12px',
              fontSize: '0.8rem',
              borderRadius: '10px'
            }}
          >
            <ShieldCheck size={14} />
            <span>Claim This Item</span>
          </button>
        ) : null}

        {/* Human Footer: Reporter + Quick Boost/Comments */}
        <div style={{
          paddingTop: '12px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <div style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-warm) 100%)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.72rem',
              fontWeight: 700,
              flexShrink: 0
            }}>
              {reporterInitial}
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.reporterName?.split(' ')[0] || 'Student'}
            </span>
            {item.reporterVerified !== false && (
              <ShieldCheck size={13} color="var(--success)" style={{ flexShrink: 0 }} />
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {(item.comments?.length || 0) > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.76rem', color: 'var(--primary)', fontWeight: 600 }}>
                <MessageCircle size={13} />
                {item.comments?.length}
              </span>
            )}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                toggleHelpful(item.id);
              }}
              title="Keep an eye out / boost visibility"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 9px',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                backgroundColor: isHelped ? 'var(--primary-light)' : 'var(--bg-subtle)',
                color: isHelped ? 'var(--primary)' : 'var(--text-muted)',
                border: `1px solid ${isHelped ? 'var(--primary)' : 'transparent'}`,
                transition: 'var(--transition)'
              }}
            >
              <Eye size={12} />
              <span>{item.helpfulCount || 0}</span>
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

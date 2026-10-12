import React from 'react';
import { useData } from '../store/DataContext';
import { Sparkles, Check, X as CloseIcon, ArrowLeftRight, MapPin, Calendar, ShieldCheck, CheckCircle2 } from 'lucide-react';
import type { Report } from '../types';
import { motion } from 'framer-motion';
import { getCategoryIllustration } from '../components/ItemDetailModal';

export const AIMatches: React.FC = () => {
  const { matches, reports, verifyMatch, rejectMatch, setSelectedReportId } = useData();

  const pendingMatches = matches.filter(m => m.status === 'pending');
  const verifiedMatches = matches.filter(m => m.status === 'verified');

  const MatchItemCard = ({ item, badgeLabel, isFound }: { item: Report; badgeLabel: string; isFound?: boolean }) => {
    const catArt = getCategoryIllustration(item.category);
    return (
      <div
        onClick={() => setSelectedReportId(item.id)}
        style={{
          flex: 1,
          backgroundColor: 'var(--bg-subtle)',
          borderRadius: '18px',
          padding: '20px',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          transition: 'var(--transition)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span className={`badge ${isFound ? 'badge-found' : 'badge-lost'}`}>
            {badgeLabel}
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            By {item.reporterName || 'Campus Student'}
          </span>
        </div>

        <div style={{ height: '150px', borderRadius: '12px', overflow: 'hidden', marginBottom: '14px', background: catArt.bg }}>
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>
              {catArt.emoji}
            </div>
          )}
        </div>

        <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-main)' }}>
          {item.title}
        </h4>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px', fontWeight: 600 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <MapPin size={14} color="var(--accent-warm)" /> {item.location}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
            <Calendar size={14} /> {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        </div>

        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: '10px' }}>
          {item.description}
        </p>

        {item.gratitudeNote && (
          <div style={{ fontSize: '0.78rem', padding: '8px 10px', borderRadius: '10px', backgroundColor: 'var(--amber-light)', border: '1px dashed var(--amber-border)', color: 'var(--text-secondary)' }}>
            💬 “{item.gratitudeNote}”
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '999px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', fontSize: '0.78rem', fontWeight: 700, marginBottom: '8px' }}>
          <Sparkles size={14} /> Intelligent Recovery Bridge
        </div>
        <h1 className="page-title serif-accent">Smart Campus Matchmaker</h1>
        <p className="page-subtitle" style={{ marginBottom: 0 }}>
          We continuously compare lost and found stories across campus zones, keywords, and timestamps to reunite students faster.
        </p>
      </div>

      {pendingMatches.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
          style={{ padding: '72px 24px', textAlign: 'center', marginBottom: '32px' }}
        >
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px'
          }}>
            <Sparkles size={36} />
          </div>
          <h3 className="serif-accent" style={{ fontSize: '1.4rem', marginBottom: '8px' }}>
            All current matches have been reviewed!
          </h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto' }}>
            Whenever a new lost or found report shares a location, category, or descriptive clue with another item, it will appear right here.
          </p>
        </motion.div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', marginBottom: '36px' }}>
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
                style={{ padding: '28px', border: '1.5px solid var(--border-strong)' }}
              >
                {/* Match Top Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '16px',
                  marginBottom: '22px',
                  paddingBottom: '18px',
                  borderBottom: '1px solid var(--border)'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <div style={{
                        background: 'linear-gradient(135deg, var(--primary) 0%, #4338CA 100%)',
                        color: 'white',
                        padding: '6px 14px',
                        borderRadius: '999px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 12px var(--primary-glow)'
                      }}>
                        <Sparkles size={15} />
                        <span>{match.score.score}% Match Confidence</span>
                      </div>
                      <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        Connects <strong>{lost.reporterName || 'Owner'}</strong> &amp; <strong>{found.reporterName || 'Finder'}</strong>
                      </span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Click either card below to inspect full photos and comments before confirming.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => rejectMatch(match.id)}
                      style={{ padding: '10px 16px' }}
                    >
                      <CloseIcon size={17} /> Not the Same Item
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => verifyMatch(match.id)}
                      style={{ padding: '10px 20px', background: 'linear-gradient(135deg, var(--success) 0%, #047857 100%)' }}
                    >
                      <Check size={17} /> Confirm Reunion (+50 Karma)
                    </button>
                  </div>
                </div>

                {/* Side by Side Cards */}
                <div className="grid mobile-form-grid" style={{ gridTemplateColumns: '1fr auto 1fr', gap: '18px', alignItems: 'stretch' }}>
                  <MatchItemCard item={lost} badgeLabel="🔍 Lost Report" />

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0 4px' }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--primary-light)',
                      color: 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid var(--border)'
                    }}>
                      <ArrowLeftRight size={20} />
                    </div>
                  </div>

                  <MatchItemCard item={found} badgeLabel="🙌 Found Report" isFound />
                </div>

                {/* Match Reasons Breakdown */}
                <div style={{ marginTop: '22px', paddingTop: '18px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={16} color="var(--primary)" /> Why our AI linked these:
                  </span>
                  {match.score.reasons.map((reason, i) => (
                    <span
                      key={i}
                      style={{
                        backgroundColor: 'var(--primary-light)',
                        padding: '5px 12px',
                        borderRadius: '999px',
                        fontSize: '0.8rem',
                        color: 'var(--primary)',
                        fontWeight: 700
                      }}
                    >
                      ✓ {reason}
                    </span>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Verified Matches History */}
      {verifiedMatches.length > 0 && (
        <div>
          <h3 style={{ fontSize: '1.15rem', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)' }}>
            <CheckCircle2 size={20} />
            <span>Verified AI Reunions ({verifiedMatches.length})</span>
          </h3>
          <div className="grid grid-cols-2">
            {verifiedMatches.map(vm => {
              const lost = reports.find(r => r.id === vm.lostReportId);
              const found = reports.find(r => r.id === vm.foundReportId);
              if (!lost || !found) return null;
              return (
                <div key={vm.id} className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', backgroundColor: 'var(--success-light)', borderColor: 'var(--success-border)' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{lost.title}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      Reunited {lost.reporterName || 'Owner'} &amp; {found.reporterName || 'Finder'} • {vm.score.score}% AI Match
                    </div>
                  </div>
                  <span className="badge badge-found">🎉 Reunited</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

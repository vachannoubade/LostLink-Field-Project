import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { CAMPUS_ZONES } from '../store/seedData';
import { ItemCard } from '../components/ItemCard';
import {
  AlertCircle, CheckCircle, PackageSearch, Sparkles,
  FilePlus, ChevronRight, HeartHandshake, MapPin,
  Quote, ArrowUpRight, Flame, ShieldCheck, Lock, UserCheck
} from 'lucide-react';
import { motion } from 'framer-motion';

export const Dashboard: React.FC = () => {
  const {
    user,
    reports,
    matches,
    reunionStories,
    mySubmittedClaims,
    incomingFinderClaims
  } = useData();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [selectedZone, setSelectedZone] = useState<string>('All');
  const [feedTypeFilter, setFeedTypeFilter] = useState<'all' | 'found' | 'lost'>('all');

  const lostCount = reports.filter(r => r.type === 'lost' && r.status === 'lost').length;
  const foundCount = reports.filter(r => r.type === 'found' && r.status === 'found').length;
  const recoveredCount = reports.filter(r => r.status === 'resolved').length + reunionStories.length;
  const matchCount = matches.filter(m => m.status === 'pending').length;

  const activeFinderReviews = incomingFinderClaims.filter(c =>
    ['submitted', 'verification_pending', 'finder_review_required', 'approved_for_handover'].includes(c.status)
  ).length;

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const filteredRecentReports = [...reports]
    .filter(r => r.status !== 'resolved')
    .filter(r => feedTypeFilter === 'all' || r.type === feedTypeFilter)
    .filter(r => selectedZone === 'All' || r.campusZone === selectedZone || r.location.includes(selectedZone))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  const SummaryCard = ({ title, subtitle, count, icon: Icon, color, bg = 'var(--bg-card)', onClick }: any) => (
    <motion.div
      className="card"
      onClick={onClick}
      style={{
        padding: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        backgroundColor: bg,
        cursor: onClick ? 'pointer' : 'default'
      }}
      whileHover={{ y: -3, boxShadow: 'var(--shadow-md)' }}
    >
      <div style={{
        width: '50px',
        height: '50px',
        borderRadius: '14px',
        backgroundColor: `var(--${color}-light, var(--bg-subtle))`,
        color: `var(--${color}, var(--text-main))`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}>
        <Icon size={24} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1.15, color: 'var(--text-main)' }}>{count}</div>
        <div style={{ color: 'var(--text-main)', fontSize: '0.88rem', fontWeight: 700 }}>{title}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{subtitle}</div>
      </div>
    </motion.div>
  );

  return (
    <div style={{ paddingBottom: '36px' }}>
      {/* Humanoid Warm Hero Banner */}
      <div className="hero-banner">
        <div
          className="hero-orb"
          style={{ width: '240px', height: '240px', background: '#6366F1', top: '-80px', right: '-40px' }}
        />
        <div
          className="hero-orb"
          style={{ width: '200px', height: '200px', background: '#F59E0B', bottom: '-70px', left: '20%' }}
        />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '999px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <span>👋 {timeGreeting}, <strong>{user.name.split(' ')[0]}</strong></span>
              <span style={{ color: 'var(--border-strong)' }}>|</span>
              <span style={{ color: 'var(--amber)', fontWeight: 700 }}>✨ {user.karmaPoints || 145} Kindness Karma</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {activeFinderReviews > 0 && (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  onClick={() => navigate('/my-reports')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '7px 14px',
                    borderRadius: '999px',
                    backgroundColor: 'var(--amber)',
                    color: 'white',
                    fontSize: '0.8rem',
                    fontWeight: 700
                  }}
                >
                  <ShieldCheck size={15} />
                  <span>{activeFinderReviews} Ownership {activeFinderReviews === 1 ? 'Claim' : 'Claims'} Awaiting Your Review</span>
                </motion.button>
              )}

              {matchCount > 0 && (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  onClick={() => navigate('/ai-matches')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 14px',
                    borderRadius: '999px',
                    backgroundColor: 'var(--primary)',
                    color: 'white',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    boxShadow: '0 4px 14px var(--primary-glow)'
                  }}
                >
                  <Sparkles size={15} />
                  <span>{matchCount} Smart AI {matchCount === 1 ? 'Match' : 'Matches'} Ready to Verify</span>
                  <ArrowUpRight size={15} />
                </motion.button>
              )}
            </div>
          </div>

          <div style={{ maxWidth: '680px' }}>
            <h1 className="serif-accent" style={{ fontSize: 'clamp(1.75rem, 3.2vw, 2.5rem)', lineHeight: 1.18, marginBottom: '10px', color: 'var(--text-main)' }}>
              Every lost item has a story. <br />
              <span style={{ color: 'var(--primary)' }}>Let’s bring it back home safely.</span>
            </h1>
            <p style={{ fontSize: '1.02rem', color: 'var(--text-secondary)', maxWidth: '600px', lineHeight: 1.6 }}>
              Report lost or found belongings, protect found items with private ownership verification details, and reunite items with their rightful campus owners.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', paddingTop: '4px' }}>
            <button
              className="btn btn-warm"
              style={{ padding: '14px 24px', fontSize: '0.98rem' }}
              onClick={() => navigate('/report/lost')}
            >
              <FilePlus size={19} />
              <span>I Lost Something</span>
            </button>
            <button
              className="btn btn-primary"
              style={{ padding: '14px 24px', fontSize: '0.98rem' }}
              onClick={() => navigate('/report/found')}
            >
              <HeartHandshake size={19} />
              <span>I Found Something (+25 Karma)</span>
            </button>
            <button
              className="btn btn-secondary"
              style={{ padding: '14px 20px', fontSize: '0.95rem' }}
              onClick={() => navigate('/browse')}
            >
              <PackageSearch size={19} />
              <span>Browse &amp; Claim Found Items</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live Metrics Grid */}
      <div className="grid grid-cols-4" style={{ marginBottom: '28px' }}>
        <SummaryCard
          title="Looking for Owner"
          subtitle="Active lost reports"
          count={lostCount}
          icon={AlertCircle}
          color="danger"
          onClick={() => navigate('/browse?type=lost')}
        />
        <SummaryCard
          title="Safe & Found"
          subtitle="Protected & ready to claim"
          count={foundCount}
          icon={PackageSearch}
          color="success"
          onClick={() => navigate('/browse?type=found')}
        />
        <SummaryCard
          title="AI Smart Matches"
          subtitle="High-confidence links"
          count={matchCount}
          icon={Sparkles}
          color="primary"
          bg="var(--primary-light)"
          onClick={() => navigate('/ai-matches')}
        />
        <SummaryCard
          title="Happily Reunited"
          subtitle="Verified handovers"
          count={recoveredCount}
          icon={CheckCircle}
          color="amber"
          onClick={() => {
            const el = document.getElementById('kindness-wall');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
        />
      </div>

      {/* Secure Ownership Verification & Claims Quick Hub on Main Webpage */}
      <div
        className="card"
        style={{
          padding: '22px 24px',
          marginBottom: '32px',
          background: 'linear-gradient(135deg, var(--primary-light) 0%, var(--bg-card) 100%)',
          border: '1px solid rgba(13, 107, 88, 0.22)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', maxWidth: '680px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              backgroundColor: 'var(--primary)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Lock size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                <h2 className="serif-accent" style={{ fontSize: '1.18rem', margin: 0, color: 'var(--text-main)' }}>
                  Secure Ownership Verification &amp; Handover Protection
                </h2>
                <span className="badge" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--primary)', fontSize: '0.72rem' }}>
                  3-Step Verification Active
                </span>
              </div>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Finders record private identifying details hidden from the public feed. Claimants answer ownership prompts privately, and items are only marked reunited after physical handover confirmation.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {isAuthenticated ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate('/my-reports')}
                  style={{ fontSize: '0.84rem', padding: '9px 16px' }}
                >
                  <UserCheck size={15} />
                  <span>
                    Claims &amp; Reviews ({incomingFinderClaims.length + mySubmittedClaims.length})
                  </span>
                </button>
                {user.isAdmin && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => navigate('/admin')}
                    style={{ fontSize: '0.84rem', padding: '9px 16px' }}
                  >
                    <ShieldCheck size={15} />
                    <span>Admin Queue</span>
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate('/login')}
                style={{ fontSize: '0.84rem', padding: '9px 16px' }}
              >
                <Lock size={15} />
                <span>Sign In to Claim or Review Items</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Campus Hotspots Filter Bar */}
      <div className="card" style={{ padding: '24px', marginBottom: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={20} color="var(--accent-warm)" />
              <span>Campus Hotspots</span>
            </h2>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>
              Tap a campus zone to see items recently lost or found nearby
            </p>
          </div>
          {selectedZone !== 'All' && (
            <button
              className="btn btn-ghost"
              onClick={() => setSelectedZone('All')}
              style={{ fontSize: '0.84rem', color: 'var(--primary)', fontWeight: 700 }}
            >
              Show All Zones ✕
            </button>
          )}
        </div>

        <div className="hide-scrollbar" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '12px' }}>
          {CAMPUS_ZONES.map(zone => {
            const countInZone = reports.filter(
              r => r.status !== 'resolved' && (r.campusZone === zone.id || r.location.includes(zone.id))
            ).length;
            const isSelected = selectedZone === zone.id;

            return (
              <motion.button
                key={zone.id}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedZone(isSelected ? 'All' : zone.id)}
                style={{
                  textAlign: 'left',
                  padding: '14px 16px',
                  borderRadius: '16px',
                  backgroundColor: isSelected ? 'var(--primary-light)' : 'var(--bg-subtle)',
                  border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                  transition: 'var(--transition)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '1.5rem' }}>{zone.icon}</span>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '0.73rem',
                    fontWeight: 700,
                    backgroundColor: countInZone > 0 ? 'var(--bg-card)' : 'transparent',
                    color: countInZone > 0 ? 'var(--text-main)' : 'var(--text-muted)',
                    border: countInZone > 0 ? '1px solid var(--border)' : 'none'
                  }}>
                    {countInZone} active
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>
                  {zone.label}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                  {zone.desc}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Recently Reported Section with Quick Filter Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Flame size={20} color="var(--accent-warm)" />
            <span>
              {selectedZone === 'All' ? 'Fresh on the Campus Feed' : `Items around ${selectedZone}`}
            </span>
          </h2>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>
            Click “Claim This Item” on any found item to verify ownership, or post a sighting clue
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={feedTypeFilter === 'all' ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setFeedTypeFilter('all')}
            style={{ padding: '7px 14px', fontSize: '0.82rem', borderRadius: '999px' }}
          >
            All ({reports.filter(r => r.status !== 'resolved').length})
          </button>
          <button
            type="button"
            className={feedTypeFilter === 'found' ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setFeedTypeFilter('found')}
            style={{ padding: '7px 14px', fontSize: '0.82rem', borderRadius: '999px' }}
          >
            🙌 Found — Ready to Claim ({foundCount})
          </button>
          <button
            type="button"
            className={feedTypeFilter === 'lost' ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setFeedTypeFilter('lost')}
            style={{ padding: '7px 14px', fontSize: '0.82rem', borderRadius: '999px' }}
          >
            🔍 Lost ({lostCount})
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => navigate('/browse')}
            style={{ padding: '7px 12px', fontSize: '0.84rem', fontWeight: 700, color: 'var(--primary)' }}
          >
            <span>Explore Directory</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3" style={{ marginBottom: '44px' }}>
        {filteredRecentReports.map(report => (
          <ItemCard key={report.id} item={report} />
        ))}
        {filteredRecentReports.length === 0 && (
          <div style={{
            gridColumn: '1 / -1',
            textAlign: 'center',
            padding: '48px 24px',
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)'
          }}>
            <PackageSearch size={42} color="var(--text-muted)" style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <h3 style={{ fontSize: '1.1rem', marginBottom: '6px' }}>No matching active items in {selectedZone}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
              Try switching the filter or selecting All Campus Zones.
            </p>
            <button className="btn btn-secondary" onClick={() => { setSelectedZone('All'); setFeedTypeFilter('all'); }}>
              Reset Feed Filters
            </button>
          </div>
        )}
      </div>

      {/* Campus Kindness & Reunion Stories Wall */}
      <div id="kindness-wall" style={{ paddingTop: '8px' }}>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--amber)', marginBottom: '6px' }}>
            <Sparkles size={14} /> Humans of LostLink
          </div>
          <h2 className="serif-accent" style={{ fontSize: '1.6rem', color: 'var(--text-main)' }}>
            Recent Campus Reunions &amp; Kindness Notes
          </h2>
          <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)' }}>
            Real stories from students and faculty who helped return lost belongings this week.
          </p>
        </div>

        <div className="grid grid-cols-3">
          {reunionStories.slice(0, 3).map(story => (
            <motion.div
              key={story.id}
              whileHover={{ y: -4 }}
              className="card"
              style={{
                padding: '22px',
                background: 'linear-gradient(180deg, var(--bg-card) 0%, var(--bg-subtle) 100%)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '16px'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span className="badge badge-found" style={{ fontSize: '0.7rem' }}>
                    🎉 Reunited • {story.location}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{story.timeAgo}</span>
                </div>

                <h3 style={{ fontSize: '1.05rem', marginBottom: '10px', color: 'var(--text-main)' }}>
                  {story.itemTitle}
                </h3>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <Quote size={18} color="var(--primary)" style={{ flexShrink: 0, opacity: 0.6, marginTop: '2px' }} />
                  <p className="serif-accent" style={{ fontSize: '0.92rem', fontStyle: 'italic', fontWeight: 500, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    “{story.quote}”
                  </p>
                </div>
              </div>

              <div style={{
                paddingTop: '12px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.82rem'
              }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Owner: </span>
                  <strong style={{ color: 'var(--text-main)' }}>{story.ownerName}</strong>
                </div>
                <div style={{ color: 'var(--success)', fontWeight: 700 }}>
                  🙌 Found by {story.finderName}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useData } from '../store/DataContext';
import { Mail, ShieldCheck, Award, Sparkles, HeartHandshake, Save } from 'lucide-react';
import { motion } from 'framer-motion';

export const Profile: React.FC = () => {
  const { user, updateUserProfile, reports } = useData();

  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
    role: user.role || '3rd Year • Computer Science & Design',
    department: user.department || 'School of Engineering & Design',
    studentId: user.studentId || 'CS2024-8942',
    bio: user.bio || '',
    phone: user.phone || '+91 98765 43210'
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserProfile(formData);
  };

  const myReportsCount = reports.filter(r => r.userId === user.id).length;

  const badges = [
    { icon: '🌟', title: 'Good Samaritan', desc: 'Helped reunite campus items', unlocked: true },
    { icon: '🦅', title: 'Eagle Eye Scout', desc: 'Posted helpful campus sightings', unlocked: true },
    { icon: '📚', title: 'Library Guardian', desc: 'Active around Main Library & Science Block', unlocked: true },
    { icon: '🏆', title: 'Campus Legend', desc: 'Reach 200 Kindness Karma points', unlocked: (user.karmaPoints || 145) >= 200 }
  ];

  return (
    <div style={{ paddingBottom: '40px' }}>
      <h1 className="page-title serif-accent">Profile &amp; Kindness Passport</h1>
      <p className="page-subtitle">
        Your verified campus identity, community reputation, and contact preferences.
      </p>

      <div className="grid mobile-form-grid" style={{ gridTemplateColumns: '1fr 1.35fr', gap: '28px', alignItems: 'start' }}>
        {/* Left Column: Passport & Badges */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{
              padding: '36px 28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              background: 'linear-gradient(135deg, var(--primary-light) 0%, var(--amber-light) 100%)',
              borderBottom: '1px solid var(--border)'
            }}>
              <div style={{
                width: '92px',
                height: '92px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-warm) 100%)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.3rem',
                fontWeight: 800,
                marginBottom: '16px',
                boxShadow: '0 10px 24px var(--primary-glow)',
                border: '4px solid var(--bg-card)'
              }}>
                {user.name.charAt(0)}
              </div>

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 12px', borderRadius: '999px', backgroundColor: 'var(--success-light)', color: 'var(--success)', fontSize: '0.75rem', fontWeight: 700, marginBottom: '8px', border: '1px solid var(--success-border)' }}>
                <ShieldCheck size={14} /> Verified Campus Member
              </div>

              <h2 className="serif-accent" style={{ fontSize: '1.5rem', marginBottom: '4px', color: 'var(--text-main)' }}>
                {user.name}
              </h2>
              <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '8px' }}>
                {user.role || '3rd Year • Computer Science & Design'}
              </div>
              <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                <Mail size={14} />
                <span>{user.email}</span>
              </div>
            </div>

            {/* Karma Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', padding: '20px 12px', textAlign: 'center', backgroundColor: 'var(--bg-card)' }}>
              <div style={{ borderRight: '1px solid var(--border)' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--amber)' }}>
                  {user.karmaPoints || 145}
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Karma Pts
                </div>
              </div>
              <div style={{ borderRight: '1px solid var(--border)' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)' }}>
                  {user.reunionsHelped || 4}
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Reunions
                </div>
              </div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {myReportsCount}
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  My Reports
                </div>
              </div>
            </div>
          </div>

          {/* Community Badges */}
          <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Award size={19} color="var(--amber)" />
              <span>Campus Kindness Badges</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {badges.map((b, i) => (
                <motion.div
                  key={i}
                  whileHover={{ x: 3 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '12px 14px',
                    borderRadius: '14px',
                    backgroundColor: b.unlocked ? 'var(--bg-subtle)' : 'transparent',
                    border: `1px solid ${b.unlocked ? 'var(--border)' : 'var(--border)'}`,
                    opacity: b.unlocked ? 1 : 0.55
                  }}
                >
                  <div style={{ fontSize: '1.75rem' }}>{b.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                      {b.title}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{b.desc}</div>
                  </div>
                  {b.unlocked ? (
                    <span className="badge badge-found" style={{ fontSize: '0.68rem' }}>Earned</span>
                  ) : (
                    <span className="badge" style={{ backgroundColor: 'var(--bg-subtle)', color: 'var(--text-muted)', fontSize: '0.68rem' }}>Locked</span>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Editable Profile Details */}
        <div className="card" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Edit Campus Identity</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                This information is shown when you report a lost or found item.
              </p>
            </div>
            <HeartHandshake size={24} color="var(--primary)" />
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="grid mobile-form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="form-label">Year &amp; Major / Role</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value })}
                  placeholder="e.g., 3rd Year • Computer Science"
                />
              </div>
            </div>

            <div className="grid mobile-form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label">University Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="form-label">Campus ID Number</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.studentId}
                  onChange={e => setFormData({ ...formData, studentId: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="form-label">Department / Hostel Block</label>
              <input
                type="text"
                className="form-control"
                value={formData.department}
                onChange={e => setFormData({ ...formData, department: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label">Campus Bio &amp; Pickup Note</label>
              <textarea
                rows={3}
                className="form-control"
                value={formData.bio}
                onChange={e => setFormData({ ...formData, bio: e.target.value })}
                placeholder="Share where you usually hang out on campus so people know where to meet up..."
              />
            </div>

            <div style={{
              marginTop: '8px',
              paddingTop: '20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={15} color="var(--amber)" /> Changes save immediately to your local campus session.
              </span>
              <button type="submit" className="btn btn-primary">
                <Save size={17} /> Save Profile
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

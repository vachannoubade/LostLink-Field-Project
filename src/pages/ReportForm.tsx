import React, { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { CAMPUS_ZONES } from '../store/seedData';
import type { Category, VerificationPromptInput } from '../types';
import {
  CheckCircle, UploadCloud, Sparkles, Coffee, MapPin,
  AlertTriangle, HeartHandshake, FilePlus, ShieldCheck,
  Lock, Plus, Trash2, AlertCircle
} from 'lucide-react';
import { motion } from 'framer-motion';

const CATEGORY_OPTIONS: { value: Category; emoji: string; hint: string }[] = [
  { value: 'Electronics', emoji: '🎧', hint: 'Earbuds, chargers, laptops' },
  { value: 'ID Cards', emoji: '🪪', hint: 'Student ID, metro card, wallet' },
  { value: 'Accessories', emoji: '💧', hint: 'Hydro Flask, glasses, watch' },
  { value: 'Keys', emoji: '🔑', hint: 'Hostel keys, bike keys, fobs' },
  { value: 'Books', emoji: '📓', hint: 'Notebooks, textbooks, lab files' },
  { value: 'Bags', emoji: '🎒', hint: 'Backpacks, totes, pouches' },
  { value: 'Other', emoji: '📦', hint: 'Umbrellas, hoodies, gear' }
];

const PROMPT_SUGGESTIONS = [
  'What distinctive sticker, scratch, or mark is on the item?',
  'What keychain, charm, or accessory is attached?',
  'What color or brand is the inner lining / protective case?',
  'What initials, name, or room number is written inside?'
];

export const ReportForm: React.FC = () => {
  const { addReport } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const isLost = location.pathname.includes('/report/lost');

  const [formData, setFormData] = useState({
    title: '',
    category: 'Electronics' as Category,
    description: '',
    campusZone: 'Main Library',
    location: '',
    date: new Date().toISOString().split('T')[0],
    time: '14:00',
    gratitudeNote: '',
    urgency: 'normal' as 'normal' | 'high',
    imageUrl: ''
  });

  // Private Ownership Verification Details (for Found items)
  const [privatePrompts, setPrivatePrompts] = useState<VerificationPromptInput[]>([
    {
      promptLabel: 'What distinctive sticker, scratch, or mark is on the item?',
      secretAnswer: ''
    },
    {
      promptLabel: 'What unique detail (keychain, case, engraving, or contents) is present?',
      secretAnswer: ''
    }
  ]);
  const [estimatedValue, setEstimatedValue] = useState<number>(1000);
  const [enhancedVerification, setEnhancedVerification] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File is too large. Please select an image under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setFormData(prev => ({ ...prev, imageUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (formError) setFormError(null);
  };

  const handlePromptChange = (index: number, field: keyof VerificationPromptInput, value: string) => {
    setPrivatePrompts(prev =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
    if (formError) setFormError(null);
  };

  const addThirdPrompt = () => {
    if (privatePrompts.length >= 3) return;
    setPrivatePrompts(prev => [
      ...prev,
      {
        promptLabel: 'What additional identifying characteristic is known only to the owner?',
        secretAnswer: ''
      }
    ]);
  };

  const removeThirdPrompt = (index: number) => {
    if (privatePrompts.length <= 2) return;
    setPrivatePrompts(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!isLost) {
      const validPrompts = privatePrompts.filter(
        p => p.promptLabel.trim().length >= 3 && p.secretAnswer.trim().length >= 2
      );
      if (validPrompts.length < 2) {
        setFormError(
          'Please complete at least 2 Private Ownership Verification Details (both the question prompt and the secret answer known only to the owner).'
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const fullLocation = formData.location.includes(formData.campusZone)
        ? formData.location
        : `${formData.campusZone} • ${formData.location}`;

      const result = await addReport(
        {
          type: isLost ? 'lost' : 'found',
          title: formData.title,
          category: formData.category,
          description: formData.description,
          campusZone: formData.campusZone,
          location: fullLocation,
          date: formData.date,
          time: formData.time,
          gratitudeNote: formData.gratitudeNote,
          urgency: formData.urgency,
          imageUrl: formData.imageUrl
        },
        !isLost
          ? {
              privatePrompts,
              enhancedVerification: enhancedVerification || estimatedValue >= 5000,
              estimatedValue
            }
          : undefined
      );

      if (!result.ok) {
        setFormError(result.error || 'Could not submit report.');
        return;
      }

      setSubmitted(true);
      setTimeout(() => {
        navigate('/my-reports');
      }, 1800);
    } finally {
      setSubmitting(false);
    }
  };

  const quickNotes = isLost
    ? [
        'Hot coffee & samosas at Student Union on me! ☕',
        'Has my exam study notes inside—huge thanks if found! 🙏',
        'Please message me or drop at the Main Library desk 💙'
      ]
    : [
        'Handed safely to the building front desk Reception!',
        'Keeping it safe with me—submit a claim to verify ownership!',
        'Left with Campus Security at Gate 1.'
      ];

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 24px',
          maxWidth: '540px',
          margin: '40px auto',
          textAlign: 'center'
        }}
      >
        <div style={{
          width: '88px',
          height: '88px',
          borderRadius: '50%',
          backgroundColor: 'var(--success-light)',
          color: 'var(--success)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '20px'
        }}>
          <CheckCircle size={44} />
        </div>
        <h2 className="serif-accent" style={{ fontSize: '1.8rem', marginBottom: '10px' }}>
          {isLost ? 'We’re on the lookout!' : 'Thank you, Campus Hero! 🌟'}
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', maxWidth: '420px', fontSize: '1rem', lineHeight: 1.6 }}>
          {isLost
            ? 'Your report is now live on the Campus Hub and our AI is scanning found items for matches.'
            : 'Your found report and encrypted Private Ownership Verification Details have been saved. You earned +25 Kindness Karma!'}
        </p>
      </motion.div>
    );
  }

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', paddingBottom: '48px' }}>
      {/* Mode Switcher */}
      <div style={{ display: 'inline-flex', padding: '5px', borderRadius: '14px', backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border)', marginBottom: '20px', gap: '6px' }}>
        <button
          type="button"
          onClick={() => navigate('/report/lost')}
          style={{
            padding: '9px 18px',
            borderRadius: '10px',
            fontWeight: 700,
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: isLost ? 'var(--bg-card)' : 'transparent',
            color: isLost ? 'var(--danger)' : 'var(--text-muted)',
            boxShadow: isLost ? 'var(--shadow-sm)' : 'none'
          }}
        >
          <FilePlus size={16} /> I Lost Something
        </button>
        <button
          type="button"
          onClick={() => navigate('/report/found')}
          style={{
            padding: '9px 18px',
            borderRadius: '10px',
            fontWeight: 700,
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: !isLost ? 'var(--bg-card)' : 'transparent',
            color: !isLost ? 'var(--success)' : 'var(--text-muted)',
            boxShadow: !isLost ? 'var(--shadow-sm)' : 'none'
          }}
        >
          <HeartHandshake size={16} /> I Found Something (+25 Karma)
        </button>
      </div>

      <h1 className="page-title serif-accent">
        {isLost ? 'Let’s help you track it down.' : 'You’re making someone’s day! 🌟'}
      </h1>
      <p className="page-subtitle">
        {isLost
          ? 'Share a few helpful details—stickers, color, or where you last had it—so fellow students and our AI can spot it.'
          : 'Share general public details below, and record 2–3 private identifying details so only the genuine owner can claim it.'}
      </p>

      {formError && (
        <div
          role="alert"
          style={{
            padding: '14px 16px',
            borderRadius: '14px',
            backgroundColor: 'var(--danger-light)',
            border: '1px solid var(--danger-border)',
            color: 'var(--danger)',
            fontWeight: 600,
            fontSize: '0.9rem',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{formError}</span>
        </div>
      )}

      <div className="card" style={{ padding: '32px' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Item Title */}
            <div>
              <label htmlFor="report-title" className="form-label">
                What was {isLost ? 'lost' : 'found'}? *
              </label>
              <input
                id="report-title"
                type="text"
                name="title"
                required
                className="form-control"
                placeholder={isLost ? 'e.g., Matte Black Sony Earbuds or Blue Hydro Flask' : 'e.g., Black Wireless Earbuds Case or Brass Keyring'}
                value={formData.title}
                onChange={handleChange}
              />
            </div>

            {/* Interactive Category Cards */}
            <div>
              <label className="form-label">Pick a Category *</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: '10px' }}>
                {CATEGORY_OPTIONS.map(cat => {
                  const selected = formData.category === cat.value;
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, category: cat.value })}
                      style={{
                        padding: '12px',
                        borderRadius: '14px',
                        textAlign: 'left',
                        backgroundColor: selected ? 'var(--primary-light)' : 'var(--bg-subtle)',
                        border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                        transition: 'var(--transition)'
                      }}
                    >
                      <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>{cat.emoji}</div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: selected ? 'var(--primary)' : 'var(--text-main)' }}>
                        {cat.value}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{cat.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Campus Hotspot Picker + Specific Spot */}
            <div>
              <label htmlFor="report-location" className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={16} color="var(--accent-warm)" />
                <span>Campus Zone &amp; Specific Spot *</span>
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {CAMPUS_ZONES.map(zone => {
                  const active = formData.campusZone === zone.id;
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, campusZone: zone.id })}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '999px',
                        fontSize: '0.83rem',
                        fontWeight: 600,
                        backgroundColor: active ? 'var(--text-main)' : 'var(--bg-subtle)',
                        color: active ? 'var(--bg-card)' : 'var(--text-main)',
                        border: `1px solid ${active ? 'var(--text-main)' : 'var(--border)'}`,
                        transition: 'var(--transition)'
                      }}
                    >
                      {zone.icon} {zone.label}
                    </button>
                  );
                })}
              </div>
              <input
                id="report-location"
                type="text"
                name="location"
                required
                className="form-control"
                placeholder={`Specific spot in ${formData.campusZone} (e.g., 2nd floor reading table, Room 402, Stone bench)`}
                value={formData.location}
                onChange={handleChange}
              />
            </div>

            {/* Date, Time & Urgency */}
            <div className="grid mobile-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <div>
                <label htmlFor="report-date" className="form-label">
                  Date {isLost ? 'Lost' : 'Found'} *
                </label>
                <input
                  id="report-date"
                  type="date"
                  name="date"
                  required
                  className="form-control"
                  value={formData.date}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label htmlFor="report-time" className="form-label">
                  Approx. Time
                </label>
                <input
                  id="report-time"
                  type="time"
                  name="time"
                  className="form-control"
                  value={formData.time}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="form-label">Priority Level</label>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, urgency: formData.urgency === 'high' ? 'normal' : 'high' })}
                  style={{
                    width: '100%',
                    padding: '13px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1.5px solid ${formData.urgency === 'high' ? '#F59E0B' : 'var(--border)'}`,
                    backgroundColor: formData.urgency === 'high' ? 'var(--amber-light)' : 'var(--bg-card)',
                    color: formData.urgency === 'high' ? '#B45309' : 'var(--text-muted)',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <AlertTriangle size={16} />
                  <span>{formData.urgency === 'high' ? 'Urgent Item' : 'Standard Priority'}</span>
                </button>
              </div>
            </div>

            {/* Public Description */}
            <div>
              <label htmlFor="report-description" className="form-label">
                Public Description *
              </label>
              <textarea
                id="report-description"
                name="description"
                required
                rows={3}
                className="form-control"
                placeholder={
                  isLost
                    ? 'Mention brand, color, stickers, keychains, or what you were doing when you last had it...'
                    : 'General description visible on the public feed (do NOT reveal secret verification details here)...'
                }
                value={formData.description}
                onChange={handleChange}
              />
            </div>

            {/* ==============================================================
                SECTION 1: PRIVATE OWNERSHIP VERIFICATION DETAILS (FOUND ITEMS)
               ============================================================== */}
            {!isLost && (
              <div style={{
                padding: '24px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, var(--primary-light) 0%, var(--bg-subtle) 100%)',
                border: '1.5px solid var(--primary)',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '999px', backgroundColor: 'var(--primary)', color: 'white', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                      <Lock size={12} /> Hidden from Public Feed
                    </div>
                    <h3 style={{ fontSize: '1.15rem', color: 'var(--text-main)', marginBottom: '4px' }}>
                      Private Ownership Verification Details
                    </h3>
                    <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      Record <strong>2 or 3 non-public identifying characteristics</strong> (such as a hidden scratch, sticker, keychain charm, or engraving). Claimants will be asked your question prompts without ever seeing your secret answers.
                    </p>
                  </div>
                  <ShieldCheck size={32} color="var(--primary)" style={{ flexShrink: 0 }} />
                </div>

                {/* Quick Prompt Suggestions */}
                <div>
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                    Quick question templates (click to apply to Prompt #1):
                  </span>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {PROMPT_SUGGESTIONS.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handlePromptChange(0, 'promptLabel', s)}
                        style={{
                          fontSize: '0.74rem',
                          padding: '4px 10px',
                          borderRadius: '999px',
                          backgroundColor: 'var(--bg-card)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-secondary)',
                          fontWeight: 600
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2 to 3 Prompt + Secret Answer Pairs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {privatePrompts.map((p, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '16px',
                        borderRadius: '14px',
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)' }}>
                          Characteristic #{index + 1} *
                        </span>
                        {index === 2 && (
                          <button
                            type="button"
                            onClick={() => removeThirdPrompt(index)}
                            style={{ color: 'var(--danger)', fontSize: '0.78rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Trash2 size={13} /> Remove
                          </button>
                        )}
                      </div>

                      <div className="grid mobile-form-grid" style={{ gridTemplateColumns: '1.15fr 1fr', gap: '12px' }}>
                        <div>
                          <label htmlFor={`vp-label-${index}`} style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                            Question shown to Claimant
                          </label>
                          <input
                            id={`vp-label-${index}`}
                            type="text"
                            required
                            className="form-control"
                            style={{ padding: '10px 12px', fontSize: '0.88rem' }}
                            placeholder="e.g., What sticker is on the bottom lid?"
                            value={p.promptLabel}
                            onChange={e => handlePromptChange(index, 'promptLabel', e.target.value)}
                          />
                        </div>
                        <div>
                          <label htmlFor={`vp-secret-${index}`} style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--success)', display: 'block', marginBottom: '4px' }}>
                            🔒 Secret Answer (Private — Finder &amp; Admin only)
                          </label>
                          <input
                            id={`vp-secret-${index}`}
                            type="text"
                            required
                            className="form-control"
                            style={{ padding: '10px 12px', fontSize: '0.88rem', borderColor: 'var(--success-border)' }}
                            placeholder="e.g., Tiny yellow smiley sticker"
                            value={p.secretAnswer}
                            onChange={e => handlePromptChange(index, 'secretAnswer', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {privatePrompts.length < 3 && (
                  <button
                    type="button"
                    onClick={addThirdPrompt}
                    className="btn btn-secondary"
                    style={{ alignSelf: 'flex-start', padding: '8px 14px', fontSize: '0.82rem' }}
                  >
                    <Plus size={15} /> Add 3rd Identifying Characteristic
                  </button>
                )}

                {/* High-Value / Enhanced Admin Verification Option */}
                <div className="grid mobile-form-grid" style={{ gridTemplateColumns: '1fr 1.3fr', gap: '14px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                  <div>
                    <label htmlFor="estimated-value" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>
                      Approx. Item Value (₹)
                    </label>
                    <input
                      id="estimated-value"
                      type="number"
                      min={0}
                      step={500}
                      className="form-control"
                      style={{ padding: '10px 12px', fontSize: '0.9rem' }}
                      value={estimatedValue}
                      onChange={e => setEstimatedValue(Number(e.target.value))}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      <input
                        type="checkbox"
                        checked={enhancedVerification || estimatedValue >= 5000}
                        onChange={e => setEnhancedVerification(e.target.checked)}
                        style={{ marginTop: '3px', width: '16px', height: '16px' }}
                      />
                      <span>
                        <strong style={{ color: 'var(--text-main)', display: 'block' }}>
                          Require Mandatory Administrator Co-Approval
                        </strong>
                        Automatically enabled for high-value items (₹5,000+) or sensitive IDs/keys.
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Gratitude / Finder Note */}
            <div style={{
              padding: '18px',
              borderRadius: '16px',
              backgroundColor: 'var(--amber-light)',
              border: '1px dashed var(--amber-border)'
            }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Coffee size={17} color="var(--amber)" />
                <span>{isLost ? 'Add a Gratitude Note / Thank-You Gesture (Optional)' : 'Where Is the Item Safely Stored? (Optional)'}</span>
              </label>
              <input
                type="text"
                name="gratitudeNote"
                className="form-control"
                placeholder={isLost ? 'e.g., Coffee & samosas at the canteen on me!' : 'e.g., Handed to Mrs. Nair at the Library Help Desk'}
                value={formData.gratitudeNote}
                onChange={handleChange}
                style={{ backgroundColor: 'var(--bg-card)', marginBottom: '10px' }}
              />
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {quickNotes.map((note, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setFormData({ ...formData, gratitudeNote: note })}
                    style={{
                      fontSize: '0.75rem',
                      padding: '5px 10px',
                      borderRadius: '999px',
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                      fontWeight: 600
                    }}
                  >
                    + “{note}”
                  </button>
                ))}
              </div>
            </div>

            {/* Photo Upload */}
            <div>
              <label className="form-label">Public Photo (Optional — avoid showing secret serial numbers or hidden marks)</label>
              <div style={{
                border: '2px dashed var(--border-strong)',
                borderRadius: 'var(--radius)',
                padding: '28px',
                textAlign: 'center',
                backgroundColor: 'var(--bg-subtle)'
              }}>
                {formData.imageUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '100%', maxWidth: '300px', height: '190px', borderRadius: '14px', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
                      <img src={formData.imageUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setFormData({ ...formData, imageUrl: '' });
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                    >
                      Change Photo
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--primary-light)',
                      color: 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <UploadCloud size={26} />
                    </div>
                    <div style={{ fontSize: '0.96rem', fontWeight: 700 }}>Upload a photo or product picture</div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '8px' }}>
                      No photo? No worries—we’ll automatically create a clean category illustration for your card.
                    </p>

                    <input
                      type="file"
                      accept="image/*"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      style={{ display: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                        Choose Image File
                      </button>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>or</span>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Paste image URL..."
                        style={{ width: '240px', padding: '10px 14px' }}
                        value={formData.imageUrl}
                        onChange={e => setFormData({ ...formData, imageUrl: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              <Sparkles size={16} color="var(--primary)" />
              <span>
                {isLost
                  ? 'AI Matching will automatically run as soon as you post.'
                  : 'Private answers are stored server-side and never exposed publicly.'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={isLost ? 'btn btn-warm' : 'btn btn-primary'}
                style={{ minWidth: '180px' }}
              >
                {submitting
                  ? 'Saving...'
                  : isLost
                  ? 'Publish Lost Report'
                  : 'Publish Found Report'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

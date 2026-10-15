import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useData } from '../store/DataContext';
import type { Category } from '../types';
import { 
  CheckCircle, UploadCloud, ArrowLeft, AlertCircle, Loader2, 
  Lock, Globe, MapPin, Tag, Calendar, ShieldCheck, Eye, EyeOff 
} from 'lucide-react';
import { motion } from 'framer-motion';
import { validateImageFile, uploadReportImage, deleteReportImage } from '../lib/storage';
import { validatePin, validateClue, setReportVerification, getOwnerVerification } from '../lib/verification';
import { CATEGORY_OPTIONS } from '../utils/categoryArt';

const getDefaultDate = () => new Date().toISOString().split('T')[0];

const CAMPUS_ZONES = [
  'Main Library',
  'Student Union',
  'Science Building',
  'Dining Hall',
  'Sports Complex',
  'Hostel Quad'
];

export const ReportForm: React.FC = () => {
  const { addReport, updateReport, reports, user } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();

  const editId = params.id || searchParams.get('edit') || undefined;
  const isEdit = Boolean(editId);
  const existingReport = editId ? reports.find(r => r.id === editId) : undefined;
  const isUnauthorized = Boolean(isEdit && existingReport && existingReport.userId !== user.id);

  const isLost = existingReport
    ? existingReport.type === 'lost'
    : location.pathname.includes('/report/lost');
  
  const [formData, setFormData] = useState(() => {
    if (existingReport) {
      return {
        title: existingReport.title,
        category: existingReport.category,
        description: existingReport.description,
        location: existingReport.location,
        campusZone: existingReport.campusZone || '',
        date: existingReport.date,
        imageUrl: existingReport.imageUrl || '',
        hasPrivateVerification: existingReport.hasPrivateVerification || false
      };
    }
    return {
      title: '',
      category: 'Electronics' as Category,
      description: '',
      location: '',
      campusZone: '',
      date: getDefaultDate(),
      imageUrl: '',
      hasPrivateVerification: false
    };
  });

  const [prevEditId, setPrevEditId] = useState(editId);
  if (prevEditId !== editId) {
    setPrevEditId(editId);
    setFormData(existingReport ? {
      title: existingReport.title,
      category: existingReport.category,
      description: existingReport.description,
      location: existingReport.location,
      campusZone: existingReport.campusZone || '',
      date: existingReport.date,
      imageUrl: existingReport.imageUrl || '',
      hasPrivateVerification: existingReport.hasPrivateVerification || false
    } : {
      title: '',
      category: 'Electronics' as Category,
      description: '',
      location: '',
      campusZone: '',
      date: getDefaultDate(),
      imageUrl: '',
      hasPrivateVerification: false
    });
  }
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Private Ownership Verification State
  const [ownershipClue, setOwnershipClue] = useState('');
  const [ownershipPin, setOwnershipPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [clueError, setClueError] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [hasExistingVerification, setHasExistingVerification] = useState(false);

  // Load existing verification clue when editing an owned report
  useEffect(() => {
    let isMounted = true;
    if (isEdit && editId && isLost) {
      getOwnerVerification(editId).then(res => {
        if (!isMounted) return;
        if (res.configured && res.clue) {
          setOwnershipClue(res.clue);
          setHasExistingVerification(true);
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [isEdit, editId, isLost]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImageError(null);

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setImageError(validation.error || 'Please select a valid image file (JPG, PNG, WebP under 5MB).');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
    // Create instant local blob URL for high-fidelity client preview
    const previewUrl = URL.createObjectURL(file);
    setFormData(prev => ({ ...prev, imageUrl: previewUrl }));
  };

  const handleRemoveImage = () => {
    if (selectedFile && formData.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(formData.imageUrl);
    }
    setSelectedFile(null);
    setFormData(prev => ({ ...prev, imageUrl: '' }));
    setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSelectZone = (zone: string) => {
    setFormData(prev => ({
      ...prev,
      campusZone: zone,
      location: prev.location.includes(zone) ? prev.location : (prev.location ? `${zone}, ${prev.location}` : zone)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setSubmitError(null);
    setClueError(null);
    setPinError(null);

    // Validate ownership verification fields for lost items
    if (isLost) {
      const clueVal = validateClue(ownershipClue);
      if (!clueVal.valid) {
        setClueError(clueVal.error || 'Please provide a private ownership clue.');
        return;
      }

      if (!isEdit || !hasExistingVerification || ownershipPin.trim() !== '') {
        const pinVal = validatePin(ownershipPin);
        if (!pinVal.valid) {
          setPinError(pinVal.error || 'Please provide a 6-digit numeric PIN.');
          return;
        }
      }
    }

    setIsSaving(true);
    setUploadStatus(null);

    let newlyUploadedPath: string | null = null;

    try {
      // 1. Upload local file to private Supabase Storage if present
      if (selectedFile) {
        setUploadStatus('Uploading image to private storage...');
        const uploadResult = await uploadReportImage(selectedFile, user.id);

        if (uploadResult.error || !uploadResult.path) {
          setSubmitError(uploadResult.error || 'Failed to upload image. Please try again.');
          setIsSaving(false);
          setUploadStatus(null);
          return;
        }

        newlyUploadedPath = uploadResult.path;
      }

      // 2. Perform Edit or Create
      if (isEdit && editId) {
        setUploadStatus('Saving changes...');
        const finalImagePath = newlyUploadedPath || (selectedFile ? undefined : existingReport?.imagePath);
        const finalImageUrl = newlyUploadedPath ? undefined : formData.imageUrl;

        const result = await updateReport(editId, {
          title: formData.title,
          category: formData.category,
          description: formData.description,
          location: formData.location,
          campusZone: formData.campusZone || undefined,
          date: formData.date,
          imagePath: finalImagePath,
          imageUrl: finalImageUrl,
          hasPrivateVerification: isLost ? true : formData.hasPrivateVerification
        });

        if (result.success) {
          if (isLost) {
            setUploadStatus('Updating private verification details...');
            const verifResult = await setReportVerification(
              editId,
              ownershipClue,
              ownershipPin.trim() !== '' ? ownershipPin.trim() : undefined
            );

            if (!verifResult.success) {
              setSubmitError(verifResult.error || 'Failed to update private verification details.');
              setIsSaving(false);
              setUploadStatus(null);
              return;
            }
          }

          if (
            existingReport?.imagePath &&
            (newlyUploadedPath ? existingReport.imagePath !== newlyUploadedPath : !formData.imageUrl)
          ) {
            deleteReportImage(existingReport.imagePath).catch(() => {});
          }

          setSubmitted(true);
          setTimeout(() => {
            navigate('/my-reports');
          }, 1500);
        } else {
          if (newlyUploadedPath) {
            await deleteReportImage(newlyUploadedPath).catch(() => {});
          }
          setSubmitError(result.error || 'Failed to update report. Please try again.');
        }
        return;
      }

      // 3. Create new report
      setUploadStatus('Submitting report...');
      const result = await addReport({
        type: isLost ? 'lost' : 'found',
        title: formData.title,
        category: formData.category,
        description: formData.description,
        location: formData.location,
        campusZone: formData.campusZone || undefined,
        date: formData.date,
        imagePath: newlyUploadedPath || undefined,
        imageUrl: newlyUploadedPath ? undefined : formData.imageUrl,
        hasPrivateVerification: isLost ? true : formData.hasPrivateVerification
      });

      if (result.success) {
        if (isLost && result.id) {
          setUploadStatus('Securing private verification details...');
          const verifResult = await setReportVerification(
            result.id,
            ownershipClue,
            ownershipPin.trim()
          );

          if (!verifResult.success) {
            setSubmitError(verifResult.error || 'Report created, but failed to secure private verification details.');
            setIsSaving(false);
            setUploadStatus(null);
            return;
          }
        }

        setSubmitted(true);
        setTimeout(() => {
          navigate('/my-reports');
        }, 1800);
      } else {
        if (newlyUploadedPath) {
          await deleteReportImage(newlyUploadedPath).catch(() => {});
        }
        setSubmitError(result.error || 'Failed to submit report. Please try again.');
      }
    } catch (err) {
      if (newlyUploadedPath) {
        await deleteReportImage(newlyUploadedPath).catch(() => {});
      }
      setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSaving(false);
      setUploadStatus(null);
    }
  };

  if (isEdit && !existingReport) {
    return (
      <div style={{ maxWidth: '750px', margin: '0 auto', paddingBottom: '40px' }}>
        <button className="btn btn-ghost" onClick={() => navigate('/my-reports')} style={{ marginBottom: '16px' }}>
          <ArrowLeft size={18} /> Back to My Reports
        </button>
        <div className="card" style={{ padding: '64px 24px', textAlign: 'center' }}>
          <AlertCircle size={40} color="var(--danger)" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Report Not Found</h2>
          <p style={{ color: 'var(--text-muted)', margin: '8px 0 24px' }}>
            The report you are trying to edit does not exist or may have been deleted.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/my-reports')}>
            Return to My Reports
          </button>
        </div>
      </div>
    );
  }

  if (isUnauthorized) {
    return (
      <div style={{ maxWidth: '750px', margin: '0 auto', paddingBottom: '40px' }}>
        <button className="btn btn-ghost" onClick={() => navigate('/my-reports')} style={{ marginBottom: '16px' }}>
          <ArrowLeft size={18} /> Back to My Reports
        </button>
        <div className="card" style={{ padding: '64px 24px', textAlign: 'center' }}>
          <AlertCircle size={40} color="var(--danger)" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Permission Denied</h2>
          <p style={{ color: 'var(--text-muted)', margin: '8px 0 24px' }}>
            You can only edit reports that were submitted by your account.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/my-reports')}>
            Return to My Reports
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 20px', minHeight: '60vh', textAlign: 'center' }}
      >
        <div style={{ width: '88px', height: '88px', borderRadius: '50%', backgroundColor: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
          <CheckCircle size={48} />
        </div>
        <h2 style={{ fontSize: '1.75rem', marginBottom: '10px' }}>
          {isEdit ? 'Report Updated Successfully' : 'Report Published to Campus'}
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '28px', maxWidth: '440px', fontSize: '1.05rem', lineHeight: 1.6 }}>
          {isEdit 
            ? 'Your changes have been saved.' 
            : `Your ${isLost ? 'lost' : 'found'} report is now live. We will automatically cross-reference it against campus records.`}
        </p>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={() => navigate('/my-reports')}
            style={{ padding: '10px 20px' }}
          >
            View in My Reports
          </button>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={() => navigate('/browse')}
            style={{ padding: '10px 20px' }}
          >
            Browse Campus Items
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', paddingBottom: '56px' }}>
      <button 
        type="button" 
        className="btn btn-secondary" 
        onClick={() => navigate(-1)} 
        style={{ marginBottom: '20px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px' }}
      >
        <ArrowLeft size={16} /> Return to Previous View
      </button>

      {/* Editorial Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span className="mono-token mono-token-amber">
            {isEdit ? 'DOCKET REVISION' : (isLost ? 'INCIDENT INTAKE // LOST' : 'CUSTODY REGISTRATION // FOUND')}
          </span>
          <span className="mono-token mono-token-subtle">CAMPUS ARCHIVE</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.5rem', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '-0.025em', margin: 0, lineHeight: 1.15 }}>
          {isEdit ? 'Amend Incident Docket' : (isLost ? 'File Lost Possession Inquiry' : 'Log Recovered Campus Specimen')}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.98rem', marginTop: '6px', maxWidth: '640px', lineHeight: 1.5 }}>
          {isEdit 
            ? 'Update the recorded metadata, location sector, or specimen photograph in the campus registry.'
            : (isLost 
                ? 'Provide exact specifications to assist fellow campus members and algorithmic matching in locating your item.' 
                : 'Thank you for acting in the campus community interest. Catalog details accurately so legitimate owners can verify.')}
        </p>
      </div>

      <div className="card report-form-card" style={{ 
        padding: '36px',
        backgroundColor: '#FFFFFF',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '26px' }}>
            {/* Title */}
            <div>
              <label className="form-label" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                SPECIMEN IDENTIFIER / TITLE *
              </label>
              <input 
                type="text" 
                name="title"
                required
                className="form-control" 
                placeholder="e.g. Midnight Blue Hydro Flask, Silver MacBook Air 13-inch"
                value={formData.title}
                onChange={handleChange}
              />
            </div>

            {/* Category Selector Grid */}
            <div>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <Tag size={13} color="var(--text-muted)" />
                <span>TAXONOMY CLASSIFICATION *</span>
              </label>
              <div className="report-form-category-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: '10px',
                marginTop: '8px'
              }}>
                {CATEGORY_OPTIONS.map(opt => {
                  const isSelected = formData.category === opt.value;
                  return (
                    <div
                      key={opt.value}
                      onClick={() => setFormData(prev => ({ ...prev, category: opt.value }))}
                      style={{
                        padding: '14px',
                        borderRadius: '8px',
                        border: `1.5px solid ${isSelected ? 'var(--text-main)' : 'var(--border)'}`,
                        backgroundColor: isSelected ? 'var(--bg-canvas)' : '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.25rem' }}>{opt.emoji}</span>
                        <span style={{ fontSize: '0.88rem', fontWeight: isSelected ? 700 : 600, color: 'var(--text-main)' }}>
                          {opt.value}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                        {opt.hint}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Date & Campus Zone Grid */}
            <div className="report-form-grid-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={15} color="var(--primary)" />
                  <span>Date {isLost ? 'Lost' : 'Found'} *</span>
                </label>
                <input 
                  type="date" 
                  name="date"
                  required
                  className="form-control" 
                  value={formData.date}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={15} color="var(--primary)" />
                  <span>Campus Zone Quick-Pick</span>
                </label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {CAMPUS_ZONES.map(zone => (
                    <button
                      key={zone}
                      type="button"
                      onClick={() => handleSelectZone(zone)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: formData.campusZone === zone ? 'var(--primary)' : 'var(--bg-color)',
                        color: formData.campusZone === zone ? '#FFFFFF' : 'var(--text-muted)',
                        border: `1px solid ${formData.campusZone === zone ? 'var(--primary)' : 'var(--border)'}`,
                        cursor: 'pointer',
                        transition: 'var(--transition)'
                      }}
                    >
                      {zone}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Location Details */}
            <div>
              <label className="form-label">Specific Location *</label>
              <input 
                type="text" 
                name="location"
                required
                className="form-control" 
                placeholder="e.g. Main Library 2nd Floor Silent Room, Table near window"
                value={formData.location}
                onChange={handleChange}
              />
            </div>

            {/* Description */}
            <div>
              <label className="form-label">Description *</label>
              <textarea 
                name="description"
                required
                rows={4}
                className="form-control" 
                placeholder="Include color, brand, stickers, scratches, case style, or other distinctive features..."
                value={formData.description}
                onChange={handleChange}
              />
            </div>

            {/* Private Ownership Verification Section (Lost Items) */}
            {isLost && (
              <div 
                style={{
                  padding: '24px',
                  backgroundColor: 'rgba(248, 248, 246, 0.95)',
                  border: '1.5px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '18px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <ShieldCheck size={20} color="var(--primary)" />
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                      Private Ownership Verification
                    </h3>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                    Keep these details private. They will not appear on your public report. You may need them to verify ownership if someone finds your item.
                  </p>
                </div>

                {/* Private ownership clue */}
                <div>
                  <label className="form-label" htmlFor="ownershipClue" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Private Ownership Clue *</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>
                      CONFIDENTIAL // NOT PUBLIC
                    </span>
                  </label>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '-4px', marginBottom: '8px', lineHeight: 1.4 }}>
                    Provide a specific, non-public detail about the item that only a genuine owner would know (e.g. sticker under the case, unique lock screen wallpaper, specific keychain, or scratch pattern).
                  </p>
                  <textarea
                    id="ownershipClue"
                    name="ownershipClue"
                    required
                    rows={3}
                    className="form-control"
                    placeholder="e.g. Inside the small front zipper pocket is a blue pen with engraved initials 'A.K.', and the back of the laptop has a faded sticker of a coffee cup..."
                    value={ownershipClue}
                    onChange={(e) => {
                      setOwnershipClue(e.target.value);
                      if (clueError) setClueError(null);
                    }}
                  />
                  {clueError && (
                    <div style={{ color: 'var(--danger)', fontSize: '0.82rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <AlertCircle size={14} /> <span>{clueError}</span>
                    </div>
                  )}
                </div>

                {/* Secret PIN */}
                <div>
                  <label className="form-label" htmlFor="ownershipPin" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Secret PIN {isEdit && hasExistingVerification ? '(Leave blank to retain current PIN)' : '*'}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      6 NUMERIC DIGITS
                    </span>
                  </label>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '-4px', marginBottom: '8px', lineHeight: 1.4 }}>
                    Choose a 6-digit numeric PIN. If someone contacts you regarding this item, they will need to provide this PIN to verify legitimate ownership.
                  </p>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      id="ownershipPin"
                      name="ownershipPin"
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      required={!isEdit || !hasExistingVerification}
                      className="form-control"
                      placeholder={isEdit && hasExistingVerification ? '•••••• (Current PIN securely saved)' : 'e.g. 582194'}
                      value={ownershipPin}
                      onChange={(e) => {
                        const numericOnly = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setOwnershipPin(numericOnly);
                        if (pinError) setPinError(null);
                      }}
                      style={{ 
                        paddingRight: '46px', 
                        fontFamily: showPin ? 'inherit' : 'var(--font-mono)', 
                        letterSpacing: showPin ? 'normal' : '0.2em',
                        fontSize: showPin ? '0.95rem' : '1.1rem'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      aria-label={showPin ? 'Hide secret PIN' : 'Show secret PIN'}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px'
                      }}
                    >
                      {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {pinError && (
                    <div style={{ color: 'var(--danger)', fontSize: '0.82rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <AlertCircle size={14} /> <span>{pinError}</span>
                    </div>
                  )}
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                    🔒 Plaintext PIN is never stored. It is salted and hashed using standard bcrypt inside the database.
                  </div>
                </div>
              </div>
            )}

            {/* Private Verification Option (Found items) */}
            {!isLost && (
              <div style={{
                padding: '16px 18px',
                backgroundColor: 'rgba(29, 29, 31, 0.03)',
                backdropFilter: 'var(--blur-subtle)',
                WebkitBackdropFilter: 'var(--blur-subtle)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--glass-specular-soft)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px'
              }}>
                <input 
                  type="checkbox"
                  id="hasPrivateVerification"
                  name="hasPrivateVerification"
                  checked={formData.hasPrivateVerification}
                  onChange={handleChange}
                  style={{ width: '18px', height: '18px', marginTop: '3px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                />
                <label htmlFor="hasPrivateVerification" style={{ cursor: 'pointer' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 650, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={16} color="var(--primary)" /> Enable Ownership Verification Lock
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.45 }}>
                    Check this if the item has confidential features (such as serial numbers, lock screen photo, or unique engravings) that the owner must describe before handover.
                  </div>
                </label>
              </div>
            )}

            {/* Photo Upload Section */}
            <div>
              <label className="form-label">Photo (Optional)</label>
              <div style={{ 
                border: '1.5px dashed var(--border)', 
                borderRadius: 'var(--radius)', 
                padding: '28px 20px', 
                textAlign: 'center', 
                backgroundColor: 'rgba(255, 255, 255, 0.65)', 
                backdropFilter: 'var(--blur-subtle)',
                WebkitBackdropFilter: 'var(--blur-subtle)',
                boxShadow: 'var(--glass-specular-soft)',
                transition: 'var(--transition)' 
              }}>
                {formData.imageUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '100%', maxWidth: '320px', height: '200px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)' }}>
                      <img src={formData.imageUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {selectedFile ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '4px 12px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '999px', fontWeight: 600 }}>
                          <Lock size={12} />
                          Ready for private upload ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                      ) : existingReport?.imagePath ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '4px 12px', backgroundColor: 'var(--success-light)', color: 'var(--success)', borderRadius: '999px', fontWeight: 600 }}>
                          <Lock size={12} />
                          Saved in secure storage
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '4px 12px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '999px', fontWeight: 600 }}>
                          <Globe size={12} />
                          External Image URL
                        </span>
                      )}
                    </div>

                    <button type="button" className="btn btn-secondary" onClick={handleRemoveImage} disabled={isSaving}>
                      Remove Photo
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2px', boxShadow: 'var(--glass-specular-soft)' }}>
                      <UploadCloud size={24} />
                    </div>
                    <div style={{ fontSize: '0.96rem', fontWeight: 650, color: 'var(--text-main)' }}>
                      Upload an item photo
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginBottom: '12px', maxWidth: '380px' }}>
                      JPG, PNG, or WebP under 5 MB. Photos significantly speed up item identification.
                    </p>
                    
                    <input 
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      disabled={isSaving}
                      style={{ display: 'none' }}
                    />
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSaving}
                      style={{ padding: '8px 18px', fontSize: '0.88rem' }}
                    >
                      Browse Files
                    </button>
                    
                    {imageError && (
                      <div style={{ color: 'var(--danger)', fontSize: '0.82rem', fontWeight: 500, backgroundColor: 'var(--danger-light)', padding: '6px 14px', borderRadius: '8px', maxWidth: '360px', marginTop: '6px' }}>
                        {imageError}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Form Actions Footer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '36px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
            {submitError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', fontWeight: 500 }}>
                <AlertCircle size={18} />
                <span>{submitError}</span>
              </div>
            )}
            <div className="report-form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '14px', alignItems: 'center' }}>
              <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)} disabled={isSaving}>Cancel</button>
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ minWidth: '170px' }}
                disabled={isSaving}
              >
                {isSaving ? (
                  <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> {uploadStatus || 'Saving...'}</>
                ) : (isEdit ? 'Save Changes' : (isLost ? 'Submit Lost Report' : 'Submit Found Report'))}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

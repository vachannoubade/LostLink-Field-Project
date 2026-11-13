import React, { useState, useRef } from 'react';
import { useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useData } from '../store/DataContext';
import type { Category, CustodyStatus } from '../types';
import { 
  CheckCircle, UploadCloud, ArrowLeft, AlertCircle, Loader2, 
  Lock, Globe, MapPin, Tag, Calendar, ShieldCheck 
} from 'lucide-react';
import { motion } from 'framer-motion';
import { validateImageFile, uploadReportImage, deleteReportImage, isSensitiveImagePath } from '../lib/storage';
import { CATEGORY_OPTIONS } from '../utils/categoryArt';
import { SGUK_CAMPUS_ZONES } from '../utils/matching';
import { supabase } from '../lib/supabase';

const getDefaultDate = () => new Date().toISOString().split('T')[0];

const countWords = (text: string): number => {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
};

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
        title: existingReport.title || '',
        category: existingReport.category,
        description: existingReport.description || '',
        location: existingReport.location || '',
        campusZone: existingReport.campusZone || '',
        date: existingReport.date || getDefaultDate(),
        brandModel: existingReport.brandModel || '',
        color: existingReport.color || '',
        distinguishingFeatures: existingReport.distinguishingFeatures || '',
        custodyStatus: (existingReport.custodyStatus || 'with_finder') as CustodyStatus,
        privateEvidence: existingReport.privateEvidence || '',
        imageUrl: existingReport.imageUrl || ''
      };
    }
    return {
      title: '',
      category: 'Electronics' as Category,
      description: '',
      location: '',
      campusZone: '',
      date: getDefaultDate(),
      brandModel: '',
      color: '',
      distinguishingFeatures: '',
      custodyStatus: 'with_finder' as CustodyStatus,
      privateEvidence: '',
      imageUrl: ''
    };
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSensitiveImage, setIsSensitiveImage] = useState(() => isSensitiveImagePath(existingReport?.imagePath));
  const [imageError, setImageError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wordCount = countWords(formData.description);

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
    const previewUrl = URL.createObjectURL(file);
    setFormData(prev => ({ ...prev, imageUrl: previewUrl }));
  };

  const handleRemoveImage = () => {
    if (selectedFile && formData.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(formData.imageUrl);
    }
    setSelectedFile(null);
    setIsSensitiveImage(false);
    setFormData(prev => ({ ...prev, imageUrl: '' }));
    setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
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

    // Front-end validations conforming to server invariants
    if (formData.title.trim().length < 5 || formData.title.trim().length > 70) {
      setSubmitError('Title must be between 5 and 70 characters.');
      return;
    }

    if (formData.description.trim().length === 0 || formData.description.trim().length > 700) {
      setSubmitError('Description must be between 1 and 700 characters.');
      return;
    }

    if (wordCount > 100) {
      setSubmitError(`Description contains ${wordCount} words, exceeding the 100-word limit.`);
      return;
    }

    if (formData.location.trim().length === 0 || formData.location.trim().length > 100) {
      setSubmitError('Location must be between 1 and 100 characters.');
      return;
    }

    if (formData.privateEvidence.trim().length > 300) {
      setSubmitError('Private identifying details must not exceed 300 characters.');
      return;
    }

    setIsSaving(true);
    setUploadStatus(null);

    let newlyUploadedPath: string | null = null;

    try {
      // 1. Upload local file to private Supabase Storage if present
      if (selectedFile) {
        setUploadStatus('Uploading image to private storage...');
        const uploadResult = await uploadReportImage(selectedFile, user.id, isSensitiveImage);

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
          title: formData.title.trim(),
          category: formData.category,
          description: formData.description.trim(),
          location: formData.location.trim(),
          campusZone: formData.campusZone || undefined,
          date: formData.date,
          brandModel: formData.brandModel.trim() || undefined,
          color: formData.color.trim() || undefined,
          distinguishingFeatures: formData.distinguishingFeatures.trim() || undefined,
          custodyStatus: !isLost ? formData.custodyStatus : 'with_finder',
          privateEvidence: formData.privateEvidence.trim() || undefined,
          imagePath: finalImagePath,
          imageUrl: finalImageUrl,
          hasPrivateVerification: Boolean(formData.privateEvidence.trim())
        });

        if (result.success) {
          // If private evidence was provided, update report_private_details
          if (supabase && formData.privateEvidence.trim()) {
            await supabase.from('report_private_details').upsert({
              report_id: editId,
              owner_id: user.id,
              private_detail: formData.privateEvidence.trim()
            });
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
          }, 1200);
        } else {
          if (newlyUploadedPath) {
            await deleteReportImage(newlyUploadedPath).catch(() => {});
          }
          setSubmitError(result.error || 'Failed to update report. Please try again.');
        }
        return;
      }

      // 3. Create new report via secure stored procedure
      setUploadStatus('Submitting report...');
      
      let usedRpc = false;

      // Attempt stored procedure first if supabase is available
      if (supabase) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('create_report_secure', {
          p_type: isLost ? 'lost' : 'found',
          p_title: formData.title.trim(),
          p_category: formData.category,
          p_description: formData.description.trim(),
          p_location: formData.location.trim(),
          p_date: formData.date,
          p_brand_model: formData.brandModel.trim() || null,
          p_color: formData.color.trim() || null,
          p_distinguishing_features: formData.distinguishingFeatures.trim() || null,
          p_campus_zone: formData.campusZone || null,
          p_custody_status: !isLost ? formData.custodyStatus : 'with_finder',
          p_image_path: newlyUploadedPath || null,
          p_private_evidence: formData.privateEvidence.trim() || null
        });

        if (!rpcError && rpcData) {
          usedRpc = true;
        } else if (rpcError && rpcError.message && !rpcError.message.includes('function') && !rpcError.message.includes('does not exist')) {
          // Real validation or rate limit error returned by server
          if (newlyUploadedPath) {
            await deleteReportImage(newlyUploadedPath).catch(() => {});
          }
          setSubmitError(rpcError.message);
          setIsSaving(false);
          setUploadStatus(null);
          return;
        }
      }

      // Fallback to client DataContext addReport if RPC is not present in local test harness
      if (!usedRpc) {
        const result = await addReport({
          type: isLost ? 'lost' : 'found',
          title: formData.title.trim(),
          category: formData.category,
          description: formData.description.trim(),
          location: formData.location.trim(),
          campusZone: formData.campusZone || undefined,
          date: formData.date,
          brandModel: formData.brandModel.trim() || undefined,
          color: formData.color.trim() || undefined,
          distinguishingFeatures: formData.distinguishingFeatures.trim() || undefined,
          custodyStatus: !isLost ? formData.custodyStatus : 'with_finder',
          privateEvidence: formData.privateEvidence.trim() || undefined,
          imagePath: newlyUploadedPath || undefined,
          imageUrl: newlyUploadedPath ? undefined : formData.imageUrl,
          hasPrivateVerification: Boolean(formData.privateEvidence.trim())
        });

        if (!result.success) {
          if (newlyUploadedPath) {
            await deleteReportImage(newlyUploadedPath).catch(() => {});
          }
          setSubmitError(result.error || 'Failed to submit report. Please try again.');
          setIsSaving(false);
          setUploadStatus(null);
          return;
        }
      }

      setSubmitted(true);
      setTimeout(() => {
        navigate('/my-reports');
      }, 1500);
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
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 16px' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/my-reports')} style={{ marginBottom: '16px' }}>
          <ArrowLeft size={16} /> Back to My Reports
        </button>
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <AlertCircle size={36} color="var(--danger)" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Report Not Found</h2>
          <p style={{ color: 'var(--text-muted)', margin: '8px 0 20px', fontSize: '0.9rem' }}>
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
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 16px' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/my-reports')} style={{ marginBottom: '16px' }}>
          <ArrowLeft size={16} /> Back to My Reports
        </button>
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <AlertCircle size={36} color="var(--danger)" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Permission Denied</h2>
          <p style={{ color: 'var(--text-muted)', margin: '8px 0 20px', fontSize: '0.9rem' }}>
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
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 20px', minHeight: '50vh', textAlign: 'center' }}
      >
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
          <CheckCircle size={36} />
        </div>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--text-main)' }}>
          {isEdit ? 'Report Updated Successfully' : 'Report Logged in Campus Registry'}
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px', maxWidth: '440px', fontSize: '0.95rem', lineHeight: 1.5 }}>
          {isEdit 
            ? 'Your modifications have been committed to the campus records.' 
            : `Your ${isLost ? 'lost' : 'found'} report is recorded. Algorithmic matching will evaluate candidate items.`}
        </p>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={() => navigate('/my-reports')}
            style={{ padding: '9px 18px', fontSize: '0.9rem' }}
          >
            View in My Reports
          </button>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={() => navigate('/browse')}
            style={{ padding: '9px 18px', fontSize: '0.9rem' }}
          >
            Browse Campus Items
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', paddingBottom: '48px' }}>
      <button 
        type="button" 
        className="btn btn-secondary" 
        onClick={() => navigate(-1)} 
        style={{ marginBottom: '20px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
      >
        <ArrowLeft size={16} /> Return to Previous View
      </button>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span className="mono-token" style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 600 }}>
            {isEdit ? 'AMEND REPORT' : (isLost ? 'REPORT LOST ITEM' : 'REPORT FOUND ITEM')}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>SANJAY GHODAWAT UNIVERSITY</span>
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 6px 0', letterSpacing: '-0.01em' }}>
          {isEdit ? 'Update Campus Incident' : (isLost ? 'Report a Lost Item' : 'Register a Found Item')}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', margin: 0, lineHeight: 1.5 }}>
          {isLost 
            ? 'Provide descriptive attributes and campus location to assist recovery. Matching suggestions will evaluate automatically.' 
            : 'Thank you for reporting found property. Provide clear observations so genuine owners can verify.'}
        </p>
      </div>

      <div className="card" style={{ padding: '32px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            
            {/* Title (5-70 chars) with live counter */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.88rem', margin: 0 }}>
                  Item Title *
                </label>
                <span style={{ 
                  fontSize: '0.75rem', 
                  fontFamily: 'var(--font-mono)', 
                  color: formData.title.length < 5 || formData.title.length > 70 ? 'var(--danger)' : 'var(--text-muted)' 
                }}>
                  {formData.title.length} / 70 chars (min 5)
                </span>
              </div>
              <input 
                type="text" 
                name="title"
                required
                maxLength={70}
                className="form-control" 
                placeholder="e.g. Navy Wildcraft Backpack, Space Gray MacBook Air"
                value={formData.title}
                onChange={handleChange}
              />
            </div>

            {/* Category Grid */}
            <div>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.88rem' }}>
                <Tag size={14} color="var(--primary)" />
                <span>Category *</span>
              </label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '8px',
                marginTop: '6px'
              }}>
                {CATEGORY_OPTIONS.map(opt => {
                  const isSelected = formData.category === opt.value;
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => setFormData(prev => ({ ...prev, category: opt.value }))}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                        backgroundColor: isSelected ? 'var(--primary-light)' : '#FFFFFF',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <span style={{ fontSize: '1.1rem' }}>{opt.emoji}</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: isSelected ? 650 : 500, color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>
                        {opt.value}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Structured Item Attributes (Brand/Model, Color, Distinguishing Features) */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '16px',
              padding: '16px',
              backgroundColor: 'var(--bg-color)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label className="form-label" style={{ fontSize: '0.82rem', margin: 0 }}>Brand / Model</label>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formData.brandModel.length}/100</span>
                </div>
                <input 
                  type="text" 
                  name="brandModel"
                  maxLength={100}
                  className="form-control" 
                  placeholder="e.g. Apple iPhone 13, Wildcraft"
                  value={formData.brandModel}
                  onChange={handleChange}
                  style={{ backgroundColor: '#FFFFFF', fontSize: '0.88rem' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label className="form-label" style={{ fontSize: '0.82rem', margin: 0 }}>Primary Color</label>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formData.color.length}/50</span>
                </div>
                <input 
                  type="text" 
                  name="color"
                  maxLength={50}
                  className="form-control" 
                  placeholder="e.g. Space Gray, Navy Blue"
                  value={formData.color}
                  onChange={handleChange}
                  style={{ backgroundColor: '#FFFFFF', fontSize: '0.88rem' }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label className="form-label" style={{ fontSize: '0.82rem', margin: 0 }}>Distinguishing Features (Public)</label>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formData.distinguishingFeatures.length}/200</span>
                </div>
                <input 
                  type="text" 
                  name="distinguishingFeatures"
                  maxLength={200}
                  className="form-control" 
                  placeholder="e.g. Small scratch near charger port, national park badge on strap"
                  value={formData.distinguishingFeatures}
                  onChange={handleChange}
                  style={{ backgroundColor: '#FFFFFF', fontSize: '0.88rem' }}
                />
              </div>
            </div>

            {/* Date & Campus Zone Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.88rem' }}>
                  <Calendar size={14} color="var(--primary)" />
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
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.88rem' }}>
                  <MapPin size={14} color="var(--primary)" />
                  <span>Campus Zone *</span>
                </label>
                <select
                  name="campusZone"
                  required
                  className="form-control"
                  value={formData.campusZone}
                  onChange={handleChange}
                >
                  <option value="">Select SGUK Campus Zone...</option>
                  {SGUK_CAMPUS_ZONES.map((zone: string) => (
                    <option key={zone} value={zone}>{zone}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick-Pick Zone Badges */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '-10px' }}>
              {SGUK_CAMPUS_ZONES.slice(0, 6).map((zone: string) => (
                <button
                  key={zone}
                  type="button"
                  onClick={() => handleSelectZone(zone)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.74rem',
                    fontWeight: 500,
                    backgroundColor: formData.campusZone === zone ? 'var(--primary)' : 'var(--bg-color)',
                    color: formData.campusZone === zone ? '#FFFFFF' : 'var(--text-secondary)',
                    border: `1px solid ${formData.campusZone === zone ? 'var(--primary)' : 'var(--border)'}`,
                    cursor: 'pointer'
                  }}
                >
                  {zone}
                </button>
              ))}
            </div>

            {/* Specific Location (max 100 chars) with live counter */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.88rem', margin: 0 }}>
                  Specific Location *
                </label>
                <span style={{ 
                  fontSize: '0.75rem', 
                  fontFamily: 'var(--font-mono)', 
                  color: formData.location.length > 100 ? 'var(--danger)' : 'var(--text-muted)' 
                }}>
                  {formData.location.length} / 100 chars
                </span>
              </div>
              <input 
                type="text" 
                name="location"
                required
                maxLength={100}
                className="form-control" 
                placeholder="e.g. 2nd floor silent reading room, desk 14 near north window"
                value={formData.location}
                onChange={handleChange}
              />
            </div>

            {/* Description (max 700 chars and max 100 words) with live counters */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.88rem', margin: 0 }}>
                  Description *
                </label>
                <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: wordCount > 100 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {wordCount} / 100 words
                  </span>
                  <span style={{ color: formData.description.length > 700 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {formData.description.length} / 700 chars
                  </span>
                </div>
              </div>
              <textarea 
                name="description"
                required
                maxLength={700}
                rows={3}
                className="form-control" 
                placeholder="Provide accurate visual details and context..."
                value={formData.description}
                onChange={handleChange}
              />
            </div>

            {/* For Found Items: Current Custody Status */}
            {!isLost && (
              <div style={{
                padding: '16px',
                backgroundColor: 'var(--bg-color)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)'
              }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '8px' }}>
                  Where is the item currently? *
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem' }}>
                    <input 
                      type="radio" 
                      name="custodyStatus" 
                      value="with_finder"
                      checked={formData.custodyStatus === 'with_finder'}
                      onChange={handleChange}
                    />
                    <span><strong>With me</strong> — I am physically holding this item until claimed</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem' }}>
                    <input 
                      type="radio" 
                      name="custodyStatus" 
                      value="handed_to_desk"
                      checked={formData.custodyStatus === 'handed_to_desk'}
                      onChange={handleChange}
                    />
                    <span><strong>Handed to campus helpdesk</strong> — I deposited it at a campus helpdesk</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem' }}>
                    <input 
                      type="radio" 
                      name="custodyStatus" 
                      value="only_observed"
                      checked={formData.custodyStatus === 'only_observed'}
                      onChange={handleChange}
                    />
                    <span><strong>Only observed</strong> — I saw it at the location and left it in place</span>
                  </label>
                </div>
              </div>
            )}

            {/* Optional Private Identifying Details (Replacing confusing PIN) */}
            <div style={{
              padding: '18px',
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={16} color="var(--primary)" />
                  <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-main)' }}>
                    Private Identifying Details (Optional)
                  </span>
                </div>
                <span style={{ 
                  fontSize: '0.74rem', 
                  fontFamily: 'var(--font-mono)', 
                  color: formData.privateEvidence.length > 300 ? 'var(--danger)' : 'var(--text-muted)' 
                }}>
                  {formData.privateEvidence.length} / 300 chars
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 8px 0', lineHeight: 1.4 }}>
                Describe something only the genuine owner would know (e.g. lockscreen wallpaper, serial number, engraved initials). This detail will not appear publicly.
              </p>
              <textarea 
                name="privateEvidence"
                maxLength={300}
                rows={2}
                className="form-control" 
                placeholder="e.g. Red lanyard attached inside, serial number ends in 891, or custom phone case photo..."
                value={formData.privateEvidence}
                onChange={handleChange}
                style={{ fontSize: '0.86rem' }}
              />
            </div>

            {/* Single Photo Upload (Optional, max 5 MB) */}
            <div>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                Photo (Optional)
              </label>
              <div style={{ 
                border: '1.5px dashed var(--border)', 
                borderRadius: 'var(--radius-sm)', 
                padding: '20px', 
                textAlign: 'center', 
                backgroundColor: 'var(--bg-color)' 
              }}>
                {formData.imageUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '100%', maxWidth: '280px', height: '170px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <img src={formData.imageUrl} alt="Item Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {selectedFile ? (
                        <span style={{ fontSize: '0.78rem', padding: '3px 10px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '4px', fontWeight: 600 }}>
                          <Lock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                          File ready ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.78rem', padding: '3px 10px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '4px', fontWeight: 600 }}>
                          <Globe size={12} style={{ display: 'inline', marginRight: '4px' }} />
                          Current image
                        </span>
                      )}
                      <button type="button" className="btn btn-secondary" onClick={handleRemoveImage} disabled={isSaving} style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <UploadCloud size={24} color="var(--primary)" />
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      Upload 1 item photo
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: 0 }}>
                      JPG, PNG, or WebP under 5 MB.
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
                      style={{ padding: '6px 14px', fontSize: '0.82rem', marginTop: '6px' }}
                    >
                      Browse File
                    </button>
                    
                    {imageError && (
                      <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '4px' }}>
                        {imageError}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {(!existingReport?.imagePath || selectedFile) && (
                <label style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  marginTop: '8px',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  fontSize: '0.82rem',
                  color: 'var(--text-secondary)'
                }}>
                  <input
                    type="checkbox"
                    checked={isSensitiveImage}
                    onChange={(e) => setIsSensitiveImage(e.target.checked)}
                    disabled={isSaving}
                    style={{ marginTop: '2px' }}
                  />
                  <span>
                    <strong>Sensitive image</strong> — Check if the photo displays government/college ID numbers or personal documents. Excluded from public views.
                  </span>
                </label>
              )}
            </div>
          </div>

          {/* Form Actions Footer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '28px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            {submitError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', borderRadius: '4px', fontSize: '0.88rem' }}>
                <AlertCircle size={16} />
                <span>{submitError}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', alignItems: 'center' }}>
              <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)} disabled={isSaving}>
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ minWidth: '160px' }}
                disabled={isSaving}
              >
                {isSaving ? (
                  <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> {uploadStatus || 'Saving...'}</>
                ) : (isEdit ? 'Save Changes' : (isLost ? 'Submit Lost Report' : 'Submit Found Report'))}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

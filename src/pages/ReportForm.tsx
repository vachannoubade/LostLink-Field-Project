import React, { useState, useRef } from 'react';
import { useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useData } from '../store/DataContext';
import type { Category, CustodyStatus } from '../types';
import { 
  CheckCircle, UploadCloud, ArrowLeft, AlertCircle, Loader2
} from 'lucide-react';
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
          p_image_url: newlyUploadedPath || null,
          p_private_evidence: formData.privateEvidence.trim() || null
        });

        if (rpcError) {
          console.warn('RPC create_report_secure warning, applying resilient fallback:', rpcError);
          const fallbackRes = await addReport({
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

          if (!fallbackRes.success) {
            if (newlyUploadedPath) {
              await deleteReportImage(newlyUploadedPath).catch(() => {});
            }
            setSubmitError(fallbackRes.error || rpcError.message || 'Failed to submit report. Please try again.');
            setIsSaving(false);
            setUploadStatus(null);
            return;
          }
        }

        // Add to local state
        if (rpcData) {
          await addReport({
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
        }
      } else {
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 20px', minHeight: '50vh', textAlign: 'center' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
          <CheckCircle size={32} />
        </div>
        <h2 style={{ fontSize: '1.4rem', marginBottom: '8px', color: 'var(--text-main)', fontWeight: 600 }}>
          {isEdit ? 'Report Updated Successfully' : 'Report Logged in Campus Registry'}
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', maxWidth: '440px', fontSize: '0.92rem', lineHeight: 1.5 }}>
          {isEdit 
            ? 'Your modifications have been committed to campus records.' 
            : `Your ${isLost ? 'lost' : 'found'} report has been saved. You can track updates under My Items.`}
        </p>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={() => navigate('/my-reports')}
          >
            View in My Reports
          </button>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={() => navigate('/browse')}
          >
            Browse Campus Items
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '740px', margin: '0 auto', paddingBottom: '48px' }}>
      <button 
        type="button" 
        className="btn btn-secondary btn-sm" 
        onClick={() => navigate(-1)} 
        style={{ marginBottom: '16px' }}
      >
        <ArrowLeft size={15} /> Back
      </button>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span className="badge badge-found" style={{ fontSize: '0.78rem' }}>
            {isEdit ? 'Edit Report' : (isLost ? 'Report Lost Item' : 'Report Found Item')}
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Sanjay Ghodawat University</span>
        </div>
        <h1 className="page-title">
          {isEdit ? 'Update item report' : (isLost ? 'Report a lost item' : 'Report a found item')}
        </h1>
        <p className="page-subtitle" style={{ marginBottom: 0 }}>
          {isLost 
            ? 'Provide details about your missing item and where you last saw it.' 
            : 'Provide details about the item you discovered to help reconnect it with its owner.'}
        </p>
      </div>

      <div className="card" style={{ padding: '28px', backgroundColor: 'var(--bg-surface)' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            
            {/* 1. Item Details */}
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '24px' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '14px' }}>
                1. Item details
              </h2>

              {/* Title (5-70 chars) */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label htmlFor="report-title" className="form-label" style={{ margin: 0 }}>
                    Item Title *
                  </label>
                  <span style={{ 
                    fontSize: '0.74rem', 
                    color: formData.title.length < 5 || formData.title.length > 70 ? 'var(--danger)' : 'var(--text-tertiary)' 
                  }}>
                    {formData.title.length} / 70 chars (min 5)
                  </span>
                </div>
                <input 
                  id="report-title"
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
              <div className="form-group">
                <label className="form-label">
                  Category *
                </label>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                  gap: '8px',
                  marginTop: '4px'
                }}>
                  {CATEGORY_OPTIONS.map(opt => {
                    const isSelected = formData.category === opt.value;
                    return (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => setFormData(prev => ({ ...prev, category: opt.value }))}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                          backgroundColor: isSelected ? 'var(--primary-light)' : 'var(--bg-surface)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          transition: 'var(--transition-fast)'
                        }}
                      >
                        <span style={{ fontSize: '1.1rem' }}>{opt.emoji}</span>
                        <span style={{ fontSize: '0.84rem', fontWeight: isSelected ? 600 : 500, color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>
                          {opt.value}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Attributes (Brand, Color, Distinguishing features) */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                marginTop: '16px'
              }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.82rem' }}>Brand / Model</label>
                  <input 
                    type="text" 
                    name="brandModel"
                    maxLength={100}
                    className="form-control" 
                    placeholder="e.g. Apple iPhone 13, Wildcraft"
                    value={formData.brandModel}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.82rem' }}>Primary Color</label>
                  <input 
                    type="text" 
                    name="color"
                    maxLength={50}
                    className="form-control" 
                    placeholder="e.g. Space Gray, Navy Blue"
                    value={formData.color}
                    onChange={handleChange}
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label" style={{ fontSize: '0.82rem' }}>Public Distinguishing Features (Optional)</label>
                  <input 
                    type="text" 
                    name="distinguishingFeatures"
                    maxLength={200}
                    className="form-control" 
                    placeholder="e.g. Small scratch near charger port, national park keychain on zipper"
                    value={formData.distinguishingFeatures}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>

            {/* 2. Location and Date */}
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '24px' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '14px' }}>
                2. Location and date
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    Date {isLost ? 'Lost' : 'Found'} *
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

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    Campus Zone *
                  </label>
                  <select
                    name="campusZone"
                    required
                    className="form-select"
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

              {/* Quick Pick Zone Pills */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                {SGUK_CAMPUS_ZONES.slice(0, 6).map((zone: string) => (
                  <button
                    key={zone}
                    type="button"
                    onClick={() => handleSelectZone(zone)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '0.74rem',
                      fontWeight: 500,
                      backgroundColor: formData.campusZone === zone ? 'var(--primary)' : 'var(--bg-secondary)',
                      color: formData.campusZone === zone ? '#FFFFFF' : 'var(--text-secondary)',
                      border: `1px solid ${formData.campusZone === zone ? 'var(--primary)' : 'var(--border)'}`,
                      cursor: 'pointer'
                    }}
                  >
                    {zone}
                  </button>
                ))}
              </div>

              {/* Specific Location Details */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    Specific Location Details *
                  </label>
                  <span style={{ fontSize: '0.74rem', color: formData.location.length > 100 ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                    {formData.location.length} / 100 chars
                  </span>
                </div>
                <input 
                  type="text" 
                  name="location"
                  required
                  maxLength={100}
                  className="form-control" 
                  placeholder="e.g. 2nd floor library silent study area, desk 14 near north window"
                  value={formData.location}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* 3. Description and Photo */}
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '24px' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '14px' }}>
                3. Description and photo
              </h2>

              {/* Description */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    Description *
                  </label>
                  <div style={{ display: 'flex', gap: '10px', fontSize: '0.74rem' }}>
                    <span style={{ color: wordCount > 100 ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                      {wordCount} / 100 words
                    </span>
                    <span style={{ color: formData.description.length > 700 ? 'var(--danger)' : 'var(--text-tertiary)' }}>
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
                  placeholder="Provide helpful visual description and context..."
                  value={formData.description}
                  onChange={handleChange}
                />
              </div>

              {/* Custody status for Found items */}
              {!isLost && (
                <div className="form-group" style={{
                  padding: '14px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)'
                }}>
                  <label className="form-label" style={{ fontWeight: 600, marginBottom: '6px' }}>
                    Current Item Custody *
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.86rem' }}>
                      <input 
                        type="radio" 
                        name="custodyStatus" 
                        value="with_finder"
                        checked={formData.custodyStatus === 'with_finder'}
                        onChange={handleChange}
                      />
                      <span><strong>With finder</strong> — I am holding the item until owner is verified</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.86rem' }}>
                      <input 
                        type="radio" 
                        name="custodyStatus" 
                        value="handed_to_desk"
                        checked={formData.custodyStatus === 'handed_to_desk'}
                        onChange={handleChange}
                      />
                      <span><strong>Handed to helpdesk</strong> — Deposited at campus helpdesk / security</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.86rem' }}>
                      <input 
                        type="radio" 
                        name="custodyStatus" 
                        value="only_observed"
                        checked={formData.custodyStatus === 'only_observed'}
                        onChange={handleChange}
                      />
                      <span><strong>Observed only</strong> — Saw it at the location and left it in place</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Photo Upload Container */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  Photo (Optional, max 5 MB)
                </label>
                <div style={{ 
                  border: '1px dashed var(--border)', 
                  borderRadius: 'var(--radius-sm)', 
                  padding: '18px', 
                  textAlign: 'center', 
                  backgroundColor: 'var(--bg-color)' 
                }}>
                  {formData.imageUrl ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '100%', maxWidth: '240px', height: '150px', borderRadius: 'var(--radius-xs)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <img src={formData.imageUrl} alt="Item Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {selectedFile ? (
                          <span style={{ fontSize: '0.78rem', padding: '3px 8px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '4px', fontWeight: 500 }}>
                            Ready to upload ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.78rem', padding: '3px 8px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '4px', fontWeight: 500 }}>
                            Current photo
                          </span>
                        )}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={handleRemoveImage} disabled={isSaving}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <UploadCloud size={24} color="var(--primary)" />
                      <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-main)' }}>
                        Upload item photo
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
                        className="btn btn-secondary btn-sm" 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSaving}
                        style={{ marginTop: '6px' }}
                      >
                        Choose file
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
                      <strong>Sensitive image</strong> — Check if photo contains personal identity, PRN card or private documents (hidden from public browsing).
                    </span>
                  </label>
                )}
              </div>
            </div>

            {/* 4. Optional Private Details */}
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                  4. Optional private details
                </h2>
                <span style={{ fontSize: '0.74rem', color: formData.privateEvidence.length > 300 ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                  {formData.privateEvidence.length} / 300 chars
                </span>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.45 }}>
                Describe a confidential feature only the true owner would know (e.g. lockscreen wallpaper, serial digits, engraved initials). Never published publicly.
              </p>
              <textarea 
                name="privateEvidence"
                maxLength={300}
                rows={2}
                className="form-control" 
                placeholder="e.g. Wallpaper is a mountain sunset, serial number ends in 412..."
                value={formData.privateEvidence}
                onChange={handleChange}
              />
            </div>

            {/* 5. Review and Submit */}
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '12px' }}>
                5. Review and submit
              </h2>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Please review your details above. Once submitted, your report will be logged and matched with complementary reports across campus.
              </p>

              {submitError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', marginBottom: '16px' }}>
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
                  disabled={isSaving}
                  style={{ minWidth: '160px' }}
                >
                  {isSaving ? (
                    <>
                      <Loader2 size={16} className="spin-loader" />
                      <span>{uploadStatus || 'Saving...'}</span>
                    </>
                  ) : (
                    <span>{isEdit ? 'Save Changes' : (isLost ? 'Submit Lost Report' : 'Submit Found Report')}</span>
                  )}
                </button>
              </div>
            </div>

          </div>
        </form>
      </div>
    </div>
  );
};

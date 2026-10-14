import React, { useState, useRef } from 'react';
import { useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useData } from '../store/DataContext';
import type { Category } from '../types';
import { CheckCircle, UploadCloud, ArrowLeft, AlertCircle, Loader2, Lock, Globe } from 'lucide-react';
import { motion } from 'framer-motion';
import { validateImageFile, uploadReportImage, deleteReportImage } from '../lib/storage';

const getDefaultDate = () => new Date().toISOString().split('T')[0];

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
        date: existingReport.date,
        imageUrl: existingReport.imageUrl || ''
      };
    }
    return {
      title: '',
      category: 'Electronics' as Category,
      description: '',
      location: '',
      date: getDefaultDate(),
      imageUrl: ''
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
      date: existingReport.date,
      imageUrl: existingReport.imageUrl || ''
    } : {
      title: '',
      category: 'Electronics' as Category,
      description: '',
      location: '',
      date: getDefaultDate(),
      imageUrl: ''
    });
  }
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const categories: Category[] = ['Electronics', 'ID Cards', 'Bags', 'Books', 'Accessories', 'Keys', 'Other'];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setSubmitError(null);
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
          date: formData.date,
          imagePath: finalImagePath,
          imageUrl: finalImageUrl
        });

        if (result.success) {
          // If update succeeded and previous image was replaced or removed, clean up old storage file
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
          // If update failed, remove the newly uploaded image to prevent orphan files
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
        date: formData.date,
        imagePath: newlyUploadedPath || undefined,
        imageUrl: newlyUploadedPath ? undefined : formData.imageUrl
      });

      if (result.success) {
        setSubmitted(true);
        setTimeout(() => {
          navigate('/my-reports');
        }, 2000);
      } else {
        // Clean up newly uploaded image if report creation failed
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
      <div style={{ maxWidth: '700px', margin: '0 auto', paddingBottom: '40px' }}>
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
      <div style={{ maxWidth: '700px', margin: '0 auto', paddingBottom: '40px' }}>
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
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 20px', minHeight: '60vh' }}
      >
        <div style={{ width: '96px', height: '96px', borderRadius: '50%', backgroundColor: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
          <CheckCircle size={48} />
        </div>
        <h2 style={{ fontSize: '1.75rem', marginBottom: '12px', textAlign: 'center' }}>
          {isEdit ? 'Report Updated Successfully' : 'Report Submitted Successfully'}
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px', textAlign: 'center', maxWidth: '400px', fontSize: '1.1rem' }}>
          {isEdit 
            ? 'Your changes have been saved.' 
            : `We'll notify you if we find any potential matches for your ${isLost ? 'lost' : 'found'} item.`}
        </p>
      </motion.div>
    );
  }

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', paddingBottom: '40px' }}>
      <h1 className="page-title">
        {isEdit ? 'Edit Report' : (isLost ? 'Report a Lost Item' : 'Report a Found Item')}
      </h1>
      <p className="page-subtitle">
        {isEdit 
          ? 'Update the details or photo of your reported item.'
          : (isLost 
              ? 'Provide details about the item you lost to help us match it with found reports.' 
              : 'Thank you for finding an item. Your details will help reunite it with its owner.')}
      </p>

      <div className="card" style={{ padding: '32px' }}>
        <form onSubmit={handleSubmit}>
          <div className="grid mobile-form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Item Title *</label>
              <input 
                type="text" 
                name="title"
                required
                className="form-control" 
                placeholder="e.g. Black Wireless Earbuds"
                value={formData.title}
                onChange={handleChange}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <div className="grid mobile-form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
                <div>
                  <label className="form-label">Category *</label>
                  <select 
                    name="category" 
                    className="form-control" 
                    style={{ appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2370758A\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center' }}
                    value={formData.category} 
                    onChange={handleChange}
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Date {isLost ? 'Lost' : 'Found'} *</label>
                  <input 
                    type="date" 
                    name="date"
                    required
                    className="form-control" 
                    value={formData.date}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Location *</label>
              <input 
                type="text" 
                name="location"
                required
                className="form-control" 
                placeholder={isLost ? 'Where do you think you lost it?' : 'Where did you find it?'}
                value={formData.location}
                onChange={handleChange}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Description *</label>
              <textarea 
                name="description"
                required
                rows={4}
                className="form-control" 
                placeholder="Include any identifying details, color, brand, or unique marks..."
                value={formData.description}
                onChange={handleChange}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Photo (Optional)</label>
              <div style={{ border: '2px dashed var(--border)', borderRadius: 'var(--radius)', padding: '32px', textAlign: 'center', backgroundColor: '#FAFBFC', transition: 'var(--transition)' }}>
                {formData.imageUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '100%', maxWidth: '300px', height: '200px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                      <img src={formData.imageUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {selectedFile ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '4px 12px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '999px', fontWeight: 600 }}>
                          <Lock size={12} />
                          Ready for secure private upload ({ (selectedFile.size / (1024 * 1024)).toFixed(2) } MB)
                        </span>
                      ) : existingReport?.imagePath ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '4px 12px', backgroundColor: 'var(--success-light)', color: 'var(--success)', borderRadius: '999px', fontWeight: 600 }}>
                          <Lock size={12} />
                          Saved in secure storage
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '4px 12px', backgroundColor: '#EDE9FE', color: '#6D28D9', borderRadius: '999px', fontWeight: 600 }}>
                          <Globe size={12} />
                          External HTTPS Image URL
                        </span>
                      )}
                    </div>

                    <button type="button" className="btn btn-secondary" onClick={handleRemoveImage} disabled={isSaving}>
                      Remove Image
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
                      <UploadCloud size={28} />
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                      Upload an image
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
                      Select a photo (JPG, PNG, WebP up to 5MB) or enter an external URL.
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
                      className="btn btn-primary" 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSaving}
                    >
                      Browse Files
                    </button>
                    
                    {imageError && (
                      <div style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 500, backgroundColor: 'var(--danger-light)', padding: '8px 16px', borderRadius: '8px', maxWidth: '360px', marginTop: '8px' }}>
                        {imageError}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', maxWidth: '300px', margin: '16px 0' }}>
                      <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }}></div>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>OR PASTE URL</span>
                      <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }}></div>
                    </div>

                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="https://example.com/image.jpg" 
                      style={{ maxWidth: '300px', textAlign: 'center' }}
                      value={formData.imageUrl}
                      onChange={(e) => {
                        setImageError(null);
                        setSelectedFile(null);
                        setFormData({...formData, imageUrl: e.target.value});
                      }}
                      disabled={isSaving}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '40px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
            {submitError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', fontWeight: 500 }}>
                <AlertCircle size={18} />
                {submitError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)} disabled={isSaving}>Cancel</button>
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ minWidth: '160px' }}
                disabled={isSaving}
              >
                {isSaving ? (
                  <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> {uploadStatus || 'Saving...'}</>
                ) : (isEdit ? 'Save Changes' : 'Submit Report')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

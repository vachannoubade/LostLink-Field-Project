import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useData } from '../store/DataContext';
import type { Category } from '../types';
import { CheckCircle, UploadCloud } from 'lucide-react';
import { motion } from 'framer-motion';

export const ReportForm: React.FC = () => {
  const { addReport } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const isLost = location.pathname.includes('/report/lost');
  
  const [formData, setFormData] = useState({
    title: '',
    category: 'Electronics' as Category,
    description: '',
    location: '',
    date: new Date().toISOString().split('T')[0],
    imageUrl: ''
  });
  
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (formData.imageUrl && formData.imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(formData.imageUrl);
      }
    };
  }, [formData.imageUrl]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      alert('File is too large. Please select an image under 5MB.');
      return;
    }
    
    if (formData.imageUrl && formData.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(formData.imageUrl);
    }
    
    const url = URL.createObjectURL(file);
    setFormData({ ...formData, imageUrl: url });
  };

  const categories: Category[] = ['Electronics', 'ID Cards', 'Bags', 'Books', 'Accessories', 'Keys', 'Other'];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addReport({
      type: isLost ? 'lost' : 'found',
      ...formData
    });
    setSubmitted(true);
    setTimeout(() => {
      navigate('/my-reports');
    }, 2000);
  };

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
        <h2 style={{ fontSize: '1.75rem', marginBottom: '12px', textAlign: 'center' }}>Report Submitted Successfully</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px', textAlign: 'center', maxWidth: '400px', fontSize: '1.1rem' }}>
          We'll notify you if we find any potential matches for your {isLost ? 'lost' : 'found'} item.
        </p>
      </motion.div>
    );
  }

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', paddingBottom: '40px' }}>
      <h1 className="page-title">{isLost ? 'Report a Lost Item' : 'Report a Found Item'}</h1>
      <p className="page-subtitle">
        {isLost 
          ? 'Provide details about the item you lost to help us match it with found reports.' 
          : 'Thank you for finding an item. Your details will help reunite it with its owner.'}
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
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '300px' }}>
                      {formData.imageUrl.startsWith('blob:') && 'Note: Local image previews will not survive a page refresh without a backend.'}
                    </p>
                    <button type="button" className="btn btn-secondary" onClick={() => {
                      if (formData.imageUrl.startsWith('blob:')) {
                        URL.revokeObjectURL(formData.imageUrl);
                      }
                      setFormData({...formData, imageUrl: ''});
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}>Remove Image</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
                      <UploadCloud size={28} />
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 600 }}>Upload an image</div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>Click to select a local image or paste a URL.</p>
                    
                    <input 
                      type="file"
                      accept="image/*"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      style={{ display: 'none' }}
                    />
                    <button type="button" className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
                      Browse Files
                    </button>
                    
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
                      onChange={(e) => setFormData({...formData, imageUrl: e.target.value})}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginTop: '40px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
            <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ minWidth: '160px' }}>Submit Report</button>
          </div>
        </form>
      </div>
    </div>
  );
};

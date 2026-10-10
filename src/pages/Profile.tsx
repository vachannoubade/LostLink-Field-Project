import React from 'react';
import { useData } from '../store/DataContext';
import { Mail } from 'lucide-react';

export const Profile: React.FC = () => {
  const { user } = useData();

  return (
    <div style={{ paddingBottom: '32px' }}>
      <h1 className="page-title">Profile</h1>
      <p className="page-subtitle">Manage your account details and preferences.</p>

      <div className="card" style={{ maxWidth: '600px' }}>
        <div style={{ padding: '40px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', borderBottom: '1px solid var(--border)', backgroundColor: '#FAFBFC' }}>
          <div style={{ width: '100px', height: '100px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 700, marginBottom: '20px', boxShadow: '0 8px 16px rgba(81, 70, 229, 0.15)' }}>
            {user.name.charAt(0)}
          </div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--text-main)' }}>{user.name}</h2>
          <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
            <Mail size={16} />
            <span>{user.email}</span>
          </div>
        </div>

        <div style={{ padding: '32px' }}>
          <h3 style={{ fontSize: '1.125rem', marginBottom: '24px', fontWeight: 600 }}>Account Information</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label className="form-label" style={{ color: 'var(--text-muted)' }}>Full Name</label>
              <input type="text" className="form-control" value={user.name} readOnly disabled style={{ backgroundColor: '#F8F9FC', borderColor: 'var(--border)' }} />
            </div>
            <div>
              <label className="form-label" style={{ color: 'var(--text-muted)' }}>University Email</label>
              <input type="text" className="form-control" value={user.email} readOnly disabled style={{ backgroundColor: '#F8F9FC', borderColor: 'var(--border)' }} />
            </div>
            <div>
              <label className="form-label" style={{ color: 'var(--text-muted)' }}>Student ID</label>
              <input type="text" className="form-control" value="894200112" readOnly disabled style={{ backgroundColor: '#F8F9FC', borderColor: 'var(--border)' }} />
            </div>
          </div>

          <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="btn btn-primary" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>Save Changes</button>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>(Disabled in Demo Mode)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

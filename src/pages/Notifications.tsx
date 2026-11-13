import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { 
  Bell, BellOff, Check, CheckCheck, Sparkles, 
  ArrowRight, AlertCircle
} from 'lucide-react';

const getNotificationIcon = (title: string, message: string) => {
  const text = `${title} ${message}`.toLowerCase();
  if (text.includes('match')) return Sparkles;
  if (text.includes('resolve') || text.includes('recover')) return Check;
  if (text.includes('alert') || text.includes('warning')) return AlertCircle;
  return Bell;
};

const formatTimestamp = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const Notifications: React.FC = () => {
  const { notifications, markNotificationRead, markAllNotificationsRead, reports } = useData();
  const navigate = useNavigate();

  const sortedNotifications = [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const unreadCount = notifications.filter(n => !n.read).length;

  const getLinkMeta = (link?: string) => {
    if (!link) return { hasLink: false };

    if (link.startsWith('/items/')) {
      const reportId = link.replace('/items/', '').trim();
      const reportExists = reports.some(r => r.id === reportId);
      return {
        hasLink: true,
        isReport: true,
        reportExists,
        url: link,
        label: reportExists ? 'View Item' : 'Item No Longer Available'
      };
    }

    if (link === '/ai-matches') {
      return {
        hasLink: true,
        isReport: false,
        reportExists: true,
        url: link,
        label: 'View Matches'
      };
    }

    return {
      hasLink: true,
      isReport: false,
      reportExists: true,
      url: link,
      label: 'Open Details'
    };
  };

  const handleNotificationClick = (notificationId: string, linkMeta: ReturnType<typeof getLinkMeta>) => {
    markNotificationRead(notificationId);
    if (linkMeta.hasLink && linkMeta.reportExists && linkMeta.url) {
      navigate(linkMeta.url);
    }
  };

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', paddingBottom: '48px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="page-title" style={{ margin: 0 }}>Notifications</h1>
            {unreadCount > 0 && (
              <span className="badge badge-found">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="page-subtitle" style={{ margin: '4px 0 0' }}>
            Updates on potential item matches and status changes.
          </p>
        </div>

        {notifications.length > 0 && (
          <button 
            className="btn btn-secondary btn-sm"
            onClick={markAllNotificationsRead}
            disabled={unreadCount === 0}
            style={{ 
              opacity: unreadCount === 0 ? 0.6 : 1, 
              cursor: unreadCount === 0 ? 'default' : 'pointer'
            }}
            aria-label="Mark all notifications as read"
          >
            <CheckCheck size={15} />
            Mark all read
          </button>
        )}
      </div>

      {/* Notifications List or Empty State */}
      {sortedNotifications.length === 0 ? (
        <div 
          className="card" 
          style={{ padding: '64px 20px', textAlign: 'center', backgroundColor: 'var(--bg-surface)' }}
        >
          <BellOff size={36} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-main)' }}>No notifications yet</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '360px', margin: '0 auto 20px', fontSize: '0.88rem' }}>
            You're all caught up! You will be notified when matches or status changes occur.
          </p>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/browse')}>
            Browse Items
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sortedNotifications.map((notification) => {
            const IconComponent = getNotificationIcon(notification.title, notification.message);
            const linkMeta = getLinkMeta(notification.link);
            const isClickable = linkMeta.hasLink && linkMeta.reportExists;

            return (
              <div
                key={notification.id}
                className="card"
                style={{
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px',
                  backgroundColor: notification.read ? 'var(--bg-surface)' : 'var(--bg-surface)',
                  borderLeft: notification.read ? '1px solid var(--border)' : '3px solid var(--primary)',
                  cursor: isClickable ? 'pointer' : 'default'
                }}
                onClick={() => handleNotificationClick(notification.id, linkMeta)}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={isClickable ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleNotificationClick(notification.id, linkMeta);
                  }
                } : undefined}
                aria-label={`Notification: ${notification.title}`}
              >
                {/* Icon Column */}
                <div 
                  style={{ 
                    width: '36px', 
                    height: '36px', 
                    borderRadius: 'var(--radius-sm)', 
                    backgroundColor: notification.read ? 'var(--bg-secondary)' : 'var(--primary-light)', 
                    color: notification.read ? 'var(--text-secondary)' : 'var(--primary)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    flexShrink: 0 
                  }}
                >
                  <IconComponent size={18} />
                </div>

                {/* Content Column */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                    <h3 style={{ 
                      fontSize: '0.92rem', 
                      fontWeight: notification.read ? 500 : 600, 
                      color: 'var(--text-main)', 
                      margin: 0,
                      overflowWrap: 'anywhere'
                    }}>
                      {notification.title}
                    </h3>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                      {formatTimestamp(notification.createdAt)}
                    </span>
                  </div>

                  <p style={{ 
                    fontSize: '0.84rem', 
                    color: 'var(--text-secondary)', 
                    lineHeight: 1.45, 
                    margin: 0,
                    overflowWrap: 'anywhere'
                  }}>
                    {notification.message}
                  </p>

                  {isClickable && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 500, marginTop: '8px' }}>
                      <span>{linkMeta.label}</span>
                      <ArrowRight size={13} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

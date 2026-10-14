import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { 
  Bell, BellOff, Check, CheckCheck, Sparkles, 
  Clock, ArrowRight, ExternalLink, AlertCircle, Info 
} from 'lucide-react';
import { motion } from 'framer-motion';

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
        label: reportExists ? 'View Item Details' : 'Item No Longer Available'
      };
    }

    if (link === '/ai-matches') {
      return {
        hasLink: true,
        isReport: false,
        reportExists: true,
        url: link,
        label: 'View Potential Matches'
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
    <div style={{ paddingBottom: '40px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className="page-title" style={{ marginBottom: 0 }}>Notifications</h1>
            {unreadCount > 0 && (
              <span className="badge badge-lost" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="page-subtitle" style={{ marginBottom: 0, marginTop: '4px' }}>
            Updates on potential item matches and status changes.
          </p>
        </div>

        {notifications.length > 0 && (
          <button 
            className="btn btn-secondary"
            onClick={markAllNotificationsRead}
            disabled={unreadCount === 0}
            style={{ 
              opacity: unreadCount === 0 ? 0.6 : 1, 
              cursor: unreadCount === 0 ? 'default' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
            aria-label="Mark all notifications as read"
          >
            <CheckCheck size={16} />
            Mark all as read
          </button>
        )}
      </div>

      {/* Notifications List or Empty State */}
      {sortedNotifications.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card" 
          style={{ padding: '80px 24px', textAlign: 'center' }}
        >
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--bg-color)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <BellOff size={38} />
          </div>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '8px', color: 'var(--text-main)' }}>No notifications yet</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '380px', margin: '0 auto 24px', fontSize: '0.95rem' }}>
            You're all caught up! You will be notified when matches are found for your reported items.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/browse')}>
            Browse Items
          </button>
        </motion.div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sortedNotifications.map((notification, index) => {
            const IconComponent = getNotificationIcon(notification.title, notification.message);
            const linkMeta = getLinkMeta(notification.link);
            const isClickable = linkMeta.hasLink && linkMeta.reportExists;

            return (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="card"
                style={{
                  padding: '20px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                  backgroundColor: notification.read ? 'var(--bg-card)' : 'rgba(81, 70, 229, 0.02)',
                  borderColor: notification.read ? 'var(--border)' : 'var(--primary-light)',
                  boxShadow: notification.read ? 'var(--shadow-sm)' : '0 4px 12px rgba(81, 70, 229, 0.06)',
                  cursor: isClickable ? 'pointer' : 'default',
                  transition: 'var(--transition)'
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
                    width: '42px', 
                    height: '42px', 
                    borderRadius: '12px', 
                    backgroundColor: notification.read ? 'var(--bg-color)' : 'var(--primary-light)', 
                    color: notification.read ? 'var(--text-muted)' : 'var(--primary)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <IconComponent size={20} />
                </div>

                {/* Content Column */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1rem', fontWeight: notification.read ? 600 : 700, color: 'var(--text-main)' }}>
                        {notification.title}
                      </span>
                      {!notification.read && (
                        <span 
                          style={{ 
                            width: '8px', 
                            height: '8px', 
                            borderRadius: '50%', 
                            backgroundColor: 'var(--primary)',
                            display: 'inline-block'
                          }} 
                          title="Unread"
                        />
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.8rem', flexShrink: 0 }}>
                      <Clock size={12} />
                      <span>{formatTimestamp(notification.createdAt)}</span>
                    </div>
                  </div>

                  <p style={{ color: notification.read ? 'var(--text-muted)' : 'var(--text-main)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '12px' }}>
                    {notification.message}
                  </p>

                  {/* Actions Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      {linkMeta.hasLink && (
                        linkMeta.reportExists ? (
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              color: 'var(--primary)', 
                              fontSize: '0.85rem', 
                              fontWeight: 600 
                            }}
                          >
                            {linkMeta.label}
                            {linkMeta.isReport ? <ArrowRight size={14} /> : <ExternalLink size={14} />}
                          </span>
                        ) : (
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '4px', 
                              color: 'var(--text-muted)', 
                              fontSize: '0.8rem',
                              fontStyle: 'italic'
                            }}
                          >
                            <Info size={13} />
                            {linkMeta.label}
                          </span>
                        )
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {!notification.read ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: '0.8rem', padding: '6px 10px', height: 'auto', color: 'var(--primary)' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            markNotificationRead(notification.id);
                          }}
                          aria-label={`Mark "${notification.title}" as read`}
                        >
                          <Check size={14} />
                          Mark read
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Check size={12} />
                          Read
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

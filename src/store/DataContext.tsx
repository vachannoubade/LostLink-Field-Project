import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Report, Match, User, Notification } from '../types';
import { initialReports, demoUser } from './seedData';
import { calculateMatchScore } from '../utils/matching';

interface DataContextType {
  user: User;
  reports: Report[];
  matches: Match[];
  notifications: Notification[];
  addReport: (report: Omit<Report, 'id' | 'createdAt' | 'status' | 'userId'>) => void;
  updateReportStatus: (id: string, status: Report['status']) => void;
  verifyMatch: (matchId: string) => void;
  rejectMatch: (matchId: string) => void;
  markNotificationRead: (id: string) => void;
  resetDemoData: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user] = useState<User>(demoUser);
  const [reports, setReports] = useState<Report[]>(() => {
    const saved = localStorage.getItem('lostlink_reports');
    return saved ? JSON.parse(saved) : initialReports;
  });
  const [matches, setMatches] = useState<Match[]>(() => {
    const saved = localStorage.getItem('lostlink_matches');
    return saved ? JSON.parse(saved) : [];
  });
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const saved = localStorage.getItem('lostlink_notifications');
    return saved ? JSON.parse(saved) : [];
  });

  // Save to local storage
  useEffect(() => {
    localStorage.setItem('lostlink_reports', JSON.stringify(reports));
  }, [reports]);

  useEffect(() => {
    localStorage.setItem('lostlink_matches', JSON.stringify(matches));
  }, [matches]);

  useEffect(() => {
    localStorage.setItem('lostlink_notifications', JSON.stringify(notifications));
  }, [notifications]);

  // Recalculate matches whenever reports change (only for demo, in real app would be async background job)
  useEffect(() => {
    if (reports.length === 0) return;
    
    const lostReports = reports.filter(r => r.type === 'lost' && r.status === 'lost');
    const foundReports = reports.filter(r => r.type === 'found' && r.status === 'found');
    
    const newMatches: Match[] = [];
    
    lostReports.forEach(lost => {
      foundReports.forEach(found => {
        // Don't duplicate matches
        if (matches.some(m => (m.lostReportId === lost.id && m.foundReportId === found.id) || (m.lostReportId === found.id && m.foundReportId === lost.id))) {
          return;
        }
        
        const score = calculateMatchScore(lost, found);
        if (score.score > 40) { // Threshold for potential match
          const newMatch: Match = {
            id: `m_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            lostReportId: lost.id,
            foundReportId: found.id,
            score,
            status: 'pending',
            createdAt: new Date().toISOString()
          };
          newMatches.push(newMatch);
        }
      });
    });

    if (newMatches.length > 0) {
      setMatches(prev => [...prev, ...newMatches]);
      
      // Notify user if their item got a match
      const newNotifications: Notification[] = newMatches
        .filter(m => {
          const lost = reports.find(r => r.id === m.lostReportId);
          const found = reports.find(r => r.id === m.foundReportId);
          return lost?.userId === user.id || found?.userId === user.id;
        })
        .map(m => ({
          id: `n_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId: user.id,
          title: 'New Potential Match!',
          message: `We found a potential match for your reported item with a ${m.score.score}% confidence score.`,
          read: false,
          createdAt: new Date().toISOString(),
          link: `/ai-matches`
        }));
        
      if (newNotifications.length > 0) {
        setNotifications(prev => [...newNotifications, ...prev]);
      }
    }
  }, [reports]);

  const addReport = (reportData: Omit<Report, 'id' | 'createdAt' | 'status' | 'userId'>) => {
    const newReport: Report = {
      ...reportData,
      id: `r_${Date.now()}`,
      status: reportData.type === 'lost' ? 'lost' : 'found',
      userId: user.id,
      createdAt: new Date().toISOString()
    };
    setReports(prev => [newReport, ...prev]);
  };

  const updateReportStatus = (id: string, status: Report['status']) => {
    setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const verifyMatch = (matchId: string) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: 'verified' } : m));
    const match = matches.find(m => m.id === matchId);
    if (match) {
      updateReportStatus(match.lostReportId, 'resolved');
      updateReportStatus(match.foundReportId, 'resolved');
    }
  };

  const rejectMatch = (matchId: string) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: 'rejected' } : m));
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const resetDemoData = () => {
    localStorage.removeItem('lostlink_reports');
    localStorage.removeItem('lostlink_matches');
    localStorage.removeItem('lostlink_notifications');
    setReports(initialReports);
    setMatches([]);
    setNotifications([]);
  };

  return (
    <DataContext.Provider value={{
      user, reports, matches, notifications,
      addReport, updateReportStatus, verifyMatch, rejectMatch, markNotificationRead, resetDemoData
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
};

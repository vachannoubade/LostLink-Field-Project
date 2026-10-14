import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { Report, Match, User, Notification } from '../types';
import { initialReports, demoUser, initialNotifications } from './seedData';
import { calculateMatchScore } from '../utils/matching';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import {
  isStoragePath,
  batchResolveSignedUrls,
  getReportImageSignedUrl,
  deleteReportImage,
  clearSignedUrlCache
} from '../lib/storage';

// ---------------------------------------------------------------------------
// Supabase row ↔ frontend Report type adapters
// ---------------------------------------------------------------------------
// The Supabase `reports` table uses snake_case columns (user_id, image_url,
// created_at), while the frontend Report interface uses camelCase. These two
// helpers convert between the two representations.

interface SupabaseReportRow {
  id: string;
  user_id: string;
  type: Report['type'];
  title: string;
  category: Report['category'];
  description: string;
  location: string;
  date: string;
  time?: string | null;
  image_url?: string | null;
  status: Report['status'];
  created_at: string;
  updated_at?: string;
}

interface SupabaseMatchRow {
  id: string;
  lost_report_id: string;
  found_report_id: string;
  score: number;
  reasons: string[];
  status: 'pending' | 'verified' | 'rejected';
  created_at: string;
  updated_at?: string;
}

interface SupabaseNotificationRow {
  id: string;
  user_id: string;
  title: string;
  message: string;
  read: boolean;
  link?: string | null;
  created_at: string;
}

const rowToReport = (row: SupabaseReportRow, signedUrl?: string): Report => ({
  id: row.id,
  type: row.type,
  title: row.title,
  category: row.category,
  description: row.description,
  location: row.location,
  date: row.date,
  time: row.time ?? undefined,
  imageUrl: isStoragePath(row.image_url) ? signedUrl : (row.image_url ?? undefined),
  imagePath: isStoragePath(row.image_url) ? (row.image_url ?? undefined) : undefined,
  status: row.status,
  userId: row.user_id,
  createdAt: row.created_at,
});

const rowToMatch = (row: SupabaseMatchRow): Match => ({
  id: row.id,
  lostReportId: row.lost_report_id,
  foundReportId: row.found_report_id,
  score: {
    score: row.score,
    reasons: row.reasons || []
  },
  status: row.status,
  createdAt: row.created_at
});

const rowToNotification = (row: SupabaseNotificationRow): Notification => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  message: row.message,
  read: row.read,
  link: row.link ?? undefined,
  createdAt: row.created_at
});

const reportToInsertRow = (
  report: Omit<Report, 'id' | 'createdAt' | 'status' | 'userId'>,
  userId: string,
) => {
  let imageUrlToSave: string | null = null;
  if (report.imagePath) {
    imageUrlToSave = report.imagePath;
  } else if (
    report.imageUrl &&
    !report.imageUrl.startsWith('data:') &&
    !report.imageUrl.startsWith('blob:')
  ) {
    imageUrlToSave = report.imageUrl;
  }

  return {
    user_id: userId,
    type: report.type,
    title: report.title,
    category: report.category,
    description: report.description,
    location: report.location,
    date: report.date,
    time: report.time ?? null,
    image_url: imageUrlToSave,
    status: report.type === 'lost' ? 'lost' : 'found',
  };
};

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

export interface DataContextType {
  user: User;
  reports: Report[];
  matches: Match[];
  notifications: Notification[];
  loading: boolean;
  error: string | null;
  addReport: (report: Omit<Report, 'id' | 'createdAt' | 'status' | 'userId'>) => Promise<{ success: boolean; error?: string }>;
  updateReport: (id: string, updates: Partial<Omit<Report, 'id' | 'userId' | 'createdAt'>>) => Promise<{ success: boolean; error?: string }>;
  deleteReport: (id: string) => Promise<{ success: boolean; error?: string }>;
  resolveReport: (id: string) => Promise<{ success: boolean; error?: string }>;
  updateReportStatus: (id: string, status: Report['status']) => void;
  verifyMatch: (matchId: string) => void;
  rejectMatch: (matchId: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  resetDemoData: () => void;
  refreshReports: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth();
  const isDemo = auth.isDemoMode;
  const user: User = auth.user || (isDemo ? demoUser : { id: '', name: 'Student', email: '', isDemo: false });

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------
  const [reports, setReports] = useState<Report[]>(() => {
    if (isDemo) {
      const saved = localStorage.getItem('lostlink_reports');
      return saved ? JSON.parse(saved) : initialReports;
    }
    return [];
  });

  const [matches, setMatches] = useState<Match[]>(() => {
    if (isDemo) {
      const saved = localStorage.getItem('lostlink_matches');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [notifications, setNotifications] = useState<Notification[]>(() => {
    if (isDemo) {
      const saved = localStorage.getItem('lostlink_notifications');
      return saved ? JSON.parse(saved) : initialNotifications;
    }
    return [];
  });

  const [loading, setLoading] = useState<boolean>(!isDemo);
  const [error, setError] = useState<string | null>(null);

  const matchesRef = useRef<Match[]>(matches);
  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  // -----------------------------------------------------------------------
  // Demo-only: persist to localStorage
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isDemo) return;
    localStorage.setItem('lostlink_reports', JSON.stringify(reports));
  }, [reports, isDemo]);

  useEffect(() => {
    if (!isDemo) return;
    localStorage.setItem('lostlink_matches', JSON.stringify(matches));
  }, [matches, isDemo]);

  useEffect(() => {
    if (!isDemo) return;
    localStorage.setItem('lostlink_notifications', JSON.stringify(notifications));
  }, [notifications, isDemo]);

  // -----------------------------------------------------------------------
  // Supabase: Fetch all shared reports, matches, and notifications
  // -----------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    if (isDemo || !supabase) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch shared reports
      const { data: reportsData, error: reportsError } = await supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (reportsError) {
        setError(reportsError.message);
        setLoading(false);
        return;
      }

      const rows: SupabaseReportRow[] = reportsData || [];
      const storagePaths = rows
        .map(r => r.image_url)
        .filter((url): url is string => Boolean(url && isStoragePath(url)));

      let signedUrlMap = new Map<string, string>();
      if (storagePaths.length > 0) {
        signedUrlMap = await batchResolveSignedUrls(storagePaths, 3600);
      }

      setReports(rows.map(row => {
        const signedUrl = row.image_url ? signedUrlMap.get(row.image_url) : undefined;
        return rowToReport(row, signedUrl);
      }));

      // 2. Fetch matches (RLS enforces user sees only matches involving their reports)
      if (auth.isAuthenticated) {
        const { data: matchesData, error: matchesError } = await supabase
          .from('matches')
          .select('*')
          .order('created_at', { ascending: false });

        if (matchesError) {
          console.error('Failed to fetch matches:', matchesError);
        } else if (matchesData) {
          setMatches(matchesData.map(rowToMatch));
        }

        // 3. Fetch notifications (RLS enforces user sees only their own notifications)
        const { data: notifsData, error: notifsError } = await supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false });

        if (notifsError) {
          console.error('Failed to fetch notifications:', notifsError);
        } else if (notifsData) {
          setNotifications(notifsData.map(rowToNotification));
        }
      } else {
        setMatches([]);
        setNotifications([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [isDemo, auth.isAuthenticated]);

  // Synchronize with auth state changes:
  useEffect(() => {
    // If auth is still checking initial session, keep loading state active and wait
    if (auth.loading) {
      setLoading(true);
      return;
    }

    if (!isDemo && supabase) {
      if (auth.isAuthenticated) {
        fetchData();
      } else {
        clearSignedUrlCache();
        setReports([]);
        setMatches([]);
        setNotifications([]);
        setError(null);
        setLoading(false);
      }
    }
  }, [auth.loading, isDemo, auth.isAuthenticated, auth.user?.id, fetchData]);

  // When transitioning to demo mode, load demo data from localStorage / seeds
  useEffect(() => {
    if (isDemo) {
      const saved = localStorage.getItem('lostlink_reports');
      setReports(saved ? JSON.parse(saved) : initialReports);
      const savedMatches = localStorage.getItem('lostlink_matches');
      setMatches(savedMatches ? JSON.parse(savedMatches) : []);
      const savedNotifs = localStorage.getItem('lostlink_notifications');
      setNotifications(savedNotifs ? JSON.parse(savedNotifs) : initialNotifications);
      setLoading(false);
      setError(null);
    }
  }, [isDemo]);

  // -----------------------------------------------------------------------
  // Demo-only: Recalculate matches whenever reports change
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isDemo) return;
    if (reports.length === 0) return;
    
    const lostReports = reports.filter(r => r.type === 'lost' && r.status === 'lost');
    const foundReports = reports.filter(r => r.type === 'found' && r.status === 'found');
    
    const newMatches: Match[] = [];
    const currentMatches = matchesRef.current;
    
    lostReports.forEach(lost => {
      foundReports.forEach(found => {
        const alreadyMatched = currentMatches.some(m => 
          (m.lostReportId === lost.id && m.foundReportId === found.id) ||
          (m.lostReportId === found.id && m.foundReportId === lost.id)
        ) || newMatches.some(m => 
          (m.lostReportId === lost.id && m.foundReportId === found.id) ||
          (m.lostReportId === found.id && m.foundReportId === lost.id)
        );

        if (alreadyMatched) return;
        
        const score = calculateMatchScore(lost, found);
        if (score.score > 40) {
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
  }, [reports, user.id, isDemo]);

  // -----------------------------------------------------------------------
  // CRUD Operations
  // -----------------------------------------------------------------------

  const addReport = useCallback(async (
    reportData: Omit<Report, 'id' | 'createdAt' | 'status' | 'userId'>
  ): Promise<{ success: boolean; error?: string }> => {
    // --- Demo mode ---
    if (isDemo) {
      const newReport: Report = {
        ...reportData,
        id: `r_${Date.now()}`,
        status: reportData.type === 'lost' ? 'lost' : 'found',
        userId: user.id,
        createdAt: new Date().toISOString()
      };
      setReports(prev => [newReport, ...prev]);
      return { success: true };
    }

    // --- Authenticated mode ---
    if (!supabase) return { success: false, error: 'Database connection not available' };
    const activeUserId = auth.session?.user?.id || auth.user?.id;
    if (!auth.isAuthenticated || !activeUserId) {
      return { success: false, error: 'You must be signed in to submit a report.' };
    }

    try {
      const insertPayload = reportToInsertRow(reportData, activeUserId);
      const { data, error: insertError } = await supabase
        .from('reports')
        .insert(insertPayload)
        .select()
        .single();

      if (insertError) {
        return { success: false, error: insertError.message };
      }

      if (data) {
        let signedUrl: string | undefined = undefined;
        if (data.image_url && isStoragePath(data.image_url)) {
          signedUrl = (await getReportImageSignedUrl(data.image_url, 3600)) || undefined;
        }
        setReports(prev => [rowToReport(data, signedUrl), ...prev]);
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to create report' };
    }
  }, [isDemo, auth.isAuthenticated, auth.session, auth.user, user.id]);

  const updateReport = useCallback(async (
    id: string,
    updates: Partial<Omit<Report, 'id' | 'userId' | 'createdAt'>>,
  ): Promise<{ success: boolean; error?: string }> => {
    // --- Demo mode ---
    if (isDemo) {
      const report = reports.find(r => r.id === id);
      if (!report) return { success: false, error: 'Report not found' };
      if (report.userId !== user.id) return { success: false, error: 'Permission denied' };

      setReports(prev => prev.map(r => {
        if (r.id === id) {
          return {
            ...r,
            ...updates,
            id: r.id,
            userId: r.userId,
            createdAt: r.createdAt
          };
        }
        return r;
      }));

      return { success: true };
    }

    // --- Authenticated mode ---
    if (!supabase) return { success: false, error: 'Database connection not available' };
    if (!auth.isAuthenticated) {
      return { success: false, error: 'You must be signed in to update a report.' };
    }

    try {
      const updatePayload: Record<string, unknown> = {};
      if (updates.title !== undefined) updatePayload.title = updates.title;
      if (updates.category !== undefined) updatePayload.category = updates.category;
      if (updates.description !== undefined) updatePayload.description = updates.description;
      if (updates.location !== undefined) updatePayload.location = updates.location;
      if (updates.date !== undefined) updatePayload.date = updates.date;
      if (updates.time !== undefined) updatePayload.time = updates.time;
      if (updates.imagePath !== undefined) {
        updatePayload.image_url = updates.imagePath || null;
      } else if (updates.imageUrl !== undefined) {
        updatePayload.image_url = updates.imageUrl && !updates.imageUrl.startsWith('data:') && !updates.imageUrl.startsWith('blob:')
          ? updates.imageUrl
          : null;
      }

      const { data, error: updateError } = await supabase
        .from('reports')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        const errorMsg = updateError.code === 'PGRST116'
          ? 'Report not found or permission denied'
          : updateError.message;
        return { success: false, error: errorMsg };
      }

      if (!data) {
        return { success: false, error: 'Report not found or permission denied' };
      }

      let signedUrl: string | undefined = undefined;
      if (data.image_url && isStoragePath(data.image_url)) {
        signedUrl = (await getReportImageSignedUrl(data.image_url, 3600)) || undefined;
      }

      setReports(prev => prev.map(r => r.id === id ? rowToReport(data, signedUrl) : r));
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to update report' };
    }
  }, [isDemo, auth.isAuthenticated, user.id, reports]);

  const deleteReport = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    const reportToDelete = reports.find(r => r.id === id);

    // --- Demo mode ---
    if (isDemo) {
      if (!reportToDelete) return { success: false, error: 'Report not found' };
      if (reportToDelete.userId !== user.id) return { success: false, error: 'Permission denied' };

      setReports(prev => prev.filter(r => r.id !== id));
      setMatches(prev => prev.filter(m => m.lostReportId !== id && m.foundReportId !== id));
      return { success: true };
    }

    // --- Authenticated mode ---
    if (!supabase) return { success: false, error: 'Database connection not available' };
    if (!auth.isAuthenticated) {
      return { success: false, error: 'You must be signed in to delete a report.' };
    }

    try {
      const { data, error: deleteError } = await supabase
        .from('reports')
        .delete()
        .eq('id', id)
        .select('id');

      if (deleteError) {
        return { success: false, error: deleteError.message };
      }

      if (!data || data.length === 0) {
        return { success: false, error: 'Report not found or permission denied' };
      }

      setReports(prev => prev.filter(r => r.id !== id));
      setMatches(prev => prev.filter(m => m.lostReportId !== id && m.foundReportId !== id));

      if (reportToDelete?.imagePath && reportToDelete.userId === user.id) {
        deleteReportImage(reportToDelete.imagePath).catch(() => {});
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to delete report' };
    }
  }, [isDemo, auth.isAuthenticated, user.id, reports]);

  const resolveReport = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    // --- Demo mode ---
    if (isDemo) {
      const report = reports.find(r => r.id === id);
      if (!report) return { success: false, error: 'Report not found' };
      if (report.userId !== user.id) return { success: false, error: 'Permission denied' };
      if (report.status === 'resolved') return { success: false, error: 'Already resolved' };

      setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'resolved' as const } : r));
      setMatches(prev => prev.map(m => 
        (m.lostReportId === id || m.foundReportId === id) && m.status === 'pending' 
          ? { ...m, status: 'rejected' as const } 
          : m
      ));
      return { success: true };
    }

    // --- Authenticated mode: use resolve_report RPC ---
    if (!supabase) return { success: false, error: 'Database connection not available' };
    if (!auth.isAuthenticated) {
      return { success: false, error: 'You must be signed in to resolve a report.' };
    }

    try {
      const { data, error: rpcError } = await supabase
        .rpc('resolve_report', { report_id: id });

      if (rpcError) {
        return { success: false, error: rpcError.message };
      }

      if (!data) {
        return { success: false, error: 'Report not found or permission denied' };
      }

      setReports(prev => prev.map(r => r.id === id ? rowToReport(data) : r));

      setMatches(prev => prev.map(m =>
        (m.lostReportId === id || m.foundReportId === id) && m.status === 'pending'
          ? { ...m, status: 'rejected' as const }
          : m
      ));

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to resolve report' };
    }
  }, [isDemo, auth.isAuthenticated, user.id, reports]);

  const updateReportStatus = (id: string, status: Report['status']) => {
    setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const verifyMatch = useCallback(async (matchId: string) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: 'verified' } : m));
    const match = matches.find(m => m.id === matchId);
    if (match) {
      if (isDemo) {
        updateReportStatus(match.lostReportId, 'resolved');
        updateReportStatus(match.foundReportId, 'resolved');
      } else {
        const activeUserId = auth.session?.user?.id || auth.user?.id;
        const myReport = reports.find(r => (r.id === match.lostReportId || r.id === match.foundReportId) && r.userId === activeUserId);
        if (myReport) {
          await resolveReport(myReport.id);
        }
      }
    }
  }, [isDemo, matches, reports, auth.session, auth.user, resolveReport]);

  const rejectMatch = useCallback((matchId: string) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: 'rejected' } : m));
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    if (!isDemo && supabase) {
      supabase.from('notifications').update({ read: true }).eq('id', id).then(({ error: updateErr }) => {
        if (updateErr) console.error('Failed to update notification in database:', updateErr);
      });
    }
  }, [isDemo]);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    const activeUserId = auth.session?.user?.id || auth.user?.id;
    if (!isDemo && supabase && activeUserId) {
      supabase.from('notifications').update({ read: true }).eq('user_id', activeUserId).then(({ error: updateErr }) => {
        if (updateErr) console.error('Failed to update all notifications in database:', updateErr);
      });
    }
  }, [isDemo, auth.session, auth.user]);

  const resetDemoData = () => {
    localStorage.removeItem('lostlink_reports');
    localStorage.removeItem('lostlink_matches');
    localStorage.removeItem('lostlink_notifications');
    setReports(initialReports);
    setMatches([]);
    setNotifications(initialNotifications);
  };

  const refreshReports = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return (
    <DataContext.Provider value={{
      user, reports, matches, notifications, loading, error,
      addReport, updateReport, deleteReport, resolveReport,
      updateReportStatus, verifyMatch, rejectMatch, 
      markNotificationRead, markAllNotificationsRead, resetDemoData,
      refreshReports
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

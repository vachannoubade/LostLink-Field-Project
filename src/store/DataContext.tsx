import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { Report, Match, User, Notification } from '../types';
import { CAMPUS_ZONES } from '../utils/categoryArt';
import { generateMatches } from '../utils/matching';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import {
  isStoragePath,
  batchResolveSignedUrls,
  getReportImageSignedUrl,
  deleteReportImage,
} from '../lib/storage';

// ---------------------------------------------------------------------------
// Supabase row ↔ frontend Report type adapters
// ---------------------------------------------------------------------------

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

const rowToReport = (row: SupabaseReportRow, signedUrl?: string): Report => {
  let detectedZone: string | undefined = undefined;
  for (const zone of CAMPUS_ZONES) {
    if (row.location.toLowerCase().includes(zone.toLowerCase())) {
      detectedZone = zone;
      break;
    }
  }

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    category: row.category,
    description: row.description,
    location: row.location,
    campusZone: detectedZone,
    date: row.date,
    time: row.time ?? undefined,
    imageUrl: isStoragePath(row.image_url) ? signedUrl : (row.image_url ?? undefined),
    imagePath: isStoragePath(row.image_url) ? (row.image_url ?? undefined) : undefined,
    status: row.status,
    userId: row.user_id,
    createdAt: row.created_at,
  };
};

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
  refreshReports: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth();
  const user: User = auth.user || { id: '', name: 'Campus Student', email: '' };

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------
  const [reports, setReports] = useState<Report[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const matchesRef = useRef<Match[]>(matches);
  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  // -----------------------------------------------------------------------
  // Supabase: Fetch shared reports, user notifications, and cross-reference matches
  // -----------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch shared reports (accessible publicly to all visitors per Supabase RLS)
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

      // 2. Fetch authenticated user data (matches & notifications)
      if (auth.isAuthenticated) {
        const { data: matchesData, error: matchesError } = await supabase
          .from('matches')
          .select('*')
          .order('created_at', { ascending: false });

        if (matchesError) {
          console.warn('Notice: Server matches query returned:', matchesError.message);
        } else if (matchesData && matchesData.length > 0) {
          setMatches(matchesData.map(rowToMatch));
        }

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
        setNotifications([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [auth.isAuthenticated]);

  // Synchronize with auth state changes
  useEffect(() => {
    if (auth.loading) {
      setLoading(true);
      return;
    }

    if (supabase) {
      fetchData();
    }
  }, [auth.loading, auth.isAuthenticated, auth.user?.id, fetchData]);

  // -----------------------------------------------------------------------
  // Recalculate matches whenever reports change
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (reports.length === 0) {
      setMatches([]);
      return;
    }

    const storageKey = `lostlink_match_decisions_${user.id || 'auth'}`;
    const savedDecisions: Record<string, 'pending' | 'verified' | 'rejected'> = {};
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((m: Match) => {
            if (m?.id && m?.status) {
              savedDecisions[m.id] = m.status;
            }
          });
        }
      }
    } catch {}

    const generated = generateMatches(reports);

    // Preserve any existing user decisions from memory or storage
    const currentMemoryMatches = matchesRef.current;
    const finalMatches: Match[] = generated.map(gm => {
      const existingInMem = currentMemoryMatches.find(m => m.id === gm.id);
      if (existingInMem && existingInMem.status !== 'pending') {
        return { ...gm, status: existingInMem.status };
      }
      if (savedDecisions[gm.id] && savedDecisions[gm.id] !== 'pending') {
        return { ...gm, status: savedDecisions[gm.id] };
      }
      return gm;
    });

    // Sort: user's own reports first, then highest score
    finalMatches.sort((a, b) => {
      const aUser = Boolean(user.id && reports.some(r => (r.id === a.lostReportId || r.id === a.foundReportId) && r.userId === user.id));
      const bUser = Boolean(user.id && reports.some(r => (r.id === b.lostReportId || r.id === b.foundReportId) && r.userId === user.id));
      if (aUser && !bUser) return -1;
      if (!aUser && bUser) return 1;
      return b.score.score - a.score.score;
    });

    setMatches(finalMatches);

    // Generate in-app notifications for newly discovered matches involving the active user
    const newMatchesForUser = finalMatches.filter(m => {
      const isNew = !currentMemoryMatches.some(prev => prev.id === m.id);
      if (!isNew) return false;
      const lost = reports.find(r => r.id === m.lostReportId);
      const found = reports.find(r => r.id === m.foundReportId);
      return (lost?.userId === user.id || found?.userId === user.id);
    });

    if (newMatchesForUser.length > 0 && user.id) {
      const newNotifs: Notification[] = newMatchesForUser.map(m => ({
        id: `n_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: user.id,
        title: 'Potential Match Discovered',
        message: `A potential match was cross-referenced for your reported item (${m.score.score}% correlation).`,
        read: false,
        createdAt: new Date().toISOString(),
        link: '/ai-matches'
      }));

      setNotifications(prev => [...newNotifs, ...prev]);
    }
  }, [reports, user.id]);

  // -----------------------------------------------------------------------
  // Real CRUD Operations (Supabase Only)
  // -----------------------------------------------------------------------

  const addReport = useCallback(async (
    reportData: Omit<Report, 'id' | 'createdAt' | 'status' | 'userId'>
  ): Promise<{ success: boolean; error?: string }> => {
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
  }, [auth.isAuthenticated, auth.session, auth.user]);

  const updateReport = useCallback(async (
    id: string,
    updates: Partial<Omit<Report, 'id' | 'userId' | 'createdAt'>>,
  ): Promise<{ success: boolean; error?: string }> => {
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
  }, [auth.isAuthenticated]);

  const deleteReport = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    const reportToDelete = reports.find(r => r.id === id);

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
  }, [auth.isAuthenticated, user.id, reports]);

  const resolveReport = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
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
  }, [auth.isAuthenticated]);

  const updateReportStatus = (id: string, status: Report['status']) => {
    setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const verifyMatch = useCallback((matchId: string) => {
    setMatches(prev => {
      const updated = prev.map(m => m.id === matchId ? { ...m, status: 'verified' as const } : m);
      try {
        const storageKey = `lostlink_match_decisions_${user.id || 'auth'}`;
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, [user.id]);

  const rejectMatch = useCallback((matchId: string) => {
    setMatches(prev => {
      const updated = prev.map(m => m.id === matchId ? { ...m, status: 'rejected' as const } : m);
      try {
        const storageKey = `lostlink_match_decisions_${user.id || 'auth'}`;
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, [user.id]);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    if (supabase) {
      supabase.from('notifications').update({ read: true }).eq('id', id).then(({ error: updateErr }) => {
        if (updateErr) console.error('Failed to update notification in database:', updateErr);
      });
    }
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    const activeUserId = auth.session?.user?.id || auth.user?.id;
    if (supabase && activeUserId) {
      supabase.from('notifications').update({ read: true }).eq('user_id', activeUserId).then(({ error: updateErr }) => {
        if (updateErr) console.error('Failed to update all notifications in database:', updateErr);
      });
    }
  }, [auth.session, auth.user]);

  const refreshReports = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return (
    <DataContext.Provider value={{
      user, reports, matches, notifications, loading, error,
      addReport, updateReport, deleteReport, resolveReport,
      updateReportStatus, verifyMatch, rejectMatch, 
      markNotificationRead, markAllNotificationsRead,
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

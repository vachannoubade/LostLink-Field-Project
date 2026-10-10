export type ItemStatus = 'lost' | 'found' | 'resolved';
export type Category = 'Electronics' | 'ID Cards' | 'Bags' | 'Books' | 'Accessories' | 'Keys' | 'Other';
export type ReportType = 'lost' | 'found';

export interface Report {
  id: string;
  type: ReportType;
  title: string;
  category: Category;
  description: string;
  location: string;
  date: string; // ISO date or simple date string
  time?: string;
  imageUrl?: string;
  status: ItemStatus;
  userId: string;
  createdAt: string;
}

export interface MatchScore {
  score: number; // 0-100
  reasons: string[];
}

export interface Match {
  id: string;
  lostReportId: string;
  foundReportId: string;
  score: MatchScore;
  status: 'pending' | 'verified' | 'rejected';
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  link?: string;
}

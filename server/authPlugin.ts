import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  salt: string;
  role: string;
  department: string;
  studentId: string;
  bio: string;
  phone: string;
  karmaPoints: number;
  reunionsHelped: number;
  emailVerified: boolean;
  isAdmin?: boolean;
  createdAt: string;
  resetTokenHash?: string;
  resetExpiresAt?: number;
}

interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
}

interface StoredVerificationPrompt {
  id: string;
  promptLabel: string;
  secretAnswer: string;
}

interface StoredVerificationDetails {
  itemId: string;
  finderId: string;
  privatePrompts: StoredVerificationPrompt[];
  enhancedVerification: boolean;
  estimatedValue: number;
  createdAt: string;
  updatedAt: string;
}

interface StoredEvidence {
  id: string;
  claimId: string;
  uploadingUserId: string;
  uploaderName: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  privateStoragePath: string;
  dataUrl?: string;
  description: string;
  createdAt: string;
}

interface StoredClaim {
  id: string;
  itemId: string;
  itemTitle: string;
  itemCategory: string;
  itemImageUrl?: string;
  itemLocation: string;
  finderId: string;
  claimantId: string;
  claimantName: string;
  claimantEmail: string;
  explanation: string;
  submittedAnswers: { promptId: string; promptLabel: string; answer: string }[];
  truthfulnessConfirmed: boolean;
  status:
    | 'submitted'
    | 'verification_pending'
    | 'additional_evidence_required'
    | 'finder_review_required'
    | 'administrator_review_required'
    | 'approved_for_handover'
    | 'rejected'
    | 'handed_over';
  verificationStatus: 'pending' | 'partially_matched' | 'strong_signal' | 'fallback_manual' | 'verified' | 'failed';
  automatedScore: number;
  hasPrivateDetailsOnItem: boolean;
  riskFlags: string[];
  requiresAdminReview: boolean;
  escalationReason?: string;
  finderDecision?: {
    decision: 'approved' | 'request_evidence' | 'rejected' | 'escalated';
    reason: string;
    reviewerId: string;
    reviewerName: string;
    timestamp: string;
  };
  adminDecision?: {
    decision: 'approved' | 'request_evidence' | 'rejected' | 'returned_to_finder';
    reason: string;
    reviewerId: string;
    reviewerName: string;
    timestamp: string;
  };
  handoverConfirmation?: {
    confirmedById: string;
    confirmedByName: string;
    handoverNotes: string;
    timestamp: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface StoredAuditLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: 'claimant' | 'finder' | 'admin' | 'system';
  action: string;
  claimId?: string;
  itemId: string;
  previousStatus?: string;
  newStatus?: string;
  reason?: string;
  timestamp: string;
}

const HIGH_VALUE_THRESHOLD = 5000; // Configurable threshold (₹5,000 / high-value electronics)
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_VERIFICATION_ATTEMPTS_PER_WINDOW = 3;

const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', '.server-data')
  : path.resolve(process.cwd(), '.server-data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');
const VERIFICATION_FILE = path.join(DATA_DIR, 'verification_details.json');
const CLAIMS_FILE = path.join(DATA_DIR, 'claims.json');
const EVIDENCE_FILE = path.join(DATA_DIR, 'evidence.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit_logs.json');
const PRIVATE_UPLOADS_DIR = path.join(DATA_DIR, 'private-uploads');

// In-memory sliding window rate limiter for verification attempts
const verificationAttemptsMap = new Map<string, number[]>();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PRIVATE_UPLOADS_DIR)) {
    fs.mkdirSync(PRIVATE_UPLOADS_DIR, { recursive: true });
  }
}

function getServerSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  ensureDataDir();
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE, 'utf-8').trim();
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
  return generated;
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const derived = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function signJwt(payload: Omit<TokenPayload, 'iat' | 'exp'>, expiresInSeconds = 7 * 24 * 3600): { token: string; expiresAt: number } {
  const secret = getServerSecret();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expiresInSeconds;
  const fullPayload: TokenPayload = { ...payload, iat, exp };

  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return {
    token: `${headerB64}.${payloadB64}.${signature}`,
    expiresAt: exp * 1000
  };
}

function verifyJwt(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sig] = parts;
    const secret = getServerSecret();
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as TokenPayload;
    if (Date.now() >= payload.exp * 1000) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function loadUsers(): StoredUser[] {
  ensureDataDir();
  const seedAccounts: Omit<StoredUser, 'salt' | 'passwordHash'>[] = [
    {
      id: 'u_1',
      name: 'Vivek Sharma',
      email: 'vivek.sharma@campus.edu',
      role: '3rd Year • Computer Science & Design (Campus Admin)',
      department: 'School of Engineering & Design',
      studentId: 'CS2024-8942',
      bio: 'Always happy to help fellow students track down lost gear around the Library and Student Union. Coffee enthusiast ☕',
      phone: '+91 98765 43210',
      karmaPoints: 145,
      reunionsHelped: 4,
      emailVerified: true,
      isAdmin: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'u_3',
      name: 'Meera Krishnan',
      email: 'meera.k@campus.edu',
      role: '4th Year • Biotechnology',
      department: 'School of Biosciences',
      studentId: 'BT2023-3310',
      bio: 'Frequent library visitor. Happy to help return found items!',
      phone: '+91 98765 11111',
      karmaPoints: 165,
      reunionsHelped: 3,
      emailVerified: true,
      isAdmin: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'u_2',
      name: 'Aarav Mehta',
      email: 'aarav.m@campus.edu',
      role: '2nd Year • Mechanical Eng',
      department: 'School of Mechanical Engineering',
      studentId: 'ME2025-1104',
      bio: 'Robotics club member.',
      phone: '+91 98765 22222',
      karmaPoints: 110,
      reunionsHelped: 1,
      emailVerified: true,
      isAdmin: false,
      createdAt: new Date().toISOString()
    }
  ];

  if (!fs.existsSync(USERS_FILE)) {
    const initialUsers: StoredUser[] = seedAccounts.map(acc => {
      const salt = crypto.randomBytes(16).toString('hex');
      return {
        ...acc,
        salt,
        passwordHash: hashPassword('LostLink@2026', salt)
      };
    });
    fs.writeFileSync(USERS_FILE, JSON.stringify(initialUsers, null, 2), 'utf-8');
    return initialUsers;
  }

  try {
    const existing = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')) as StoredUser[];
    let modified = false;
    // Non-destructively ensure seed accounts exist and u_1 has isAdmin: true
    for (const seed of seedAccounts) {
      const found = existing.find(u => u.id === seed.id || u.email.toLowerCase() === seed.email.toLowerCase());
      if (!found) {
        const salt = crypto.randomBytes(16).toString('hex');
        existing.push({
          ...seed,
          salt,
          passwordHash: hashPassword('LostLink@2026', salt)
        });
        modified = true;
      } else if (seed.id === 'u_1' && found.isAdmin !== true) {
        found.isAdmin = true;
        modified = true;
      }
    }
    if (modified) {
      fs.writeFileSync(USERS_FILE, JSON.stringify(existing, null, 2), 'utf-8');
    }
    return existing;
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]) {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

function loadVerificationDetails(): StoredVerificationDetails[] {
  ensureDataDir();
  if (!fs.existsSync(VERIFICATION_FILE)) {
    const initialDetails: StoredVerificationDetails[] = [
      {
        itemId: 'r_2',
        finderId: 'u_3',
        privatePrompts: [
          {
            id: 'vp_r2_1',
            promptLabel: 'What sticker, mark, or decal is on the bottom of the charging case?',
            secretAnswer: 'tiny yellow smiley sticker on the bottom lid'
          },
          {
            id: 'vp_r2_2',
            promptLabel: 'What color or finish are the ear tips inside the case?',
            secretAnswer: 'matte black foam ear tips medium size'
          }
        ],
        enhancedVerification: false,
        estimatedValue: 3500,
        createdAt: '2026-10-11T16:45:00Z',
        updatedAt: '2026-10-11T16:45:00Z'
      },
      {
        itemId: 'r_6',
        finderId: 'u_6',
        privatePrompts: [
          {
            id: 'vp_r6_1',
            promptLabel: 'What number or room code is stamped on the brass hostel key?',
            secretAnswer: 'B-214 stamped on the flat side'
          },
          {
            id: 'vp_r6_2',
            promptLabel: 'What small accessory or tag is attached next to the Totoro plush?',
            secretAnswer: 'mini silver whistle charm'
          }
        ],
        enhancedVerification: true,
        estimatedValue: 6500,
        createdAt: '2026-10-11T19:30:00Z',
        updatedAt: '2026-10-11T19:30:00Z'
      }
    ];
    fs.writeFileSync(VERIFICATION_FILE, JSON.stringify(initialDetails, null, 2), 'utf-8');
    return initialDetails;
  }
  try {
    return JSON.parse(fs.readFileSync(VERIFICATION_FILE, 'utf-8')) as StoredVerificationDetails[];
  } catch {
    return [];
  }
}

function saveVerificationDetails(list: StoredVerificationDetails[]) {
  ensureDataDir();
  fs.writeFileSync(VERIFICATION_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

function loadClaims(): StoredClaim[] {
  ensureDataDir();
  if (!fs.existsSync(CLAIMS_FILE)) {
    fs.writeFileSync(CLAIMS_FILE, JSON.stringify([], null, 2), 'utf-8');
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(CLAIMS_FILE, 'utf-8')) as StoredClaim[];
  } catch {
    return [];
  }
}

function saveClaims(list: StoredClaim[]) {
  ensureDataDir();
  fs.writeFileSync(CLAIMS_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

function loadEvidence(): StoredEvidence[] {
  ensureDataDir();
  if (!fs.existsSync(EVIDENCE_FILE)) {
    fs.writeFileSync(EVIDENCE_FILE, JSON.stringify([], null, 2), 'utf-8');
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(EVIDENCE_FILE, 'utf-8')) as StoredEvidence[];
  } catch {
    return [];
  }
}

function saveEvidence(list: StoredEvidence[]) {
  ensureDataDir();
  fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

function loadAuditLogs(): StoredAuditLog[] {
  ensureDataDir();
  if (!fs.existsSync(AUDIT_FILE)) {
    fs.writeFileSync(AUDIT_FILE, JSON.stringify([], null, 2), 'utf-8');
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8')) as StoredAuditLog[];
  } catch {
    return [];
  }
}

function appendAuditLog(entry: Omit<StoredAuditLog, 'id' | 'timestamp'>) {
  const logs = loadAuditLogs();
  const record: StoredAuditLog = {
    ...entry,
    id: `audit_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    timestamp: new Date().toISOString()
  };
  logs.unshift(record);
  ensureDataDir();
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(logs, null, 2), 'utf-8');
}

function sanitizeUser(u: StoredUser) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    department: u.department,
    studentId: u.studentId,
    bio: u.bio,
    phone: u.phone,
    karmaPoints: u.karmaPoints,
    reunionsHelped: u.reunionsHelped,
    emailVerified: u.emailVerified,
    isAdmin: Boolean(u.isAdmin)
  };
}

// Normalize text and compute human-tolerant similarity (0 to 100) without exact-match rigidity
const FILLER_WORDS = new Set(['the', 'a', 'an', 'on', 'in', 'at', 'of', 'with', 'is', 'it', 'has', 'my', 'there', 'side', 'and', 'to', 'for']);

function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !FILLER_WORDS.has(w));
}

function getBigrams(str: string): string[] {
  const clean = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const out: string[] = [];
  for (let i = 0; i < clean.length - 1; i++) {
    out.push(clean.slice(i, i + 2));
  }
  return out;
}

function computeAnswerSimilarity(secretAnswer: string, claimantAnswer: string): number {
  const sTokens = normalizeTokens(secretAnswer);
  const cTokens = normalizeTokens(claimantAnswer);
  if (sTokens.length === 0 || cTokens.length === 0) return 0;

  // Token recall/overlap (allows partial/substring matches like "smiley" <-> "smileyface")
  let matchedTokens = 0;
  for (const st of sTokens) {
    if (cTokens.some(ct => ct === st || ct.includes(st) || st.includes(ct))) {
      matchedTokens++;
    }
  }
  const tokenRecall = matchedTokens / sTokens.length;

  // Character bigram Dice similarity
  const sBigrams = getBigrams(secretAnswer);
  const cBigrams = getBigrams(claimantAnswer);
  let bigramMatches = 0;
  const used = new Array(cBigrams.length).fill(false);
  for (const sb of sBigrams) {
    const idx = cBigrams.findIndex((cb, i) => !used[i] && cb === sb);
    if (idx !== -1) {
      used[idx] = true;
      bigramMatches++;
    }
  }
  const dice = sBigrams.length + cBigrams.length > 0
    ? (2 * bigramMatches) / (sBigrams.length + cBigrams.length)
    : 0;

  const combined = Math.round(Math.min(100, (tokenRecall * 0.7 + dice * 0.3) * 105));
  return combined;
}

function buildComparisonBreakdown(
  details: StoredVerificationDetails | undefined,
  submittedAnswers: { promptId: string; promptLabel: string; answer: string }[]
) {
  if (!details || details.privatePrompts.length === 0) return [];
  return details.privatePrompts.map(prompt => {
    const sub = submittedAnswers.find(a => a.promptId === prompt.id || a.promptLabel === prompt.promptLabel);
    const claimantAnswer = sub?.answer || '';
    const similarity = computeAnswerSimilarity(prompt.secretAnswer, claimantAnswer);
    const matchLevel: 'strong' | 'partial' | 'weak' =
      similarity >= 65 ? 'strong' : similarity >= 35 ? 'partial' : 'weak';
    return {
      promptId: prompt.id,
      promptLabel: prompt.promptLabel,
      secretAnswer: prompt.secretAnswer,
      claimantAnswer,
      similarity,
      matchLevel
    };
  });
}

function formatClaimForViewer(
  claim: StoredClaim,
  viewerRole: 'claimant' | 'finder' | 'admin',
  allDetails: StoredVerificationDetails[],
  allEvidence: StoredEvidence[],
  allClaims: StoredClaim[]
) {
  const claimEvidence = allEvidence
    .filter(e => e.claimId === claim.id)
    .map(e => ({
      id: e.id,
      claimId: e.claimId,
      uploadingUserId: e.uploadingUserId,
      uploaderName: e.uploaderName,
      fileName: e.fileName,
      mimeType: e.mimeType,
      sizeBytes: e.sizeBytes,
      description: e.description,
      createdAt: e.createdAt
    }));

  const competingCount = allClaims.filter(
    c => c.itemId === claim.itemId && c.id !== claim.id && c.status !== 'rejected'
  ).length;

  if (viewerRole === 'claimant') {
    // Strip sensitive reviewer breakdown & secret answers from claimant response
    return {
      ...claim,
      evidence: claimEvidence,
      competingClaimsCount: competingCount > 0 ? competingCount : 0
    };
  }

  // Authorized Finder or Admin receives full comparison breakdown with secret answers
  const details = allDetails.find(d => d.itemId === claim.itemId);
  const comparisonBreakdown = buildComparisonBreakdown(details, claim.submittedAnswers);
  return {
    ...claim,
    evidence: claimEvidence,
    comparisonBreakdown,
    competingClaimsCount: competingCount
  };
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

function getAuthenticatedUser(req: IncomingMessage): StoredUser | null {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies['lostlink_session'];
  }
  if (!token) return null;
  const payload = verifyJwt(token);
  if (!payload) return null;
  const users = loadUsers();
  return users.find(u => u.id === payload.sub) || null;
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 6 * 1024 * 1024) {
        reject(new Error('Payload too large (max 5MB)'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: Record<string, any>, extraHeaders: Record<string, string> = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify(body));
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9!@#$%^&*(),.?":{}|<>_\-+=]/.test(password)) {
    return 'Password must include at least one letter and one number or special character.';
  }
  return null;
}

function checkRateLimit(key: string): { allowed: boolean; attemptsInWindow: number } {
  const now = Date.now();
  const timestamps = (verificationAttemptsMap.get(key) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= MAX_VERIFICATION_ATTEMPTS_PER_WINDOW) {
    verificationAttemptsMap.set(key, timestamps);
    return { allowed: false, attemptsInWindow: timestamps.length };
  }
  timestamps.push(now);
  verificationAttemptsMap.set(key, timestamps);
  return { allowed: true, attemptsInWindow: timestamps.length };
}

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url?.split('?')[0] || '';
  if (!url.startsWith('/api/')) return false;

  try {
    // ========================================================================
    // AUTHENTICATION ENDPOINTS
    // ========================================================================

    // 1. GET /api/auth/me
    if (url === '/api/auth/me' && req.method === 'GET') {
      const user = getAuthenticatedUser(req);
      if (!user) {
        sendJson(res, 401, { error: 'Not authenticated' });
        return true;
      }
      const { token, expiresAt } = signJwt({ sub: user.id, email: user.email, name: user.name });
      sendJson(res, 200, {
        user: sanitizeUser(user),
        session: { accessToken: token, expiresAt }
      });
      return true;
    }

    // 2. POST /api/auth/signup
    if (url === '/api/auth/signup' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');

      if (name.length < 2) {
        sendJson(res, 400, { error: 'Please enter your full name (at least 2 characters).' });
        return true;
      }
      if (!isValidEmail(email)) {
        sendJson(res, 400, { error: 'Please enter a valid email address.' });
        return true;
      }
      const pwdError = validatePasswordStrength(password);
      if (pwdError) {
        sendJson(res, 400, { error: pwdError });
        return true;
      }

      const users = loadUsers();
      if (users.some(u => u.email.toLowerCase() === email)) {
        sendJson(res, 409, { error: 'An account with this email address already exists. Please log in instead.' });
        return true;
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(password, salt);

      const newUser: StoredUser = {
        id: `u_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        name,
        email,
        salt,
        passwordHash,
        role: 'Verified Campus Member',
        department: 'Campus Community',
        studentId: `ID-${Math.floor(100000 + Math.random() * 900000)}`,
        bio: 'Member of the LostLink Campus Kindness Network.',
        phone: '',
        karmaPoints: 100,
        reunionsHelped: 0,
        emailVerified: true,
        isAdmin: false, // Never allow client signup to grant admin privileges
        createdAt: new Date().toISOString()
      };

      users.push(newUser);
      saveUsers(users);

      const { token, expiresAt } = signJwt({ sub: newUser.id, email: newUser.email, name: newUser.name });
      sendJson(
        res,
        201,
        {
          message: 'Account created successfully!',
          user: sanitizeUser(newUser),
          session: { accessToken: token, expiresAt }
        },
        {
          'Set-Cookie': `lostlink_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`
        }
      );
      return true;
    }

    // 3. POST /api/auth/login
    if (url === '/api/auth/login' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');

      if (!email || !password) {
        sendJson(res, 400, { error: 'Please enter both your email address and password.' });
        return true;
      }

      const users = loadUsers();
      const user = users.find(u => u.email.toLowerCase() === email);
      if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
        sendJson(res, 401, { error: 'Invalid email or password. Please check your credentials and try again.' });
        return true;
      }

      const { token, expiresAt } = signJwt({ sub: user.id, email: user.email, name: user.name });
      sendJson(
        res,
        200,
        {
          message: 'Logged in successfully!',
          user: sanitizeUser(user),
          session: { accessToken: token, expiresAt }
        },
        {
          'Set-Cookie': `lostlink_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`
        }
      );
      return true;
    }

    // 4. POST /api/auth/logout
    if (url === '/api/auth/logout' && req.method === 'POST') {
      sendJson(
        res,
        200,
        { message: 'Logged out successfully.' },
        {
          'Set-Cookie': 'lostlink_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax'
        }
      );
      return true;
    }

    // 5. POST /api/auth/forgot-password
    if (url === '/api/auth/forgot-password' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      if (!isValidEmail(email)) {
        sendJson(res, 400, { error: 'Please enter a valid email address.' });
        return true;
      }

      const users = loadUsers();
      const user = users.find(u => u.email.toLowerCase() === email);

      if (!user) {
        sendJson(res, 200, {
          message: 'If an account exists for that email, a password recovery link has been generated.'
        });
        return true;
      }

      const rawResetToken = crypto.randomBytes(24).toString('hex');
      const resetTokenHash = crypto.createHash('sha256').update(rawResetToken).digest('hex');
      user.resetTokenHash = resetTokenHash;
      user.resetExpiresAt = Date.now() + 15 * 60 * 1000;
      saveUsers(users);

      const resetUrl = `/reset-password?email=${encodeURIComponent(user.email)}&token=${encodeURIComponent(rawResetToken)}`;
      sendJson(res, 200, {
        message: 'Password recovery link generated! In localhost mode, you can use the direct recovery link below.',
        resetUrl
      });
      return true;
    }

    // 6. POST /api/auth/reset-password
    if (url === '/api/auth/reset-password' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const token = String(body.token || '').trim();
      const newPassword = String(body.newPassword || '');

      if (!email || !token) {
        sendJson(res, 400, { error: 'Missing password reset token or email.' });
        return true;
      }
      const pwdError = validatePasswordStrength(newPassword);
      if (pwdError) {
        sendJson(res, 400, { error: pwdError });
        return true;
      }

      const users = loadUsers();
      const user = users.find(u => u.email.toLowerCase() === email);
      const providedHash = crypto.createHash('sha256').update(token).digest('hex');

      if (
        !user ||
        !user.resetTokenHash ||
        !user.resetExpiresAt ||
        Date.now() > user.resetExpiresAt ||
        user.resetTokenHash !== providedHash
      ) {
        sendJson(res, 400, { error: 'This password reset link is invalid or has expired. Please request a new one.' });
        return true;
      }

      const newSalt = crypto.randomBytes(16).toString('hex');
      user.salt = newSalt;
      user.passwordHash = hashPassword(newPassword, newSalt);
      delete user.resetTokenHash;
      delete user.resetExpiresAt;
      saveUsers(users);

      sendJson(res, 200, { message: 'Your password has been reset successfully! You can now log in.' });
      return true;
    }

    // 7. PUT /api/auth/profile (Protected Backend Endpoint — Never allows modifying isAdmin or id)
    if (url === '/api/auth/profile' && req.method === 'PUT') {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'Unauthorized: You must be logged in to update your profile.' });
        return true;
      }

      const body = await readJsonBody(req);
      if (body.isAdmin !== undefined && Boolean(body.isAdmin) !== Boolean(authUser.isAdmin)) {
        sendJson(res, 403, { error: 'Forbidden: Administrator role cannot be modified by clients.' });
        return true;
      }

      const users = loadUsers();
      const idx = users.findIndex(u => u.id === authUser.id);
      if (idx === -1) {
        sendJson(res, 404, { error: 'User account not found.' });
        return true;
      }

      const target = users[idx];
      if (typeof body.name === 'string' && body.name.trim().length >= 2) target.name = body.name.trim();
      if (typeof body.role === 'string') target.role = body.role.trim();
      if (typeof body.department === 'string') target.department = body.department.trim();
      if (typeof body.studentId === 'string') target.studentId = body.studentId.trim();
      if (typeof body.bio === 'string') target.bio = body.bio.trim();
      if (typeof body.phone === 'string') target.phone = body.phone.trim();
      if (typeof body.karmaPoints === 'number') target.karmaPoints = body.karmaPoints;
      if (typeof body.reunionsHelped === 'number') target.reunionsHelped = body.reunionsHelped;

      saveUsers(users);
      sendJson(res, 200, { user: sanitizeUser(target) });
      return true;
    }

    // 8. POST /api/reports/authorize
    if (url === '/api/reports/authorize' && req.method === 'POST') {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'Unauthorized: Please log in to perform this action.' });
        return true;
      }

      const body = await readJsonBody(req);
      const action = String(body.action || '');
      const resourceOwnerId = body.resourceOwnerId ? String(body.resourceOwnerId) : undefined;

      if (action === 'delete_report' && resourceOwnerId && resourceOwnerId !== authUser.id && !authUser.isAdmin) {
        sendJson(res, 403, { error: 'Forbidden: You can only delete reports that you created.' });
        return true;
      }

      sendJson(res, 200, {
        authorized: true,
        userId: authUser.id,
        userName: authUser.name,
        userRole: authUser.role
      });
      return true;
    }

    // ========================================================================
    // OWNERSHIP VERIFICATION & CLAIM MANAGEMENT ENDPOINTS
    // ========================================================================

    // 9. POST /api/verification-details (Finder saves private verification prompts & answers)
    if (url === '/api/verification-details' && req.method === 'POST') {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'Unauthorized: Please log in to save verification details.' });
        return true;
      }

      const body = await readJsonBody(req);
      const itemId = String(body.itemId || '').trim();
      const rawPrompts = Array.isArray(body.privatePrompts) ? body.privatePrompts : [];
      const enhancedVerification = Boolean(body.enhancedVerification);
      const estimatedValue = Number(body.estimatedValue || 0);

      if (!itemId) {
        sendJson(res, 400, { error: 'Item ID is required.' });
        return true;
      }

      const validPrompts: StoredVerificationPrompt[] = rawPrompts
        .map((p: any, i: number) => ({
          id: `vp_${itemId}_${i + 1}`,
          promptLabel: String(p?.promptLabel || '').trim(),
          secretAnswer: String(p?.secretAnswer || '').trim()
        }))
        .filter((p: StoredVerificationPrompt) => p.promptLabel.length >= 3 && p.secretAnswer.length >= 2);

      if (validPrompts.length < 2 || validPrompts.length > 3) {
        sendJson(res, 400, {
          error: 'Please provide 2 or 3 private identifying characteristics (both question prompt and secret answer).'
        });
        return true;
      }

      const allDetails = loadVerificationDetails();
      const existingIdx = allDetails.findIndex(d => d.itemId === itemId);

      if (existingIdx !== -1 && allDetails[existingIdx].finderId !== authUser.id && !authUser.isAdmin) {
        sendJson(res, 403, { error: 'Forbidden: Only the authorized finder can modify verification details for this item.' });
        return true;
      }

      const record: StoredVerificationDetails = {
        itemId,
        finderId: existingIdx !== -1 ? allDetails[existingIdx].finderId : authUser.id,
        privatePrompts: validPrompts,
        enhancedVerification: enhancedVerification || estimatedValue >= HIGH_VALUE_THRESHOLD,
        estimatedValue,
        createdAt: existingIdx !== -1 ? allDetails[existingIdx].createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (existingIdx !== -1) {
        allDetails[existingIdx] = record;
      } else {
        allDetails.push(record);
      }
      saveVerificationDetails(allDetails);

      appendAuditLog({
        actorId: authUser.id,
        actorName: authUser.name,
        actorRole: authUser.isAdmin ? 'admin' : 'finder',
        action: 'saved_private_verification_details',
        itemId,
        reason: `Configured ${validPrompts.length} private verification characteristics`
      });

      sendJson(res, 201, {
        message: 'Private ownership verification details saved securely.',
        itemId,
        promptCount: validPrompts.length,
        enhancedVerification: record.enhancedVerification
      });
      return true;
    }

    // 10. GET /api/verification-details/:itemId/prompts (Safe endpoint for claimants — NEVER returns secretAnswer)
    const promptsMatch = url.match(/^\/api\/verification-details\/([^/]+)\/prompts$/);
    if (promptsMatch && req.method === 'GET') {
      const itemId = decodeURIComponent(promptsMatch[1]);
      const allDetails = loadVerificationDetails();
      const details = allDetails.find(d => d.itemId === itemId);

      if (!details) {
        sendJson(res, 200, {
          hasPrivateDetails: false,
          enhancedVerification: false,
          estimatedValue: 0,
          prompts: []
        });
        return true;
      }

      sendJson(res, 200, {
        hasPrivateDetails: true,
        enhancedVerification: details.enhancedVerification,
        estimatedValue: details.estimatedValue,
        prompts: details.privatePrompts.map(p => ({
          id: p.id,
          promptLabel: p.promptLabel
          // NEVER include secretAnswer here!
        }))
      });
      return true;
    }

    // 11. GET /api/verification-details/:itemId/private (Restricted to Finder or Admin ONLY)
    const privateDetailsMatch = url.match(/^\/api\/verification-details\/([^/]+)\/private$/);
    if (privateDetailsMatch && req.method === 'GET') {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'Unauthorized: Authentication required.' });
        return true;
      }
      const itemId = decodeURIComponent(privateDetailsMatch[1]);
      const allDetails = loadVerificationDetails();
      const details = allDetails.find(d => d.itemId === itemId);

      if (!details) {
        sendJson(res, 404, { error: 'No private verification details configured for this item.' });
        return true;
      }
      if (details.finderId !== authUser.id && !authUser.isAdmin) {
        sendJson(res, 403, { error: 'Forbidden: Only the item finder or an administrator may access private verification details.' });
        return true;
      }

      sendJson(res, 200, { details });
      return true;
    }

    // 12. POST /api/claims (Authenticated Claimant submits a claim)
    if (url === '/api/claims' && req.method === 'POST') {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'Unauthorized: Please sign in to claim a found item.' });
        return true;
      }

      const body = await readJsonBody(req);
      const itemId = String(body.itemId || '').trim();
      const itemTitle = String(body.itemTitle || 'Found Campus Item').trim();
      const itemCategory = String(body.itemCategory || 'Other').trim();
      const itemImageUrl = body.itemImageUrl ? String(body.itemImageUrl) : undefined;
      const itemLocation = String(body.itemLocation || 'Campus').trim();
      const explanation = String(body.explanation || '').trim();
      const truthfulnessConfirmed = Boolean(body.truthfulnessConfirmed);
      const rawAnswers = Array.isArray(body.submittedAnswers) ? body.submittedAnswers : [];
      const evidenceUpload = body.evidenceUpload;

      if (!itemId) {
        sendJson(res, 400, { error: 'Item ID is required.' });
        return true;
      }

      const allDetails = loadVerificationDetails();
      const details = allDetails.find(d => d.itemId === itemId);

      // Determine authoritative finderId (from server verification details or report owner)
      const finderId = details?.finderId || String(body.finderId || '').trim();
      if (!finderId) {
        sendJson(res, 400, { error: 'Finder identity could not be resolved for this item.' });
        return true;
      }

      // Prevent users from claiming their own found-item listing
      if (finderId === authUser.id) {
        sendJson(res, 403, { error: 'You cannot submit an ownership claim for an item that you reported finding.' });
        return true;
      }

      const allClaims = loadClaims();

      // Prevent claims on items that have already been handed over
      if (allClaims.some(c => c.itemId === itemId && c.status === 'handed_over')) {
        sendJson(res, 409, { error: 'This item has already been verified and physically returned to its owner.' });
        return true;
      }

      // Prevent duplicate active claims by the same user for the same item
      const existingActive = allClaims.find(
        c => c.itemId === itemId && c.claimantId === authUser.id && c.status !== 'rejected'
      );
      if (existingActive) {
        sendJson(res, 409, { error: 'You already have an active claim pending for this item.' });
        return true;
      }

      // Rate-limit repeated verification attempts per user + item
      const rateKey = `${authUser.id}:${itemId}`;
      const rateStatus = checkRateLimit(rateKey);
      if (!rateStatus.allowed) {
        appendAuditLog({
          actorId: authUser.id,
          actorName: authUser.name,
          actorRole: 'claimant',
          action: 'rate_limit_exceeded_on_claim',
          itemId,
          reason: `Exceeded ${MAX_VERIFICATION_ATTEMPTS_PER_WINDOW} claim verification attempts within 15 minutes`
        });
        sendJson(res, 429, {
          error: 'Too many verification attempts for this item. Please wait 15 minutes before trying again.'
        });
        return true;
      }

      // Validate required fields
      if (explanation.length < 15) {
        sendJson(res, 400, {
          error: 'Please provide a clear explanation of why this item belongs to you (at least 15 characters).'
        });
        return true;
      }
      if (!truthfulnessConfirmed) {
        sendJson(res, 400, {
          error: 'You must confirm that the ownership information you are submitting is truthful.'
        });
        return true;
      }

      // Validate answers against configured prompts or fallback prompt
      const formattedAnswers: { promptId: string; promptLabel: string; answer: string }[] = [];
      if (details && details.privatePrompts.length > 0) {
        for (const p of details.privatePrompts) {
          const submitted = rawAnswers.find((a: any) => a.promptId === p.id || a.promptLabel === p.promptLabel);
          const ansText = String(submitted?.answer || '').trim();
          if (ansText.length < 2) {
            sendJson(res, 400, {
              error: `Please answer the verification question: "${p.promptLabel}"`
            });
            return true;
          }
          formattedAnswers.push({
            promptId: p.id,
            promptLabel: p.promptLabel,
            answer: ansText
          });
        }
      } else {
        // Fallback review process for items without pre-configured private details
        const fallbackAns = String(rawAnswers[0]?.answer || body.fallbackIdentifyingDetails || '').trim();
        if (fallbackAns.length < 5) {
          sendJson(res, 400, {
            error: 'Please describe at least two non-public identifying marks, contents, or details known only to the owner.'
          });
          return true;
        }
        formattedAnswers.push({
          promptId: 'fallback_1',
          promptLabel: 'Private identifying characteristics & contents (Fallback Verification)',
          answer: fallbackAns
        });
      }

      // Compute supporting automated score (NEVER auto-approves or auto-rejects!)
      let automatedScore = 0;
      let verificationStatus: StoredClaim['verificationStatus'] = 'fallback_manual';

      if (details && details.privatePrompts.length > 0) {
        const breakdown = buildComparisonBreakdown(details, formattedAnswers);
        const total = breakdown.reduce((acc, b) => acc + b.similarity, 0);
        automatedScore = Math.round(total / breakdown.length);
        verificationStatus =
          automatedScore >= 65
            ? 'strong_signal'
            : automatedScore >= 35
            ? 'partially_matched'
            : 'pending';
      }

      // Detect risk flags & escalation conditions
      const riskFlags: string[] = [];
      const escalationReasons: string[] = [];

      // 1. High-value or enhanced-verification item
      const itemEstimatedValue = details?.estimatedValue || Number(body.estimatedValue || 0);
      if (details?.enhancedVerification || itemEstimatedValue >= HIGH_VALUE_THRESHOLD) {
        riskFlags.push('high_value_item');
        escalationReasons.push(`High-value or enhanced-verification item (₹${itemEstimatedValue || HIGH_VALUE_THRESHOLD}+)`);
      }

      // 2. Multiple competing active claims on the same item
      const competingActiveClaims = allClaims.filter(
        c => c.itemId === itemId && c.status !== 'rejected' && c.status !== 'handed_over'
      );
      if (competingActiveClaims.length > 0) {
        riskFlags.push('multiple_competing_claims');
        escalationReasons.push(`Multiple competing claims (${competingActiveClaims.length + 1} active claims for this item)`);
        // Also flag existing competing claims for mandatory admin review
        for (const comp of competingActiveClaims) {
          if (!comp.riskFlags.includes('multiple_competing_claims')) {
            comp.riskFlags.push('multiple_competing_claims');
          }
          comp.requiresAdminReview = true;
          comp.escalationReason = comp.escalationReason
            ? `${comp.escalationReason}; Competing claim submitted`
            : 'Multiple competing claims detected for this item';
          if (comp.status === 'finder_review_required' || comp.status === 'submitted') {
            comp.status = 'administrator_review_required';
          }
        }
      }

      // 3. Repeated verification attempts / prior rejected claims by this user
      const priorRejectedCount = allClaims.filter(
        c => c.itemId === itemId && c.claimantId === authUser.id && c.status === 'rejected'
      ).length;
      if (priorRejectedCount > 0 || rateStatus.attemptsInWindow >= 2) {
        riskFlags.push('repeated_verification_attempts');
        escalationReasons.push('Repeated verification attempts detected for this item');
      }

      // 4. Low automated similarity warning (flagged for reviewer awareness, NOT auto-rejected)
      if (details && details.privatePrompts.length > 0 && automatedScore < 35) {
        riskFlags.push('low_answer_similarity');
      }

      const requiresAdminReview =
        riskFlags.includes('high_value_item') ||
        riskFlags.includes('multiple_competing_claims') ||
        riskFlags.includes('repeated_verification_attempts');

      const initialStatus: StoredClaim['status'] = requiresAdminReview
        ? 'administrator_review_required'
        : 'finder_review_required';

      const newClaim: StoredClaim = {
        id: `clm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        itemId,
        itemTitle,
        itemCategory,
        itemImageUrl,
        itemLocation,
        finderId,
        claimantId: authUser.id,
        claimantName: authUser.name,
        claimantEmail: authUser.email,
        explanation,
        submittedAnswers: formattedAnswers,
        truthfulnessConfirmed: true,
        status: initialStatus,
        verificationStatus,
        automatedScore,
        hasPrivateDetailsOnItem: Boolean(details && details.privatePrompts.length > 0),
        riskFlags,
        requiresAdminReview,
        escalationReason: escalationReasons.length > 0 ? escalationReasons.join(' • ') : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      allClaims.unshift(newClaim);
      saveClaims(allClaims);

      // Save optional private supporting evidence if provided
      const allEvidence = loadEvidence();
      if (evidenceUpload && evidenceUpload.fileName) {
        const mimeType = String(evidenceUpload.mimeType || 'application/octet-stream');
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'];
        if (!allowedTypes.includes(mimeType)) {
          sendJson(res, 400, { error: 'Unsupported evidence file type. Allowed: JPG, PNG, WebP, PDF, TXT.' });
          return true;
        }
        const dataUrl = String(evidenceUpload.dataUrl || '');
        const sizeBytes = Number(evidenceUpload.sizeBytes || Buffer.byteLength(dataUrl, 'utf-8'));
        if (sizeBytes > 4 * 1024 * 1024) {
          sendJson(res, 400, { error: 'Evidence file exceeds the 4MB size limit.' });
          return true;
        }
        const evId = `ev_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        const privatePath = path.join(PRIVATE_UPLOADS_DIR, `${evId}_${ path.basename(String(evidenceUpload.fileName)) }`);
        if (dataUrl) {
          fs.writeFileSync(privatePath, dataUrl, 'utf-8');
        }
        allEvidence.push({
          id: evId,
          claimId: newClaim.id,
          uploadingUserId: authUser.id,
          uploaderName: authUser.name,
          fileName: String(evidenceUpload.fileName),
          mimeType,
          sizeBytes,
          privateStoragePath: privatePath,
          dataUrl,
          description: String(evidenceUpload.description || 'Initial supporting ownership evidence'),
          createdAt: new Date().toISOString()
        });
        saveEvidence(allEvidence);
      }

      appendAuditLog({
        actorId: authUser.id,
        actorName: authUser.name,
        actorRole: 'claimant',
        action: 'claim_submitted',
        claimId: newClaim.id,
        itemId,
        previousStatus: 'none',
        newStatus: initialStatus,
        reason: requiresAdminReview
          ? `Escalated on submission: ${newClaim.escalationReason}`
          : 'Routed to item finder for ownership verification review'
      });

      sendJson(res, 201, {
        message: requiresAdminReview
          ? 'Claim submitted and routed for enhanced Administrator & Finder verification.'
          : 'Claim submitted! The finder will review your ownership details.',
        claim: formatClaimForViewer(newClaim, 'claimant', allDetails, allEvidence, allClaims)
      });
      return true;
    }

    // 13. GET /api/claims/my (Returns user's own submitted claims + claims on items the user found)
    if (url === '/api/claims/my' && req.method === 'GET') {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'Unauthorized: Please sign in to view your claims.' });
        return true;
      }

      const allClaims = loadClaims();
      const allDetails = loadVerificationDetails();
      const allEvidence = loadEvidence();

      const mySubmittedClaims = allClaims
        .filter(c => c.claimantId === authUser.id)
        .map(c => formatClaimForViewer(c, 'claimant', allDetails, allEvidence, allClaims));

      const incomingFinderClaims = allClaims
        .filter(c => c.finderId === authUser.id)
        .map(c => formatClaimForViewer(c, 'finder', allDetails, allEvidence, allClaims));

      sendJson(res, 200, {
        mySubmittedClaims,
        incomingFinderClaims
      });
      return true;
    }

    // 14. POST /api/claims/:claimId/evidence (Claimant uploads additional supporting evidence)
    const addEvidenceMatch = url.match(/^\/api\/claims\/([^/]+)\/evidence$/);
    if (addEvidenceMatch && req.method === 'POST') {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'Unauthorized: Please sign in to upload evidence.' });
        return true;
      }

      const claimId = decodeURIComponent(addEvidenceMatch[1]);
      const allClaims = loadClaims();
      const claim = allClaims.find(c => c.id === claimId);
      if (!claim) {
        sendJson(res, 404, { error: 'Claim not found.' });
        return true;
      }
      if (claim.claimantId !== authUser.id) {
        sendJson(res, 403, { error: 'Forbidden: You can only upload evidence to your own claim.' });
        return true;
      }

      const body = await readJsonBody(req);
      const description = String(body.description || '').trim();
      const fileName = String(body.fileName || 'supporting-note.txt').trim();
      const mimeType = String(body.mimeType || 'text/plain').trim();
      const dataUrl = String(body.dataUrl || '');

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'];
      if (!allowedTypes.includes(mimeType)) {
        sendJson(res, 400, { error: 'Unsupported evidence file type. Allowed: JPG, PNG, WebP, PDF, TXT.' });
        return true;
      }

      const sizeBytes = Number(body.sizeBytes || Buffer.byteLength(dataUrl || description, 'utf-8'));
      if (sizeBytes > 4 * 1024 * 1024) {
        sendJson(res, 400, { error: 'Evidence file exceeds 4MB limit.' });
        return true;
      }

      const evId = `ev_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const privatePath = path.join(PRIVATE_UPLOADS_DIR, `${evId}_${path.basename(fileName)}`);
      fs.writeFileSync(privatePath, dataUrl || description, 'utf-8');

      const allEvidence = loadEvidence();
      allEvidence.push({
        id: evId,
        claimId: claim.id,
        uploadingUserId: authUser.id,
        uploaderName: authUser.name,
        fileName,
        mimeType,
        sizeBytes,
        privateStoragePath: privatePath,
        dataUrl: dataUrl || undefined,
        description: description || 'Additional supporting evidence',
        createdAt: new Date().toISOString()
      });
      saveEvidence(allEvidence);

      const prevStatus = claim.status;
      if (claim.status === 'additional_evidence_required') {
        claim.status = claim.requiresAdminReview
          ? 'administrator_review_required'
          : 'finder_review_required';
        claim.updatedAt = new Date().toISOString();
        saveClaims(allClaims);
      }

      appendAuditLog({
        actorId: authUser.id,
        actorName: authUser.name,
        actorRole: 'claimant',
        action: 'additional_evidence_uploaded',
        claimId: claim.id,
        itemId: claim.itemId,
        previousStatus: prevStatus,
        newStatus: claim.status,
        reason: description || fileName
      });

      const allDetails = loadVerificationDetails();
      sendJson(res, 201, {
        message: 'Supporting evidence uploaded privately.',
        claim: formatClaimForViewer(claim, 'claimant', allDetails, allEvidence, allClaims)
      });
      return true;
    }

    // 15. GET /api/claims/:claimId/evidence/:evidenceId (Authorized private evidence access ONLY)
    const getEvidenceMatch = url.match(/^\/api\/claims\/([^/]+)\/evidence\/([^/]+)$/);
    if (getEvidenceMatch && req.method === 'GET') {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'Unauthorized: Authentication required to view private evidence.' });
        return true;
      }

      const claimId = decodeURIComponent(getEvidenceMatch[1]);
      const evidenceId = decodeURIComponent(getEvidenceMatch[2]);
      const allClaims = loadClaims();
      const claim = allClaims.find(c => c.id === claimId);
      if (!claim) {
        sendJson(res, 404, { error: 'Claim not found.' });
        return true;
      }

      // Strictly enforce: only the claimant, the item's finder, or an administrator can access evidence
      if (claim.claimantId !== authUser.id && claim.finderId !== authUser.id && !authUser.isAdmin) {
        sendJson(res, 403, { error: 'Forbidden: Private claim evidence is restricted to authorized reviewers.' });
        return true;
      }

      const allEvidence = loadEvidence();
      const ev = allEvidence.find(e => e.id === evidenceId && e.claimId === claimId);
      if (!ev) {
        sendJson(res, 404, { error: 'Evidence record not found.' });
        return true;
      }

      sendJson(res, 200, {
        evidence: {
          id: ev.id,
          claimId: ev.claimId,
          fileName: ev.fileName,
          mimeType: ev.mimeType,
          description: ev.description,
          dataUrl: ev.dataUrl || null,
          createdAt: ev.createdAt
        }
      });
      return true;
    }

    // 16. POST /api/claims/:claimId/finder-decision (Finder reviews claim for their own item)
    const finderDecisionMatch = url.match(/^\/api\/claims\/([^/]+)\/finder-decision$/);
    if (finderDecisionMatch && req.method === 'POST') {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'Unauthorized: Please sign in.' });
        return true;
      }

      const claimId = decodeURIComponent(finderDecisionMatch[1]);
      const allClaims = loadClaims();
      const claim = allClaims.find(c => c.id === claimId);
      if (!claim) {
        sendJson(res, 404, { error: 'Claim not found.' });
        return true;
      }

      // Strictly enforce that ONLY the item's finder can submit a finder decision
      if (claim.finderId !== authUser.id) {
        sendJson(res, 403, { error: 'Forbidden: You can only review claims for items that you reported finding.' });
        return true;
      }

      if (claim.status === 'handed_over') {
        sendJson(res, 409, { error: 'This claim has already completed physical handover.' });
        return true;
      }

      const body = await readJsonBody(req);
      const decision = String(body.decision || '').trim() as 'approved' | 'request_evidence' | 'rejected' | 'escalated';
      const reason = String(body.reason || '').trim();
      const attemptBypassAdmin = Boolean(body.bypassAdminReview);

      if (!['approved', 'request_evidence', 'rejected', 'escalated'].includes(decision)) {
        sendJson(res, 400, { error: 'Invalid finder decision.' });
        return true;
      }
      if (reason.length < 3) {
        sendJson(res, 400, { error: 'Please provide a brief reason or review note for your decision.' });
        return true;
      }

      // CRITICAL SECURITY RULE: A high-value or suspicious claim MUST NOT bypass administrator review
      if (decision === 'approved' && claim.requiresAdminReview) {
        if (attemptBypassAdmin) {
          sendJson(res, 403, {
            error: 'Forbidden: High-value or risk-flagged claims require mandatory Administrator approval and cannot be bypassed by the finder.'
          });
          return true;
        }
        const prevStatus = claim.status;
        claim.finderDecision = {
          decision: 'approved',
          reason,
          reviewerId: authUser.id,
          reviewerName: authUser.name,
          timestamp: new Date().toISOString()
        };
        claim.status = 'administrator_review_required';
        claim.updatedAt = new Date().toISOString();
        saveClaims(allClaims);

        appendAuditLog({
          actorId: authUser.id,
          actorName: authUser.name,
          actorRole: 'finder',
          action: 'finder_endorsed_escalated_to_admin',
          claimId: claim.id,
          itemId: claim.itemId,
          previousStatus: prevStatus,
          newStatus: claim.status,
          reason: `Finder endorsed claim (${reason}); awaiting mandatory Administrator approval`
        });

        const allDetails = loadVerificationDetails();
        const allEvidence = loadEvidence();
        sendJson(res, 200, {
          message: 'Your positive endorsement has been recorded! Because this claim is flagged for high-value/risk protection, it now awaits final Administrator approval.',
          requiresAdminApproval: true,
          claim: formatClaimForViewer(claim, 'finder', allDetails, allEvidence, allClaims)
        });
        return true;
      }

      const prevStatus = claim.status;

      if (decision === 'approved') {
        // Atomic check: prevent approving multiple claims for the same item
        const conflictingApproved = allClaims.find(
          c =>
            c.itemId === claim.itemId &&
            c.id !== claim.id &&
            (c.status === 'approved_for_handover' || c.status === 'handed_over')
        );
        if (conflictingApproved) {
          sendJson(res, 409, {
            error: 'Conflict: Another claim for this item is already approved for handover or handed over.'
          });
          return true;
        }
        claim.status = 'approved_for_handover';
        claim.verificationStatus = 'verified';
      } else if (decision === 'request_evidence') {
        claim.status = 'additional_evidence_required';
      } else if (decision === 'rejected') {
        claim.status = 'rejected';
        claim.verificationStatus = 'failed';
      } else if (decision === 'escalated') {
        claim.status = 'administrator_review_required';
        claim.requiresAdminReview = true;
        if (!claim.riskFlags.includes('finder_escalated')) {
          claim.riskFlags.push('finder_escalated');
        }
        claim.escalationReason = claim.escalationReason
          ? `${claim.escalationReason} • Finder escalated: ${reason}`
          : `Finder flagged as suspicious: ${reason}`;
      }

      claim.finderDecision = {
        decision,
        reason,
        reviewerId: authUser.id,
        reviewerName: authUser.name,
        timestamp: new Date().toISOString()
      };
      claim.updatedAt = new Date().toISOString();
      saveClaims(allClaims);

      appendAuditLog({
        actorId: authUser.id,
        actorName: authUser.name,
        actorRole: 'finder',
        action: `finder_${decision}`,
        claimId: claim.id,
        itemId: claim.itemId,
        previousStatus: prevStatus,
        newStatus: claim.status,
        reason
      });

      const allDetails = loadVerificationDetails();
      const allEvidence = loadEvidence();
      sendJson(res, 200, {
        message: `Claim status updated to ${claim.status.replace(/_/g, ' ')}.`,
        claim: formatClaimForViewer(claim, 'finder', allDetails, allEvidence, allClaims)
      });
      return true;
    }

    // 17. GET /api/admin/claims (Strictly enforced server-side Admin endpoint)
    if (url === '/api/admin/claims' && req.method === 'GET') {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'Unauthorized: Please sign in.' });
        return true;
      }
      if (!authUser.isAdmin) {
        sendJson(res, 403, { error: 'Forbidden: Administrator privileges are required to access the Admin Review Queue.' });
        return true;
      }

      const allClaims = loadClaims();
      const allDetails = loadVerificationDetails();
      const allEvidence = loadEvidence();
      const auditLogs = loadAuditLogs();

      const formattedClaims = allClaims.map(c =>
        formatClaimForViewer(c, 'admin', allDetails, allEvidence, allClaims)
      );

      sendJson(res, 200, {
        claims: formattedClaims,
        auditLogs
      });
      return true;
    }

    // 18. POST /api/admin/claims/:claimId/decision (Strictly enforced server-side Admin decision)
    const adminDecisionMatch = url.match(/^\/api\/admin\/claims\/([^/]+)\/decision$/);
    if (adminDecisionMatch && req.method === 'POST') {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'Unauthorized: Please sign in.' });
        return true;
      }
      if (!authUser.isAdmin) {
        sendJson(res, 403, { error: 'Forbidden: Only authorized administrators can perform this action.' });
        return true;
      }

      const claimId = decodeURIComponent(adminDecisionMatch[1]);
      const allClaims = loadClaims();
      const claim = allClaims.find(c => c.id === claimId);
      if (!claim) {
        sendJson(res, 404, { error: 'Claim not found.' });
        return true;
      }
      if (claim.status === 'handed_over') {
        sendJson(res, 409, { error: 'This claim has already completed physical handover.' });
        return true;
      }

      const body = await readJsonBody(req);
      const decision = String(body.decision || '').trim() as
        | 'approved'
        | 'request_evidence'
        | 'rejected'
        | 'returned_to_finder';
      const reason = String(body.reason || '').trim();

      if (!['approved', 'request_evidence', 'rejected', 'returned_to_finder'].includes(decision)) {
        sendJson(res, 400, { error: 'Invalid administrator decision.' });
        return true;
      }
      if (reason.length < 3) {
        sendJson(res, 400, { error: 'Please provide an administrator decision reason for the audit log.' });
        return true;
      }

      const prevStatus = claim.status;

      if (decision === 'approved') {
        const conflictingApproved = allClaims.find(
          c =>
            c.itemId === claim.itemId &&
            c.id !== claim.id &&
            (c.status === 'approved_for_handover' || c.status === 'handed_over')
        );
        if (conflictingApproved) {
          sendJson(res, 409, {
            error: 'Conflict: Another claim for this item is already approved for handover or handed over.'
          });
          return true;
        }
        claim.status = 'approved_for_handover';
        claim.verificationStatus = 'verified';
      } else if (decision === 'request_evidence') {
        claim.status = 'additional_evidence_required';
      } else if (decision === 'rejected') {
        claim.status = 'rejected';
        claim.verificationStatus = 'failed';
      } else if (decision === 'returned_to_finder') {
        claim.status = 'finder_review_required';
        claim.requiresAdminReview = false;
      }

      claim.adminDecision = {
        decision,
        reason,
        reviewerId: authUser.id,
        reviewerName: authUser.name,
        timestamp: new Date().toISOString()
      };
      claim.updatedAt = new Date().toISOString();
      saveClaims(allClaims);

      appendAuditLog({
        actorId: authUser.id,
        actorName: authUser.name,
        actorRole: 'admin',
        action: `admin_${decision}`,
        claimId: claim.id,
        itemId: claim.itemId,
        previousStatus: prevStatus,
        newStatus: claim.status,
        reason
      });

      const allDetails = loadVerificationDetails();
      const allEvidence = loadEvidence();
      sendJson(res, 200, {
        message: `Administrator decision recorded (${decision.replace(/_/g, ' ')}).`,
        claim: formatClaimForViewer(claim, 'admin', allDetails, allEvidence, allClaims)
      });
      return true;
    }

    // 19. POST /api/claims/:claimId/handover (Physical handover confirmation — separate from approval!)
    const handoverMatch = url.match(/^\/api\/claims\/([^/]+)\/handover$/);
    if (handoverMatch && req.method === 'POST') {
      const authUser = getAuthenticatedUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'Unauthorized: Please sign in.' });
        return true;
      }

      const claimId = decodeURIComponent(handoverMatch[1]);
      const allClaims = loadClaims();
      const claim = allClaims.find(c => c.id === claimId);
      if (!claim) {
        sendJson(res, 404, { error: 'Claim not found.' });
        return true;
      }

      // Only the authorized item finder (or an admin) can confirm physical handover. Claimants CANNOT!
      if (claim.finderId !== authUser.id && !authUser.isAdmin) {
        sendJson(res, 403, {
          error: 'Forbidden: Only the authorized finder or an administrator can confirm physical handover of the item.'
        });
        return true;
      }

      // Must be approved_for_handover first!
      if (claim.status !== 'approved_for_handover') {
        sendJson(res, 400, {
          error: `Cannot confirm handover: claim must be in 'approved_for_handover' status first (current: '${claim.status}').`
        });
        return true;
      }

      // Atomic check: ensure no other claim for this item has already completed handover
      if (allClaims.some(c => c.itemId === claim.itemId && c.status === 'handed_over')) {
        sendJson(res, 409, {
          error: 'Conflict: Physical handover has already been completed for this item.'
        });
        return true;
      }

      const body = await readJsonBody(req);
      const handoverNotes = String(body.handoverNotes || 'Handed over in person on campus after ID check.').trim();

      const prevStatus = claim.status;
      claim.status = 'handed_over';
      claim.handoverConfirmation = {
        confirmedById: authUser.id,
        confirmedByName: authUser.name,
        handoverNotes,
        timestamp: new Date().toISOString()
      };
      claim.updatedAt = new Date().toISOString();

      // Automatically close any other non-rejected competing claims for the same item
      allClaims.forEach(other => {
        if (other.itemId === claim.itemId && other.id !== claim.id && other.status !== 'rejected') {
          const old = other.status;
          other.status = 'rejected';
          other.verificationStatus = 'failed';
          other.updatedAt = new Date().toISOString();
          appendAuditLog({
            actorId: authUser.id,
            actorName: authUser.name,
            actorRole: authUser.isAdmin ? 'admin' : 'finder',
            action: 'competing_claim_closed_on_handover',
            claimId: other.id,
            itemId: claim.itemId,
            previousStatus: old,
            newStatus: 'rejected',
            reason: `Item physically handed over to verified claimant (${claim.id})`
          });
        }
      });

      saveClaims(allClaims);

      appendAuditLog({
        actorId: authUser.id,
        actorName: authUser.name,
        actorRole: authUser.isAdmin ? 'admin' : 'finder',
        action: 'physical_handover_confirmed',
        claimId: claim.id,
        itemId: claim.itemId,
        previousStatus: prevStatus,
        newStatus: 'handed_over',
        reason: handoverNotes
      });

      const allDetails = loadVerificationDetails();
      const allEvidence = loadEvidence();
      sendJson(res, 200, {
        message: 'Physical handover confirmed! The item is now marked as returned.',
        itemStatus: 'resolved',
        claim: formatClaimForViewer(claim, authUser.isAdmin ? 'admin' : 'finder', allDetails, allEvidence, allClaims)
      });
      return true;
    }

    sendJson(res, 404, { error: 'API endpoint not found' });
    return true;
  } catch (err: any) {
    sendJson(res, 500, { error: err?.message || 'Internal server error' });
    return true;
  }
}

export function lostLinkAuthPlugin(): Plugin {
  return {
    name: 'lostlink-auth-backend',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handleApiRequest(req, res);
        if (!handled) next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handleApiRequest(req, res);
        if (!handled) next();
      });
    }
  };
}

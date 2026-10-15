import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePin, validateClue } from '../src/lib/verification.ts';

// In-memory simulation of Supabase PostgreSQL schema with RLS and pgcrypto
interface MockReportRow {
  id: string;
  user_id: string;
  type: 'lost' | 'found';
  title: string;
  category: string;
  description: string;
  location: string;
  date: string;
  status: 'lost' | 'found' | 'resolved';
  has_private_verification: boolean;
  created_at: string;
}

interface MockVerificationRow {
  report_id: string;
  owner_id: string;
  clue: string;
  pin_hash: string;
  updated_at: string;
}

interface MockAttemptRow {
  report_id: string;
  claimant_id: string;
  failed_attempts: number;
  locked_until: number | null;
  status: 'active' | 'verified' | 'locked';
}

// Simple deterministic bcrypt-like salt+hash simulator for test assertions
function simulateHashPin(pin: string, salt: string = 'bf_salt_10'): string {
  return `$2a$10$${salt}$${Buffer.from(pin + salt).toString('base64')}`;
}

function simulateVerifyPin(submittedPin: string, storedHash: string, salt: string = 'bf_salt_10'): boolean {
  const expectedHash = simulateHashPin(submittedPin, salt);
  return expectedHash === storedHash;
}

class MockSupabaseDatabase {
  reports: Map<string, MockReportRow> = new Map();
  verifications: Map<string, MockVerificationRow> = new Map();
  attempts: Map<string, MockAttemptRow> = new Map();

  // Create report with RLS simulation
  createReport(callerId: string | null, report: Omit<MockReportRow, 'id' | 'user_id' | 'created_at'>): { success: boolean; id?: string; error?: string } {
    if (!callerId) {
      return { success: false, error: 'Authentication required' };
    }
    const id = `rep_${Math.random().toString(36).slice(2, 9)}`;
    const row: MockReportRow = {
      ...report,
      id,
      user_id: callerId,
      created_at: new Date().toISOString()
    };
    this.reports.set(id, row);
    return { success: true, id };
  }

  // Set report verification (set_report_verification_details RPC)
  setReportVerification(callerId: string | null, reportId: string, clue: string, pin?: string): { success: boolean; error?: string } {
    if (!callerId) {
      return { success: false, error: 'Authentication required' };
    }
    const report = this.reports.get(reportId);
    if (!report) {
      return { success: false, error: 'Report not found' };
    }
    if (report.user_id !== callerId) {
      return { success: false, error: 'Permission denied: caller is not the owner' };
    }
    if (report.status === 'resolved') {
      return { success: false, error: 'Resolved reports cannot be modified' };
    }

    const clueVal = validateClue(clue);
    if (!clueVal.valid) {
      return { success: false, error: clueVal.error };
    }

    let pinHash = this.verifications.get(reportId)?.pin_hash;
    if (pin !== undefined && pin !== '') {
      const pinVal = validatePin(pin);
      if (!pinVal.valid) {
        return { success: false, error: pinVal.error };
      }
      pinHash = simulateHashPin(pin);
    }

    if (!pinHash) {
      return { success: false, error: 'Secret PIN is required when setting up verification for the first time' };
    }

    this.verifications.set(reportId, {
      report_id: reportId,
      owner_id: callerId,
      clue: clue.trim(),
      pin_hash: pinHash,
      updated_at: new Date().toISOString()
    });

    report.has_private_verification = true;
    return { success: true };
  }

  // Public report query (simulates select * from reports)
  getPublicReports(): Omit<MockReportRow, 'pin_hash' | 'clue'>[] {
    return Array.from(this.reports.values()).map(r => ({
      id: r.id,
      user_id: r.user_id,
      type: r.type,
      title: r.title,
      category: r.category,
      description: r.description,
      location: r.location,
      date: r.date,
      status: r.status,
      has_private_verification: r.has_private_verification,
      created_at: r.created_at
    }));
  }

  // Owner private details query (get_owner_verification_details RPC)
  getOwnerVerificationDetails(callerId: string | null, reportId: string): { success: boolean; configured: boolean; clue?: string; error?: string } {
    if (!callerId) {
      return { success: false, configured: false, error: 'Authentication required' };
    }
    const report = this.reports.get(reportId);
    if (!report || report.user_id !== callerId) {
      return { success: false, configured: false, error: 'Permission denied' };
    }

    const verif = this.verifications.get(reportId);
    if (!verif) {
      return { success: true, configured: false };
    }

    // Explicitly note: pin_hash is NEVER returned
    return {
      success: true,
      configured: true,
      clue: verif.clue
    };
  }

  // Direct SELECT simulation on report_ownership_verifications with RLS
  directSelectVerification(callerId: string | null, reportId: string): MockVerificationRow | null {
    if (!callerId) return null;
    const row = this.verifications.get(reportId);
    if (!row) return null;
    // RLS policy: USING (auth.uid() = owner_id)
    if (row.owner_id !== callerId) return null;
    return row;
  }

  // Authoritative verify_ownership RPC
  verifyOwnership(callerId: string | null, reportId: string, submittedClue: string, submittedPin: string): {
    success: boolean;
    verified: boolean;
    message: string;
    locked?: boolean;
    remainingAttempts?: number;
    error?: string;
  } {
    if (!callerId) {
      return { success: false, verified: false, error: 'Authentication required to verify ownership.' };
    }

    const report = this.reports.get(reportId);
    if (!report) {
      return { success: false, verified: false, error: 'Target report not found.' };
    }

    if (report.status === 'resolved') {
      return { success: false, verified: false, error: 'This report is already resolved.' };
    }

    if (report.user_id === callerId) {
      return { success: false, verified: false, error: 'You are the registered creator of this report.' };
    }

    const verif = this.verifications.get(reportId);
    if (!verif) {
      return { success: false, verified: false, error: 'No private ownership verification configured.' };
    }

    const attemptKey = `${reportId}_${callerId}`;
    let attempt = this.attempts.get(attemptKey);
    const now = Date.now();

    if (attempt && attempt.locked_until && attempt.locked_until > now) {
      return {
        success: false,
        verified: false,
        locked: true,
        message: 'Too many verification attempts for this item. Please wait before trying again.'
      };
    }

    if (!attempt || (attempt.locked_until && attempt.locked_until <= now)) {
      attempt = {
        report_id: reportId,
        claimant_id: callerId,
        failed_attempts: 0,
        locked_until: null,
        status: 'active'
      };
      this.attempts.set(attemptKey, attempt);
    }

    const pinMatches = simulateVerifyPin(submittedPin, verif.pin_hash);
    const normSubmitted = submittedClue.trim().toLowerCase();
    const normStored = verif.clue.trim().toLowerCase();
    const clueMatches = normSubmitted === normStored || (normSubmitted.length > 0 && normStored.includes(normSubmitted));

    if (pinMatches && clueMatches) {
      attempt.failed_attempts = 0;
      attempt.status = 'verified';
      attempt.locked_until = null;
      return {
        success: true,
        verified: true,
        message: 'Ownership verification successful. The reported owner has been alerted.'
      };
    } else {
      attempt.failed_attempts += 1;
      if (attempt.failed_attempts >= 5) {
        attempt.locked_until = now + 15 * 60 * 1000;
        attempt.status = 'locked';
        return {
          success: false,
          verified: false,
          locked: true,
          message: 'Too many failed verification attempts. This item is temporarily locked for 15 minutes.'
        };
      }

      return {
        success: true,
        verified: false,
        message: 'Verification failed. The submitted private details did not match our records.',
        remainingAttempts: 5 - attempt.failed_attempts
      };
    }
  }

  // Delete report with cascading foreign key deletion
  deleteReport(callerId: string | null, reportId: string): { success: boolean; error?: string } {
    if (!callerId) return { success: false, error: 'Authentication required' };
    const report = this.reports.get(reportId);
    if (!report || report.user_id !== callerId) {
      return { success: false, error: 'Permission denied or report not found' };
    }

    this.reports.delete(reportId);
    // ON DELETE CASCADE simulation
    this.verifications.delete(reportId);
    for (const [key, att] of this.attempts.entries()) {
      if (att.report_id === reportId) {
        this.attempts.delete(key);
      }
    }
    return { success: true };
  }
}

// -----------------------------------------------------------------------------
// Test Suite: Ownership Verification & Lifecycle Invariants
// -----------------------------------------------------------------------------

test('1. Valid report saves public fields and private verification details separately', () => {
  const db = new MockSupabaseDatabase();
  const ownerId = 'student_owner_1';

  const reportResult = db.createReport(ownerId, {
    title: 'Silver Dell XPS 15',
    category: 'Electronics',
    description: 'Left in library study booth 4',
    location: 'Main Library 2nd Floor',
    date: '2026-10-15',
    type: 'lost',
    status: 'lost',
    has_private_verification: false
  });

  assert.ok(reportResult.success);
  assert.ok(reportResult.id);

  const verifResult = db.setReportVerification(
    ownerId,
    reportResult.id,
    'Custom Linux penguin sticker on the bottom casing near exhaust',
    '729481'
  );

  assert.ok(verifResult.success);
  const reportRow = db.reports.get(reportResult.id);
  assert.strictEqual(reportRow?.has_private_verification, true);

  const privateRow = db.verifications.get(reportResult.id);
  assert.ok(privateRow);
  assert.strictEqual(privateRow.clue, 'Custom Linux penguin sticker on the bottom casing near exhaust');
  // Never stored in plaintext
  assert.notStrictEqual(privateRow.pin_hash, '729481');
  assert.ok(privateRow.pin_hash.startsWith('$2a$10$'));
});

test('2. Public report response never contains private clue or PIN hash', () => {
  const db = new MockSupabaseDatabase();
  const ownerId = 'student_owner_1';

  const reportResult = db.createReport(ownerId, {
    title: 'Blue Fjallraven Backpack',
    category: 'Bags',
    description: 'Navy blue Kanken backpack',
    location: 'Student Union Cafeteria',
    date: '2026-10-15',
    type: 'lost',
    status: 'lost',
    has_private_verification: true
  });

  db.setReportVerification(ownerId, reportResult.id!, 'Contains silver Montblanc pen with initials E.V.', '994821');

  const publicReports = db.getPublicReports();
  const target = publicReports.find(r => r.id === reportResult.id);

  assert.ok(target);
  assert.strictEqual('pin_hash' in target, false);
  assert.strictEqual('clue' in target, false);
  assert.strictEqual(target.has_private_verification, true);
});

test('3. Unauthenticated user cannot create or verify a claim', () => {
  const db = new MockSupabaseDatabase();

  const createAttempt = db.createReport(null, {
    title: 'AirPods Pro Gen 2',
    category: 'Electronics',
    description: 'White charging case',
    location: 'Sports Complex gym',
    date: '2026-10-15',
    type: 'lost',
    status: 'lost',
    has_private_verification: false
  });
  assert.strictEqual(createAttempt.success, false);

  const verifyAttempt = db.verifyOwnership(null, 'any_id', 'Some clue', '123456');
  assert.strictEqual(verifyAttempt.success, false);
  assert.strictEqual(verifyAttempt.verified, false);
});

test('4. A different authenticated user cannot read the owner private details', () => {
  const db = new MockSupabaseDatabase();
  const ownerId = 'student_owner_1';
  const otherUserId = 'student_intruder_2';

  const reportResult = db.createReport(ownerId, {
    title: 'Scientific Calculator TI-84',
    category: 'Electronics',
    description: 'Black Texas Instruments calculator',
    location: 'Science Building Room 204',
    date: '2026-10-15',
    type: 'lost',
    status: 'lost',
    has_private_verification: true
  });

  db.setReportVerification(ownerId, reportResult.id!, 'Small yellow smiley sticker inside the slide cover', '482103');

  // Direct SELECT simulation: RLS blocks other user
  const directRead = db.directSelectVerification(otherUserId, reportResult.id!);
  assert.strictEqual(directRead, null);

  // Secure RPC simulation: checks auth.uid() = owner_id
  const rpcRead = db.getOwnerVerificationDetails(otherUserId, reportResult.id!);
  assert.strictEqual(rpcRead.success, false);
  assert.strictEqual(rpcRead.clue, undefined);
});

test('5. Correct clue and PIN produce a successful verification result', () => {
  const db = new MockSupabaseDatabase();
  const ownerId = 'student_owner_1';
  const finderId = 'student_finder_3';

  const reportResult = db.createReport(ownerId, {
    title: 'Sony WH-1000XM5 Headphones',
    category: 'Electronics',
    description: 'Black noise cancelling over-ear headphones',
    location: 'Main Library quiet lounge',
    date: '2026-10-15',
    type: 'lost',
    status: 'lost',
    has_private_verification: true
  });

  db.setReportVerification(ownerId, reportResult.id!, 'Scratch on left ear cup near power toggle', '830192');

  const verifyResult = db.verifyOwnership(finderId, reportResult.id!, 'Scratch on left ear cup near power toggle', '830192');

  assert.ok(verifyResult.success);
  assert.strictEqual(verifyResult.verified, true);
  assert.strictEqual(verifyResult.message.includes('successful'), true);
});

test('6. Incorrect clue or PIN produces a generic failure without leaking which was wrong', () => {
  const db = new MockSupabaseDatabase();
  const ownerId = 'student_owner_1';
  const claimantId = 'student_claimant_4';

  const reportResult = db.createReport(ownerId, {
    title: 'Kindle Paperwhite',
    category: 'Electronics',
    description: 'Dark green fabric cover',
    location: 'Hostel Quad Lawn',
    date: '2026-10-15',
    type: 'lost',
    status: 'lost',
    has_private_verification: true
  });

  db.setReportVerification(ownerId, reportResult.id!, 'Lockscreen is a photo of Mount Fuji at sunrise', '617283');

  // Case A: Correct clue, wrong PIN
  const resA = db.verifyOwnership(claimantId, reportResult.id!, 'Lockscreen is a photo of Mount Fuji at sunrise', '000000');
  assert.ok(resA.success);
  assert.strictEqual(resA.verified, false);
  assert.strictEqual(resA.message, 'Verification failed. The submitted private details did not match our records.');
  assert.strictEqual('pin_error' in resA, false);

  // Case B: Wrong clue, correct PIN
  const resB = db.verifyOwnership(claimantId, reportResult.id!, 'Totally wrong clue text', '617283');
  assert.ok(resB.success);
  assert.strictEqual(resB.verified, false);
  assert.strictEqual(resB.message, 'Verification failed. The submitted private details did not match our records.');
});

test('7. Repeated failed verification attempts trigger rate limiting lockout', () => {
  const db = new MockSupabaseDatabase();
  const ownerId = 'student_owner_1';
  const attackerId = 'malicious_claimant_5';

  const reportResult = db.createReport(ownerId, {
    title: 'Apple iPad Pro 11-inch',
    category: 'Electronics',
    description: 'Space Gray with Apple Pencil',
    location: 'Dining Hall Upper Deck',
    date: '2026-10-15',
    type: 'lost',
    status: 'lost',
    has_private_verification: true
  });

  db.setReportVerification(ownerId, reportResult.id!, 'Engraved with "Class of 2026"', '381920');

  // Attempt 1 to 4: returns failure with remaining count
  for (let i = 1; i <= 4; i++) {
    const res = db.verifyOwnership(attackerId, reportResult.id!, 'Guess', '111111');
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.locked ?? false, false);
    assert.strictEqual(res.remainingAttempts, 5 - i);
  }

  // Attempt 5: triggers temporary lockout
  const res5 = db.verifyOwnership(attackerId, reportResult.id!, 'Guess', '111111');
  assert.strictEqual(res5.verified, false);
  assert.strictEqual(res5.locked, true);
  assert.ok(res5.message.includes('temporarily locked'));

  // Attempt 6 while locked: strictly rejected
  const res6 = db.verifyOwnership(attackerId, reportResult.id!, 'Engraved with "Class of 2026"', '381920');
  assert.strictEqual(res6.verified, false);
  assert.strictEqual(res6.locked, true);
});

test('8. Report owner can update their own verification clue and replace PIN', () => {
  const db = new MockSupabaseDatabase();
  const ownerId = 'student_owner_1';

  const reportResult = db.createReport(ownerId, {
    title: 'Leather Wallet Brown',
    category: 'Accessories',
    description: 'Vintage brown bifold wallet',
    location: 'Campus Bookstore',
    date: '2026-10-15',
    type: 'lost',
    status: 'lost',
    has_private_verification: true
  });

  db.setReportVerification(ownerId, reportResult.id!, 'Initial clue text', '123456');

  // Update clue and replace PIN
  const updateResult = db.setReportVerification(ownerId, reportResult.id!, 'Updated new clue text', '654321');
  assert.ok(updateResult.success);

  const ownerDetails = db.getOwnerVerificationDetails(ownerId, reportResult.id!);
  assert.strictEqual(ownerDetails.clue, 'Updated new clue text');

  // Verify that new PIN works and old PIN fails
  const verifyOld = db.verifyOwnership('finder_x', reportResult.id!, 'Updated new clue text', '123456');
  assert.strictEqual(verifyOld.verified, false);

  const verifyNew = db.verifyOwnership('finder_x', reportResult.id!, 'Updated new clue text', '654321');
  assert.strictEqual(verifyNew.verified, true);
});

test('9. A different user cannot update or delete another user verification details', () => {
  const db = new MockSupabaseDatabase();
  const ownerId = 'student_owner_1';
  const otherUserId = 'unauthorized_user_6';

  const reportResult = db.createReport(ownerId, {
    title: 'Hydro Flask 24oz Lilac',
    category: 'Accessories',
    description: 'Lilac hydro flask with straw lid',
    location: 'Central Campus Quad',
    date: '2026-10-15',
    type: 'lost',
    status: 'lost',
    has_private_verification: true
  });

  db.setReportVerification(ownerId, reportResult.id!, 'Dented rim on the bottom edge', '491823');

  // Unauthorized update attempt
  const updateAttempt = db.setReportVerification(otherUserId, reportResult.id!, 'Hijacked clue', '999999');
  assert.strictEqual(updateAttempt.success, false);
  assert.ok(updateAttempt.error?.includes('Permission denied'));

  // Ensure original remains intact
  const ownerDetails = db.getOwnerVerificationDetails(ownerId, reportResult.id!);
  assert.strictEqual(ownerDetails.clue, 'Dented rim on the bottom edge');
});

test('10. Report deletion cascades and cleans up associated private details', () => {
  const db = new MockSupabaseDatabase();
  const ownerId = 'student_owner_1';

  const reportResult = db.createReport(ownerId, {
    title: 'North Face Rain Jacket',
    category: 'Accessories',
    description: 'Black hooded rain jacket size M',
    location: 'Sports Complex locker room',
    date: '2026-10-15',
    type: 'lost',
    status: 'lost',
    has_private_verification: true
  });

  const repId = reportResult.id!;
  db.setReportVerification(ownerId, repId, 'Small patch repair on inside left cuff', '773910');

  assert.ok(db.verifications.has(repId));

  const deleteResult = db.deleteReport(ownerId, repId);
  assert.ok(deleteResult.success);

  // Report and verification details are completely deleted
  assert.strictEqual(db.reports.has(repId), false);
  assert.strictEqual(db.verifications.has(repId), false);
});

test('11. Input validation guards: PIN length and clue length requirements', () => {
  // PIN validation tests
  assert.strictEqual(validatePin('123456').valid, true);
  assert.strictEqual(validatePin('000000').valid, true);
  assert.strictEqual(validatePin('12345').valid, false); // Too short
  assert.strictEqual(validatePin('1234567').valid, false); // Too long
  assert.strictEqual(validatePin('12a456').valid, false); // Non-numeric
  assert.strictEqual(validatePin('').valid, false); // Empty

  // Clue validation tests
  assert.strictEqual(validateClue('Valid secret clue').valid, true);
  assert.strictEqual(validateClue('ab').valid, false); // Too short (<3)
  assert.strictEqual(validateClue('   ').valid, false); // Blank
});

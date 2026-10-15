import { supabase } from './supabase.ts';

export interface OwnerVerificationDetails {
  configured: boolean;
  clue?: string;
  createdAt?: string;
  updatedAt?: string;
  error?: string;
}

export interface VerificationClaimResult {
  success: boolean;
  verified: boolean;
  message: string;
  error?: string;
  locked?: boolean;
  remainingAttempts?: number;
}

/**
 * Validates a 6-digit numeric PIN format.
 */
export const validatePin = (pin: string): { valid: boolean; error?: string } => {
  const trimmed = pin.trim();
  if (!trimmed) {
    return { valid: false, error: 'A 6-digit secret PIN is required.' };
  }
  if (!/^\d{6}$/.test(trimmed)) {
    return { valid: false, error: 'Secret PIN must be exactly 6 numeric digits (0-9).' };
  }
  return { valid: true };
};

/**
 * Validates private ownership clue format.
 */
export const validateClue = (clue: string): { valid: boolean; error?: string } => {
  const trimmed = clue.trim();
  if (!trimmed) {
    return { valid: false, error: 'Private ownership clue is required.' };
  }
  if (trimmed.length < 3) {
    return { valid: false, error: 'Private ownership clue must be at least 3 characters.' };
  }
  return { valid: true };
};

/**
 * Sets or updates private verification clue and secret PIN for a report via secure PostgreSQL RPC.
 * Plaintext PIN is hashed with bcrypt inside PostgreSQL and never stored in plaintext.
 */
export const setReportVerification = async (
  reportId: string,
  clue: string,
  pin?: string
): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) {
    return { success: false, error: 'Supabase client is not available.' };
  }

  const clueVal = validateClue(clue);
  if (!clueVal.valid) {
    return { success: false, error: clueVal.error };
  }

  if (pin !== undefined && pin !== '') {
    const pinVal = validatePin(pin);
    if (!pinVal.valid) {
      return { success: false, error: pinVal.error };
    }
  }

  try {
    const { data, error } = await supabase.rpc('set_report_verification_details', {
      p_report_id: reportId,
      p_clue: clue.trim(),
      p_pin: pin && pin.trim() !== '' ? pin.trim() : null
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data && typeof data === 'object' && 'success' in data && !data.success) {
      return { success: false, error: (data as { error?: string }).error || 'Failed to save verification details.' };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unexpected error saving verification details.'
    };
  }
};

/**
 * Fetches configured verification details for the report owner.
 * Never returns the PIN hash or plaintext PIN.
 */
export const getOwnerVerification = async (
  reportId: string
): Promise<OwnerVerificationDetails> => {
  if (!supabase) {
    return { configured: false, error: 'Supabase client is not available.' };
  }

  try {
    const { data, error } = await supabase.rpc('get_owner_verification_details', {
      p_report_id: reportId
    });

    if (error) {
      return { configured: false, error: error.message };
    }

    if (data && typeof data === 'object') {
      const res = data as {
        success?: boolean;
        configured?: boolean;
        clue?: string;
        created_at?: string;
        updated_at?: string;
        error?: string;
      };

      if (res.error) {
        return { configured: false, error: res.error };
      }

      return {
        configured: Boolean(res.configured),
        clue: res.clue,
        createdAt: res.created_at,
        updatedAt: res.updated_at
      };
    }

    return { configured: false };
  } catch (err) {
    return {
      configured: false,
      error: err instanceof Error ? err.message : 'Unexpected error fetching verification details.'
    };
  }
};

/**
 * Submits claimant clue and PIN for authoritative server-side verification.
 * Enforces rate limiting, attempt tracking, and generic failure messages.
 */
export const verifyOwnershipClaim = async (
  reportId: string,
  clue: string,
  pin: string
): Promise<VerificationClaimResult> => {
  if (!supabase) {
    return {
      success: false,
      verified: false,
      message: 'Database connection is not available.'
    };
  }

  const clueVal = validateClue(clue);
  if (!clueVal.valid) {
    return {
      success: false,
      verified: false,
      message: clueVal.error || 'Please provide a valid ownership clue.'
    };
  }

  const pinVal = validatePin(pin);
  if (!pinVal.valid) {
    return {
      success: false,
      verified: false,
      message: pinVal.error || 'Please provide a 6-digit numeric PIN.'
    };
  }

  try {
    const { data, error } = await supabase.rpc('verify_ownership', {
      p_report_id: reportId,
      p_clue: clue.trim(),
      p_pin: pin.trim()
    });

    if (error) {
      return {
        success: false,
        verified: false,
        message: error.message
      };
    }

    const res = data as {
      success?: boolean;
      verified?: boolean;
      message?: string;
      error?: string;
      locked?: boolean;
      remaining_attempts?: number;
    };

    if (res.error) {
      return {
        success: false,
        verified: false,
        locked: Boolean(res.locked),
        message: res.error
      };
    }

    return {
      success: Boolean(res.success),
      verified: Boolean(res.verified),
      message: res.message || (res.verified ? 'Ownership verified successfully.' : 'Verification failed.'),
      remainingAttempts: res.remaining_attempts
    };
  } catch (err) {
    return {
      success: false,
      verified: false,
      message: err instanceof Error ? err.message : 'An unexpected error occurred during verification.'
    };
  }
};

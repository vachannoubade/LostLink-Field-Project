export const COLLEGE_EMAIL_DOMAIN = 'sguk.ac.in';

export const COLLEGE_EMAIL_ERROR =
  `Use your college email in the format yourPRNnumber@${COLLEGE_EMAIL_DOMAIN} (e.g. 242631003@${COLLEGE_EMAIL_DOMAIN}).`;

const PRN_PATTERN = /^[0-9]{6,16}$/;

export const normalizeCollegeEmail = (email: string): string => email.trim().toLowerCase();

export const getPrnFromCollegeEmail = (email: string): string | null => {
  const normalized = normalizeCollegeEmail(email);
  const atIndex = normalized.lastIndexOf('@');

  if (atIndex <= 0) return null;

  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);

  if (domain !== COLLEGE_EMAIL_DOMAIN) return null;
  if (!PRN_PATTERN.test(localPart)) return null;

  return localPart;
};

export const isCollegeEmail = (email: string): boolean =>
  getPrnFromCollegeEmail(email) !== null;

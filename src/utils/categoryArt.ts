import type { Category } from '../types';

export interface CategoryIllustration {
  emoji: string;
  bg: string;
  label: string;
}

export interface CategoryOption {
  value: Category;
  emoji: string;
  hint: string;
}

/**
 * Returns illustration metadata (emoji icon, refined gradient background, and human-friendly label)
 * for a given lost or found item category.
 *
 * Provides a predictable, aesthetic fallback for missing, unknown, or undefined categories.
 */
export const getCategoryIllustration = (category?: string | null): CategoryIllustration => {
  switch (category) {
    case 'Electronics':
      return {
        emoji: '🎧',
        bg: 'linear-gradient(145deg, #F0F4FF 0%, #E2ECFE 100%)',
        label: 'Tech & Devices'
      };
    case 'ID Cards':
      return {
        emoji: '🪪',
        bg: 'linear-gradient(145deg, #FFFBEB 0%, #FEF3C7 100%)',
        label: 'Campus ID & Cards'
      };
    case 'Bags':
      return {
        emoji: '🎒',
        bg: 'linear-gradient(145deg, #FDF2F8 0%, #FCE7F3 100%)',
        label: 'Backpacks & Totes'
      };
    case 'Books':
      return {
        emoji: '📓',
        bg: 'linear-gradient(145deg, #FEFCE8 0%, #FEF9C3 100%)',
        label: 'Notebooks & Textbooks'
      };
    case 'Accessories':
      return {
        emoji: '💧',
        bg: 'linear-gradient(145deg, #F0FDF4 0%, #DCFCE7 100%)',
        label: 'Everyday Essentials'
      };
    case 'Keys':
      return {
        emoji: '🔑',
        bg: 'linear-gradient(145deg, #FFF7ED 0%, #FFEDD5 100%)',
        label: 'Keys & Access Fobs'
      };
    case 'Other':
      return {
        emoji: '📦',
        bg: 'linear-gradient(145deg, #F8FAFC 0%, #F1F5F9 100%)',
        label: 'Campus Item'
      };
    default:
      return {
        emoji: '📦',
        bg: 'linear-gradient(145deg, #F8FAFC 0%, #F1F5F9 100%)',
        label: 'Campus Item'
      };
  }
};

/**
 * Standard category selection list with curated icons and hint descriptions.
 * Compatible with report forms and filtering interfaces.
 */
export const CATEGORY_OPTIONS: CategoryOption[] = [
  { value: 'Electronics', emoji: '🎧', hint: 'Earbuds, chargers, laptops, phones' },
  { value: 'ID Cards', emoji: '🪪', hint: 'Student ID, metro cards, wallets' },
  { value: 'Accessories', emoji: '💧', hint: 'Water bottles, watches, glasses' },
  { value: 'Keys', emoji: '🔑', hint: 'Hostel keys, bike keys, fobs' },
  { value: 'Books', emoji: '📓', hint: 'Notebooks, textbooks, binders' },
  { value: 'Bags', emoji: '🎒', hint: 'Backpacks, totes, pouches' },
  { value: 'Other', emoji: '📦', hint: 'Clothing, athletic gear, and misc' }
];

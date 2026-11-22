import type { Urgency } from '../domain/types';

export const color = {
  primary: '#0E7C5A', // filled buttons, selected chip, FAB (AA with white text)
  brand: '#1D9E75', // accents and large icons only
  dark: '#0c6b58', // titles
  tint: '#E1F5EE',
  ink: '#1d4038',
  inkMuted: '#5d7068',
  placeholder: '#90a79e', // TextInput placeholder only; lighter than inkMuted
  line: '#dfe8e5',
  inputBorder: '#8aa399', // text field outline; darker than line so fields don't look disabled
  surface: '#fff',
  red: '#C62828',
  amber: '#F5B335',
  orange: '#B4510A', // To put away: chip outline and text (AA on white, and with white text)
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, screen: 16 } as const;
export const radius = { sm: 8, md: 12, lg: 20, full: 999 } as const;
export const font = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, title: 'serif' } as const;
export const TOUCH = 48; // minimum touch target, dp

type Icon = 'close-circle' | 'clock-outline' | 'circle-half-full' | 'help-circle-outline';

/** Urgency is never colour-only: every pill has an icon and text. null = no pill. */
export const urgencyStyle: Record<Urgency, { fill: string; text: string; icon: Icon; outline?: boolean } | null> = {
  expired: { fill: color.red, text: '#fff', icon: 'close-circle' },
  expiring_soon: { fill: color.amber, text: color.ink, icon: 'clock-outline' },
  past_best: { fill: color.amber, text: color.ink, icon: 'circle-half-full' },
  needs_date: { fill: color.surface, text: color.inkMuted, icon: 'help-circle-outline', outline: true },
  fine: null,
  no_expiry: null,
};

/** 4dp left edge of a list row. */
export const edgeColor = (u: Urgency) =>
  u === 'expired' ? color.red : u === 'expiring_soon' || u === 'past_best' ? color.amber : u === 'needs_date' ? color.line : 'transparent';

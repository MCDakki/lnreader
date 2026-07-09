import { TextStyle, ViewStyle } from 'react-native';

/**
 * Shared design tokens for the LNReader UI design system.
 *
 * These provide a single source of truth for spacing, corner radii,
 * typography and elevation so screens feel consistent and "breathe".
 * Prefer importing from here instead of scattering magic numbers.
 */

/** 4pt based spacing scale. */
export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Corner radius scale. `l` (16) is the default for cards, inputs and buttons. */
export const borderRadius = {
  xs: 6,
  s: 10,
  m: 12,
  l: 16,
  xl: 20,
  xxl: 28,
  full: 999,
} as const;

/** Typography scale with a clear hierarchy between headers and body copy. */
export const typography = {
  display: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: 0.15,
  } as TextStyle,
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: 0.1,
  } as TextStyle,
  subtitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  } as TextStyle,
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  } as TextStyle,
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    letterSpacing: 0.2,
  } as TextStyle,
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  } as TextStyle,
} as const;

/** Soft, layered drop shadows used for cards, inputs and floating elements. */
export const shadow = {
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  } as ViewStyle,
  soft: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  } as ViewStyle,
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  } as ViewStyle,
  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 8,
  } as ViewStyle,
} as const;

export type Spacing = keyof typeof spacing;
export type BorderRadius = keyof typeof borderRadius;

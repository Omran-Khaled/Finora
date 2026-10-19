import { StyleSheet } from 'react-native';

/**
 * FINORA DESIGN TOKENS — Native representation of the approved identity.
 * High-contrast, calm financial clarity, semantic accessibility.
 * No arbitrary values are repeated inside components; tokens live here.
 */

const lightColors = {
  background: '#F3F8FD',
  surface: '#FFFFFF',
  surfaceSubtle: '#EAF3FB',
  surfaceHover: '#DFECF7',
  border: '#D1E0EC',
  borderSubtle: '#E1EBF3',
  brand: '#1676C5',
  brandLight: '#155F9E',
  brandMuted: '#E0F0FC',
  ring: '#1676C5',
  success: '#277A4B',
  successBg: '#E6F4EB',
  successText: '#236642',
  warning: '#8A5A00',
  warningBg: '#FFF3D8',
  warningText: '#795000',
  danger: '#B42335',
  dangerBg: '#FDE8EB',
  dangerText: '#A11D2D',
  textPrimary: '#172B3B',
  textSecondary: '#42596B',
  textMuted: '#5D7284',
  textInverse: '#FFFFFF',
};

const darkColors: typeof lightColors = {
  background: '#0C1724',
  surface: '#142437',
  surfaceSubtle: '#1A3047',
  surfaceHover: '#23415C',
  border: '#38536A',
  borderSubtle: '#2B4359',
  brand: '#55B4F2',
  brandLight: '#84CCFA',
  brandMuted: '#173B58',
  ring: '#55B4F2',
  success: '#68D39A',
  successBg: '#163A2B',
  successText: '#9BE8B9',
  warning: '#F4C76A',
  warningBg: '#3B3018',
  warningText: '#F7D98D',
  danger: '#FF7F8D',
  dangerBg: '#421F2A',
  dangerText: '#FFA2AC',
  textPrimary: '#F0F6FC',
  textSecondary: '#C2D1DF',
  textMuted: '#9BB0C2',
  textInverse: '#082033',
};

export type AppColors = { [Key in keyof typeof lightColors]: string };

const colors: AppColors = { ...lightColors };
let colorRevision = 0;
let currentScheme: 'light' | 'dark' = 'light';
const colorListeners = new Set<() => void>();

export function subscribeToTokenColorScheme(listener: () => void): () => void {
  colorListeners.add(listener);
  return () => colorListeners.delete(listener);
}

export function getTokenColorRevision(): number {
  return colorRevision;
}

export function setTokenColorScheme(scheme: 'light' | 'dark'): void {
  if (scheme === currentScheme) return;
  currentScheme = scheme;
  Object.assign(colors, scheme === 'dark' ? darkColors : lightColors);
  colorRevision += 1;
  colorListeners.forEach((listener) => listener());
}

/**
 * Native StyleSheet declarations normally snapshot their colors at module
 * load. Resolve a cached stylesheet lazily per palette so a theme change can
 * update every routed screen without duplicating component styles.
 */
export function createThemeStyles<T extends StyleSheet.NamedStyles<T>>(factory: () => T): T {
  let cachedRevision = -1;
  let cachedStyles: T;
  return new Proxy({} as T, {
    get(_target, property: string | symbol) {
      if (cachedRevision !== colorRevision) {
        cachedStyles = StyleSheet.create(factory());
        cachedRevision = colorRevision;
      }
      return Reflect.get(cachedStyles, property);
    },
  });
}

export const Tokens = {
  colors,
  createStyles: createThemeStyles,

  radius: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 20,
    full: 9999,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },

  typography: {
    tiny: 11,
    small: 13,
    body: 15,
    title: 18,
    large: 22,
    hero: 32,
  },
}

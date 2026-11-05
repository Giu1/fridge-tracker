import { useColorScheme } from 'react-native';

const light = {
  bg: '#F7F6F2',
  card: '#FFFFFF',
  elevated: '#FFFFFF',
  text: '#16181A',
  muted: '#7A7F86',
  border: '#ECEAE4',
  accent: '#1F7A55',
  accentSoft: '#E3F2EA',
  accentText: '#FFFFFF',
  danger: '#D2493A',
  dangerSoft: '#FBE9E6',
  warn: '#C98A12',
  warnSoft: '#FBF1DD',
  chip: '#EFEDE7',
};
const dark: typeof light = {
  bg: '#0E0F10',
  card: '#17191B',
  elevated: '#1E2124',
  text: '#F2F1EE',
  muted: '#8C9197',
  border: '#24272A',
  accent: '#4FCB91',
  accentSoft: '#173226',
  accentText: '#06140D',
  danger: '#F07A6C',
  dangerSoft: '#3A1D19',
  warn: '#F2B544',
  warnSoft: '#33280F',
  chip: '#222528',
};

export type Theme = typeof light;
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 };

export const NUTRI_COLORS: Record<string, string> = {
  a: '#038141',
  b: '#85BB2F',
  c: '#FECB02',
  d: '#EE8100',
  e: '#E63E11',
};

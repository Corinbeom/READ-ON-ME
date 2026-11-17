import type { TextStyle } from 'react-native';

export const Spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 40 } as const;
export const UI = {
  controlHeight: 48,
  compactControlHeight: 44,
  iconButtonSize: 44,
  controlRadius: 8,
  cardRadius: 12,
  dialogRadius: 16,
  tabHeight: 64,
} as const;

export const Typography = {
  display: { fontFamily: 'NotoSerifKR-Regular', fontSize: 28, lineHeight: 40 },
  title: { fontFamily: 'NotoSerifKR-Regular', fontSize: 24, lineHeight: 34 },
  section: { fontFamily: 'NotoSerifKR-Regular', fontSize: 20, lineHeight: 28 },
  bookTitle: { fontFamily: 'NotoSerifKR-Regular', fontSize: 16, lineHeight: 24 },
  body: { fontFamily: 'NotoSerifKR-Regular', fontSize: 15, lineHeight: 24 },
  label: { fontFamily: 'Pretendard-SemiBold', fontSize: 14, lineHeight: 20 },
  compactLabel: { fontFamily: 'Pretendard-SemiBold', fontSize: 13, lineHeight: 20 },
  caption: { fontFamily: 'Pretendard-SemiBold', fontSize: 12, lineHeight: 18 },
  input: { fontFamily: 'Pretendard-SemiBold', fontSize: 16, lineHeight: 24 },
} as const satisfies Record<string, TextStyle>;

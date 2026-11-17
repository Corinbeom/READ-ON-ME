import { Spacing, Typography, UI } from './designTokens';

export const SCREEN_LAYOUT = {
  maxWidth: 640,
  formMaxWidth: 440,
  gutter: Spacing.lg,
  bottomPadding: Spacing.xl,
  headerFontSize: Typography.display.fontSize,
  headerLineHeight: Typography.display.lineHeight,
  headerBottomPadding: Spacing.sm,
  tabBarHeight: UI.tabHeight,
} as const;

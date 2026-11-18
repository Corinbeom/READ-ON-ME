import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Spacing, Typography, UI } from '@/src/styles/designTokens';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';

export const getBookLibraryStatusStyles = (scheme: 'light' | 'dark') => {
  const c = Colors[scheme];
  return StyleSheet.create({
    section: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: Spacing.lg, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.background },
    header: { minHeight: UI.compactControlHeight, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
    heading: { ...Typography.label, color: c.inkSoft },
    options: { flexDirection: 'row', borderWidth: 1, borderColor: c.text, borderRadius: UI.controlRadius, overflow: 'hidden' },
    option: { flex: 1, minWidth: 0 },
    divider: { borderLeftWidth: 1, borderLeftColor: c.text },
    button: { borderRadius: 0, paddingHorizontal: Spacing.xxs },
    feedback: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.sm, minHeight: Typography.caption.lineHeight },
    message: { ...Typography.caption, color: c.inkSoft, flex: 1 },
    error: { color: c.danger },
    guestHint: { ...Typography.caption, color: c.inkSoft, marginTop: Spacing.xs },
    lastConfirmed: { ...Typography.caption, color: c.inkSoft, marginTop: Spacing.xs },
    recovery: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm },
  });
};

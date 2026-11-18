import { Spacing, Typography, UI } from '@/src/styles/designTokens';
import { StyleSheet, Platform } from 'react-native';
import { Colors } from '@/constants/Colors';
import { SCREEN_LAYOUT } from './screenLayout';

export const getHomeScreenStyles = (colorScheme: 'light' | 'dark') => {
  const c = Colors[colorScheme];

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { paddingBottom: SCREEN_LAYOUT.bottomPadding },
    mastheadRight: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 16 },
    issueBar: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line, paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: c.background },
    issueBarText: { ...Typography.caption, letterSpacing: 0.2, textTransform: 'uppercase', color: c.inkSoft },
    authButtons: { flexDirection: 'row', gap: Spacing.xs },
    notificationBellButton: { position: 'relative', justifyContent: 'center', alignItems: 'center', width: UI.iconButtonSize, height: UI.iconButtonSize, borderRadius: UI.controlRadius },
    notificationDot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: c.danger, top: Spacing.xs, right: Spacing.xs },
    aiSection: { marginHorizontal: SCREEN_LAYOUT.gutter, paddingBottom: Spacing.lg, borderBottomWidth: 1, borderBottomColor: c.line, marginTop: Spacing.lg },
    aiContent: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    aiCopy: { flex: 1, minWidth: 0 },
    aiLabel: { ...Typography.caption, color: c.inkSoft, marginBottom: Spacing.xs },
    aiTitle: { ...Typography.section, color: c.text, letterSpacing: -0.5 },
    aiPromptText: { ...Typography.compactLabel, color: c.inkSoft, height: 24, marginTop: Spacing.sm, marginBottom: Spacing.md },
    sectionHeader: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: 28, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm, alignItems: 'center' },
    sectionTitle: { ...Typography.section, color: c.text, letterSpacing: -0.3, flexShrink: 1 },
    sectionCount: { ...Typography.caption, color: c.inkSoft, letterSpacing: 0.1 },
    sectionDivider: { height: 1, backgroundColor: c.line, marginHorizontal: SCREEN_LAYOUT.gutter },
    birthYearHint: { ...Typography.caption, paddingHorizontal: SCREEN_LAYOUT.gutter, paddingBottom: 12, color: c.inkSoft, letterSpacing: 0.1 },
    centeredView: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: SCREEN_LAYOUT.gutter },
    modalView: { backgroundColor: c.card, alignItems: 'center', borderWidth: 1, borderColor: c.line, width: '100%', maxWidth: SCREEN_LAYOUT.formMaxWidth, padding: Spacing.lg, borderRadius: UI.dialogRadius },
    modalTitle: { ...Typography.section, marginBottom: 12, textAlign: 'center', color: c.text, fontStyle: Platform.OS === 'android' ? 'normal' : 'italic' },
    modalText: { ...Typography.body, marginBottom: 20, textAlign: 'center', color: c.inkSoft },
  });
};

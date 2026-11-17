import { useHeaderHeight } from '@react-navigation/elements';
import type { ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';
import { Spacing, Typography } from '@/src/styles/designTokens';

export default function AuthScreen({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const theme = useColorScheme() ?? 'light';
  const c = Colors[theme];
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: c.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scroll, { paddingBottom: Spacing.xl + insets.bottom }]}>
        <View style={styles.content}>
          <Image source={theme === 'dark' ? require('@/assets/images/login_register_logo_dark.png') : require('@/assets/images/login_register_logo.png')} style={styles.logo} />
          <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>{title}</Text>
          <Text style={[styles.description, { color: c.inkSoft }]}>{description}</Text>
          <View style={styles.form}>{children}</View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: Spacing.lg },
  content: { width: '100%', maxWidth: SCREEN_LAYOUT.formMaxWidth, alignSelf: 'center', flexGrow: 1, justifyContent: 'center', paddingVertical: Spacing.lg },
  logo: { width: 180, maxWidth: '70%', aspectRatio: 4.7, resizeMode: 'contain', alignSelf: 'center', marginBottom: Spacing.xl },
  title: { ...Typography.display, textAlign: 'center', marginBottom: Spacing.xs },
  description: { ...Typography.body, textAlign: 'center', marginBottom: Spacing.xl },
  form: { gap: Spacing.md },
});

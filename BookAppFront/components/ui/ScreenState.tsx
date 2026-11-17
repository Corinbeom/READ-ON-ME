import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import AppButton from './AppButton';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Spacing, Typography } from '@/src/styles/designTokens';

export default function ScreenState({ title, description, loading, action, onAction }: {
  title: string; description?: string; loading?: boolean; action?: string; onAction?: () => void;
}) {
  const c = Colors[useColorScheme() ?? 'light'];
  return <View style={styles.container}>
    {loading ? <ActivityIndicator color={c.text} /> : null}
    <Text style={[Typography.section, styles.centered, { color: c.text }]}>{title}</Text>
    {description ? <Text style={[Typography.body, styles.centered, { color: c.inkSoft }]}>{description}</Text> : null}
    {action && onAction ? <AppButton title={action} variant="secondary" onPress={onAction} /> : null}
  </View>;
}
const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.lg, paddingVertical: Spacing.xxl },
  centered: { textAlign: 'center' },
});

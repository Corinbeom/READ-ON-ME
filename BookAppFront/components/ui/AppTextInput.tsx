import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Spacing, Typography, UI } from '@/src/styles/designTokens';

type Props = TextInputProps & { invalid?: boolean; inline?: boolean };
const AppTextInput = forwardRef<TextInput, Props>(function AppTextInput({ invalid, inline, multiline, style, ...props }, ref) {
  const c = Colors[useColorScheme() ?? 'light'];
  return <TextInput ref={ref} aria-invalid={!!invalid} placeholderTextColor={c.inkSoft} {...props} multiline={multiline}
    style={[styles.input, { color: c.text, backgroundColor: inline ? 'transparent' : c.card, borderColor: invalid ? c.danger : inline ? 'transparent' : c.line },
      multiline && styles.multiline, inline && styles.inline, style]} />;
});
export default AppTextInput;

export function FormField({ label, error, hint, ...props }: Props & { label: string; error?: string; hint?: string }) {
  const c = Colors[useColorScheme() ?? 'light'];
  return (
    <View style={styles.field}>
      <Text style={[Typography.label, { color: c.text }]}>{label}</Text>
      <AppTextInput accessibilityLabel={label} accessibilityHint={error || hint} {...props} invalid={!!error} />
      {error ? <Text accessibilityRole="alert" style={[Typography.caption, { color: c.danger }]}>{error}</Text>
        : hint ? <Text style={[Typography.caption, { color: c.inkSoft }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.xs },
  input: { ...Typography.input, minHeight: UI.controlHeight, minWidth: 0, borderWidth: 1, borderRadius: UI.controlRadius, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  multiline: { minHeight: 112, textAlignVertical: 'top' },
  inline: { borderWidth: 0, borderRadius: 0 },
});

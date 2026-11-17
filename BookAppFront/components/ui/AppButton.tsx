import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, type TouchableOpacityProps, type StyleProp, type TextStyle } from 'react-native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Spacing, Typography, UI } from '@/src/styles/designTokens';

type Props = TouchableOpacityProps & {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  compact?: boolean;
  loading?: boolean;
  textStyle?: StyleProp<TextStyle>;
};

export default function AppButton({ title, variant = 'primary', compact = false, loading = false, disabled, style, textStyle, accessibilityState, ...props }: Props) {
  const c = Colors[useColorScheme() ?? 'light'];
  const filled = variant === 'primary' || variant === 'danger';
  const foreground = filled ? c.background : variant === 'ghost' ? c.inkSoft : c.text;
  const inactive = disabled || loading;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.72}
      {...props}
      disabled={inactive}
      aria-disabled={!!inactive}
      aria-busy={loading}
      aria-checked={accessibilityState?.checked}
      aria-selected={accessibilityState?.selected}
      accessibilityState={{ ...accessibilityState, disabled: !!inactive, busy: loading }}
      style={[styles.button, {
        minHeight: compact ? UI.compactControlHeight : UI.controlHeight,
        backgroundColor: filled ? (variant === 'danger' ? c.danger : c.text) : variant === 'secondary' ? c.card : 'transparent',
        borderColor: variant === 'secondary' ? c.line : 'transparent',
        opacity: inactive ? 0.45 : 1,
      }, style]}
    >
      {loading ? <ActivityIndicator color={foreground} size="small" /> : null}
      <Text style={[styles.label, compact && Typography.compactLabel, { color: foreground }, textStyle]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: UI.controlRadius, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, gap: Spacing.xs, minWidth: UI.iconButtonSize },
  label: { ...Typography.label, textAlign: 'center', flexShrink: 1 },
});

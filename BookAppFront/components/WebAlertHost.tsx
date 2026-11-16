import AppButton from '@/components/ui/AppButton';
import { Spacing, Typography, UI } from '@/src/styles/designTokens';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';
import { useSyncExternalStore } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { closeWebAlert, getServerWebAlert, getWebAlert, subscribeWebAlerts } from '@/src/utils/alert';

export default function WebAlertHost() {
  const request = useSyncExternalStore(subscribeWebAlerts, getWebAlert, getServerWebAlert);
  const c = Colors[useColorScheme() ?? 'light'];
  if (Platform.OS !== 'web' || !request) return null;

  const cancel = () => {
    const index = request.buttons.findIndex(button => button.style === 'cancel');
    if (index >= 0) closeWebAlert(request.id, index);
    else if (request.options?.cancelable) closeWebAlert(request.id);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.overlay}>
        <View style={[styles.dialog, { backgroundColor: c.card, borderColor: c.line }]} accessibilityViewIsModal role="alertdialog" accessibilityLabel={request.title}>
          <ScrollView style={styles.body}>
            <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>{request.title}</Text>
            {request.message ? <Text style={[styles.message, { color: c.inkSoft }]}>{request.message}</Text> : null}
          </ScrollView>
          <View style={styles.actions}>
            {request.buttons.map((button, index) => (
              <AppButton key={index} title={button.text ?? '확인'}
                variant={button.style === 'destructive' ? 'danger' : button.style === 'cancel' || request.buttons.length > 1 ? 'secondary' : 'primary'}
                onPress={() => closeWebAlert(request.id, index)} />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.45)' },
  dialog: { width: '100%', maxWidth: SCREEN_LAYOUT.formMaxWidth, maxHeight: '85%', borderWidth: 1, borderRadius: UI.dialogRadius, padding: Spacing.lg },
  body: { flexShrink: 1 },
  title: Typography.section,
  message: { ...Typography.body, marginTop: Spacing.sm },
  actions: { marginTop: 24, gap: 8 },
});

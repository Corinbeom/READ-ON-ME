import { useSyncExternalStore } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
        <View style={[styles.dialog, { backgroundColor: c.card, borderColor: c.line }]} accessibilityViewIsModal>
          <ScrollView style={styles.body}>
            <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>{request.title}</Text>
            {request.message ? <Text style={[styles.message, { color: c.inkSoft }]}>{request.message}</Text> : null}
          </ScrollView>
          <View style={styles.actions}>
            {request.buttons.map((button, index) => (
              <TouchableOpacity key={index} accessibilityRole="button"
                onPress={() => closeWebAlert(request.id, index)}
                style={[styles.button, { borderColor: c.line, backgroundColor: c.surface2 }]}>
                <Text style={[styles.buttonText, { color: button.style === 'destructive' ? c.danger : c.text }]}>
                  {button.text ?? '확인'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.45)' },
  dialog: { width: '100%', maxWidth: 400, maxHeight: '85%', borderWidth: 1, padding: 24 },
  body: { flexShrink: 1 },
  title: { fontFamily: 'Pretendard-SemiBold', fontSize: 18, lineHeight: 26 },
  message: { fontFamily: 'Pretendard-SemiBold', fontSize: 14, lineHeight: 22, marginTop: 12 },
  actions: { marginTop: 24, gap: 8 },
  button: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1 },
  buttonText: { fontFamily: 'Pretendard-SemiBold', fontSize: 14 },
});

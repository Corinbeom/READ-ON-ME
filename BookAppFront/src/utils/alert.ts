import { Alert, Platform, type AlertButton, type AlertOptions } from 'react-native';

export interface WebAlertRequest {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
}

let nextId = 0;
let queue: WebAlertRequest[] = [];
const listeners = new Set<() => void>();

export const getWebAlert = () => queue[0] ?? null;
export const getServerWebAlert = () => null;
export const subscribeWebAlerts = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function closeWebAlert(id: number, buttonIndex?: number) {
  const request = getWebAlert();
  if (!request || request.id !== id) return;
  queue = queue.slice(1);
  listeners.forEach(listener => listener());
  if (buttonIndex !== undefined) request.buttons[buttonIndex]?.onPress?.();
  else request.options?.onDismiss?.();
}

const customAlert: typeof Alert.alert = (title, message, buttons, options) => {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons, options);
    return;
  }
  queue = [...queue, { id: ++nextId, title, message,
    buttons: buttons?.length ? buttons : [{ text: '확인' }], options }];
  listeners.forEach(listener => listener());
};

export default customAlert;

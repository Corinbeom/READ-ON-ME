import { Alert, Platform } from 'react-native';

const alertPolyfill = (title: string, description?: string, options?: any[], extra?: any) => {
  if (Platform.OS === 'web') {
    const message = [title, description].filter(Boolean).join('\n');
    if (options && options.length > 0) {
      // For simplicity, we'll just use window.alert for now.
      // A more robust polyfill would use window.confirm for options.
      window.alert(message);
      // If there's an 'OK' or default option, call its onPress.
      const defaultOption = options.find(opt => opt.style !== 'cancel');
      if (defaultOption && defaultOption.onPress) {
        defaultOption.onPress();
      }
    } else {
      window.alert(message);
    }
  } else {
    Alert.alert(title, description, options, extra);
  }
};

const customAlert = Platform.OS === 'web' ? alertPolyfill : Alert.alert;

export default customAlert;

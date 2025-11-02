import React, { useState } from 'react';
import {
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  useColorScheme as useSystemColorScheme, // Rename to avoid conflict
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useDispatch } from 'react-redux';
import { signIn } from '@/src/store/authSlice';
import type { AppDispatch } from '@/src/store';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';


const screenWidth = Dimensions.get('window').width;


// Dynamic stylesheet function
const getStyles = (colorScheme: 'light' | 'dark') => {
  const colors = Colors[colorScheme];
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    logo: {
      width: screenWidth * 0.55,   // 전체 화면 폭의 55%
      height: (screenWidth * 0.55) / 4.7, // 원본 비율 유지 (470:100)
      resizeMode: 'contain',
      alignSelf: 'center',
      marginBottom: 48,
    },
    title: {
      textAlign: 'center',
      marginBottom: 8,
      color: colors.primary,
    },
    subtitle: {
      textAlign: 'center',
      marginBottom: 40,
      color: colors.darkGray,
    },
    form: {
      gap: 16,
    },
    input: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.lightGray,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    buttonDisabled: {
      backgroundColor: colors.darkGray,
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    linkContainer: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    link: {
      color: colors.primary, // Use primary color for the link
    },
    backButtonText: {
      color: colors.darkGray,
      fontSize: 14,
    },
  });
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch<AppDispatch>();

  const colorScheme = useColorScheme() ?? 'light';
  const styles = getStyles(colorScheme);
  const colors = Colors[colorScheme];

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('알림', '이메일과 비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const result = await dispatch(signIn({ email, password }));
      
      if (signIn.fulfilled.match(result)) {
        Alert.alert('성공', '로그인되었습니다.', [
          { text: '확인', onPress: () => router.replace('/') }
        ]);
      } else {
        Alert.alert('로그인 실패', '이메일 또는 비밀번호를 확인해주세요.');
      }
    } catch (error) {
      Alert.alert('오류', '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ThemedView style={styles.content}>
        <Image 
          source={colorScheme === 'dark' 
            ? require('@/assets/images/login_register_logo_dark.png') 
            : require('@/assets/images/login_register_logo.png')} 
          style={styles.logo} 
        />
        <ThemedText type="title" style={styles.title}>로그인</ThemedText>
        <ThemedText style={styles.subtitle}>다시 찾아주셔서 감사합니다</ThemedText>

        <ThemedView style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="이메일"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={colors.darkGray}
          />
          
          <TextInput
            style={styles.input}
            placeholder="비밀번호"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholderTextColor={colors.darkGray}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            <ThemedText style={styles.buttonText}>
              {loading ? '로그인 중...' : '로그인'}
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkContainer}
            onPress={() => router.push('/auth/register')}
          >
            <ThemedText type="link" style={styles.link}>계정이 없으신가요? 회원가입</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkContainer}
            onPress={() => router.back()}
          >
            <ThemedText style={styles.backButtonText}>뒤로 가기</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}
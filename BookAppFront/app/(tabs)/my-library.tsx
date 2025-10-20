import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function MyLibraryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>내 서재 (프로필 페이지)</Text>
      <Text style={styles.subtitle}>이곳에 사용자 프로필 정보와 서재 기능이 통합될 예정입니다.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#212529',
  },
  subtitle: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
  },
});

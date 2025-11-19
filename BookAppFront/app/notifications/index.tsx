import React, { useCallback } from 'react';
import { FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useFocusEffect, Stack } from 'expo-router';

import { AppDispatch, RootState } from '@/src/store';
import { fetchNotifications, markAllNotificationsAsRead, markNotificationAsRead } from '@/src/store/notificationSlice';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

const NotificationsScreen = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { items, loading, unreadCount } = useSelector((state: RootState) => state.notifications);
  const colorScheme = useColorScheme() ?? 'light';
  const styles = getStyles(colorScheme);

  useFocusEffect(
    useCallback(() => {
      dispatch(fetchNotifications());
    }, [dispatch])
  );

  const handleMarkAll = () => {
    if (unreadCount === 0) return;
    dispatch(markAllNotificationsAsRead());
  };

  const handleItemPress = (notificationId: number, isRead: boolean) => {
    if (!isRead) {
      dispatch(markNotificationAsRead(notificationId));
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: '알림',
          headerRight: () => (
            <TouchableOpacity onPress={handleMarkAll} disabled={unreadCount === 0}>
              <ThemedText style={[styles.markAllText, unreadCount === 0 && styles.markAllDisabled]}>모두 읽음</ThemedText>
            </TouchableOpacity>
          ),
        }}
      />
      {loading && <ThemedText style={styles.helperText}>불러오는 중...</ThemedText>}
      {!loading && items.length === 0 && (
        <ThemedText style={styles.helperText}>아직 받은 알림이 없습니다.</ThemedText>
      )}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.notificationItem, !item.read && styles.notificationUnread]}
            onPress={() => handleItemPress(item.id, item.read)}
          >
            {!item.read && <ThemedText style={styles.unreadBadge}>NEW</ThemedText>}
            <ThemedText style={styles.messageText}>{item.message}</ThemedText>
            <ThemedText style={styles.dateText}>{new Date(item.createdAt).toLocaleString()}</ThemedText>
          </TouchableOpacity>
        )}
      />
    </ThemedView>
  );
};

const getStyles = (scheme: 'light' | 'dark') => {
  const colors = Colors[scheme];
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    markAllText: {
      fontFamily: 'Pretendard-SemiBold',
      color: colors.primary,
      fontSize: 14,
    },
    markAllDisabled: {
      color: colors.darkGray,
    },
    helperText: {
      marginTop: 32,
      textAlign: 'center',
      color: colors.darkGray,
      fontFamily: 'NotoSerifKR-Regular',
    },
    listContent: {
      paddingVertical: 8,
    },
    notificationItem: {
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.lightGray,
      backgroundColor: colors.card,
      marginBottom: 12,
    },
    notificationUnread: {
      borderColor: colors.primary,
      backgroundColor: scheme === 'light' ? 'rgba(139,94,60,0.08)' : 'rgba(227,197,101,0.12)',
    },
    unreadBadge: {
      fontSize: 12,
      color: '#ff4d4f',
      fontFamily: 'Pretendard-SemiBold',
      marginBottom: 6,
    },
    messageText: {
      fontSize: 15,
      fontFamily: 'Pretendard-SemiBold',
      color: colors.text,
    },
    dateText: {
      marginTop: 6,
      fontSize: 12,
      fontFamily: 'NotoSerifKR-Regular',
      color: colors.darkGray,
    },
  });
};

export default NotificationsScreen;

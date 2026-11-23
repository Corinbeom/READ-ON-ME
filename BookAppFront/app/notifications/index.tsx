import AppButton from '@/components/ui/AppButton';
import ScreenState from '@/components/ui/ScreenState';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';
import { Spacing, Typography, UI } from '@/src/styles/designTokens';
import React, { useCallback } from 'react';
import { FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useFocusEffect, Stack, router } from 'expo-router';

import { AppDispatch, RootState } from '@/src/store';
import { fetchNotifications, markAllNotificationsAsRead, markNotificationAsRead } from '@/src/store/notificationSlice';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

const NotificationsScreen = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { items, listStatus, unreadCount } = useSelector((state: RootState) => state.notifications);
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  const colorScheme = useColorScheme() ?? 'light';
  const styles = getStyles(colorScheme);

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) dispatch(fetchNotifications());
    }, [dispatch, isAuthenticated])
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
            <AppButton compact variant="ghost" title="모두 읽음" onPress={handleMarkAll} disabled={!isAuthenticated || unreadCount === 0} />
          ),
        }}
      />
      {!isAuthenticated ? <ScreenState title="로그인 후 알림을 확인해보세요" action="로그인하기" onAction={() => router.push('/auth/login')} />
        : listStatus === 'failed' ? <ScreenState title="알림을 불러오지 못했어요" action="다시 시도" onAction={() => dispatch(fetchNotifications())} />
        : listStatus === 'loading' ? <ScreenState loading title="알림을 불러오고 있어요" /> : null}
      <FlatList
        data={isAuthenticated ? items : []}
        ListEmptyComponent={isAuthenticated && listStatus === 'ready' ? <ScreenState title="아직 받은 알림이 없어요" description="새 알림이 도착하면 이곳에서 확인할 수 있어요." /> : null}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.notificationItem, !item.read && styles.notificationUnread]}
            accessibilityRole="button"
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
    container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: Spacing.md },
    listContent: { paddingVertical: 8, paddingBottom: SCREEN_LAYOUT.bottomPadding },
    notificationItem: { borderWidth: 1, borderColor: colors.lightGray, backgroundColor: colors.card, marginBottom: 12, minHeight: UI.controlHeight, padding: Spacing.md, borderRadius: UI.cardRadius },
    notificationUnread: { borderColor: colors.primary, backgroundColor: colors.surface2 },
    unreadBadge: { ...Typography.caption, color: colors.text, marginBottom: 6 },
    messageText: { ...Typography.body, color: colors.text },
    dateText: { ...Typography.caption, marginTop: 6, color: colors.darkGray },
  });
};

export default NotificationsScreen;

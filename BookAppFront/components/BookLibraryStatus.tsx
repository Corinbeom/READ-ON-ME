import { useCallback } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import AppButton from '@/components/ui/AppButton';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { AppDispatch, RootState } from '@/src/store';
import { emptyLibraryStatus, fetchLibraryStatus, libraryStatusKey, readingStatusLabels, saveLibraryStatus } from '@/src/store/libraryStatusSlice';
import { ReadingStatus } from '@/src/types/readingStatus';
import { getBookLibraryStatusStyles } from './styles/BookLibraryStatus.styles';

export function GuestBookLibraryStatus({ isbn }: { isbn: string }) {
  const styles = getBookLibraryStatusStyles(useColorScheme() ?? 'light');
  return (
    <View style={styles.section} testID="guest-book-library-status">
      <AppButton title="읽고 싶어요" variant="secondary"
        accessibilityHint="로그인한 뒤 이 책을 서재에 담을 수 있어요."
        onPress={() => router.push({ pathname: '/auth/login', params: { returnTo: 'book-detail', isbn } })} />
      <Text style={styles.guestHint}>로그인 후 이 책을 서재에 담을 수 있어요.</Text>
    </View>
  );
}

export default function BookLibraryStatus({ bookId, userId }: { bookId: number; userId: number }) {
  const dispatch = useDispatch<AppDispatch>();
  const scheme = useColorScheme() ?? 'light';
  const styles = getBookLibraryStatusStyles(scheme);
  const entry = useSelector((state: RootState) => state.libraryStatus.entries[libraryStatusKey({ bookId, userId })] ?? emptyLibraryStatus);
  useFocusEffect(useCallback(() => {
    void dispatch(fetchLibraryStatus({ bookId, userId }));
  }, [bookId, userId, dispatch]));
  const reload = () => { void dispatch(fetchLibraryStatus({ bookId, userId })); };
  const save = (status: ReadingStatus) => { void dispatch(saveLibraryStatus({ bookId, userId, status })); };
  const loading = entry.loading || (!entry.loaded && !entry.error);
  const busy = loading || entry.saving;
  const label = entry.status ? readingStatusLabels[entry.status] : '';
  const message = loading ? '서재 상태를 확인하고 있어요.'
    : entry.saving ? `‘${readingStatusLabels[entry.requestedStatus!]}’ 상태로 저장하고 있어요.`
    : entry.error === 'load' ? '서재 상태를 불러오지 못했어요. 다시 확인해주세요.'
    : entry.error === 'save' ? '저장 결과를 확인하지 못했어요. 다시 저장하거나 상태를 확인해주세요.'
    : entry.saved ? `‘${label}’ 상태로 서재에 저장했어요.`
    : label ? `서재에 ‘${label}’ 상태로 담겨 있어요.` : '읽기 상태를 선택해 서재에 담아보세요.';
  return (
    <View style={styles.section} testID="book-library-status">
      <View style={styles.header}>
        <Text style={styles.heading}>내 서재</Text>
        {entry.loaded && entry.status && !entry.error && !busy ? (
          <AppButton title="서재 보기" compact variant="ghost" onPress={() => router.dismissTo('/my-library')} />
        ) : null}
      </View>
      <View style={styles.options} role="radiogroup" accessibilityLabel="읽기 상태" aria-busy={busy}>
        {Object.values(ReadingStatus).map((status, index) => (
          <View key={status} style={[styles.option, index > 0 && styles.divider]}>
            <AppButton title={`${entry.status === status ? '✓ ' : ''}${readingStatusLabels[status]}`}
              accessibilityLabel={readingStatusLabels[status]} accessibilityRole="radio"
              accessibilityState={{ checked: entry.status === status }}
              variant={entry.status === status ? 'primary' : 'ghost'} style={styles.button}
              disabled={busy || !!entry.error} onPress={() => save(status)} />
          </View>
        ))}
      </View>
      <View style={styles.feedback}>
        {busy ? <ActivityIndicator size="small" color={Colors[scheme].inkSoft} /> : null}
        <Text role={entry.error ? 'alert' : 'status'} accessibilityLiveRegion="polite"
          style={[styles.message, entry.error && styles.error]} testID="library-status-feedback">{message}</Text>
      </View>
      {entry.error && entry.status ? <Text style={styles.lastConfirmed}>마지막으로 확인한 상태: {label}</Text> : null}
      {entry.error ? (
        <View style={styles.recovery}>
          {entry.error === 'save' && entry.requestedStatus ? (
            <AppButton title="다시 저장" compact variant="secondary" onPress={() => save(entry.requestedStatus!)} />
          ) : null}
          <AppButton title="상태 다시 확인" compact variant="secondary" onPress={reload} />
        </View>
      ) : null}
    </View>
  );
}

import { type ReactNode, useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { bookApi } from '@/src/services/api';
import AppButton from '@/components/ui/AppButton';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { AppDispatch, RootState } from '@/src/store';
import { emptyLibraryStatus, fetchLibraryStatus, libraryStatusKey, readingStatusLabels, saveLibraryStatus, selectedByIsbn } from '@/src/store/libraryStatusSlice';
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

const emptyStatusMessage = '읽기 상태를 선택해 서재에 담아보세요.';

export function NewBookLibraryStatus({ isbn, userId, onSaved }: { isbn: string; userId: number; onSaved: (id: number) => void }) {
  const dispatch = useDispatch<AppDispatch>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const save = async (status: ReadingStatus) => {
    setSaving(true);
    setError(false);
    try {
      const { data } = await bookApi.updateBookStatusByIsbn(isbn, status, { handleErrorLocally: true });
      dispatch(selectedByIsbn({ userId, bookId: data, status }));
      onSaved(data);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };
  return <LibraryStatusControl status={null} busy={saving} error={error} onSave={save}
    message={error ? '서재 저장에 실패했어요. 다시 선택해주세요.'
      : saving ? '서재에 저장하고 있어요.' : emptyStatusMessage} />;
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
    : entry.saving ? entry.requestedStatus ? `‘${readingStatusLabels[entry.requestedStatus]}’ 상태로 저장하고 있어요.` : '서재에서 책을 빼고 있어요.'
    : entry.error === 'load' ? '서재 상태를 불러오지 못했어요. 다시 확인해주세요.'
    : entry.error === 'save' ? '저장 결과를 확인하지 못했어요. 다시 저장하거나 상태를 확인해주세요.'
    : entry.error === 'remove' ? '서재에서 책을 뺐는지 다시 확인해주세요.'
    : entry.saved ? `‘${label}’ 상태로 서재에 저장했어요.`
    : label ? `서재에 ‘${label}’ 상태로 담겨 있어요.` : emptyStatusMessage;
  return (
    <LibraryStatusControl status={entry.status} busy={busy} error={!!entry.error}
      disableOptions={!!entry.error} message={message} onSave={save}>
      {entry.error && entry.status ? <Text style={styles.lastConfirmed}>마지막으로 확인한 상태: {label}</Text> : null}
      {entry.error ? (
        <View style={styles.recovery}>
          {entry.error === 'save' && entry.requestedStatus ? (
            <AppButton title="다시 저장" compact variant="secondary" onPress={() => save(entry.requestedStatus!)} />
          ) : null}
          <AppButton title="상태 다시 확인" compact variant="secondary" onPress={reload} />
        </View>
      ) : null}
    </LibraryStatusControl>
  );
}

function LibraryStatusControl({ status: selected, busy, error, disableOptions = false, message, onSave, children }: {
  status: ReadingStatus | null;
  busy: boolean;
  error: boolean;
  disableOptions?: boolean;
  message: string;
  onSave: (status: ReadingStatus) => void;
  children?: ReactNode;
}) {
  const scheme = useColorScheme() ?? 'light';
  const styles = getBookLibraryStatusStyles(scheme);
  return (
    <View style={styles.section} testID="book-library-status">
      <View style={styles.header}>
        <Text style={styles.heading}>내 서재</Text>
        {selected && !error && !busy ? (
          <AppButton title="서재 보기" compact variant="ghost" onPress={() => router.dismissTo('/my-library')} />
        ) : null}
      </View>
      <View style={styles.options} role="radiogroup" accessibilityLabel="읽기 상태" aria-busy={busy}>
        {Object.values(ReadingStatus).map((status, index) => (
          <View key={status} style={[styles.option, index > 0 && styles.divider]}>
            <AppButton title={`${selected === status ? '✓ ' : ''}${readingStatusLabels[status]}`}
              accessibilityLabel={readingStatusLabels[status]} accessibilityRole="radio"
              accessibilityState={{ checked: selected === status }}
              variant={selected === status ? 'primary' : 'ghost'} style={styles.button}
              disabled={busy || disableOptions} onPress={() => onSave(status)} />
          </View>
        ))}
      </View>
      <View style={styles.feedback}>
        {busy ? <ActivityIndicator size="small" color={Colors[scheme].inkSoft} /> : null}
        <Text role={error ? 'alert' : 'status'} accessibilityLiveRegion="polite"
          style={[styles.message, error && styles.error]} testID="library-status-feedback">{message}</Text>
      </View>
      {children}
    </View>
  );
}

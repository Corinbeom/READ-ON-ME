import { useState } from 'react';
import { Text, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import AppButton from '@/components/ui/AppButton';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { BookDto } from '@/src/types/BookDto';
import { ReadingStatus } from '@/src/types/readingStatus';
import type { AppDispatch, RootState } from '@/src/store';
import { emptyLibraryStatus, fetchLibraryStatus, libraryStatusKey, readingStatusLabels, removeLibraryBook, saveLibraryStatus } from '@/src/store/libraryStatusSlice';
import { getMyLibraryScreenStyles } from '@/src/styles/MyLibraryScreen.styles';

export default function LibraryBookActions({ book, userId, onSaved }: {
  book: BookDto; userId: number; onSaved: () => void;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const styles = getMyLibraryScreenStyles(useColorScheme() ?? 'light');
  const target = { bookId: book.id, userId };
  const entry = useSelector((state: RootState) => state.libraryStatus.entries[libraryStatusKey(target)] ?? emptyLibraryStatus);
  const [confirming, setConfirming] = useState(false);
  const busy = entry.loading || entry.saving;
  const changeStatus = async (status: ReadingStatus) => {
    const result = await dispatch(saveLibraryStatus({ ...target, status }));
    if (saveLibraryStatus.fulfilled.match(result)) onSaved();
  };
  const remove = async () => {
    const result = await dispatch(removeLibraryBook(target));
    if (removeLibraryBook.fulfilled.match(result)) onSaved();
  };
  const error = entry.error === 'remove' ? '서재에서 책을 뺐는지 확인하지 못했어요.'
    : entry.error === 'save' ? '저장 결과를 확인하지 못했어요.'
    : entry.error === 'load' ? '책 상태를 불러오지 못했어요.' : '';

  return (
    <View style={styles.bookActions}>
      <Text style={styles.sectionTitle} numberOfLines={2}>{book.title}</Text>
      {confirming ? (
        <>
          <Text style={styles.actionDescription}>이 책을 내 서재에서 뺄까요?</Text>
          <AppButton title="서재에서 빼기" variant="danger" disabled={busy || !entry.status || (!!entry.error && entry.error !== 'remove')}
            loading={entry.saving} onPress={() => { void remove(); }} />
          <AppButton title="취소" variant="secondary" disabled={busy} onPress={() => setConfirming(false)} />
        </>
      ) : (
        <>
          {Object.values(ReadingStatus).map(status => (
            <AppButton key={status} title={readingStatusLabels[status]} variant={entry.status === status ? 'primary' : 'secondary'}
              accessibilityRole="radio" accessibilityState={{ checked: entry.status === status }}
              disabled={busy || entry.status === status || entry.error === 'load' || entry.error === 'remove'
                || (entry.error === 'save' && entry.requestedStatus !== status)}
              loading={entry.saving && entry.requestedStatus === status} onPress={() => { void changeStatus(status); }} />
          ))}
          <AppButton title="서재에서 빼기" variant="ghost" disabled={busy || !entry.status || (!!entry.error && entry.error !== 'remove')}
            onPress={() => setConfirming(true)} />
        </>
      )}
      {error ? (
        <>
          <Text role="alert" style={styles.actionDescription}>{error}</Text>
          <AppButton title="상태 다시 확인" variant="secondary" disabled={busy}
            onPress={() => { void dispatch(fetchLibraryStatus(target)); }} />
        </>
      ) : null}
    </View>
  );
}

import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { restoreRecentEdition } from '@/src/services/catalogEdition';
import type { RecentBook } from '@/src/utils/recentBooks';

// The parent keys each card by ISBN. A detail view in this session already supplies its metadata.
export function useRecentBookDetails(book: RecentBook) {
  const [restored, setRestored] = useState<RecentBook>();
  const [failed, setFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const visible = book.title ? book : restored;
  const retry = useCallback(() => {
    request.current?.abort();
    if (visible) return;
    const controller = new AbortController();
    request.current = controller;
    setFailed(false);
    restoreRecentEdition(book.isbn13, controller.signal).then(result => {
      if (!controller.signal.aborted) setRestored(result);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
  }, [book.isbn13, visible]);
  useFocusEffect(useCallback(() => {
    retry();
    return () => request.current?.abort();
  }, [retry]));
  return { visible, failed: !visible && failed, retry };
}

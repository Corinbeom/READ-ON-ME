import { useCallback, useState, type ReactNode } from 'react';
import { router, useFocusEffect } from 'expo-router';
import ScreenState from '@/components/ui/ScreenState';
import { aiJobApi } from '@/src/services/api';

export default function GalpiAvailability({ children, hideDuringMaintenance = false }: { children: ReactNode; hideDuringMaintenance?: boolean }) {
  const [available, setAvailable] = useState(false);
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    aiJobApi.availability(controller.signal).then(({ data }) => {
      if (!controller.signal.aborted) setAvailable(data.data === true);
    }).catch(() => {
      if (!controller.signal.aborted) setAvailable(false);
    });
    return () => controller.abort();
  }, []));
  if (available) return <>{children}</>;
  if (hideDuringMaintenance) return null;
  return (
    <ScreenState title="갈피의 추천 도서를 정비하고 있어요" action="일반 검색으로 이동"
      onAction={() => router.replace('/(tabs)/search')} />
  );
}

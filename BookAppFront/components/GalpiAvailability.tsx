import { useCallback, useState, type ReactNode } from 'react';
import { router, useFocusEffect } from 'expo-router';
import ScreenState from '@/components/ui/ScreenState';
import { aiJobApi } from '@/src/services/api';
import { watchAiJob } from '@/src/utils/aiJobStatusWatcher';

export default function GalpiAvailability({ children, hideDuringMaintenance = false }: { children: ReactNode; hideDuringMaintenance?: boolean }) {
  const [state, setState] = useState<'checking' | 'available' | 'maintenance'>('checking');
  useFocusEffect(useCallback(() => {
    const watcher = watchAiJob(async (signal) => {
      try {
        const { data } = await aiJobApi.availability(signal);
        if (!signal.aborted) setState(data.data ? 'available' : 'maintenance');
        return false;
      } catch {
        if (!signal.aborted) setState('checking');
        return true;
      }
    }, 3000);
    return watcher.stop;
  }, []));
  if (state === 'available') return <>{children}</>;
  if (hideDuringMaintenance) return null;
  if (state === 'checking') return <ScreenState title="갈피 연결을 확인하고 있어요" loading />;
  return (
    <ScreenState title="갈피의 추천 도서를 정비하고 있어요" action="일반 검색으로 이동"
      onAction={() => router.replace('/(tabs)/search')} />
  );
}

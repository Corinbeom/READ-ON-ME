import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import AppButton from '@/components/ui/AppButton';
import { operationsApi } from '@/src/services/api';

export default function OperationsShortcut({ userId }: { userId: number }) {
  const [authorizedUser, setAuthorizedUser] = useState<number | null>(null);

  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    void operationsApi.access(controller.signal).then(({ data }) => {
      if (!controller.signal.aborted) setAuthorizedUser(data.data.user_id === userId ? userId : null);
    }).catch(() => {
      if (!controller.signal.aborted) setAuthorizedUser(null);
    });
    return () => controller.abort();
  }, [userId]));

  if (authorizedUser !== userId) return null;
  return (
    <Link href="/operations" asChild>
      <AppButton title="서비스 운영" compact variant="secondary" accessibilityRole="link" />
    </Link>
  );
}

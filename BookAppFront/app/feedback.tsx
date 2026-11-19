import { isAxiosError } from 'axios';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppButton from '@/components/ui/AppButton';
import { FormField } from '@/components/ui/AppTextInput';
import ScreenState from '@/components/ui/ScreenState';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { feedbackApi } from '@/src/services/api';
import { Spacing, Typography } from '@/src/styles/designTokens';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';
import { feedbackCategories, type FeedbackCategory } from '@/src/utils/feedback';

export default function FeedbackScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<FeedbackCategory>();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const request = useRef<AbortController | null>(null);
  const message = draft.trim();

  useEffect(() => () => request.current?.abort(), []);

  const submit = async () => {
    if (!category || !message || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setSending(true);
    setError('');
    try {
      await feedbackApi.submit(category, message, controller.signal);
      if (!controller.signal.aborted) setSent(true);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(isAxiosError(failure) && failure.response?.status === 429
        ? '요청이 많아요. 잠시 후 다시 보내주세요.'
        : '의견을 보내지 못했어요. 입력한 내용은 남아 있으니 다시 시도해주세요.');
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setSending(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: c.background }} keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, Spacing.xl) }]}>
      {sent ? (
        <ScreenState title="의견을 받았어요" description="Read On Me를 써보고 이야기해주셔서 감사합니다."
          action="홈으로 돌아가기" onAction={() => router.dismissTo('/')} />
      ) : (
        <>
          <View style={styles.field}>
            <Text style={[Typography.label, { color: c.text }]}>어떤 의견인가요?</Text>
            <View role="radiogroup" accessibilityLabel="의견 유형" style={styles.categories}>
              {feedbackCategories.map(({ value, label }) => (
                <AppButton key={value} compact title={label} variant={category === value ? 'primary' : 'secondary'}
                  accessibilityRole="radio" accessibilityState={{ checked: category === value }} disabled={sending}
                  onPress={() => setCategory(value)} />
              ))}
            </View>
          </View>
          <FormField label="의견" value={draft} multiline maxLength={1000} editable={!sending}
            placeholder="어떤 화면에서 어떤 일이 있었는지 알려주세요."
            hint="이메일, 비밀번호 등 개인정보는 적지 말아주세요."
            onChangeText={setDraft} />
          {error ? <Text accessibilityRole="alert" style={[Typography.label, { color: c.danger }]}>{error}</Text> : null}
          <AppButton title="보내기" loading={sending} disabled={!category || !message} onPress={() => void submit()} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SCREEN_LAYOUT.gutter, paddingTop: Spacing.lg, gap: Spacing.lg },
  field: { gap: Spacing.xs },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
});

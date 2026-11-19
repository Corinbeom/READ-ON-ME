import { isAxiosError } from 'axios';
import { Star } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import AppButton from '@/components/ui/AppButton';
import { FormField } from '@/components/ui/AppTextInput';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { aiJobApi, type RecommendationFeedback as SavedFeedback } from '@/src/services/api';
import { Spacing, Typography, UI } from '@/src/styles/designTokens';
import { recommendationRatings, type RecommendationRating } from '@/src/utils/feedback';

type Props = { jobId: string; hasBooks: boolean; onExpand: () => void };
const scoreLabels = ['전혀 맞지 않아요', '별로 맞지 않아요', '보통이에요', '대체로 잘 맞아요', '아주 잘 맞아요'];
const isUnavailable = (error: unknown) => isAxiosError(error) && error.response?.status === 404;

export default function RecommendationFeedback({ jobId, hasBooks, onExpand }: Props) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const [saved, setSaved] = useState<SavedFeedback>();
  const [rating, setRating] = useState<RecommendationRating | null>(null);
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const saveRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void aiJobApi.feedback(jobId, controller.signal).then(({ data }) => {
      if (controller.signal.aborted) return;
      setSaved(data.data);
      setRating(data.data.rating);
      setComment(data.data.comment ?? '');
    }).catch(failure => {
      if (controller.signal.aborted) return;
      if (isUnavailable(failure)) setUnavailable(true);
      else setError('평가를 불러오지 못했어요.');
    });
    return () => controller.abort();
  }, [jobId, loadAttempt]);

  useEffect(() => () => saveRequest.current?.abort(), []);

  const submit = async () => {
    if (!rating || saveRequest.current) return;
    const controller = new AbortController();
    saveRequest.current = controller;
    Keyboard.dismiss();
    setError('');
    setSending(true);
    try {
      const { data } = await aiJobApi.sendFeedback(jobId, rating, comment.trim(), controller.signal);
      if (controller.signal.aborted) return;
      setSaved(data.data);
      setRating(data.data.rating);
      setComment(data.data.comment ?? '');
      setEditing(false);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (isUnavailable(failure)) setUnavailable(true);
      else setError('평가를 보내지 못했어요. 다시 시도해 주세요.');
    } finally {
      if (!controller.signal.aborted) setSending(false);
      saveRequest.current = null;
    }
  };

  const muted = { color: colors.inkSoft };
  const title = hasBooks ? '찾던 책에 가까웠나요?' : '이번 검색은 어땠나요?';
  if (!saved && !error && !unavailable) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
      {unavailable ? <Text style={[Typography.caption, muted]}>이 검색의 평가 기간이 끝났어요.</Text>
        : saved?.rating && !editing ? (
          <View style={styles.actions}>
            <View style={styles.confirmation}>
              <Text accessibilityLiveRegion="polite" style={[Typography.label, { color: colors.text }]}>평가를 보내주셔서 감사해요.</Text>
              <Text style={[Typography.caption, muted]}>내 평가 {saved.rating}점</Text>
            </View>
            <AppButton compact variant="ghost" title="평가 수정" onPress={() => {
              onExpand();
              setEditing(true);
              setShowComment(!!saved.comment);
            }} />
          </View>
        ) : <>
          <Text accessibilityRole="header" style={[Typography.section, { color: colors.text }]}>{title}</Text>
          {saved ? <>
            <View accessibilityRole="radiogroup" accessibilityLabel="추천 만족도" style={styles.stars}>
              {recommendationRatings.map(score => {
                const filled = rating !== null && score <= rating;
                return (
                  <Pressable key={score} accessibilityRole="radio" accessibilityLabel={`${score}점, ${scoreLabels[score - 1]}`}
                    accessibilityState={{ checked: rating === score, disabled: sending }} disabled={sending}
                    onPress={() => setRating(score)} style={({ pressed }) => [
                      styles.star, { backgroundColor: pressed ? colors.surface2 : 'transparent' },
                    ]}>
                    <Star size={26} color={filled ? colors.star : colors.inkSoft} fill={filled ? colors.star : 'none'} aria-hidden />
                  </Pressable>
                );
              })}
            </View>
            <Text accessibilityLiveRegion="polite" style={[Typography.caption, muted]}>
              {rating ? `${rating}점 · ${scoreLabels[rating - 1]}` : '별을 눌러 1점부터 5점까지 평가해 주세요.'}
            </Text>
            {showComment ? (
              <FormField label="추가 의견 (선택)" value={comment} onChangeText={setComment} editable={!sending}
                placeholder={hasBooks ? '어떤 점이 좋았거나 아쉬웠나요?' : '어떤 책을 찾고 있었나요?'}
                maxLength={500} multiline style={styles.comment} />
            ) : (
              <AppButton compact variant="ghost" title="의견 덧붙이기" disabled={sending}
                style={styles.commentAction} onPress={() => {
                  onExpand();
                  setShowComment(true);
                }} />
            )}
            <Text style={[Typography.caption, muted]}>보내면 질문과 추천 책 목록이 운영팀에 함께 전달돼요.</Text>
            {error ? <Text accessibilityRole="alert" style={[Typography.caption, { color: colors.danger }]}>{error}</Text> : null}
            <View style={styles.actions}>
              {editing ? <AppButton compact variant="ghost" title="취소" disabled={sending} onPress={() => {
                setRating(saved.rating);
                setComment(saved.comment ?? '');
                setError('');
                setEditing(false);
              }} /> : null}
              <AppButton title={editing ? '수정 내용 저장' : '평가 보내기'} variant="primary"
                style={styles.send} disabled={!rating} loading={sending} onPress={() => { void submit(); }} />
            </View>
          </> : <>
            <Text accessibilityRole="alert" style={[Typography.caption, { color: colors.danger }]}>{error}</Text>
            <AppButton compact variant="secondary" title="다시 불러오기" style={styles.commentAction} onPress={() => {
              setError('');
              setLoadAttempt(value => value + 1);
            }} />
          </>}
        </>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: UI.cardRadius, padding: Spacing.md, gap: Spacing.xs },
  stars: { flexDirection: 'row', flexWrap: 'wrap' },
  star: { width: UI.iconButtonSize, height: UI.iconButtonSize, borderRadius: UI.controlRadius, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.xs },
  confirmation: { flex: 1, gap: Spacing.xxs },
  commentAction: { alignSelf: 'flex-start', paddingHorizontal: 0, minHeight: UI.iconButtonSize },
  comment: { minHeight: 76 },
  send: { flex: 1 },
});

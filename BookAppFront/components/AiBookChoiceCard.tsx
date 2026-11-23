import BookSourceLink from '@/components/BookSourceLink';
import { readBookAttribution } from '@/src/utils/bookAttribution';
import AppButton from '@/components/ui/AppButton';
import { Spacing, Typography, UI } from '@/src/styles/designTokens';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { AiSearchBook } from '@/src/services/api';
import { secureImageUri } from '@/src/utils/imageUri';

export default function AiBookChoiceCard({
  book,
  position,
  label,
  selected = false,
  onToggle,
  onChoose,
  onDetails,
  showEvidence = false,
  showDetailsAction = true,
}: {
  book: AiSearchBook;
  position?: number;
  label?: string;
  selected?: boolean;
  onToggle?: () => void;
  onChoose?: () => void;
  onDetails: () => void;
  showEvidence?: boolean;
  showDetailsAction?: boolean;
}) {
  const theme = useColorScheme() ?? 'dark';
  const styles = getStyles(theme);
  const [imageFailed, setImageFailed] = useState(false);
  const thumbnail = secureImageUri(book.thumbnail);
  const title = book.title?.trim() || '제목 정보 없음';
  const authors = Array.isArray(book.authors) ? book.authors.join(', ') : book.authors?.trim();
  const { source } = readBookAttribution(book.contents);
  const reason = (book.ranking_status === 'GEMINI' || book.ranking_status === 'GROQ') && book.reason?.trim() && book.reason_evidence?.trim()
    ? book.reason.trim()
    : null;

  useEffect(() => setImageFailed(false), [thumbnail]);

  return (
    <View style={[styles.card, selected && styles.selectedCard]}>
      <View style={styles.topRow}>
        <Text style={styles.index}>{position ? String(position).padStart(2, '0') : label ?? '추천 후보'}</Text>
        {onToggle ? <AppButton compact title={selected ? '선택됨 ✓' : '비교 후보로 선택'}
          variant={selected ? 'primary' : 'secondary'} onPress={onToggle}
          accessibilityRole="checkbox" accessibilityState={{ checked: selected }}
          accessibilityLabel={`${title} 비교 후보 ${selected ? '선택됨' : '선택하기'}`} /> : null}
      </View>
      <View style={styles.mainRow}>
        <View style={styles.coverFrame}>
          {thumbnail && !imageFailed ? <Image source={{ uri: thumbnail }} style={styles.cover} resizeMode="contain" onError={() => setImageFailed(true)} />
            : <Text style={styles.coverPlaceholder}>표지 없음</Text>}
        </View>
        <View style={styles.bookInfo}>
          <Text style={styles.title} numberOfLines={3}>{title}</Text>
          {authors ? <Text style={styles.authors}>{authors}</Text> : null}
        </View>
      </View>
      <View style={styles.reasonBlock}>
        <Text style={styles.reasonLabel}>추천 이유</Text>
        <Text style={reason ? styles.reason : styles.noReason}>{reason || (book.ranking_status === 'FALLBACK'
          ? 'AI 추천 이유는 제공되지 않아요. 책 상세에서 소개를 확인해 주세요.'
          : '확인 가능한 추천 이유가 없어요. 책 상세에서 소개를 확인해 주세요.')}</Text>
      </View>
      {showEvidence && reason && book.reason_evidence ? <View style={styles.evidenceBlock}>
        <Text style={styles.reasonLabel}>책 소개에서 확인한 근거</Text>
        <Text style={styles.evidence}>{book.reason_evidence}</Text>
      </View> : null}
      {source && <BookSourceLink source={source} />}
      {showDetailsAction || onChoose ? <View style={styles.actions}>
        {showDetailsAction ? <AppButton title="책 상세 보기" variant="secondary" style={styles.action} onPress={onDetails} /> : null}
        {onChoose ? <AppButton title="이 책으로 결정" style={styles.action} onPress={onChoose} accessibilityLabel={`${title} 선택하기`} /> : null}
      </View> : null}
    </View>
  );
}

const getStyles = (theme: 'light' | 'dark') => {
  const c = Colors[theme];
  return StyleSheet.create({
    card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: UI.cardRadius, padding: Spacing.md, marginBottom: Spacing.md },
    selectedCard: { borderColor: c.text, borderWidth: 2, padding: Spacing.md - 1 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.md },
    index: { ...Typography.caption, color: c.inkSoft, flexShrink: 1 },
    mainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
    coverFrame: { width: 76, height: 112, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' },
    cover: { width: 76, height: 112 },
    coverPlaceholder: { ...Typography.caption, color: c.inkSoft },
    bookInfo: { flex: 1, minWidth: 0 },
    title: { ...Typography.bookTitle, color: c.text },
    authors: { ...Typography.caption, color: c.inkSoft, marginTop: Spacing.xs },
    reasonBlock: { borderTopWidth: 1, borderTopColor: c.line, marginTop: Spacing.md, paddingTop: Spacing.sm },
    reasonLabel: { ...Typography.caption, color: c.inkSoft, marginBottom: Spacing.xxs },
    reason: { ...Typography.body, color: c.text },
    noReason: { ...Typography.body, color: c.inkSoft },
    evidenceBlock: { marginTop: Spacing.sm, backgroundColor: c.surface2, padding: Spacing.sm, borderRadius: UI.controlRadius },
    evidence: { ...Typography.body, color: c.inkSoft },
    actions: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.md },
    action: { flex: 1, paddingHorizontal: Spacing.xs },
  });
};

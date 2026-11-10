import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { AiSearchBook } from '@/src/services/api';

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
  const thumbnail = book.thumbnail?.trim();
  const title = book.title?.trim() || '제목 정보 없음';
  const authors = Array.isArray(book.authors) ? book.authors.join(', ') : book.authors?.trim();
  const reason = book.ranking_status === 'GEMINI' && book.reason?.trim() && book.reason_evidence?.trim()
    ? book.reason.trim()
    : null;

  useEffect(() => setImageFailed(false), [thumbnail]);

  return (
    <View style={[styles.card, selected && styles.selectedCard]}>
      <View style={styles.topRow}>
        <Text style={styles.index}>{position ? String(position).padStart(2, '0') : label ?? '추천 후보'}</Text>
        {onToggle ? (
          <TouchableOpacity
            onPress={onToggle}
            style={[styles.selectButton, selected && styles.selectButtonActive]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${title} 비교 후보 ${selected ? '선택됨' : '선택하기'}`}
          >
            <Text style={[styles.selectText, selected && styles.selectTextActive]}>
              {selected ? '선택됨 ✓' : '비교 후보로 선택'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.mainRow}>
        <View style={styles.coverFrame}>
          {thumbnail && !imageFailed ? (
            <Image source={{ uri: thumbnail }} style={styles.cover} resizeMode="contain" onError={() => setImageFailed(true)} />
          ) : <Text style={styles.coverPlaceholder}>표지 없음</Text>}
        </View>
        <View style={styles.bookInfo}>
          <Text style={styles.title}>{title}</Text>
          {authors ? <Text style={styles.authors}>{authors}</Text> : null}
          {reason ? (
            <View style={styles.reasonBlock}>
              <Text style={styles.reasonLabel}>추천 이유</Text>
              <Text style={styles.reason}>{reason}</Text>
            </View>
          ) : <Text style={styles.noReason}>추천 이유를 확인할 수 없어요. 책 소개를 살펴보고 골라주세요.</Text>}
        </View>
      </View>
      {showEvidence && reason ? (
        <View style={styles.evidenceBlock}>
          <Text style={styles.evidenceLabel}>책 소개에서 확인한 내용</Text>
          <Text style={styles.evidence} numberOfLines={3}>{book.reason_evidence}</Text>
        </View>
      ) : null}
      {showDetailsAction || onChoose ? (
        <View style={styles.actions}>
          {showDetailsAction ? (
            <TouchableOpacity onPress={onDetails} style={styles.detailButton} disabled={!book.isbn} accessibilityRole="button">
              <Text style={styles.detailText}>책 상세 보기</Text>
            </TouchableOpacity>
          ) : null}
          {onChoose ? (
            <TouchableOpacity onPress={onChoose} style={styles.chooseButton} accessibilityRole="button" accessibilityLabel={`${title} 선택하기`}>
              <Text style={styles.chooseText}>이 책으로 결정 →</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const getStyles = (theme: 'light' | 'dark') => {
  const c = Colors[theme];
  return StyleSheet.create({
    card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.line, padding: 16, marginBottom: 12 },
    selectedCard: { borderColor: c.text, borderWidth: 2, padding: 15 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    index: { color: c.inkSoft, fontFamily: 'Pretendard-SemiBold', fontSize: 11 },
    selectButton: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', borderWidth: 1, borderColor: c.line },
    selectButtonActive: { backgroundColor: c.text, borderColor: c.text },
    selectText: { color: c.text, fontFamily: 'Pretendard-SemiBold', fontSize: 11 },
    selectTextActive: { color: c.background },
    mainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
    coverFrame: { width: 88, height: 130, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' },
    cover: { width: 88, height: 130 },
    coverPlaceholder: { color: c.inkSoft, fontFamily: 'NotoSerifKR-Regular', fontSize: 11 },
    bookInfo: { flex: 1, minWidth: 0 },
    title: { color: c.text, fontFamily: 'NotoSerifKR-Regular', fontSize: 16, lineHeight: 23 },
    authors: { color: c.inkSoft, fontFamily: 'Pretendard-SemiBold', fontSize: 12, lineHeight: 18, marginTop: 6 },
    reasonBlock: { borderTopWidth: 1, borderTopColor: c.line, marginTop: 12, paddingTop: 10 },
    reasonLabel: { color: c.inkSoft, fontFamily: 'Pretendard-SemiBold', fontSize: 10, marginBottom: 4 },
    reason: { color: c.text, fontFamily: 'NotoSerifKR-Regular', fontSize: 12, lineHeight: 19 },
    noReason: { color: c.inkSoft, fontFamily: 'NotoSerifKR-Regular', fontSize: 12, lineHeight: 19, marginTop: 12 },
    evidenceBlock: { marginTop: 12, backgroundColor: c.surface2, padding: 10 },
    evidenceLabel: { color: c.inkSoft, fontFamily: 'Pretendard-SemiBold', fontSize: 10, marginBottom: 4 },
    evidence: { color: c.text, fontFamily: 'NotoSerifKR-Regular', fontSize: 11, lineHeight: 17 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    detailButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.line },
    detailText: { color: c.text, fontFamily: 'Pretendard-SemiBold', fontSize: 11 },
    chooseButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: c.text },
    chooseText: { color: c.background, fontFamily: 'Pretendard-SemiBold', fontSize: 11 },
  });
};

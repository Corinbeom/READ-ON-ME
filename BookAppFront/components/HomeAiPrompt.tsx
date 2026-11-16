import { useEffect, useMemo, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import { Text, View } from 'react-native';

import BookmarkMascot from '@/components/BookmarkMascot';
import AppButton from '@/components/ui/AppButton';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getHomeScreenStyles } from '@/src/styles/HomeScreen.styles';
import { AI_SEARCH_EXAMPLES } from '@/src/constants/aiSearchExamples';
import { aiSearchHref } from '@/src/utils/aiSearchEntry';

const PROMPTS = [
  '스릴러 소설 추천해줘',
  '잠 못 드는 밤에 읽을 책',
  '나 요즘 좀 지쳐있어. 위로가 되는 책',
  '일본 소설 입문으로 뭐가 좋아?',
  '짧은 에세이 하나 추천해줘',
  '성장하는 주인공 나오는 소설',
];

export default function HomeAiPrompt() {
  const colorScheme = useColorScheme() ?? 'light';
  const styles = useMemo(() => getHomeScreenStyles(colorScheme), [colorScheme]);
  const focused = useIsFocused();
  const [typedText, setTypedText] = useState('');
  const [promptIdx, setPromptIdx] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const [cursorOn, setCursorOn] = useState(true);

  // Keep animation updates inside this component, away from the book lists.
  useEffect(() => {
    if (!focused) return;
    const current = PROMPTS[promptIdx];
    const timer = setTimeout(() => {
      if (isTyping && typedText.length < current.length) {
        setTypedText(current.slice(0, typedText.length + 1));
      } else if (isTyping) {
        setIsTyping(false);
      } else if (typedText.length > 0) {
        setTypedText((text) => text.slice(0, -1));
      } else {
        setPromptIdx((index) => (index + 1) % PROMPTS.length);
        setIsTyping(true);
      }
    }, isTyping ? (typedText.length < current.length ? 75 : 2000) : 35);
    return () => clearTimeout(timer);
  }, [focused, typedText, isTyping, promptIdx]);

  useEffect(() => {
    if (!focused) return;
    const timer = setInterval(() => setCursorOn((value) => !value), 530);
    return () => clearInterval(timer);
  }, [focused]);

  return (
    <View style={styles.aiSection} testID="home-ai-discovery">
      <View style={styles.aiContent}>
        <View style={styles.aiCopy}>
          <Text style={styles.aiLabel}>AI 사서와 책 고르기</Text>
          <Text accessibilityRole="header" style={styles.aiTitle}>오늘은 어떤 책을{`\n`}읽고 싶으세요?</Text>
        </View>
        <BookmarkMascot state="idle" size={80} compact />
      </View>
      <Text style={styles.aiDescription}>기분이나 취향을 알려주세요.{`\n`}어울리는 책을 함께 골라드릴게요.</Text>
      <Text testID="home-typing-prompt" aria-hidden style={styles.aiPromptText} numberOfLines={1}>
        예: {typedText}<Text style={{ opacity: cursorOn ? 1 : 0 }}>|</Text>
      </Text>
      <AppButton title="나에게 맞는 책 찾기" onPress={() => router.push(aiSearchHref())} />
      <View style={styles.aiExamples}>
        {AI_SEARCH_EXAMPLES.map((example) => (
          <AppButton key={example.label} compact variant="secondary" title={example.label}
            style={styles.aiExample} accessibilityHint="선택한 조건을 추천 화면에 미리 입력합니다."
            onPress={() => router.push(aiSearchHref(example.query))} />
        ))}
      </View>
    </View>
  );
}

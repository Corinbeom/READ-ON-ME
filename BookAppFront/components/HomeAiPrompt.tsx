import { useEffect, useMemo, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';

import BookmarkMascot from '@/components/BookmarkMascot';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getHomeScreenStyles } from '@/src/styles/HomeScreen.styles';

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
    <TouchableOpacity
      style={styles.aiSection}
      onPress={() => router.push('/ai-books')}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="AI 사서와 책 고르기"
    >
      <View style={styles.aiContent}>
        <View style={styles.aiCopy}>
          <Text style={styles.aiLabel}>AI 사서</Text>
          <Text style={styles.aiPromptText}>오늘 읽을 한 권을 골라볼까요?</Text>
          <Text testID="home-typing-prompt" style={styles.aiPromptText} numberOfLines={1}>
            {typedText}<Text style={{ opacity: cursorOn ? 1 : 0 }}>|</Text>
          </Text>
          <Text style={styles.aiSubText}>책을 찾고, 비교하고, 한 권 고르기 →</Text>
        </View>
        <BookmarkMascot state="idle" size={68} compact />
      </View>
    </TouchableOpacity>
  );
}

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { ReadingKeyword } from '@/src/utils/libraryOverview';
import { getLibraryReadingKeywordsStyles } from './styles/LibraryReadingKeywords.styles';

const cloudRows = [[1, 2], [0], [3, 4, 5], [6, 7, 8], [9, 10, 11]];
const sizes = [33, 23, 22, 20, 19, 18, 17, 17, 16, 15, 15, 15];
const tilts = [0, -6, 6, -5, 0, 7, 5, -7, 2, -5, 6, -2];
const stepMs = 65;
const appearanceMs = 390;

export default function ReadingKeywordCloud({ keywords, onSelect }: {
  keywords: ReadingKeyword[];
  onSelect: (tag: string) => void;
}) {
  const styles = getLibraryReadingKeywordsStyles(useColorScheme() ?? 'light');
  const cloudRef = useRef<View>(null);
  const started = useRef(false);
  const focused = useIsFocused();
  const duration = (keywords.length - 1) * stepMs + appearanceMs;
  const progress = useRef(new Animated.Value(duration)).current;
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [focusedTag, setFocusedTag] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (active) setReduceMotion(enabled);
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; subscription?.remove(); };
  }, []);

  useEffect(() => {
    if (!focused || reduceMotion !== false || started.current) return;

    let animation: Animated.CompositeAnimation | undefined;
    progress.setValue(0);
    const reveal = () => {
      if (started.current) return;
      started.current = true;
      animation = Animated.timing(progress, {
        toValue: duration, duration, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web',
      });
      animation.start();
    };

    const element = cloudRef.current;
    // Wait until the cloud comes into view below the user's books.
    const observer = Platform.OS === 'web' && typeof IntersectionObserver === 'function' && element instanceof Element
      ? new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          reveal();
          observer?.disconnect();
        }
      }, { threshold: 0.12 }) : undefined;
    if (observer && element instanceof Element) observer.observe(element);
    else reveal();

    return () => {
      observer?.disconnect();
      animation?.stop();
      progress.setValue(duration);
    };
  }, [duration, focused, progress, reduceMotion]);

  return (
    <View ref={cloudRef} style={styles.cloud} testID="reading-keyword-cloud">
      {cloudRows.map(row => {
        const indices = row.filter(index => index < keywords.length);
        if (!indices.length) return null;
        return <View key={row[0]} style={styles.cloudRow}>
          {indices.map(index => {
            const item = keywords[index];
            const start = index * stepMs;
            const inputRange = [start, start + 165, start + appearanceMs];
            const opacity = progress.interpolate({ inputRange, outputRange: [0, 0.8, 1], extrapolate: 'clamp' });
            const scale = progress.interpolate({ inputRange, outputRange: [0.72, 0.95, 1], extrapolate: 'clamp' });
            const size = sizes[index];
            const rotate = `${item.tag.length > 12 ? 0 : tilts[index]}deg`;
            return <Pressable key={item.tag} accessibilityRole="button" accessibilityLabel={`${item.tag} · ${item.count}권`}
              accessibilityHint="이 키워드가 나온 책을 표시합니다." onPress={() => onSelect(item.tag)}
              onFocus={() => setFocusedTag(item.tag)} onBlur={() => setFocusedTag(null)}
              style={({ pressed }) => [styles.cloudWord, (pressed || focusedTag === item.tag) && styles.cloudWordFocused]}>
              <Animated.Text style={[styles.cloudLabel, index === 0 && styles.cloudMainLabel, {
                fontSize: size, lineHeight: size + 8, opacity, transform: [{ scale }, { rotate }],
              }]}>{item.tag}</Animated.Text>
            </Pressable>;
          })}
        </View>;
      })}
    </View>
  );
}

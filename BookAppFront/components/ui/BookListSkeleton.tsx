import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getBookListSkeletonStyles } from '@/components/styles/BookListSkeleton.styles';

type Layout = 'carousel' | 'rows' | 'library';

export default function BookListSkeleton({ layout, label }: { layout: Layout; label: string }) {
  const styles = getBookListSkeletonStyles(useColorScheme() ?? 'light');
  const focused = useIsFocused();
  const opacity = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    setVisible(false);
    if (!focused) return;
    const timer = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timer);
  }, [focused]);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (active) setReduceMotion(enabled); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!visible || !focused) { opacity.setValue(0); return; }
    if (reduceMotion) { opacity.setValue(1); return; }
    const timing = (toValue: number, duration: number) => Animated.timing(opacity, { toValue, duration, useNativeDriver: Platform.OS !== 'web' });
    const animation = Animated.sequence([
      timing(0.85, 180),
      Animated.loop(Animated.sequence([timing(0.5, 800), timing(0.85, 800)])),
    ]);
    animation.start();
    return () => animation.stop();
  }, [visible, reduceMotion, opacity, focused]);

  const cards = (library = false) => (
    <View style={styles.cards}>
      {Array.from({ length: 5 }, (_, index) => (
        <View key={index} style={library ? styles.libraryCard : styles.card}>
          <View style={[styles.bone, library ? styles.libraryCover : styles.cover]} />
          <View style={styles.titleLines}>
            <View style={[styles.bone, styles.line]} /><View style={[styles.bone, styles.shortLine]} />
          </View>
          <View style={[styles.bone, styles.authorLine]} />
        </View>
      ))}
    </View>
  );
  return (
    <View style={styles.outer} testID={`book-list-loading-${layout}`} accessibilityRole="progressbar"
      accessibilityLabel={label} accessibilityState={{ busy: true }} accessibilityLiveRegion="polite"
      aria-busy aria-hidden={!visible || !focused} accessibilityElementsHidden={!visible || !focused}>
      <Animated.View style={{ opacity }} importantForAccessibility="no-hide-descendants">
        {layout === 'carousel' ? cards() : layout === 'rows' ? (
          <>
            <View style={styles.resultsHeading}><View style={[styles.bone, styles.resultCount]} /></View>
            {Array.from({ length: 5 }, (_, index) => (
              <View key={index}>
                {index ? <View style={styles.rowDivider} /> : null}
                <View style={styles.row}>
                  <View style={[styles.bone, styles.rowCover]} />
                  <View style={styles.rowText}>
                    <View style={[styles.bone, styles.rowTitle]} /><View style={[styles.bone, styles.rowAuthor]} />
                  </View>
                </View>
              </View>
            ))}
          </>
        ) : (
          <>
            <View style={styles.stats}>
              {[0, 1, 2].map((index) => <View key={index} style={styles.stat}><View style={[styles.bone, styles.statCount]} /><View style={[styles.bone, styles.statLabel]} /></View>)}
            </View>
            {[0, 1].map((index) => (
              <View key={index} style={styles.shelf}>
                <View style={styles.shelfHeading}><View style={[styles.bone, styles.headingLine]} /><View style={[styles.bone, styles.allBooksLine]} /></View>
                {cards(true)}
              </View>
            ))}
          </>
        )}
      </Animated.View>
    </View>
  );
}

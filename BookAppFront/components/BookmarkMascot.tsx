import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, View } from 'react-native';

import { useColorScheme } from '@/hooks/useColorScheme';

export type BookmarkMascotState = 'idle' | 'searching' | 'comparing' | 'selected' | 'empty';

const images = {
  light: {
    idle: require('@/assets/mascot/bookmark_idle_light.png'),
    searching: require('@/assets/mascot/bookmark_searching_light.png'),
    comparing: require('@/assets/mascot/bookmark_comparing_light.png'),
    selected: require('@/assets/mascot/bookmark_selected_light.png'),
    empty: require('@/assets/mascot/bookmark_empty_light.png'),
    searchingBooks: require('@/assets/mascot/bookmark_searching_books_light.png'),
    searchingCharacter: require('@/assets/mascot/bookmark_searching_character_light.png'),
    small: require('@/assets/mascot/bookmark_idle_small_light.png'),
  },
  dark: {
    idle: require('@/assets/mascot/bookmark_idle_dark.png'),
    searching: require('@/assets/mascot/bookmark_searching_dark.png'),
    comparing: require('@/assets/mascot/bookmark_comparing_dark.png'),
    selected: require('@/assets/mascot/bookmark_selected_dark.png'),
    empty: require('@/assets/mascot/bookmark_empty_dark.png'),
    searchingBooks: require('@/assets/mascot/bookmark_searching_books_dark.png'),
    searchingCharacter: require('@/assets/mascot/bookmark_searching_character_dark.png'),
    small: require('@/assets/mascot/bookmark_idle_small_dark.png'),
  },
};

export default function BookmarkMascot({
  state,
  size,
  active = true,
  compact = false,
}: {
  state: BookmarkMascotState;
  size: number;
  active?: boolean;
  compact?: boolean;
}) {
  const theme = useColorScheme() ?? 'dark';
  const asset = images[theme];
  const movement = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    movement.setValue(0);
    if (state !== 'searching' || !active || reduceMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(movement, { toValue: -2, duration: 900, useNativeDriver: true }),
      Animated.timing(movement, { toValue: 2, duration: 900, useNativeDriver: true }),
      Animated.timing(movement, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [active, movement, reduceMotion, state]);

  const frame = { width: size, height: size };
  if (compact && state === 'idle') {
    return <Image source={asset.small} style={frame} resizeMode="contain" accessible={false} />;
  }
  if (state === 'searching' && active && !reduceMotion) {
    return (
      <View style={frame} accessible={false}>
        <Image source={asset.searchingBooks} style={[frame, { position: 'absolute' }]} resizeMode="contain" />
        <Animated.Image
          source={asset.searchingCharacter}
          style={[frame, { position: 'absolute', transform: [{ translateY: movement }] }]}
          resizeMode="contain"
        />
      </View>
    );
  }
  return <Image source={asset[state]} style={frame} resizeMode="contain" accessible={false} />;
}

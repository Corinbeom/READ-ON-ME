/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const primary = '#8B5E3C'; // Ink Brown
const accent = '#E3C565'; // Toned-down Gold
const background = '#FFFDF9'; // Ivory
const text = '#121212'; // Dark text
const warmGray = '#A09486'; // Warm Gray
const lightBeige = '#F2E9D8'; // Light Beige for borders

export const Colors = {
  light: {
    text: text,
    background: background,
    tint: primary,
    icon: warmGray,
    tabIconDefault: warmGray,
    tabIconSelected: primary,

    // Custom colors
    primary: primary,
    accent: accent,
    card: '#FFFEFB', // Slightly off-white for cards
    lightGray: lightBeige, // Used for borders
    darkGray: warmGray, // Used for secondary text
  },
  dark: { // Dark mode colors remain for now, can be updated later.
    text: '#ECEDEE',
    background: '#121212',
    tint: accent,
    icon: warmGray,
    tabIconDefault: warmGray,
    tabIconSelected: accent,

    // Custom colors
    primary: primary,
    accent: accent,
    card: '#1E1E1E',
    lightGray: lightBeige,
    darkGray: warmGray,
  },
};

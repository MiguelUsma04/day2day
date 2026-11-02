import React, { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/auth/AuthProvider';
import { RootScreen } from './src/screens/RootScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';

function Themed() {
  const { colors, isDark } = useTheme();

  // The browser chrome (and the iOS status bar of an installed PWA) follows
  // the theme-color meta tag, so keep it in step with the active palette.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', colors.background);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    document.body.style.backgroundColor = colors.background;
  }, [colors.background, isDark]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <RootScreen />
    </View>
  );
}

export default function App() {
  return (
    // Required wrapper for react-native-gesture-handler; swipes are inert without it.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <Themed />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

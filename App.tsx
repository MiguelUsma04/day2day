import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { LoginScreen } from './src/screens/LoginScreen';
import { RootScreen } from './src/screens/RootScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';

function Themed() {
  const { colors, isDark } = useTheme();
  const auth = useAuth();

  // The browser chrome (and the iOS status bar of an installed PWA) follows
  // the theme-color meta tag, so keep it in step with the active palette.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', colors.background);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    document.body.style.backgroundColor = colors.background;
  }, [colors.background, isDark]);

  // The app is gated behind a session when Supabase is configured: the stored
  // session is read first (spinner), then either the login or the app. Without
  // Supabase variables there is nothing to log into and the app runs local-only.
  let body: React.ReactNode;
  if (auth.loading) {
    body = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  } else if (auth.configured && !auth.user) {
    body = <LoginScreen />;
  } else {
    body = <RootScreen />;
  }

  return <View style={{ flex: 1, backgroundColor: colors.background }}>{body}</View>;
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

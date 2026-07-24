/**
 * Root layout: providers + a themed 5-tab bar (Home, Chat, Plan, Market, More).
 * Secondary screens (Money, BDApps, Trace, Account, Pest, Knowledge, Finance)
 * stay routable but are hidden from the tab bar and reached from the More hub.
 * Terracotta & Sage theme; Bangla-first via LanguageProvider. No emojis.
 */
import { useEffect } from 'react';
import { Tabs, ThemeProvider, DefaultTheme, DarkTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { SessionProvider, useSession } from '@/state/session';
import { AuthProvider } from '@/state/auth';
import { LanguageProvider, useLanguage } from '@/i18n/language';
import { useTheme } from '@/hooks/use-theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <SessionProvider>
          <LanguageSync />
          <AnimatedSplashOverlay />
          <TabsNavigator />
        </SessionProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

/** Keep the agent's response language (session) in step with the UI language. */
function LanguageSync() {
  const { language } = useLanguage();
  const { setLanguage } = useSession();
  useEffect(() => {
    setLanguage(language);
  }, [language, setLanguage]);
  return null;
}

function TabsNavigator() {
  const theme = useTheme();
  const { t } = useLanguage();
  const scheme = useColorScheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: theme.background,
      card: theme.backgroundElement,
      border: theme.border,
      primary: theme.brand,
      text: theme.text,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.brand,
          tabBarInactiveTintColor: theme.textSecondary,
          tabBarStyle: { backgroundColor: theme.backgroundElement, borderTopColor: theme.border },
          tabBarLabelStyle: { fontSize: 11 },
        }}>
        <Tabs.Screen
          name="index"
          options={{ title: t('Home'), tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="chat"
          options={{ title: t('Chat'), tabBarIcon: ({ color, size }) => <Feather name="message-circle" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="plan"
          options={{ title: t('Plan'), tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="market"
          options={{ title: t('Market'), tabBarIcon: ({ color, size }) => <Feather name="shopping-bag" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="more"
          options={{ title: t('More'), tabBarIcon: ({ color, size }) => <Feather name="grid" size={size} color={color} /> }}
        />

        {/* Routable, but reached from the More hub rather than the tab bar. */}
        <Tabs.Screen name="pest" options={{ href: null }} />
        <Tabs.Screen name="finance" options={{ href: null }} />
        <Tabs.Screen name="knowledge" options={{ href: null }} />
        <Tabs.Screen name="money" options={{ href: null }} />
        <Tabs.Screen name="bdapps" options={{ href: null }} />
        <Tabs.Screen name="trace" options={{ href: null }} />
        <Tabs.Screen name="account" options={{ href: null }} />
      </Tabs>
    </ThemeProvider>
  );
}

/**
 * Home / connection screen — proves the phone can reach the backend before
 * any demo flow starts (venue-wifi isolation is our #1 device risk). Shows
 * the resolved API base URL, live /health status, and a retry button.
 * Chat/Plan/Money/Trace live in their own tabs (see components/app-tabs.tsx).
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pingBackend } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

type Conn = { state: 'checking' } | { state: 'ok'; detail: string } | { state: 'down'; detail: string };

export default function HomeScreen() {
  const [conn, setConn] = useState<Conn>({ state: 'checking' });

  const check = useCallback(async () => {
    setConn({ state: 'checking' });
    const res = await pingBackend();
    setConn(res.ok ? { state: 'ok', detail: res.detail } : { state: 'down', detail: res.detail });
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <ThemedText type="title" style={styles.title}>
            AgriSense 🌾
          </ThemedText>
          <ThemedText style={styles.title}>
            Your season, planned: weather-aware crops, dated tasks, honest numbers.
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.stepContainer}>
          <ThemedText type="subtitle">Backend connection</ThemedText>
          {conn.state === 'checking' ? (
            <ActivityIndicator />
          ) : (
            <>
              <ThemedText>{conn.state === 'ok' ? '✅ Connected' : '❌ Not reachable'}</ThemedText>
              <ThemedText type="small">{conn.detail}</ThemedText>
              {conn.state === 'down' && (
                <ThemedText type="small">
                  Phone and laptop must share one network (use the hotspot). Override with
                  EXPO_PUBLIC_API_URL in mobile/.env if the auto-detected host is wrong.
                </ThemedText>
              )}
            </>
          )}
          <Pressable onPress={check} style={styles.button}>
            <ThemedText type="subtitle">Re-check</ThemedText>
          </Pressable>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    textAlign: 'center',
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

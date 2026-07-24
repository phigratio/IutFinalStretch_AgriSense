/**
 * Home — a warm welcome, the live backend-connection check (venue-wifi is our #1
 * device risk), and quick actions into the core flows. Terracotta & Sage theme,
 * Bangla-first, no emojis.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { pingBackend } from '@/api/client';
import { Screen, Card, Button, LanguageToggle, type IconName } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/i18n/language';

type Conn = { state: 'checking' } | { state: 'ok'; detail: string } | { state: 'down'; detail: string };

export default function HomeScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const [conn, setConn] = useState<Conn>({ state: 'checking' });

  const check = useCallback(async () => {
    setConn({ state: 'checking' });
    const res = await pingBackend();
    setConn(res.ok ? { state: 'ok', detail: res.detail } : { state: 'down', detail: res.detail });
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const ok = conn.state === 'ok';
  const dotColor = conn.state === 'checking' ? theme.textSecondary : ok ? theme.success : theme.error;

  return (
    <Screen
      title="AgriSense"
      subtitle="Your season, planned: weather-aware crops, dated tasks, honest numbers."
      right={<LanguageToggle />}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor }} />
            <ThemedText type="smallBold">{t('Backend connection')}</ThemedText>
          </View>
          <ThemedText type="small" themeColor={conn.state === 'checking' ? 'textSecondary' : ok ? 'success' : 'error'}>
            {conn.state === 'checking' ? t('Loading…') : ok ? t('Connected') : t('Not reachable')}
          </ThemedText>
        </View>
        {conn.state !== 'checking' ? (
          <ThemedText type="small" themeColor="textSecondary">
            {conn.detail}
          </ThemedText>
        ) : null}
        {conn.state === 'down' ? (
          <ThemedText type="small" themeColor="textSecondary">
            Phone and laptop must share one network (use the hotspot). Override with EXPO_PUBLIC_API_URL in mobile/.env if the
            auto-detected host is wrong.
          </ThemedText>
        ) : null}
        <Button label="Re-check" icon="refresh-cw" variant="ghost" onPress={() => void check()} />
      </Card>

      <View style={{ gap: Spacing.two }}>
        <QuickAction icon="message-circle" label="Start a conversation" sub="Tell the agent about your farm" route="/chat" />
        <QuickAction icon="calendar" label="View season plan" sub="Dated tasks, crops and finances" route="/plan" />
        <QuickAction icon="shopping-bag" label="Market prices" sub="Sell, store or wait guidance" route="/market" />
      </View>
    </Screen>
  );
}

function QuickAction({ icon, label, sub, route }: { icon: IconName; label: string; sub: string; route: '/chat' | '/plan' | '/market' }) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <Pressable
      onPress={() => router.push(route)}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.three,
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: Radius.lg,
          padding: Spacing.three,
        },
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
      <View
        style={{ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.brandSoft }}>
        <Feather name={icon} size={18} color={theme.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText type="smallBold">{t(label)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t(sub)}
        </ThemedText>
      </View>
      <Feather name="chevron-right" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

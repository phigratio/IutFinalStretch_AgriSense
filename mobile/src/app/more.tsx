/**
 * More hub — reaches the secondary features that are not primary tabs:
 * BDApps SMS/OTP, Payments/CaaS, the agent trace, and the account. New feature
 * screens (Pest & Leaf, Knowledge, Finance) are added here as they land.
 */
import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Screen, Card, type IconName } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/i18n/language';

// route is validated at runtime by expo-router; typed as string because the
// generated route union only refreshes when the dev server regenerates it.
type MoreItem = { label: string; sub: string; icon: IconName; route: string };

const ITEMS: MoreItem[] = [
  { label: 'Pest & Disease', sub: 'Leaf diagnosis and weather risk check', icon: 'shield', route: '/pest' },
  { label: 'Finance', sub: 'Budget vs actuals, income and ROI', icon: 'bar-chart-2', route: '/finance' },
  { label: 'Knowledge Base', sub: 'Search grounded agronomy sources', icon: 'book-open', route: '/knowledge' },
  { label: 'BDApps Payments', sub: 'SMS alerts, OTP sign-in, USSD', icon: 'smartphone', route: '/bdapps' },
  { label: 'Payments', sub: 'CaaS checkout and receipts', icon: 'credit-card', route: '/money' },
  { label: 'Agent Trace', sub: 'Every tool call and raw value', icon: 'activity', route: '/trace' },
  { label: 'Account', sub: 'Phone sign-in and profile', icon: 'user', route: '/account' },
];

export default function MoreScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <Screen title="More" subtitle="Every AgriSense tool in one place.">
      <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        {ITEMS.map((item, index) => (
          <Pressable
            key={item.label}
            onPress={() => router.push(item.route as unknown as Href)}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: Spacing.three,
                paddingHorizontal: Spacing.three,
                paddingVertical: Spacing.three,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: theme.border,
              },
              pressed && { backgroundColor: theme.backgroundSelected },
            ]}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.brandSoft,
              }}>
              <Feather name={item.icon} size={18} color={theme.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText type="smallBold">{t(item.label)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t(item.sub)}
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={18} color={theme.textSecondary} />
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

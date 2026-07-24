/**
 * Money tab — the bdapps CaaS checkout (P-1, 10-pt rubric row): pay for an
 * input order (amount prefills from the plan's first costed fertilizer task)
 * via POST /api/payments/checkout. Result cards use the TailAdmin semantic
 * accents (success/warning/error soft tints) and an honest MOCK badge
 * whenever the backend served mock bdapps responses. The receipt SMS lands
 * on this same phone.
 */
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { checkout } from '@/api/payments';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/state/session';
import type { CheckoutResult } from '@/api/types';

const tk = (n: number) => `৳${Math.round(n).toLocaleString('en-IN')}`;

function MockBadge({ theme }: { theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={[styles.mockBadge, { backgroundColor: theme.warningSoft }]}>
      <ThemedText type="small" themeColor="warning">
        MOCK
      </ThemedText>
    </View>
  );
}

function ResultCard({ result }: { result: CheckoutResult }) {
  const theme = useTheme();

  if (result.status === 'success') {
    return (
      <View
        style={[styles.card, { backgroundColor: theme.successSoft, borderColor: theme.success }]}>
        <View style={styles.cardTitleRow}>
          <ThemedText type="subtitle" themeColor="success">
            ✅ Payment received
          </ThemedText>
          {result.mock && <MockBadge theme={theme} />}
        </View>
        <ThemedText type="small">amount {tk(result.amountBdt)}</ThemedText>
        <ThemedText type="small">trx {result.internalTrxId ?? result.externalTrxId}</ThemedText>
        {result.balanceBeforeBdt != null && (
          <ThemedText type="small">
            balance {tk(result.balanceBeforeBdt)} → {tk(result.balanceBeforeBdt - result.amountBdt)}
          </ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {result.smsSent ? '📩 receipt SMS sent to your phone' : 'receipt SMS not sent'}
        </ThemedText>
      </View>
    );
  }

  if (result.status === 'insufficient') {
    return (
      <View
        style={[styles.card, { backgroundColor: theme.warningSoft, borderColor: theme.warning }]}>
        <View style={styles.cardTitleRow}>
          <ThemedText type="subtitle" themeColor="warning">
            💸 Not enough balance
          </ThemedText>
          {result.mock && <MockBadge theme={theme} />}
        </View>
        <ThemedText type="small">{result.statusDetail}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Top up your Robi account or try a smaller order — nothing was charged.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.errorSoft, borderColor: theme.error }]}>
      <View style={styles.cardTitleRow}>
        <ThemedText type="subtitle" themeColor="error">
          ❌ Payment failed
        </ThemedText>
        {result.mock && <MockBadge theme={theme} />}
      </View>
      <ThemedText type="small">
        {result.statusCode}: {result.statusDetail ?? 'unknown error'} — nothing was charged.
      </ThemedText>
    </View>
  );
}

export default function MoneyScreen() {
  const { seasonPlan, sessionId, profile } = useSession();
  const theme = useTheme();
  const suggested = useMemo(
    () => seasonPlan?.tasks.find((t) => t.phase === 'fertilizer' && t.totalCostBdt != null),
    [seasonPlan],
  );

  const [mobile, setMobile] = useState(profile?.bdappsMobile ?? '');
  const [amount, setAmount] = useState(
    suggested?.totalCostBdt != null ? String(suggested.totalCostBdt) : '',
  );
  const [description, setDescription] = useState(suggested?.title ?? 'AgriSense input order');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<CheckoutResult[]>([]);
  const [error, setError] = useState<string>();

  const inputStyle = [
    styles.input,
    { borderColor: theme.border, backgroundColor: theme.backgroundElement, color: theme.text },
  ];

  const pay = async () => {
    setError(undefined);
    const amountBdt = Number(amount);
    if (mobile.trim() === '' || !Number.isFinite(amountBdt) || amountBdt <= 0) {
      setError('Enter the Robi number and a positive amount.');
      return;
    }
    setBusy(true);
    try {
      const res = await checkout({ mobile: mobile.trim(), amountBdt, description, sessionId });
      setResults((prev) => [res, ...prev]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">Money</ThemedText>

          {seasonPlan && (
            <ThemedView
              type="backgroundElement"
              style={[styles.planCard, { borderColor: theme.border }]}>
              <ThemedText type="smallBold">{seasonPlan.crop} season budget</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                cost {tk(seasonPlan.financials.totalCostBdt)} · expected net{' '}
                {tk(seasonPlan.financials.netProfitBdt)} ({Math.round(seasonPlan.financials.roiPct)}
                % ROI)
              </ThemedText>
            </ThemedView>
          )}

          <ThemedView
            type="backgroundElement"
            style={[styles.planCard, { borderColor: theme.border }]}>
            <ThemedText type="subtitle">Order & pay (bdapps)</ThemedText>
            {suggested && (
              <ThemedText type="small" themeColor="textSecondary">
                Suggested from your plan: {suggested.title} — {tk(suggested.totalCostBdt!)}
              </ThemedText>
            )}
            <TextInput
              style={inputStyle}
              value={mobile}
              onChangeText={setMobile}
              placeholder="Robi number (e.g. 01812345678)"
              placeholderTextColor={theme.textSecondary}
              keyboardType="phone-pad"
            />
            <TextInput
              style={inputStyle}
              value={amount}
              onChangeText={setAmount}
              placeholder="Amount (BDT, 5–100 in sandbox)"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
            />
            <TextInput
              style={inputStyle}
              value={description}
              onChangeText={setDescription}
              placeholder="What is this for?"
              placeholderTextColor={theme.textSecondary}
            />
            {error && (
              <ThemedText type="small" themeColor="error">
                ⚠️ {error}
              </ThemedText>
            )}
            <Pressable
              onPress={() => void pay()}
              disabled={busy}
              style={[styles.payBtn, { backgroundColor: theme.brand }, busy && styles.payBtnBusy]}>
              {busy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <ThemedText type="smallBold" style={styles.payLabel}>
                  Pay with Mobile Account
                </ThemedText>
              )}
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary">
              Charges the Robi balance via the bdapps CaaS sandbox: payment instruments → balance
              check → direct debit → SMS receipt. Every call is logged in the Trace tab.
            </ThemedText>
          </ThemedView>

          {results.map((r, i) => (
            <ResultCard key={`${r.paymentId}-${i}`} result={r} />
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  planCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two + Spacing.half,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
    fontSize: 16,
  },
  payBtn: {
    alignSelf: 'flex-start',
    borderRadius: Spacing.two + Spacing.half,
    paddingHorizontal: Spacing.three + Spacing.one,
    paddingVertical: Spacing.two + Spacing.half,
  },
  payBtnBusy: { opacity: 0.7 },
  payLabel: { color: '#ffffff' },
  card: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  mockBadge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
});

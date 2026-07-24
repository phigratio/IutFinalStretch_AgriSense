/**
 * Money tab — the bdapps CaaS checkout (P-1, 10-pt rubric row): pay for an
 * input order (amount prefills from the plan's first costed fertilizer task)
 * via POST /api/payments/checkout. Renders success receipts, the friendly
 * insufficient-balance branch, and an honest MOCK badge whenever the backend
 * served mock bdapps responses. The receipt SMS lands on this same phone.
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
import { useSession } from '@/state/session';
import type { CheckoutResult } from '@/api/types';

const tk = (n: number) => `৳${Math.round(n).toLocaleString('en-IN')}`;

function ResultCard({ result }: { result: CheckoutResult }) {
  if (result.status === 'success') {
    return (
      <ThemedView type="backgroundElement" style={[styles.card, styles.cardOk]}>
        <ThemedText type="subtitle">✅ Payment received {result.mock && '· MOCK'}</ThemedText>
        <ThemedText type="small">amount {tk(result.amountBdt)}</ThemedText>
        <ThemedText type="small">trx {result.internalTrxId ?? result.externalTrxId}</ThemedText>
        {result.balanceBeforeBdt != null && (
          <ThemedText type="small">
            balance {tk(result.balanceBeforeBdt)} → {tk(result.balanceBeforeBdt - result.amountBdt)}
          </ThemedText>
        )}
        <ThemedText type="small">
          {result.smsSent ? '📩 receipt SMS sent to your phone' : 'receipt SMS not sent'}
        </ThemedText>
      </ThemedView>
    );
  }
  if (result.status === 'insufficient') {
    return (
      <ThemedView type="backgroundElement" style={[styles.card, styles.cardWarn]}>
        <ThemedText type="subtitle">💸 Not enough balance {result.mock && '· MOCK'}</ThemedText>
        <ThemedText type="small">{result.statusDetail}</ThemedText>
        <ThemedText type="small">
          Top up your Robi account or try a smaller order — nothing was charged.
        </ThemedText>
      </ThemedView>
    );
  }
  return (
    <ThemedView type="backgroundElement" style={[styles.card, styles.cardErr]}>
      <ThemedText type="subtitle">❌ Payment failed {result.mock && '· MOCK'}</ThemedText>
      <ThemedText type="small">
        {result.statusCode}: {result.statusDetail ?? 'unknown error'} — nothing was charged.
      </ThemedText>
    </ThemedView>
  );
}

export default function MoneyScreen() {
  const { seasonPlan, sessionId, profile } = useSession();
  const suggested = useMemo(
    () => seasonPlan?.tasks.find((t) => t.phase === 'fertilizer' && t.totalCostBdt != null),
    [seasonPlan],
  );

  const [mobile, setMobile] = useState(profile?.bdappsMobile ?? '');
  const [amount, setAmount] = useState(suggested?.totalCostBdt != null ? String(suggested.totalCostBdt) : '');
  const [description, setDescription] = useState(suggested?.title ?? 'AgriSense input order');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<CheckoutResult[]>([]);
  const [error, setError] = useState<string>();

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
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{seasonPlan.crop} season budget</ThemedText>
              <ThemedText type="small">
                cost {tk(seasonPlan.financials.totalCostBdt)} · expected net{' '}
                {tk(seasonPlan.financials.netProfitBdt)} ({Math.round(seasonPlan.financials.roiPct)}%
                ROI)
              </ThemedText>
            </ThemedView>
          )}

          <View style={styles.form}>
            <ThemedText type="subtitle">Order & pay (bdapps)</ThemedText>
            {suggested && (
              <ThemedText type="small">
                Suggested from your plan: {suggested.title} — {tk(suggested.totalCostBdt!)}
              </ThemedText>
            )}
            <TextInput
              style={styles.input}
              value={mobile}
              onChangeText={setMobile}
              placeholder="Robi number (e.g. 01812345678)"
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="Amount (BDT)"
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="What is this for?"
            />
            {error && <ThemedText style={styles.error}>⚠️ {error}</ThemedText>}
            <Pressable onPress={() => void pay()} disabled={busy} style={styles.payBtn}>
              {busy ? <ActivityIndicator /> : <ThemedText type="subtitle">Pay with Mobile Account</ThemedText>}
            </Pressable>
            <ThemedText type="small" style={styles.finePrint}>
              Charges the Robi balance via the bdapps CaaS sandbox: payment instruments → balance
              check → direct debit → SMS receipt. Every call is logged in the Trace tab.
            </ThemedText>
          </View>

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
  form: { gap: Spacing.two },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  payBtn: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  finePrint: { opacity: 0.7 },
  error: { color: '#cc4444' },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  cardOk: { borderLeftWidth: 3, borderLeftColor: '#16a34a' },
  cardWarn: { borderLeftWidth: 3, borderLeftColor: '#d97706' },
  cardErr: { borderLeftWidth: 3, borderLeftColor: '#cc4444' },
});

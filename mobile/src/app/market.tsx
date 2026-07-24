/**
 * Market tab (Tier-2) — mirrors the web Marketplace page: seeded supplier
 * ranking (price/delivery/distance/rating), market price history, a
 * sell/store/wait recommendation with confidence, mem0 memory status, and the
 * agent trace. Calls POST /api/marketplace/intelligence via api/marketplace.ts.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMarketplaceIntelligence } from '@/api/marketplace';
import { checkout } from '@/api/payments';
import { TraceChip } from '@/components/trace-chips';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/state/session';
import type { MarketplaceIntelligenceResult, SupplierOffer } from '@/api/types';

const PRESETS = [
  { label: 'Urea · Gazipur', itemName: 'Urea fertilizer', quantity: 120, unit: 'kg', district: 'Gazipur', crop: 'rice' },
  { label: 'TSP · Bogura', itemName: 'TSP fertilizer', quantity: 80, unit: 'kg', district: 'Bogura', crop: 'rice' },
  { label: 'Maize seed', itemName: 'Hybrid maize seed', quantity: 25, unit: 'kg', district: 'Gazipur', crop: 'maize' },
  { label: 'Mustard seed', itemName: 'Mustard seed', quantity: 20, unit: 'kg', district: 'Mymensingh', crop: 'mustard' },
];

const tk = (n: number) => `৳${Math.round(n).toLocaleString('en-IN')}`;

const ACTION_COLOR: Record<'sell_now' | 'store' | 'wait', ThemeColor> = {
  sell_now: 'success',
  store: 'warning',
  wait: 'brand',
};

function Metric({ label, value }: { label: string; value: string | number }) {
  const theme = useTheme();
  return (
    <View style={[styles.metric, { borderColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

/** Sandbox CaaS caps a debit at ৳100, so a large order pays a booking deposit. */
const DEPOSIT_CAP = 100;

function SupplierCard({ offer, rank, best, mobile, sessionId }: {
  offer: SupplierOffer;
  rank: number;
  best: boolean;
  mobile?: string;
  sessionId?: string;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>();
  const [error, setError] = useState<string>();

  const deposit = Math.min(Math.round(offer.totalPriceBdt), DEPOSIT_CAP);

  const buy = async () => {
    setError(undefined);
    setResult(undefined);
    if (!mobile) {
      setError('Sign in (Account tab) to pay by BDApps.');
      return;
    }
    setBusy(true);
    try {
      const res = await checkout({
        mobile,
        amountBdt: deposit,
        description: `Booking: ${offer.requestedQuantity} ${offer.unit} ${offer.itemName} — ${offer.supplierName}`,
        sessionId,
      });
      if (res.ok) setResult(`Paid ${tk(res.amountBdt)}${res.mock ? ' (MOCK)' : ''} · trx ${res.internalTrxId ?? res.externalTrxId}`);
      else setError(`${res.statusCode}: ${res.statusDetail ?? 'payment failed'}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.supplier, { borderColor: best ? theme.success : theme.border, backgroundColor: best ? theme.successSoft : 'transparent' }]}>
      <View style={styles.cardHeader}>
        <View style={styles.flexOne}>
          <ThemedText type="small" themeColor="textSecondary">Rank {rank}</ThemedText>
          <ThemedText type="smallBold">{offer.supplierName}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{offer.district} · {offer.itemName}</ThemedText>
        </View>
        <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="small" themeColor="text">{offer.score}/100</ThemedText>
        </View>
      </View>
      <View style={styles.metricGrid}>
        <Metric label="Unit price" value={tk(offer.unitPriceBdt)} />
        <Metric label="Total" value={tk(offer.totalPriceBdt)} />
        <Metric label="Delivery" value={`${offer.deliveryDays}d`} />
        <Metric label="Distance" value={`${offer.distanceKm.toFixed(0)} km`} />
        <Metric label="Rating" value={`${offer.rating.toFixed(1)}/5`} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">{offer.rankReason}</ThemedText>
      <Pressable onPress={() => void buy()} disabled={busy} style={[styles.buyBtn, { backgroundColor: theme.brand }, busy && styles.busy]}>
        {busy ? <ActivityIndicator color="#fff" /> : <ThemedText type="smallBold" style={styles.buyLabel}>Buy · pay {tk(deposit)} deposit (bKash/Robi)</ThemedText>}
      </Pressable>
      {result && <ThemedText type="small" themeColor="success">{result}</ThemedText>}
      {error && <ThemedText type="small" themeColor="error">{error}</ThemedText>}
    </View>
  );
}

function PricePanel({ result }: { result: MarketplaceIntelligenceResult }) {
  const theme = useTheme();
  const price = result.priceIntelligence;
  const action = price.recommendation.action;
  return (
    <View style={styles.stack}>
      <View style={styles.metricGrid}>
        <Metric label="Farmgate" value={price.current ? tk(price.current.farmgatePriceBdt) : 'n/a'} />
        <Metric label="Wholesale" value={price.current ? tk(price.current.wholesalePriceBdt) : 'n/a'} />
        <Metric label="Trend" value={`${price.trendPct}%`} />
        <Metric label="Confidence" value={`${Math.round(price.recommendation.confidence * 100)}%`} />
      </View>
      <View style={[styles.recBox, { borderColor: theme.border }]}>
        <View style={[styles.badge, { alignSelf: 'flex-start', backgroundColor: theme[`${ACTION_COLOR[action]}Soft` as ThemeColor] }]}>
          <ThemedText type="smallBold" themeColor={ACTION_COLOR[action]}>
            {action.replace('_', ' ')}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">{price.recommendation.reasoning}</ThemedText>
      </View>
      <View style={styles.stack}>
        {price.history.map((point) => (
          <View key={`${point.marketName}-${point.observedAt}`} style={[styles.histRow, { borderColor: theme.border }]}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.flexOne}>
              {point.observedAt} · {point.marketName}
            </ThemedText>
            <ThemedText type="small">farmgate {tk(point.farmgatePriceBdt)}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function MarketScreen() {
  const theme = useTheme();
  const { sessionId, profile } = useSession();
  const [itemName, setItemName] = useState('Urea fertilizer');
  const [quantity, setQuantity] = useState('120');
  const [unit, setUnit] = useState('kg');
  const [district, setDistrict] = useState('Gazipur');
  const [crop, setCrop] = useState('rice');
  const [result, setResult] = useState<MarketplaceIntelligenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const inputStyle = [styles.input, { borderColor: theme.border, backgroundColor: theme.backgroundElement, color: theme.text }];

  const run = async () => {
    setError(undefined);
    setLoading(true);
    try {
      const res = await getMarketplaceIntelligence({
        itemName,
        quantity: Number(quantity) || 0,
        unit,
        district,
        crop,
        sessionId,
      });
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const best = result?.supplierOffers[0];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">Marketplace</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Seeded supplier ranking, price history, and sell/store/wait reasoning.
          </ThemedText>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
            {PRESETS.map((p) => (
              <Pressable
                key={p.label}
                onPress={() => {
                  setItemName(p.itemName);
                  setQuantity(String(p.quantity));
                  setUnit(p.unit);
                  setDistrict(p.district);
                  setCrop(p.crop);
                }}
                style={[styles.preset, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="small" themeColor="textSecondary">{p.label}</ThemedText>
              </Pressable>
            ))}
          </ScrollView>

          <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
            <ThemedText type="subtitle">Input need</ThemedText>
            <TextInput style={inputStyle} value={itemName} onChangeText={setItemName} placeholder="Item" placeholderTextColor={theme.textSecondary} />
            <View style={styles.row}>
              <TextInput style={[inputStyle, styles.flexOne]} value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholder="Qty" placeholderTextColor={theme.textSecondary} />
              <TextInput style={[inputStyle, styles.unitInput]} value={unit} onChangeText={setUnit} placeholder="Unit" placeholderTextColor={theme.textSecondary} />
            </View>
            <TextInput style={inputStyle} value={district} onChangeText={setDistrict} placeholder="District" placeholderTextColor={theme.textSecondary} />
            <TextInput style={inputStyle} value={crop} onChangeText={setCrop} placeholder="Crop (rice/maize/mustard)" placeholderTextColor={theme.textSecondary} />
            {error && <ThemedText type="small" themeColor="error">{error}</ThemedText>}
            <Pressable onPress={() => void run()} disabled={loading} style={[styles.runBtn, { backgroundColor: theme.brand }, loading && styles.busy]}>
              {loading ? <ActivityIndicator color="#fff" /> : <ThemedText type="smallBold" style={styles.runLabel}>Run marketplace agent</ThemedText>}
            </Pressable>
          </ThemedView>

          {result && (
            <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
              <ThemedText type="smallBold">Agent answer</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{result.agentMessage}</ThemedText>
            </ThemedView>
          )}

          {result && result.supplierOffers.length > 0 && (
            <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <ThemedText type="subtitle">Supplier comparison</ThemedText>
                <View style={[styles.badge, { backgroundColor: theme.brandSoft }]}>
                  <ThemedText type="small" themeColor="brand">Seeded</ThemedText>
                </View>
              </View>
              <View style={styles.stack}>
                {result.supplierOffers.map((offer, i) => (
                  <SupplierCard key={offer.supplierId} offer={offer} rank={i + 1} best={offer.supplierId === best?.supplierId} mobile={profile?.bdappsMobile} sessionId={sessionId} />
                ))}
              </View>
            </ThemedView>
          )}

          {result && (
            <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
              <ThemedText type="subtitle">Price intelligence</ThemedText>
              <PricePanel result={result} />
            </ThemedView>
          )}

          {result && (
            <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <ThemedText type="subtitle">mem0 memory</ThemedText>
                <View style={[styles.badge, { backgroundColor: result.memory.status === 'used' ? theme.successSoft : theme.warningSoft }]}>
                  <ThemedText type="small" themeColor={result.memory.status === 'used' ? 'success' : 'warning'}>
                    {result.memory.status}
                  </ThemedText>
                </View>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {result.memory.status === 'used'
                  ? `${result.memory.retrieved.length} memory result(s) retrieved.`
                  : result.memory.error ?? 'mem0 unavailable; seeded results shown.'}
              </ThemedText>
            </ThemedView>
          )}

          {result && result.trace.length > 0 && (
            <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
              <ThemedText type="subtitle">Agent trace</ThemedText>
              <View style={styles.stack}>
                {result.trace.map((event, i) => (
                  <TraceChip key={`${event.toolName}-${i}`} event={event} />
                ))}
              </View>
            </ThemedView>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: BottomTabInset + Spacing.three },
  card: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: Spacing.two },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  badge: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one / 2 + 1 },
  presetRow: { gap: Spacing.two, paddingVertical: Spacing.one },
  preset: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.two + Spacing.half, paddingVertical: Spacing.two },
  input: { borderWidth: 1, borderRadius: Spacing.two + Spacing.half, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + Spacing.half, fontSize: 16 },
  row: { flexDirection: 'row', gap: Spacing.two },
  unitInput: { width: 90 },
  flexOne: { flex: 1 },
  runBtn: { alignSelf: 'flex-start', borderRadius: Spacing.two + Spacing.half, paddingHorizontal: Spacing.three + Spacing.one, paddingVertical: Spacing.two + Spacing.half },
  busy: { opacity: 0.7 },
  runLabel: { color: '#ffffff' },
  buyBtn: { alignSelf: 'flex-start', borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, marginTop: Spacing.one },
  buyLabel: { color: '#ffffff' },
  stack: { gap: Spacing.two },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  metric: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.two + Spacing.half, paddingVertical: Spacing.one + 2, minWidth: 90, gap: 2 },
  supplier: { borderWidth: 1, borderRadius: Spacing.two + Spacing.half, padding: Spacing.two + Spacing.half, gap: Spacing.two },
  recBox: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two + Spacing.half, gap: Spacing.two },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.two + Spacing.half, paddingVertical: Spacing.two },
});

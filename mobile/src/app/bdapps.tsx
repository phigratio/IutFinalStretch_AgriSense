/**
 * Bdapps tab — on-device action console mirroring the web Bdapps page. Runs the
 * backend /api/bdapps/* test routes (SMS, OTP, balance, PI, charge,
 * subscription) and shows the raw JSON response. Useful for live sandbox
 * verification during the demo. All calls are server-side; this is a trigger UI.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as bdapps from '@/api/bdapps';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Action =
  | 'sms' | 'broadcast' | 'otp-request' | 'otp-verify' | 'balance'
  | 'pi' | 'charge' | 'subscription-status' | 'subscribe' | 'unsubscribe';

const ACTIONS: { value: Action; label: string }[] = [
  { value: 'sms', label: 'Send SMS' },
  { value: 'otp-request', label: 'Request OTP' },
  { value: 'otp-verify', label: 'Verify OTP' },
  { value: 'balance', label: 'Balance' },
  { value: 'pi', label: 'Pay Instruments' },
  { value: 'charge', label: 'Direct Charge' },
  { value: 'subscription-status', label: 'Sub Status' },
  { value: 'subscribe', label: 'Subscribe' },
  { value: 'unsubscribe', label: 'Unsubscribe' },
  { value: 'broadcast', label: 'Broadcast' },
];

function run(action: Action, i: { mobile: string; message: string; amount: number; referenceNo: string; otp: string }) {
  switch (action) {
    case 'sms': return bdapps.sendSms({ to: i.mobile, message: i.message });
    case 'broadcast': return bdapps.broadcastSms(i.message);
    case 'otp-request': return bdapps.requestOtp(i.mobile);
    case 'otp-verify': return bdapps.verifyOtp({ referenceNo: i.referenceNo, otp: i.otp });
    case 'balance': return bdapps.queryBalance(i.mobile);
    case 'pi': return bdapps.listPaymentInstruments(i.mobile);
    case 'charge': return bdapps.charge({ mobile: i.mobile, amount: i.amount });
    case 'subscription-status': return bdapps.subscriptionStatus(i.mobile);
    case 'subscribe': return bdapps.subscribe(i.mobile);
    case 'unsubscribe': return bdapps.unsubscribe(i.mobile);
  }
}

export default function BdappsScreen() {
  const theme = useTheme();
  const [action, setAction] = useState<Action>('balance');
  const [mobile, setMobile] = useState('01805758966');
  const [message, setMessage] = useState('AgriSense test message');
  const [amount, setAmount] = useState('5');
  const [referenceNo, setReferenceNo] = useState('');
  const [otp, setOtp] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const inputStyle = [styles.input, { borderColor: theme.border, backgroundColor: theme.backgroundElement, color: theme.text }];

  const execute = async () => {
    setError(undefined);
    setLoading(true);
    try {
      setResult(await run(action, { mobile, message, amount: Number(amount) || 0, referenceNo, otp }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">Bdapps console</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Calls the /api/bdapps test routes against the live sandbox.
          </ThemedText>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRow}>
            {ACTIONS.map((a) => {
              const active = action === a.value;
              return (
                <Pressable
                  key={a.value}
                  onPress={() => setAction(a.value)}
                  style={[styles.actionChip, { borderColor: theme.border }, active && { backgroundColor: theme.brand, borderColor: theme.brand }]}>
                  <ThemedText type="small" themeColor={active ? undefined : 'textSecondary'} style={active ? styles.activeLabel : undefined}>
                    {a.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>

          <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
            {action !== 'broadcast' && (
              <TextInput style={inputStyle} value={mobile} onChangeText={setMobile} placeholder="Mobile (01…)" placeholderTextColor={theme.textSecondary} keyboardType="phone-pad" />
            )}
            {(action === 'sms' || action === 'broadcast') && (
              <TextInput style={inputStyle} value={message} onChangeText={setMessage} placeholder="Message" placeholderTextColor={theme.textSecondary} />
            )}
            {action === 'charge' && (
              <TextInput style={inputStyle} value={amount} onChangeText={setAmount} placeholder="Amount (BDT)" placeholderTextColor={theme.textSecondary} keyboardType="numeric" />
            )}
            {action === 'otp-verify' && (
              <>
                <TextInput style={inputStyle} value={referenceNo} onChangeText={setReferenceNo} placeholder="Reference No" placeholderTextColor={theme.textSecondary} />
                <TextInput style={inputStyle} value={otp} onChangeText={setOtp} placeholder="OTP" placeholderTextColor={theme.textSecondary} keyboardType="numeric" />
              </>
            )}
            {error && <ThemedText type="small" themeColor="error">⚠️ {error}</ThemedText>}
            <Pressable onPress={() => void execute()} disabled={loading} style={[styles.runBtn, { backgroundColor: theme.brand }, loading && styles.busy]}>
              {loading ? <ActivityIndicator color="#fff" /> : <ThemedText type="smallBold" style={styles.runLabel}>Run action</ThemedText>}
            </Pressable>
          </ThemedView>

          <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">Response</ThemedText>
            <ScrollView horizontal>
              <ThemedText type="code" style={styles.json}>
                {result ? JSON.stringify(result, null, 2) : 'No response yet.'}
              </ThemedText>
            </ScrollView>
          </ThemedView>
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
  actionRow: { gap: Spacing.two, paddingVertical: Spacing.one },
  actionChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  activeLabel: { color: '#ffffff' },
  input: { borderWidth: 1, borderRadius: Spacing.two + Spacing.half, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + Spacing.half, fontSize: 16 },
  runBtn: { alignSelf: 'flex-start', borderRadius: Spacing.two + Spacing.half, paddingHorizontal: Spacing.three + Spacing.one, paddingVertical: Spacing.two + Spacing.half },
  busy: { opacity: 0.7 },
  runLabel: { color: '#ffffff' },
  json: { fontSize: 11, lineHeight: 16 },
});

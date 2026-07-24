/**
 * Account tab — BDApps phone sign-in (mobile has no other login). Phone → OTP
 * → verified signs the farmer in on the shared backend identity and activates
 * their SMS/pay channel. Signed-in state shows the farmer + channel status +
 * sign out. State lives in state/auth.tsx.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/state/auth';

export default function AccountScreen() {
  const theme = useTheme();
  const { user, channelActive, loading, sending, startSignIn, completeSignIn, signOut } = useAuth();

  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [msg, setMsg] = useState<string>();
  const [error, setError] = useState<string>();

  const inputStyle = [
    styles.input,
    { borderColor: theme.border, backgroundColor: theme.backgroundElement, color: theme.text },
  ];

  const sendCode = async () => {
    setError(undefined);
    setMsg(undefined);
    if (mobile.trim() === '') {
      setError('Enter your phone number.');
      return;
    }
    try {
      const ref = await startSignIn(mobile.trim());
      setReferenceNo(ref);
      setStep('otp');
      setMsg('A code was sent to your phone.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const verify = async () => {
    setError(undefined);
    try {
      await completeSignIn({ referenceNo, otp: otp.trim(), mobile: mobile.trim(), name: name.trim() || undefined });
      setStep('phone');
      setOtp('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">Account</ThemedText>

          {loading ? (
            <ActivityIndicator color={theme.brand} />
          ) : user ? (
            <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
              <ThemedText type="subtitle">👋 {user.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {user.email}
              </ThemedText>
              <View style={[styles.statusRow, { backgroundColor: channelActive ? theme.successSoft : theme.warningSoft }]}>
                <ThemedText type="small" themeColor={channelActive ? 'success' : 'warning'}>
                  {channelActive ? '📩 SMS alerts enabled' : '⏳ SMS channel pending confirmation'}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                You are signed in. AgriSense remembers your farm and plans across sessions.
              </ThemedText>
              <Pressable onPress={signOut} style={[styles.btnOutline, { borderColor: theme.border }]}>
                <ThemedText type="smallBold">Sign out</ThemedText>
              </Pressable>
            </ThemedView>
          ) : (
            <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
              <ThemedText type="subtitle">Sign in with your phone</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Verify your number to save your farm and get weather & pest alerts by SMS.
              </ThemedText>

              {step === 'phone' ? (
                <>
                  <TextInput
                    style={inputStyle}
                    value={mobile}
                    onChangeText={setMobile}
                    placeholder="Robi number (01…)"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="phone-pad"
                  />
                  <TextInput
                    style={inputStyle}
                    value={name}
                    onChangeText={setName}
                    placeholder="Your name (optional)"
                    placeholderTextColor={theme.textSecondary}
                  />
                  <Pressable
                    onPress={() => void sendCode()}
                    disabled={sending}
                    style={[styles.btn, { backgroundColor: theme.brand }, sending && styles.busy]}>
                    {sending ? <ActivityIndicator color="#fff" /> : <ThemedText type="smallBold" style={styles.btnLabel}>Send code</ThemedText>}
                  </Pressable>
                </>
              ) : (
                <>
                  <TextInput
                    style={inputStyle}
                    value={otp}
                    onChangeText={setOtp}
                    placeholder="6-digit code"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="numeric"
                  />
                  <Pressable
                    onPress={() => void verify()}
                    disabled={sending || otp.trim().length < 4}
                    style={[styles.btn, { backgroundColor: theme.brand }, (sending || otp.trim().length < 4) && styles.busy]}>
                    {sending ? <ActivityIndicator color="#fff" /> : <ThemedText type="smallBold" style={styles.btnLabel}>Verify & sign in</ThemedText>}
                  </Pressable>
                  <Pressable onPress={() => { setStep('phone'); setMsg(undefined); }}>
                    <ThemedText type="link">← change number</ThemedText>
                  </Pressable>
                </>
              )}

              {msg && (
                <ThemedText type="small" themeColor="textSecondary">
                  {msg}
                </ThemedText>
              )}
              {error && (
                <ThemedText type="small" themeColor="error">
                  ⚠️ {error}
                </ThemedText>
              )}
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
  statusRow: { borderRadius: Spacing.two, paddingHorizontal: Spacing.two + Spacing.half, paddingVertical: Spacing.two, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: Spacing.two + Spacing.half, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + Spacing.half, fontSize: 16 },
  btn: { alignSelf: 'flex-start', borderRadius: Spacing.two + Spacing.half, paddingHorizontal: Spacing.three + Spacing.one, paddingVertical: Spacing.two + Spacing.half },
  btnOutline: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: Spacing.two + Spacing.half, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  busy: { opacity: 0.6 },
  btnLabel: { color: '#ffffff' },
});

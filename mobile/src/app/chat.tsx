/**
 * Chat tab — the primary surface (Tier-0): farmer talks, agent gathers the
 * profile, fetches weather, ranks crops, and plans the season. Each agent
 * bubble carries inline trace chips proving which tools produced its numbers.
 * State lives in state/session.tsx and is shared with Plan/Money/Trace tabs.
 */
import { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TraceChipRow } from '@/components/trace-chips';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useSession, type ChatBubble } from '@/state/session';

const FIELD_HINTS: Record<string, string> = {
  location: 'My farm is in ',
  farmSize: 'The farm is  bigha',
  soilType: 'The soil is ',
  waterAvailability: 'For water I have ',
  budget: 'My budget is  taka',
  targetSeason: 'I am planning for  season',
};

function ProfileStrip() {
  const { profile } = useSession();
  if (!profile) return null;
  const bits = [
    profile.locationText,
    profile.sizeAcres != null ? `${profile.sizeAcres} acre` : undefined,
    profile.soilType,
    profile.waterAvailability,
    profile.budgetBdt != null ? `৳${profile.budgetBdt}` : undefined,
    profile.targetSeason,
  ].filter(Boolean);
  if (bits.length === 0) return null;
  return (
    <ThemedView type="backgroundElement" style={styles.profileStrip}>
      <ThemedText type="small">🧑‍🌾 {bits.join(' · ')}</ThemedText>
    </ThemedView>
  );
}

function Bubble({ item, onHint }: { item: ChatBubble; onHint: (text: string) => void }) {
  const isFarmer = item.role === 'farmer';
  return (
    <View style={[styles.bubbleRow, isFarmer && styles.bubbleRowFarmer]}>
      <ThemedView
        type={isFarmer ? 'backgroundElement' : 'background'}
        style={[styles.bubble, item.role === 'error' && styles.bubbleError]}>
        <ThemedText>{item.role === 'error' ? `⚠️ ${item.text}` : item.text}</ThemedText>
        <TraceChipRow trace={item.trace} />
        {item.missingFields && item.missingFields.length > 0 && (
          <View style={styles.hintRow}>
            {item.missingFields.map((field) => (
              <Pressable
                key={field}
                onPress={() => onHint(FIELD_HINTS[field] ?? '')}
                style={styles.hintChip}>
                <ThemedText type="small">+ {field}</ThemedText>
              </Pressable>
            ))}
          </View>
        )}
      </ThemedView>
    </View>
  );
}

export default function ChatScreen() {
  const { bubbles, sending, send } = useSession();
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChatBubble>>(null);

  const submit = () => {
    const text = draft;
    setDraft('');
    void send(text);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ProfileStrip />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            ref={listRef}
            data={bubbles}
            keyExtractor={(b) => b.id}
            renderItem={({ item }) => <Bubble item={item} onHint={setDraft} />}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <ThemedText style={styles.empty}>
                Start with anything — e.g. “I have some land in Bogura, what should I plant?”
              </ThemedText>
            }
          />
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder={sending ? 'Agent is working…' : 'Message AgriSense'}
              editable={!sending}
              onSubmitEditing={submit}
              returnKeyType="send"
              multiline
            />
            <Pressable onPress={submit} disabled={sending || draft.trim() === ''} style={styles.sendBtn}>
              <ThemedText type="subtitle">{sending ? '…' : 'Send'}</ThemedText>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  profileStrip: {
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  listContent: {
    padding: Spacing.three,
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.six ?? 48,
    opacity: 0.7,
  },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowFarmer: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '88%',
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  bubbleError: { borderColor: '#cc4444' },
  hintRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  hintChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one / 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.two,
  },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    maxHeight: 120,
  },
  sendBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});

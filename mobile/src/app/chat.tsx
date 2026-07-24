/**
 * Chat tab — the primary surface (Tier-0): farmer talks, agent gathers the
 * profile, fetches weather, ranks crops, and plans the season. Each agent
 * bubble carries inline trace chips proving which tools produced its numbers.
 * Styling follows the team's TailAdmin tokens: brand bubbles for the farmer,
 * bordered white cards for the agent, brand-tinted chips.
 * State lives in state/session.tsx and is shared with Plan/Money/Trace tabs.
 */
import { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TraceChipRow } from '@/components/trace-chips';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession, type ChatBubble } from '@/state/session';
import type { Language, MemoryOutcome } from '@/api/types';

const FIELD_HINTS: Record<string, string> = {
  location: 'My farm is in ',
  farmSize: 'The farm is  bigha',
  soilType: 'The soil is ',
  waterAvailability: 'For water I have ',
  budget: 'My budget is  taka',
  targetSeason: 'I am planning for  season',
};

const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  banglish: 'Banglish',
  bn: 'বাংলা',
};

const STARTER_MESSAGES = [
  'I have 2 acres in Gazipur, what should I plant?',
  'amar 2 acre jomi Gazipur e, bele doash mati, brishti er pani, budget 45k, Aman',
  'আমার গাজীপুরে ২ একর জমি, বেলে দোআঁশ মাটি, বৃষ্টির পানি, বাজেট ৪৫ হাজার, আমন',
  '2 acres in Gazipur, sandy loam, rainfed, budget 45k, Aman',
];

function ChatHeader() {
  const { language, setLanguage, sending, send } = useSession();
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <View style={[styles.langBar, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        {(Object.keys(LANGUAGE_LABELS) as Language[]).map((lang) => {
          const active = language === lang;
          return (
            <Pressable
              key={lang}
              onPress={() => setLanguage(lang)}
              style={[styles.langChip, active && { backgroundColor: theme.brand }]}>
              <ThemedText
                type="small"
                themeColor={active ? undefined : 'textSecondary'}
                style={active ? styles.langActiveLabel : undefined}>
                {LANGUAGE_LABELS[lang]}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.starterRow}>
        {STARTER_MESSAGES.map((starter) => (
          <Pressable
            key={starter}
            onPress={() => void send(starter)}
            disabled={sending}
            style={[styles.starterChip, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.starterText}>
              {starter}
            </ThemedText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function ProfileStrip() {
  const { profile } = useSession();
  const theme = useTheme();
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
    <ThemedView
      type="backgroundElement"
      style={[styles.profileStrip, { borderColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary">
        🧑‍🌾 {bits.join(' · ')}
      </ThemedText>
    </ThemedView>
  );
}

function MemoryStrip() {
  const { rememberedOutcomes, useMemory, setUseMemory, ignoreOutcome, send } = useSession();
  const theme = useTheme();
  if (!useMemory) {
    return (
      <ThemedView
        type="backgroundElement"
        style={[styles.memoryStrip, { borderColor: theme.border }]}>
        <Pressable onPress={() => setUseMemory(true)}>
          <ThemedText type="small" themeColor="textSecondary">
            Previous sessions off · tap to enable
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }
  if (rememberedOutcomes.length === 0) return null;
  const useOutcome = (outcome: MemoryOutcome) => {
    void send(`Use remembered context: ${outcome.title}`, [outcome.id]);
  };

  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.memoryStrip, { borderColor: theme.border }]}>
      <View style={styles.memoryHeader}>
        <ThemedText type="smallBold">Remembered</ThemedText>
        <Pressable onPress={() => setUseMemory(false)}>
          <ThemedText type="small" themeColor="textSecondary">Off</ThemedText>
        </Pressable>
      </View>
      <View style={styles.memoryChips}>
        {rememberedOutcomes.slice(0, 3).map((outcome) => (
          <View key={outcome.id} style={[styles.memoryChip, { borderColor: theme.border }]}>
            <Pressable onPress={() => useOutcome(outcome)} style={styles.memoryChipText}>
              <ThemedText type="smallBold">{outcome.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                {outcome.summary}
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => ignoreOutcome(outcome.id)}>
              <ThemedText type="small" themeColor="textSecondary">Ignore</ThemedText>
            </Pressable>
          </View>
        ))}
      </View>
    </ThemedView>
  );
}

function Bubble({ item, onHint }: { item: ChatBubble; onHint: (text: string) => void }) {
  const theme = useTheme();
  const isFarmer = item.role === 'farmer';
  const isError = item.role === 'error';

  if (isFarmer) {
    return (
      <View style={[styles.bubbleRow, styles.bubbleRowFarmer]}>
        <View style={[styles.bubble, { backgroundColor: theme.brand }]}>
          <ThemedText style={styles.farmerText}>{item.text}</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.bubbleRow}>
      <ThemedView
        type="backgroundElement"
        style={[
          styles.bubble,
          { borderColor: theme.border, borderWidth: 1 },
          isError && { backgroundColor: theme.errorSoft, borderColor: theme.error },
        ]}>
        <ThemedText themeColor={isError ? 'error' : 'text'}>
          {isError ? `⚠️ ${item.text}` : item.text}
        </ThemedText>
        <TraceChipRow trace={item.trace} />
        {item.missingFields && item.missingFields.length > 0 && (
          <View style={styles.hintRow}>
            {item.missingFields.map((field) => (
              <Pressable
                key={field}
                onPress={() => onHint(FIELD_HINTS[field] ?? '')}
                style={[styles.hintChip, { backgroundColor: theme.brandSoft }]}>
                <ThemedText type="small" themeColor="brand">
                  + {field}
                </ThemedText>
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
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChatBubble>>(null);

  const submit = () => {
    const text = draft;
    setDraft('');
    void send(text);
  };

  const canSend = !sending && draft.trim() !== '';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ChatHeader />
        <ProfileStrip />
        <MemoryStrip />
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
              <ThemedText themeColor="textSecondary" style={styles.empty}>
                Start with anything — e.g. “I have some land in Bogura, what should I plant?”
              </ThemedText>
            }
          />
          <View style={styles.inputRow}>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.backgroundElement,
                  color: theme.text,
                },
              ]}
              value={draft}
              onChangeText={setDraft}
              placeholder={sending ? 'Agent is working…' : 'Message AgriSense'}
              placeholderTextColor={theme.textSecondary}
              editable={!sending}
              onSubmitEditing={submit}
              returnKeyType="send"
              multiline
            />
            <Pressable
              onPress={submit}
              disabled={!canSend}
              style={[
                styles.sendBtn,
                { backgroundColor: theme.brand },
                !canSend && styles.sendBtnDisabled,
              ]}>
              <ThemedText type="smallBold" style={styles.sendLabel}>
                {sending ? '…' : 'Send'}
              </ThemedText>
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
  header: {
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  langBar: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    marginHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: 999,
    padding: 3,
    gap: 3,
  },
  langChip: {
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  langActiveLabel: { color: '#ffffff' },
  starterRow: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  starterChip: {
    maxWidth: 240,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two + Spacing.half,
    paddingVertical: Spacing.two,
  },
  starterText: { maxWidth: 220 },
  profileStrip: {
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  memoryStrip: {
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  memoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  memoryChips: {
    gap: Spacing.one,
  },
  memoryChip: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  memoryChipText: {
    flex: 1,
  },
  listContent: {
    padding: Spacing.three,
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowFarmer: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '88%',
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
  },
  farmerText: { color: '#ffffff' },
  hintRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  hintChip: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two + Spacing.half,
    paddingVertical: Spacing.one / 2 + 1,
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
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
    fontSize: 16,
    maxHeight: 120,
  },
  sendBtn: {
    borderRadius: Spacing.two + Spacing.half,
    paddingHorizontal: Spacing.three + Spacing.one,
    paddingVertical: Spacing.two + Spacing.half,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendLabel: { color: '#ffffff' },
});

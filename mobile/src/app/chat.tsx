/**
 * Chat tab — the primary surface (Tier-0): the farmer talks, the agent gathers
 * the profile, fetches weather, ranks crops, and plans the season. Missing
 * fields become friendly, language-aware tap-to-answer chips; the tool trace is
 * collapsed behind a subtle toggle so the conversation stays clean (the full
 * trace also lives in the Trace tab). Terracotta & Sage theme, no emojis.
 * State lives in state/session.tsx and is shared with the Plan/Market/Money tabs.
 */
import { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { TraceChipRow } from '@/components/trace-chips';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LeafResultCard } from '@/components/leaf-result';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession, type ChatBubble } from '@/state/session';
import type { Language, MemoryOutcome } from '@/api/types';
import type { LeafImagePart } from '@/api/vision';

const LANGUAGE_LABELS: Record<Language, string> = { en: 'English', banglish: 'Banglish', bn: 'বাংলা' };

const STARTER_MESSAGES = [
  'I have 2 acres in Gazipur, what should I plant?',
  'amar 2 acre jomi Gazipur e, bele doash mati, brishti er pani, budget 45k, Aman',
  'আমার গাজীপুরে ২ একর জমি, বেলে দোআঁশ মাটি, বৃষ্টির পানি, বাজেট ৪৫ হাজার, আমন',
  '2 acres in Gazipur, sandy loam, rainfed, budget 45k, Aman',
];

/** Friendly, tappable prompts for each still-missing intake field, per language.
 *  Tapping a chip appends its `filler` (with a ___ blank) to the message being
 *  composed — so the farmer builds one sentence and just replaces each ___,
 *  instead of typing/sending each field separately. */
const FIELD_PROMPTS: Record<string, Record<Language, { label: string; filler: string }>> = {
  location: {
    en: { label: 'Where?', filler: 'land in ___' },
    bn: { label: 'জমি কোথায়?', filler: 'জমি ___ এ' },
    banglish: { label: 'Jomi kothay?', filler: 'jomi ___ e' },
  },
  farmSize: {
    en: { label: 'How big?', filler: '___ bigha' },
    bn: { label: 'জমি কত বড়?', filler: 'জমি ___ বিঘা' },
    banglish: { label: 'Jomi koto boro?', filler: 'jomi ___ bigha' },
  },
  soilType: {
    en: { label: 'Soil type?', filler: '___ soil' },
    bn: { label: 'মাটির ধরন?', filler: 'মাটি ___' },
    banglish: { label: 'Matir dhoron?', filler: 'mati ___' },
  },
  waterAvailability: {
    en: { label: 'Water?', filler: 'water from ___' },
    bn: { label: 'পানির উৎস?', filler: 'পানি ___' },
    banglish: { label: 'Panir source?', filler: 'pani ___' },
  },
  budget: {
    en: { label: 'Budget?', filler: 'budget ___ taka' },
    bn: { label: 'বাজেট কত?', filler: 'বাজেট ___ টাকা' },
    banglish: { label: 'Budget koto?', filler: 'budget ___ taka' },
  },
  targetSeason: {
    en: { label: 'Season?', filler: '___ season' },
    bn: { label: 'কোন মৌসুম?', filler: '___ মৌসুম' },
    banglish: { label: 'Kon season?', filler: '___ season' },
  },
};

const TXT: Record<Language, Record<'quick' | 'steps' | 'placeholder' | 'working' | 'send' | 'empty' | 'remembered' | 'off' | 'ignore' | 'prevOff', string>> = {
  en: {
    quick: 'Tap to answer:',
    steps: 'How the agent worked',
    placeholder: 'Message AgriSense',
    working: 'Working…',
    send: 'Send',
    empty: 'Start with anything — for example, “I have some land in Bogura, what should I plant?”',
    remembered: 'Remembered from before',
    off: 'Off',
    ignore: 'Ignore',
    prevOff: 'Previous sessions off · tap to enable',
  },
  bn: {
    quick: 'উত্তর দিতে চাপুন:',
    steps: 'এজেন্ট যেভাবে কাজ করেছে',
    placeholder: 'AgriSense-কে লিখুন',
    working: 'কাজ চলছে…',
    send: 'পাঠান',
    empty: 'যেকোনো কিছু দিয়ে শুরু করুন — যেমন, “বগুড়ায় আমার জমি আছে, কী চাষ করব?”',
    remembered: 'আগের কথা মনে আছে',
    off: 'বন্ধ',
    ignore: 'বাদ দিন',
    prevOff: 'আগের সেশন বন্ধ · চালু করতে চাপুন',
  },
  banglish: {
    quick: 'Answer dite tap korun:',
    steps: 'Agent jevabe kaj koreche',
    placeholder: 'AgriSense ke likhun',
    working: 'Kaj cholche…',
    send: 'Pathan',
    empty: 'Jekono kichu diye shuru korun — jemon, “Bogura te amar jomi ache, ki chash korbo?”',
    remembered: 'Ager kotha mone ache',
    off: 'Bondho',
    ignore: 'Bad din',
    prevOff: 'Ager session bondho · chalu korte tap korun',
  },
};

function ChatHeader() {
  const { language, setLanguage, sending, send } = useSession();
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <View style={[styles.langBar, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        {(Object.keys(LANGUAGE_LABELS) as Language[]).map((lang) => {
          const active = language === lang;
          return (
            <Pressable key={lang} onPress={() => setLanguage(lang)} style={[styles.langChip, active && { backgroundColor: theme.brand }]}>
              <ThemedText type="small" themeColor={active ? undefined : 'textSecondary'} style={active ? styles.langActiveLabel : undefined}>
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
    profile.budgetBdt != null ? `Tk ${profile.budgetBdt}` : undefined,
    profile.targetSeason,
  ].filter(Boolean);
  if (bits.length === 0) return null;
  return (
    <View style={[styles.profileStrip, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      <Feather name="user" size={13} color={theme.secondary} />
      <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }} numberOfLines={1}>
        {bits.join(' · ')}
      </ThemedText>
    </View>
  );
}

function MemoryStrip() {
  const { rememberedOutcomes, useMemory, setUseMemory, ignoreOutcome, send, language } = useSession();
  const theme = useTheme();
  const txt = TXT[language];
  if (!useMemory) {
    return (
      <Pressable onPress={() => setUseMemory(true)} style={[styles.memoryStrip, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="small" themeColor="textSecondary">
          {txt.prevOff}
        </ThemedText>
      </Pressable>
    );
  }
  if (rememberedOutcomes.length === 0) return null;
  const useOutcome = (outcome: MemoryOutcome) => {
    void send(`Use remembered context: ${outcome.title}`, [outcome.id]);
  };
  return (
    <View style={[styles.memoryStrip, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      <View style={styles.memoryHeader}>
        <ThemedText type="smallBold">{txt.remembered}</ThemedText>
        <Pressable onPress={() => setUseMemory(false)}>
          <ThemedText type="small" themeColor="textSecondary">
            {txt.off}
          </ThemedText>
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
              <ThemedText type="small" themeColor="textSecondary">
                {txt.ignore}
              </ThemedText>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

function Bubble({ item, language, onInsert }: { item: ChatBubble; language: Language; onInsert: (field: string) => void }) {
  const theme = useTheme();
  const [traceOpen, setTraceOpen] = useState(false);
  const txt = TXT[language];
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

  const stepCount = item.trace?.length ?? 0;
  const prompts = (item.missingFields ?? []).map((field) => ({ field, prompt: FIELD_PROMPTS[field]?.[language] })).filter((x) => x.prompt);

  return (
    <View style={styles.bubbleRow}>
      <ThemedView
        type="backgroundElement"
        style={[styles.bubble, { borderColor: theme.border, borderWidth: 1 }, isError && { backgroundColor: theme.errorSoft, borderColor: theme.error }]}>
        <ThemedText themeColor={isError ? 'error' : 'text'}>{item.text}</ThemedText>

        {item.diagnosis ? <LeafResultCard diagnosis={item.diagnosis} /> : null}

        {prompts.length > 0 ? (
          <View style={styles.quickReplies}>
            <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: Spacing.one }}>
              {txt.quick}
            </ThemedText>
            <View style={styles.hintRow}>
              {prompts.map(({ field, prompt }) => (
                <Pressable
                  key={field}
                  onPress={() => onInsert(field)}
                  style={[styles.hintChip, { borderColor: theme.brand, backgroundColor: theme.brandSoft }]}>
                  <ThemedText type="small" themeColor="brand">
                    {prompt!.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {stepCount > 0 ? (
          <View style={{ marginTop: Spacing.two }}>
            <Pressable onPress={() => setTraceOpen((v) => !v)} style={styles.traceToggle}>
              <Feather name={traceOpen ? 'chevron-down' : 'chevron-right'} size={13} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                {txt.steps} · {stepCount}
              </ThemedText>
            </Pressable>
            {traceOpen ? <TraceChipRow trace={item.trace} /> : null}
          </View>
        ) : null}
      </ThemedView>
    </View>
  );
}

export default function ChatScreen() {
  const { bubbles, sending, send, diagnoseLeaf, language } = useSession();
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChatBubble>>(null);
  const txt = TXT[language];

  const submit = () => {
    const text = draft;
    setDraft('');
    void send(text);
  };

  async function pickAndDiagnose() {
    if (sending) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    const image: LeafImagePart = (asset as { file?: File }).file
      ? (asset as { file: File }).file
      : { uri: asset.uri, name: asset.fileName ?? 'leaf.jpg', type: asset.mimeType ?? 'image/jpeg' };
    await diagnoseLeaf(image);
  }

  /** Append a still-missing field's filler slot to the message being composed,
   *  so the farmer answers several fields in one editable sentence. */
  function insertFiller(field: string) {
    const filler = FIELD_PROMPTS[field]?.[language]?.filler;
    if (!filler) return;
    setDraft((prev) => (prev.trim() ? `${prev.trim()}, ${filler}` : filler));
  }

  const canSend = !sending && draft.trim() !== '';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ChatHeader />
        <ProfileStrip />
        <MemoryStrip />
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            ref={listRef}
            data={bubbles}
            keyExtractor={(b) => b.id}
            renderItem={({ item }) => <Bubble item={item} language={language} onInsert={insertFiller} />}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <ThemedText themeColor="textSecondary" style={styles.empty}>
                {txt.empty}
              </ThemedText>
            }
          />
          <View style={[styles.inputRow, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
            <TextInput
              style={[styles.input, { borderColor: theme.border, backgroundColor: theme.backgroundElement, color: theme.text }]}
              value={draft}
              onChangeText={setDraft}
              placeholder={sending ? txt.working : txt.placeholder}
              placeholderTextColor={theme.textSecondary}
              editable={!sending}
              onSubmitEditing={submit}
              returnKeyType="send"
              multiline
            />
            <Pressable
              onPress={() => void pickAndDiagnose()}
              disabled={sending}
              accessibilityLabel="Diagnose a leaf photo"
              style={[styles.iconBtn, { borderColor: theme.border, backgroundColor: theme.backgroundElement }, sending && styles.disabled]}>
              <Feather name="camera" size={18} color={theme.text} />
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={!canSend}
              style={[styles.sendBtn, { backgroundColor: theme.brand }, !canSend && styles.disabled]}>
              <ThemedText type="smallBold" style={styles.sendLabel}>
                {sending ? '…' : txt.send}
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
  header: { paddingTop: Spacing.two, gap: Spacing.two },
  langBar: { flexDirection: 'row', alignSelf: 'flex-start', marginHorizontal: Spacing.three, borderWidth: 1, borderRadius: Radius.pill, padding: 3, gap: 3 },
  langChip: { borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  langActiveLabel: { color: '#ffffff' },
  starterRow: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  starterChip: { maxWidth: 240, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.two + Spacing.half, paddingVertical: Spacing.two },
  starterText: { maxWidth: 220 },
  profileStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  memoryStrip: { marginHorizontal: Spacing.three, marginTop: Spacing.two, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  memoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.one },
  memoryChips: { gap: Spacing.one },
  memoryChip: { borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  memoryChipText: { flex: 1 },
  listContent: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.four },
  empty: { textAlign: 'center', marginTop: Spacing.six, paddingHorizontal: Spacing.four },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowFarmer: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '90%', borderRadius: Radius.lg, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + Spacing.half, gap: Spacing.one },
  farmerText: { color: '#ffffff' },
  quickReplies: { marginTop: Spacing.two },
  hintRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  hintChip: { borderRadius: Radius.pill, borderWidth: 1, paddingHorizontal: Spacing.two + Spacing.half, paddingVertical: Spacing.one + 1 },
  traceToggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, alignSelf: 'flex-start' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, padding: Spacing.three, paddingBottom: BottomTabInset + Spacing.two, borderTopWidth: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + Spacing.half, fontSize: 16, maxHeight: 120 },
  iconBtn: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + Spacing.half, justifyContent: 'center', alignItems: 'center' },
  sendBtn: { borderRadius: Radius.md, paddingHorizontal: Spacing.three + Spacing.one, paddingVertical: Spacing.two + Spacing.half },
  disabled: { opacity: 0.5 },
  sendLabel: { color: '#ffffff' },
});

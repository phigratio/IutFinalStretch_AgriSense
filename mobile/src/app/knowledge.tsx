/**
 * Knowledge Base — search the shared agronomy sources and read grounded results
 * with citations and a verification badge. New UI kit, Bangla-first, no emojis.
 */
import { useState } from 'react';
import { View } from 'react-native';

import { Screen, Card, Button, TextField, Chip, EmptyState, type Tone } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/state/auth';
import { searchKnowledgeBase, type KbHit } from '@/api/kb';

export default function KnowledgeScreen() {
  const { user } = useAuth();
  const [query, setQuery] = useState('urea top-dress for boro rice');
  const [hits, setHits] = useState<KbHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await searchKnowledgeBase({ query: query.trim(), userId: user?.id });
      setHits(res.hits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
      setHits([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Knowledge Base" subtitle="Search grounded agronomy sources with citations.">
      <Card>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Fertilizer, pests, crop calendar…"
          onSubmitEditing={() => void run()}
          returnKeyType="search"
        />
        <Button label="Search" icon="search" full onPress={() => void run()} loading={busy} />
        {error ? (
          <ThemedText type="small" themeColor="error">
            {error}
          </ThemedText>
        ) : null}
      </Card>

      {hits === null ? null : hits.length === 0 ? (
        <EmptyState icon="book-open" text="No results. Try different words or a crop name." />
      ) : (
        <View style={{ gap: Spacing.two }}>
          {hits.map((hit, index) => (
            <HitCard key={hit.docKey ?? index} hit={hit} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function HitCard({ hit }: { hit: KbHit }) {
  const tone: Tone = hit.verificationStatus === 'verified' ? 'success' : hit.verificationStatus === 'cross_checked' ? 'warning' : 'neutral';
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' }}>
        <ThemedText type="smallBold" style={{ flexShrink: 1 }}>
          {hit.title ?? hit.source ?? 'Knowledge'}
        </ThemedText>
        <Chip label={hit.verificationStatus.replace('_', ' ')} tone={tone} />
      </View>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={8}>
        {hit.text}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
        {hit.citation}
      </ThemedText>
    </Card>
  );
}

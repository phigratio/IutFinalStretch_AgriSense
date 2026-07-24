/**
 * Inline tool-call chips shown under each agent reply — the mobile face of
 * the judge-visible trace (T0-8). Tap a chip to expand the parameters and
 * raw response JSON. Consumed by: chat screen and the Trace tab.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { IntakeTraceEvent } from '@/api/types';

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    return String(value);
  }
}

export function TraceChip({ event }: { event: IntakeTraceEvent }) {
  const [open, setOpen] = useState(false);
  const failed = event.status === 'error';

  return (
    <View style={styles.chipWrap}>
      <Pressable onPress={() => setOpen((v) => !v)} style={[styles.chip, failed && styles.chipError]}>
        <ThemedText type="small">
          {failed ? '⚠️' : '🔧'} {event.toolName} · {event.latencyMs}ms {open ? '▴' : '▾'}
        </ThemedText>
      </Pressable>
      {open && (
        <ThemedView type="backgroundElement" style={styles.detail}>
          <ThemedText type="smallBold">parameters</ThemedText>
          <ScrollView horizontal>
            <ThemedText type="code" style={styles.json}>
              {pretty(event.parameters)}
            </ThemedText>
          </ScrollView>
          <ThemedText type="smallBold">{failed ? 'error' : 'raw response'}</ThemedText>
          <ScrollView horizontal>
            <ThemedText type="code" style={styles.json}>
              {failed ? (event.errorMessage ?? 'unknown error') : pretty(event.rawResponse)}
            </ThemedText>
          </ScrollView>
        </ThemedView>
      )}
    </View>
  );
}

export function TraceChipRow({ trace }: { trace?: IntakeTraceEvent[] }) {
  if (!trace || trace.length === 0) return null;
  return (
    <View style={styles.row}>
      {trace.map((event, i) => (
        <TraceChip key={`${event.toolName}-${i}`} event={event} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  chipWrap: {
    alignSelf: 'stretch',
  },
  chip: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one / 2,
  },
  chipError: {
    borderColor: '#cc4444',
  },
  detail: {
    marginTop: Spacing.one,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  json: {
    fontSize: 11,
    lineHeight: 15,
  },
});

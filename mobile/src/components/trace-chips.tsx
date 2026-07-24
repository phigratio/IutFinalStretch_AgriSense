/**
 * Inline tool-call chips shown under each agent reply — the mobile face of
 * the judge-visible trace (T0-8). Tap a chip to expand the parameters and
 * raw response JSON. Styled as TailAdmin-style badges: brand-tinted pill for
 * success, error-tinted for failures. Consumed by: chat screen and Trace tab.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
  const theme = useTheme();
  const failed = event.status === 'error';

  return (
    <View style={styles.chipWrap}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={[styles.chip, { backgroundColor: failed ? theme.errorSoft : theme.brandSoft }]}>
        <ThemedText type="small" themeColor={failed ? 'error' : 'brand'}>
          {failed ? '⚠️' : '🔧'} {event.toolName} · {event.latencyMs}ms {open ? '▴' : '▾'}
        </ThemedText>
      </Pressable>
      {open && (
        <ThemedView
          type="backgroundElement"
          style={[styles.detail, { borderColor: theme.border }]}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            parameters
          </ThemedText>
          <ScrollView horizontal>
            <ThemedText type="code" style={styles.json}>
              {pretty(event.parameters)}
            </ThemedText>
          </ScrollView>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {failed ? 'error' : 'raw response'}
          </ThemedText>
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
    marginTop: Spacing.two,
  },
  chipWrap: {
    alignSelf: 'stretch',
  },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: Spacing.two + Spacing.half,
    paddingVertical: Spacing.one / 2 + 1,
  },
  detail: {
    marginTop: Spacing.one,
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  json: {
    fontSize: 11,
    lineHeight: 15,
  },
});

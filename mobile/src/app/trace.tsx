/**
 * Trace tab — the judge-inspection view (T0-8): every persisted tool call of
 * the current session from GET /api/agrisense/sessions/:id/trace, expandable
 * to parameters + raw response. Pull to refresh after new turns.
 */
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSessionTrace } from '@/api/agrisense';
import { TraceChip } from '@/components/trace-chips';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useSession } from '@/state/session';
import type { IntakeTraceEvent } from '@/api/types';

/** Server rows are agent_tool_calls records; adapt loosely to chip props. */
function toEvent(row: unknown, i: number): IntakeTraceEvent {
  const r = row as Record<string, unknown>;
  return {
    kind: (r.kind as IntakeTraceEvent['kind']) ?? 'tool',
    toolName: String(r.toolName ?? r.tool_name ?? `step ${i + 1}`),
    parameters: (r.parameters as Record<string, unknown>) ?? {},
    rawResponse: r.rawResponse ?? r.raw_response,
    status: (r.status as IntakeTraceEvent['status']) ?? 'success',
    errorMessage: (r.errorMessage ?? r.error_message) as string | undefined,
    latencyMs: Number(r.latencyMs ?? 0),
  };
}

export default function TraceScreen() {
  const { sessionId } = useSession();
  const [events, setEvents] = useState<IntakeTraceEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!sessionId) return;
    setRefreshing(true);
    setError(undefined);
    try {
      const rows = await getSessionTrace(sessionId);
      setEvents(rows.map(toEvent));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="title" style={styles.heading}>
          Agent trace
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.heading}>
          Every tool call behind the advice — parameters and raw responses, straight from the
          server. {sessionId ? `Session ${sessionId.slice(0, 8)}…` : 'No session yet — say hello in Chat first.'}
        </ThemedText>
        {error && (
          <ThemedText type="small" themeColor="error" style={styles.heading}>
            ⚠️ {error}
          </ThemedText>
        )}
        <FlatList
          data={events}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => <TraceChip event={item} />}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}
          ListEmptyComponent={
            sessionId ? (
              <ThemedText style={styles.empty}>Pull down to refresh the trace.</ThemedText>
            ) : null
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  heading: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  listContent: {
    padding: Spacing.three,
    gap: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  empty: {
    textAlign: 'center',
    opacity: 0.7,
    marginTop: Spacing.four,
  },
});

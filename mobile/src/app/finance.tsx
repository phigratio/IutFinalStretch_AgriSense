/**
 * Finance — the farmer's season money view: budget vs actuals, income/expense
 * totals, ROI, agent insights, seasonal roll-up, and recent entries. Scoped to
 * the current farm from the shared session. New UI kit, Bangla-first, no emojis.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Screen, Card, StatGrid, StatTile, SectionHeader, EmptyState, Chip, type Tone } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/state/session';
import { getFinanceSummary, type FinanceAgentInsight, type FinanceSummary } from '@/api/finance';

function grp(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function tk(value?: number): string {
  return `Tk ${grp(Math.round(value ?? 0))}`;
}

export default function FinanceScreen() {
  const { farmId } = useSession();
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    getFinanceSummary({ farmId })
      .then((summary) => {
        if (!cancelled) {
          setData(summary);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load finances.');
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [farmId]);

  return (
    <Screen title="Finance" subtitle="Season budget vs actuals, income, expenses and ROI.">
      {busy ? (
        <EmptyState icon="loader" text="Loading…" />
      ) : error ? (
        <Card>
          <ThemedText type="small" themeColor="error">
            {error}
          </ThemedText>
        </Card>
      ) : data ? (
        <>
          <Card>
            <SectionHeader title="Totals" icon="bar-chart-2" />
            <StatGrid>
              <StatTile label="Income" value={tk(data.totals.totalIncomeBdt)} tone="success" />
              <StatTile label="Expense" value={tk(data.totals.totalExpenseBdt)} tone="error" />
              <StatTile label="Net profit" value={tk(data.totals.netProfitBdt)} tone={data.totals.netProfitBdt >= 0 ? 'success' : 'error'} />
              <StatTile label="ROI" value={`${Math.round(data.totals.roiPct)}%`} />
              {data.totals.budgetBdt != null ? <StatTile label="Budget" value={tk(data.totals.budgetBdt)} /> : null}
              {data.totals.budgetSurplusBdt != null ? (
                <StatTile label="Surplus" value={tk(data.totals.budgetSurplusBdt)} tone={data.totals.budgetSurplusBdt >= 0 ? 'success' : 'error'} />
              ) : null}
            </StatGrid>
          </Card>

          {data.agentInsights.length > 0 ? (
            <View style={{ gap: Spacing.two }}>
              {data.agentInsights.map((insight, index) => (
                <InsightCard key={index} insight={insight} />
              ))}
            </View>
          ) : null}

          {data.seasons.length > 0 ? (
            <Card>
              <SectionHeader title="By season" icon="calendar" />
              {data.seasons.map((season) => (
                <View key={season.season} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <ThemedText type="small" style={{ textTransform: 'capitalize' }}>
                    {season.season}
                  </ThemedText>
                  <ThemedText type="smallBold" themeColor={season.profitBdt >= 0 ? 'success' : 'error'}>
                    {tk(season.profitBdt)}
                  </ThemedText>
                </View>
              ))}
            </Card>
          ) : null}

          {data.entries.length > 0 ? (
            <Card>
              <SectionHeader title="Recent entries" icon="list" />
              {data.entries.slice(0, 12).map((entry) => (
                <View key={entry.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two, paddingVertical: 4 }}>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="small" numberOfLines={1}>
                      {entry.label}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
                      {entry.category} · {entry.entryDate}
                    </ThemedText>
                  </View>
                  <ThemedText type="smallBold" themeColor={entry.entryType === 'income' ? 'success' : 'error'}>
                    {entry.entryType === 'income' ? '+' : '-'}
                    {tk(entry.amountBdt)}
                  </ThemedText>
                </View>
              ))}
            </Card>
          ) : (
            <EmptyState icon="inbox" text="No finance entries yet. Your season plan seeds projected costs." />
          )}
        </>
      ) : null}
    </Screen>
  );
}

function InsightCard({ insight }: { insight: FinanceAgentInsight }) {
  const tone: Tone = insight.severity === 'success' ? 'success' : insight.severity === 'warning' ? 'warning' : 'brand';
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
        <Chip label={insight.severity} tone={tone} solid />
        <ThemedText type="smallBold" style={{ flexShrink: 1 }}>
          {insight.title}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {insight.message}
      </ThemedText>
      {insight.action ? (
        <ThemedText type="small" themeColor="brand">
          {insight.action}
        </ThemedText>
      ) : null}
    </Card>
  );
}

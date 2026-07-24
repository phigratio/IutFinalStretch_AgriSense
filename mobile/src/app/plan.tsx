/**
 * Plan tab — renders what the agent computed this session (T0-3/T0-4/T0-5):
 * ranked crop cards (with the factor breakdown behind each score) and, once a
 * crop is chosen in chat, the dated season-plan timeline plus financials.
 * TailAdmin-style: white bordered cards, brand score pills, semantic
 * success/warning/error accents for risk. All numbers come from the session's
 * backend responses; nothing is computed here.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/state/session';
import type { CropRecommendation, SeasonPlanTask } from '@/api/types';

const PHASE_ICON: Record<SeasonPlanTask['phase'], string> = {
  'land-prep': '🚜',
  sowing: '🌱',
  fertilizer: '🧪',
  irrigation: '💧',
  weed: '🌿',
  'pest-check': '🔍',
  harvest: '🌾',
};

const RISK_COLOR: Record<CropRecommendation['riskLevel'], ThemeColor> = {
  low: 'success',
  medium: 'warning',
  high: 'error',
};

function tk(n: number): string {
  return `৳${Math.round(n).toLocaleString('en-IN')}`;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function CropCard({ rec }: { rec: CropRecommendation }) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <ThemedText type="subtitle">{rec.crop}</ThemedText>
        <View style={[styles.scorePill, { backgroundColor: theme.brandSoft }]}>
          <ThemedText type="smallBold" themeColor="brand">
            {Math.round(rec.suitabilityScore)}/100
          </ThemedText>
        </View>
      </View>
      <View style={styles.metaRow}>
        <ThemedText type="small" themeColor="textSecondary">
          💧 {rec.waterNeed} water
        </ThemedText>
        <ThemedText type="small" themeColor={RISK_COLOR[rec.riskLevel]}>
          ⚠️ {rec.riskLevel} risk
        </ThemedText>
        <ThemedText type="small" themeColor={rec.netProfitBdt >= 0 ? 'success' : 'error'}>
          net {tk(rec.netProfitBdt)} · {Math.round(rec.roiPct)}% ROI
        </ThemedText>
      </View>
      <Pressable onPress={() => setOpen((v) => !v)}>
        <ThemedText type="link">{open ? 'hide why ▴' : 'why? ▾'}</ThemedText>
      </Pressable>
      {open && (
        <View style={[styles.why, { borderTopColor: theme.border }]}>
          <ThemedText type="small">{rec.reasoning}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            fit — soil {pct(rec.factors.soilFit)} · season {pct(rec.factors.seasonFit)} · water{' '}
            {pct(rec.factors.waterFit)} · temp {pct(rec.factors.tempFit)} · budget{' '}
            {pct(rec.factors.budgetFit)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            cost {tk(rec.totalCostBdt)} → revenue {tk(rec.expectedRevenueBdt)} · break-even{' '}
            {Math.round(rec.breakEvenYieldKg)} kg
          </ThemedText>
          {rec.citations.length > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              📚 {rec.citations.join(' · ')}
            </ThemedText>
          )}
        </View>
      )}
    </ThemedView>
  );
}

function TaskRow({ task }: { task: SeasonPlanTask }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.task, { borderColor: theme.border }]}>
      <ThemedText type="smallBold">
        {PHASE_ICON[task.phase] ?? '📌'} {task.title}
      </ThemedText>
      <ThemedText type="small" themeColor="brand">
        {task.startDate}
        {task.endDate !== task.startDate ? ` → ${task.endDate}` : ''}
        {task.quantity != null ? ` · ${task.quantity} ${task.unit ?? ''}` : ''}
        {task.totalCostBdt != null ? ` · ${tk(task.totalCostBdt)}` : ''}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {task.description}
      </ThemedText>
    </ThemedView>
  );
}

export default function PlanScreen() {
  const { cropRankings, seasonPlan } = useSession();
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">Season plan</ThemedText>

          {!cropRankings && !seasonPlan && (
            <ThemedText themeColor="textSecondary">
              Nothing planned yet — tell the agent about your farm in Chat and the
              recommendations and calendar will appear here.
            </ThemedText>
          )}

          {cropRankings && (
            <View style={styles.section}>
              <ThemedText type="subtitle">Recommended crops</ThemedText>
              {cropRankings.map((rec) => (
                <CropCard key={rec.crop} rec={rec} />
              ))}
            </View>
          )}

          {seasonPlan && (
            <View style={styles.section}>
              <ThemedText type="subtitle">
                {seasonPlan.crop} — sow {seasonPlan.sowDate}, harvest {seasonPlan.harvestStartDate}
                {' → '}
                {seasonPlan.harvestEndDate}
              </ThemedText>
              <ThemedView
                type="backgroundElement"
                style={[styles.card, { borderColor: theme.border }]}>
                <ThemedText type="smallBold">Financials</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  cost {tk(seasonPlan.financials.totalCostBdt)} · revenue{' '}
                  {tk(seasonPlan.financials.expectedRevenueBdt)} · break-even{' '}
                  {Math.round(seasonPlan.financials.breakEvenYieldKg)} kg
                </ThemedText>
                <ThemedText
                  type="smallBold"
                  themeColor={seasonPlan.financials.netProfitBdt >= 0 ? 'success' : 'error'}>
                  net {tk(seasonPlan.financials.netProfitBdt)} ·{' '}
                  {Math.round(seasonPlan.financials.roiPct)}% ROI
                </ThemedText>
              </ThemedView>
              {seasonPlan.tasks.map((task, i) => (
                <TaskRow key={`${task.phase}-${i}`} task={task} />
              ))}
              <ThemedText type="small" themeColor="textSecondary">
                {seasonPlan.reasoning}
              </ThemedText>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  section: { gap: Spacing.two },
  card: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scorePill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two + Spacing.half,
    paddingVertical: Spacing.one / 2 + 1,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  why: {
    gap: Spacing.one,
    borderTopWidth: 1,
    paddingTop: Spacing.two,
  },
  task: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.half,
  },
});

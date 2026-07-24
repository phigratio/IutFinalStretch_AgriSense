/**
 * Plan tab — renders what the agent computed this session (T0-3/T0-4/T0-5):
 * ranked crop cards (with the factor breakdown behind each score) and, once a
 * crop is chosen in chat, the dated season-plan timeline plus financials.
 * All numbers come from the session's backend responses; nothing is computed here.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
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

function tk(n: number): string {
  return `৳${Math.round(n).toLocaleString('en-IN')}`;
}

function CropCard({ rec }: { rec: CropRecommendation }) {
  const [open, setOpen] = useState(false);
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.cardHeader}>
        <ThemedText type="subtitle">{rec.crop}</ThemedText>
        <ThemedText type="smallBold">{Math.round(rec.suitabilityScore)}/100</ThemedText>
      </View>
      <ThemedText type="small">
        💧 {rec.waterNeed} water · ⚠️ {rec.riskLevel} risk · net {tk(rec.netProfitBdt)} ·{' '}
        {Math.round(rec.roiPct)}% ROI
      </ThemedText>
      <Pressable onPress={() => setOpen((v) => !v)}>
        <ThemedText type="link">{open ? 'hide why ▴' : 'why? ▾'}</ThemedText>
      </Pressable>
      {open && (
        <View style={styles.why}>
          <ThemedText type="small">{rec.reasoning}</ThemedText>
          <ThemedText type="small">
            fit — soil {pct(rec.factors.soilFit)} · season {pct(rec.factors.seasonFit)} · water{' '}
            {pct(rec.factors.waterFit)} · temp {pct(rec.factors.tempFit)} · budget{' '}
            {pct(rec.factors.budgetFit)}
          </ThemedText>
          <ThemedText type="small">
            cost {tk(rec.totalCostBdt)} → revenue {tk(rec.expectedRevenueBdt)} · break-even{' '}
            {Math.round(rec.breakEvenYieldKg)} kg
          </ThemedText>
          {rec.citations.length > 0 && (
            <ThemedText type="small">📚 {rec.citations.join(' · ')}</ThemedText>
          )}
        </View>
      )}
    </ThemedView>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function TaskRow({ task }: { task: SeasonPlanTask }) {
  return (
    <ThemedView type="backgroundElement" style={styles.task}>
      <ThemedText type="smallBold">
        {PHASE_ICON[task.phase] ?? '📌'} {task.title}
      </ThemedText>
      <ThemedText type="small">
        {task.startDate}
        {task.endDate !== task.startDate ? ` → ${task.endDate}` : ''}
        {task.quantity != null ? ` · ${task.quantity} ${task.unit ?? ''}` : ''}
        {task.totalCostBdt != null ? ` · ${tk(task.totalCostBdt)}` : ''}
      </ThemedText>
      <ThemedText type="small">{task.description}</ThemedText>
    </ThemedView>
  );
}

export default function PlanScreen() {
  const { cropRankings, seasonPlan } = useSession();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">Season plan</ThemedText>

          {!cropRankings && !seasonPlan && (
            <ThemedText style={styles.empty}>
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
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">Financials</ThemedText>
                <ThemedText type="small">
                  cost {tk(seasonPlan.financials.totalCostBdt)} · revenue{' '}
                  {tk(seasonPlan.financials.expectedRevenueBdt)} · net{' '}
                  {tk(seasonPlan.financials.netProfitBdt)} ·{' '}
                  {Math.round(seasonPlan.financials.roiPct)}% ROI · break-even{' '}
                  {Math.round(seasonPlan.financials.breakEvenYieldKg)} kg
                </ThemedText>
              </ThemedView>
              {seasonPlan.tasks.map((task, i) => (
                <TaskRow key={`${task.phase}-${i}`} task={task} />
              ))}
              <ThemedText type="small">{seasonPlan.reasoning}</ThemedText>
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
  empty: { opacity: 0.7 },
  section: { gap: Spacing.two },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  why: { gap: Spacing.one },
  task: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.one / 2,
  },
});

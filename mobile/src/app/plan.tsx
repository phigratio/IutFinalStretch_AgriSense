/**
 * Plan tab — the analysis workspace, mirroring the web AgriSense stage panels
 * (T0-2..T0-7): live weather, retrieved RAG evidence, ranked crops with the
 * factor breakdown, the dated season plan with itemized cost breakdown, and a
 * financial-math panel with the revenue−cost=net invariant check. Every number
 * comes from the session's backend responses; nothing is computed here.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/state/session';
import type {
  CropRecommendation,
  RetrievedEvidence,
  SeasonPlanResult,
  WeatherForecast,
} from '@/api/types';

const RISK_COLOR: Record<CropRecommendation['riskLevel'], ThemeColor> = {
  low: 'success',
  medium: 'warning',
  high: 'error',
};

function tk(n: number): string {
  return `৳${Math.round(n).toLocaleString('en-IN')}`;
}
const pct = (v: number) => `${Math.round(v * 100)}%`;

function Metric({ label, value }: { label: string; value: string | number }) {
  const theme = useTheme();
  return (
    <View style={[styles.metric, { borderColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

function Card({ title, badge, badgeColor, children }: {
  title: string;
  badge?: string;
  badgeColor?: ThemeColor;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <ThemedText type="subtitle">{title}</ThemedText>
        {badge && (
          <View style={[styles.badge, { backgroundColor: theme[(`${badgeColor ?? 'brand'}Soft`) as ThemeColor] }]}>
            <ThemedText type="small" themeColor={badgeColor ?? 'brand'}>
              {badge}
            </ThemedText>
          </View>
        )}
      </View>
      {children}
    </ThemedView>
  );
}

function WeatherPanel({ weather }: { weather: WeatherForecast }) {
  const first = weather.daily[0];
  return (
    <Card title="Live Weather" badge={weather.provider} badgeColor={weather.provider === 'open-meteo' ? 'success' : 'warning'}>
      <View style={styles.metricGrid}>
        <Metric label="Rain today" value={`${first?.rainfallMm ?? 0} mm`} />
        <Metric label="Temp today" value={`${first?.temperatureMinC ?? 0}–${first?.temperatureMaxC ?? 0}°C`} />
        <Metric label="Humidity" value={first?.humidityPct != null ? `${first.humidityPct}%` : 'n/a'} />
        <Metric label="ET₀" value={first?.referenceEvapotranspirationMm != null ? `${first.referenceEvapotranspirationMm} mm` : 'n/a'} />
        <Metric label="Soil moisture" value={first?.soilMoisture0To9cm != null ? `${first.soilMoisture0To9cm}` : 'n/a'} />
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
        {weather.locationText} · {weather.latitude.toFixed(2)}, {weather.longitude.toFixed(2)}
      </ThemedText>
    </Card>
  );
}

function EvidencePanel({ evidence }: { evidence: RetrievedEvidence[] }) {
  const theme = useTheme();
  return (
    <Card title="Retrieved Evidence" badge="RAG" badgeColor="brand">
      <View style={styles.stack}>
        {evidence.slice(0, 5).map((item) => (
          <View key={item.id} style={[styles.evidence, { borderColor: theme.border }]}>
            <View style={styles.evidenceHead}>
              <ThemedText type="smallBold" numberOfLines={1} style={styles.flexOne}>
                {item.title}
              </ThemedText>
              <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.source}
                </ThemedText>
              </View>
            </View>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
              {item.content}
            </ThemedText>
            {item.citation && (
              <ThemedText type="small" themeColor="brand" numberOfLines={1}>
                📚 {item.citation}
              </ThemedText>
            )}
          </View>
        ))}
      </View>
    </Card>
  );
}

function CropCard({ rec }: { rec: CropRecommendation }) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  return (
    <View style={[styles.crop, { borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <ThemedText type="smallBold" style={styles.cropName}>
          {rec.crop}
        </ThemedText>
        <View style={[styles.badge, { backgroundColor: theme.successSoft }]}>
          <ThemedText type="small" themeColor="success">
            {Math.round(rec.suitabilityScore)}/100
          </ThemedText>
        </View>
      </View>
      <View style={styles.metricRow}>
        <ThemedText type="small" themeColor="textSecondary">💧 {rec.waterNeed}</ThemedText>
        <ThemedText type="small" themeColor={RISK_COLOR[rec.riskLevel]}>⚠️ {rec.riskLevel}</ThemedText>
        <ThemedText type="small" themeColor={rec.netProfitBdt >= 0 ? 'success' : 'error'}>
          {tk(rec.netProfitBdt)} · {Math.round(rec.roiPct)}%
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
            {pct(rec.factors.waterFit)} · temp {pct(rec.factors.tempFit)} · budget {pct(rec.factors.budgetFit)}
            {rec.factors.evidenceFit != null ? ` · evidence ${pct(rec.factors.evidenceFit)}` : ''}
          </ThemedText>
          {rec.citations.length > 0 && (
            <ThemedText type="small" themeColor="brand">📚 {rec.citations.join(' · ')}</ThemedText>
          )}
        </View>
      )}
    </View>
  );
}

function CostBreakdown({ plan }: { plan: SeasonPlanResult }) {
  const theme = useTheme();
  return (
    <View style={styles.stack}>
      {plan.financials.costBreakdown.map((item) => (
        <View key={item.category} style={[styles.costRow, { backgroundColor: theme.background }]}>
          <View style={styles.flexOne}>
            <ThemedText type="smallBold">{item.label}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {item.reasoning}
            </ThemedText>
          </View>
          <ThemedText type="smallBold">{tk(item.amountBdt)}</ThemedText>
        </View>
      ))}
    </View>
  );
}

function TaskRow({ task }: { task: SeasonPlanResult['tasks'][number] }) {
  const theme = useTheme();
  return (
    <View style={[styles.task, { borderColor: theme.border }]}>
      <ThemedText type="small" themeColor="brand">
        {task.startDate}
        {task.endDate !== task.startDate ? ` → ${task.endDate}` : ''}
        {task.quantity != null ? ` · ${task.quantity} ${task.unit ?? ''}` : ''}
        {task.totalCostBdt != null ? ` · ${tk(task.totalCostBdt)}` : ''}
      </ThemedText>
      <ThemedText type="smallBold">{task.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {task.description}
      </ThemedText>
      {task.organicAlternative && (
        <ThemedText type="small" themeColor="success">
          🌿 organic: {task.organicAlternative}
        </ThemedText>
      )}
    </View>
  );
}

function SeasonPlanPanel({ plan }: { plan: SeasonPlanResult }) {
  const f = plan.financials;
  return (
    <Card title="Season Plan" badge={plan.crop} badgeColor="brand">
      <ThemedText type="small" themeColor="textSecondary">
        sow {plan.sowDate} · harvest {plan.harvestStartDate} → {plan.harvestEndDate}
      </ThemedText>
      <View style={styles.metricGrid}>
        <Metric label="Yield" value={`${f.expectedYieldKg} kg`} />
        <Metric label="Revenue" value={tk(f.expectedRevenueBdt)} />
        <Metric label="Cost" value={tk(f.totalCostBdt)} />
        <Metric label="Net" value={tk(f.netProfitBdt)} />
        <Metric label="ROI" value={`${Math.round(f.roiPct)}%`} />
        <Metric label="Break-even" value={`${f.breakEvenYieldKg} kg`} />
        <Metric label="Price/kg" value={tk(f.pricePerKgBdt)} />
        <Metric label="Budget gap" value={tk(f.budgetSurplusBdt)} />
      </View>
      <ThemedText type="smallBold" style={styles.subhead}>Itemized costs</ThemedText>
      <CostBreakdown plan={plan} />
      <ThemedText type="smallBold" style={styles.subhead}>Calendar</ThemedText>
      <View style={styles.stack}>
        {plan.tasks.map((task, i) => (
          <TaskRow key={`${task.phase}-${i}`} task={task} />
        ))}
      </View>
    </Card>
  );
}

function FinancialPanel({ plan }: { plan: SeasonPlanResult }) {
  const f = plan.financials;
  const invariantOk = Math.round(f.expectedRevenueBdt - f.totalCostBdt) === Math.round(f.netProfitBdt);
  const theme = useTheme();
  return (
    <Card title="Financial Math" badge={invariantOk ? 'Math consistent' : 'Check math'} badgeColor={invariantOk ? 'success' : 'error'}>
      <View style={[styles.formula, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary">
          Revenue {tk(f.expectedRevenueBdt)} − cost {tk(f.totalCostBdt)} = net {tk(f.netProfitBdt)}. ROI = net / cost × 100 = {Math.round(f.roiPct)}%.
        </ThemedText>
      </View>
    </Card>
  );
}

export default function PlanScreen() {
  const { weather, evidence, cropRankings, seasonPlan } = useSession();
  const nothing = !weather && !evidence && !cropRankings && !seasonPlan;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">Season plan</ThemedText>
          {nothing && (
            <ThemedText themeColor="textSecondary">
              Nothing planned yet — tell the agent about your farm in Chat and the weather,
              evidence, crop rankings, and calendar will appear here.
            </ThemedText>
          )}
          {weather && <WeatherPanel weather={weather} />}
          {evidence && evidence.length > 0 && <EvidencePanel evidence={evidence} />}
          {cropRankings && cropRankings.length > 0 && (
            <Card title="Crop Rankings">
              <View style={styles.stack}>
                {cropRankings.map((rec) => (
                  <CropCard key={rec.crop} rec={rec} />
                ))}
              </View>
            </Card>
          )}
          {seasonPlan && <SeasonPlanPanel plan={seasonPlan} />}
          {seasonPlan && <FinancialPanel plan={seasonPlan} />}
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
  badge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one / 2 + 1,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  metric: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two + Spacing.half,
    paddingVertical: Spacing.one + 2,
    minWidth: 96,
    gap: 2,
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  caption: { marginTop: Spacing.one },
  stack: { gap: Spacing.two },
  flexOne: { flex: 1 },
  evidence: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two + Spacing.half,
    gap: Spacing.one,
  },
  evidenceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  crop: {
    borderWidth: 1,
    borderRadius: Spacing.two + Spacing.half,
    padding: Spacing.two + Spacing.half,
    gap: Spacing.one,
  },
  cropName: { textTransform: 'capitalize', fontSize: 16 },
  why: {
    gap: Spacing.one,
    borderTopWidth: 1,
    paddingTop: Spacing.two,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  task: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two + Spacing.half,
    gap: 2,
  },
  subhead: { marginTop: Spacing.one },
  formula: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two + Spacing.half,
  },
});

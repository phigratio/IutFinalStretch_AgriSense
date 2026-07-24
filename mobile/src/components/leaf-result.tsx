/**
 * Native render of one leaf-diagnosis result (Tier-2 T2-4): source badge
 * (Trained model / AI vision — caution / Unavailable), confidence, caution,
 * treatment + ৳cost, and differentials. Shown inside an agent chat bubble; the
 * bubble's TraceChipRow already renders the diagnosis trace above it.
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LeafDiagnosisResult, LeafSource, LeafTreatment } from '@/api/vision';

const SOURCE_LABEL: Record<LeafSource, string> = {
  hf: 'Trained model',
  openai: 'AI vision',
  unavailable: 'Unavailable',
};

export function LeafResultCard({ diagnosis }: { diagnosis: LeafDiagnosisResult }) {
  const theme = useTheme();
  const confidencePct = Math.round(diagnosis.confidence * 100);
  const sourceColor = diagnosis.source === 'hf' ? theme.success : diagnosis.source === 'openai' ? theme.warning : theme.textSecondary;

  return (
    <View style={[styles.card, { borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold" style={styles.title}>
          {diagnosis.healthy ? 'No disease detected' : diagnosis.disease}
        </ThemedText>
        <View style={[styles.badge, { backgroundColor: sourceColor }]}>
          <ThemedText type="small" style={styles.badgeText}>{SOURCE_LABEL[diagnosis.source]}</ThemedText>
        </View>
        {!diagnosis.healthy && <SeverityBadge severity={diagnosis.severity} />}
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {diagnosis.crop} · {confidencePct}% confidence
      </ThemedText>

      {diagnosis.caution ? (
        <View style={[styles.caution, { backgroundColor: theme.warningSoft, borderColor: theme.warning }]}>
          <ThemedText type="small" themeColor="warning">{diagnosis.caution}</ThemedText>
        </View>
      ) : null}

      {diagnosis.symptoms ? (
        <ThemedText type="small" themeColor="textSecondary">{diagnosis.symptoms}</ThemedText>
      ) : null}

      {!diagnosis.healthy ? (
        <View style={styles.actions}>
          <ActionBox title="Treat" treatment={diagnosis.treatment} />
          <ActionBox title="Prevent" treatment={diagnosis.prevention} />
        </View>
      ) : null}

      {diagnosis.differentials.length > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Also consider: {diagnosis.differentials.join(', ')}
        </ThemedText>
      ) : null}

      {diagnosis.citation ? (
        <ThemedText type="small" themeColor="textSecondary">{diagnosis.citation}</ThemedText>
      ) : null}
    </View>
  );
}

function ActionBox({ title, treatment }: { title: string; treatment: LeafTreatment }) {
  const theme = useTheme();
  const sourceLabel = treatment.source === 'kb' ? 'KB' : treatment.source === 'ai' ? 'AI' : 'general';
  return (
    <View style={[styles.actionBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <View style={styles.actionHeader}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {sourceLabel}{typeof treatment.estimatedCostBdt === 'number' ? ` · ৳${treatment.estimatedCostBdt}` : ''}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">{treatment.text}</ThemedText>
    </View>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const theme = useTheme();
  const color = severity === 'high' ? theme.error : severity === 'medium' ? theme.warning : theme.success;
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <ThemedText type="small" style={styles.badgeText}>{severity}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two + Spacing.half,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  title: { flexShrink: 1 },
  badge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  badgeText: { color: '#ffffff', fontSize: 11, textTransform: 'capitalize' },
  caution: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  actions: {
    gap: Spacing.two,
  },
  actionBox: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

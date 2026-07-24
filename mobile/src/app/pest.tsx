/**
 * Pest & Disease — two grounded tools in one screen:
 *  1) Leaf photo diagnosis (HuggingFace classifier + OpenAI fallback, /api/vision)
 *  2) Weather-driven pest-risk assessment (/api/pest-risk) with ranked risks,
 *     prevention/treatment and cost.
 * Uses the farm's context (crop/location) from the shared session. New UI kit,
 * Bangla-first, no emojis.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { Screen, Card, Button, Chip, Field, TextField, SectionHeader, StatGrid, StatTile, EmptyState, type Tone } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { LeafResultCard } from '@/components/leaf-result';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/i18n/language';
import { useSession } from '@/state/session';
import { diagnoseLeaf, type LeafDiagnosisResult, type LeafImagePart } from '@/api/vision';
import { assessPestRisk, type PestRisk, type PestRiskResult, type PestSeverity } from '@/api/pestRisk';

const CROPS = [
  { id: 'rice_t_aman', label: 'Aman rice' },
  { id: 'rice_boro', label: 'Boro rice' },
  { id: 'potato', label: 'Potato' },
  { id: 'tomato', label: 'Tomato' },
];
const STAGES = ['seedling', 'tillering', 'vegetative', 'flowering', 'fruiting', 'grain_fill'];
const SEVERITY_TONE: Record<PestSeverity, Tone> = { high: 'error', medium: 'warning', low: 'success' };

export default function PestScreen() {
  const { farmId, sessionId, profile, language } = useSession();

  const [cropId, setCropId] = useState('rice_t_aman');
  const [growthStage, setGrowthStage] = useState('tillering');
  const [days, setDays] = useState('35');
  const [area, setArea] = useState(profile?.sizeAcres ? String(profile.sizeAcres) : '2');
  const [location, setLocation] = useState(profile?.locationText ?? 'Gazipur');

  const [leaf, setLeaf] = useState<LeafDiagnosisResult | null>(null);
  const [leafBusy, setLeafBusy] = useState(false);
  const [pest, setPest] = useState<PestRiskResult | null>(null);
  const [pestBusy, setPestBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickLeaf() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    const image: LeafImagePart = (asset as { file?: File }).file
      ? (asset as { file: File }).file
      : { uri: asset.uri, name: asset.fileName ?? 'leaf.jpg', type: asset.mimeType ?? 'image/jpeg' };
    setLeafBusy(true);
    try {
      const diagnosis = await diagnoseLeaf({ image, farmId, sessionId, crop: cropId, locationText: location, language, save: true, createAlerts: true });
      setLeaf(diagnosis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Leaf diagnosis failed.');
    } finally {
      setLeafBusy(false);
    }
  }

  async function runAssessment() {
    setError(null);
    setPestBusy(true);
    try {
      const result = await assessPestRisk({
        cropId,
        growthStage,
        daysAfterSowing: numeric(days),
        areaAcres: numeric(area),
        locationText: location,
        farmId,
        sessionId,
        save: true,
        createAlerts: true,
      });
      setPest(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assess pest risk.');
    } finally {
      setPestBusy(false);
    }
  }

  const features = pest?.assessment.weatherFeatures;

  return (
    <Screen title="Pest & Disease" subtitle="Diagnose a leaf photo or predict risk from crop, stage and weather.">
      {error ? (
        <Card style={{ backgroundColor: 'transparent', borderColor: 'transparent', padding: 0 }}>
          <ThemedText type="small" themeColor="error">
            {error}
          </ThemedText>
        </Card>
      ) : null}

      {/* Leaf photo diagnosis */}
      <Card>
        <SectionHeader title="Leaf Diagnosis" icon="camera" />
        <ThemedText type="small" themeColor="textSecondary">
          A trained model identifies the disease; unclear crops fall back to AI vision with a caution.
        </ThemedText>
        <Button label="Choose leaf photo" icon="image" variant="ghost" onPress={() => void pickLeaf()} loading={leafBusy} />
        {leaf ? <LeafResultCard diagnosis={leaf} /> : null}
      </Card>

      {/* Pest risk assessment */}
      <Card>
        <SectionHeader title="Risk Check" icon="alert-triangle" />
        <Field label="Crop">
          <ChipRow options={CROPS} value={cropId} onChange={setCropId} />
        </Field>
        <Field label="Growth stage">
          <ChipRow options={STAGES.map((s) => ({ id: s, label: s.replace('_', ' ') }))} value={growthStage} onChange={setGrowthStage} />
        </Field>
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <View style={{ flex: 1 }}>
            <Field label="Days after sowing">
              <TextField value={days} onChangeText={setDays} keyboardType="numeric" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Area acres">
              <TextField value={area} onChangeText={setArea} keyboardType="numeric" />
            </Field>
          </View>
        </View>
        <Field label="Location">
          <TextField value={location} onChangeText={setLocation} placeholder="e.g. Bogura" />
        </Field>
        <Button label="Run Risk Check" icon="search" full onPress={() => void runAssessment()} loading={pestBusy} />
      </Card>

      {features ? (
        <Card>
          <SectionHeader title="Weather Drivers" icon="cloud-rain" />
          <StatGrid>
            <StatTile label="Rain 3d" value={`${features.rain3dMm} mm`} />
            <StatTile label="Rain 7d" value={`${features.rain7dMm} mm`} />
            <StatTile label="Avg temp" value={`${features.avgTempC}C`} />
            <StatTile label="Humidity" value={features.avgHumidityPct != null ? `${features.avgHumidityPct}%` : 'n/a'} />
          </StatGrid>
        </Card>
      ) : null}

      {pest ? (
        pest.assessment.risks.length === 0 ? (
          <EmptyState icon="shield" text="No significant pest or disease risk for this crop, stage and weather." />
        ) : (
          <View style={{ gap: Spacing.two }}>
            {pest.assessment.risks.map((risk) => (
              <RiskCard key={risk.ruleId} risk={risk} />
            ))}
          </View>
        )
      ) : null}
    </Screen>
  );
}

function ChipRow({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one }}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            style={{
              borderRadius: 999,
              paddingHorizontal: Spacing.three,
              paddingVertical: Spacing.two,
              borderWidth: 1,
              borderColor: active ? theme.brand : theme.border,
              backgroundColor: active ? theme.brand : theme.backgroundElement,
            }}>
            <ThemedText type="small" style={{ color: active ? '#ffffff' : theme.textSecondary, textTransform: 'capitalize' }}>
              {t(opt.label)}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function RiskCard({ risk }: { risk: PestRisk }) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' }}>
        <ThemedText type="smallBold" style={{ flexShrink: 1 }}>
          {risk.issueName}
        </ThemedText>
        <Chip label={risk.issueType} tone="neutral" />
        <Chip label={risk.severity} tone={SEVERITY_TONE[risk.severity]} solid />
        <ThemedText type="small" themeColor="textSecondary">
          {risk.score}/100
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {risk.symptoms}
      </ThemedText>
      <ActionBox title="Treat" text={risk.treatment.text} cost={risk.treatment.estimatedCostBdt} />
      <ActionBox title="Prevent" text={risk.prevention.text} cost={risk.prevention.estimatedCostBdt} />
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
        {risk.citation}
      </ThemedText>
    </Card>
  );
}

function ActionBox({ title, text, cost }: { title: string; text: string; cost: number }) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={{ backgroundColor: theme.background, borderRadius: 10, padding: Spacing.two + Spacing.half, gap: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <ThemedText type="smallBold">{t(title)}</ThemedText>
        <ThemedText type="smallBold">Tk {Math.round(cost)}</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {text}
      </ThemedText>
    </View>
  );
}

function numeric(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

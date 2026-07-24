/**
 * Shared UI kit for the AgriSense mobile app — the single design language every
 * screen builds from (Terracotta & Sage theme, see constants/theme.ts). Static
 * chrome strings passed to these components are auto-translated via the i18n t()
 * (default Bangla); dynamic values (crops, numbers) are rendered as-is. No emojis
 * — Feather line icons only.
 */
import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { ThemedText } from './themed-text';
import { BottomTabInset, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/i18n/language';
import { useThemeMode } from '@/theme/theme-mode';

export type IconName = ComponentProps<typeof Feather>['name'];
export type Tone = 'brand' | 'secondary' | 'success' | 'warning' | 'error' | 'neutral';

/** Full-screen surface with an optional title/subtitle header and a right slot. */
export function Screen({
  title,
  subtitle,
  right,
  scroll = true,
  children,
  edges = ['top'],
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  scroll?: boolean;
  children: ReactNode;
  edges?: readonly Edge[];
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView edges={edges} style={{ flex: 1 }}>
        {(title || right) && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: Spacing.two,
              paddingHorizontal: Spacing.three,
              paddingTop: Spacing.three,
              paddingBottom: Spacing.two,
            }}>
            <View style={{ flex: 1 }}>
              {title ? (
                <ThemedText style={{ fontSize: 24, lineHeight: 30, fontWeight: '700', color: theme.text }}>
                  {t(title)}
                </ThemedText>
              ) : null}
              {subtitle ? (
                <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 2 }}>
                  {t(subtitle)}
                </ThemedText>
              ) : null}
            </View>
            {right}
          </View>
        )}
        {scroll ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: Spacing.three,
              paddingTop: title ? 0 : Spacing.three,
              paddingBottom: BottomTabInset + Spacing.four,
              gap: Spacing.three,
            }}
            keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{children}</View>
        )}
      </SafeAreaView>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: Radius.lg,
          padding: Spacing.three,
          gap: Spacing.two,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function SectionHeader({
  title,
  icon,
  action,
}: {
  title: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexShrink: 1 }}>
        {icon ? <Feather name={icon} size={15} color={theme.brand} /> : null}
        <ThemedText type="smallBold">{t(title)}</ThemedText>
      </View>
      {action}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  full,
  size = 'md',
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  size?: 'sm' | 'md';
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const bg =
    variant === 'primary' ? theme.brand : variant === 'secondary' ? theme.secondary : variant === 'danger' ? theme.error : 'transparent';
  const fg = variant === 'ghost' ? theme.brand : '#ffffff';
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing.two,
          backgroundColor: bg,
          borderColor: variant === 'ghost' ? theme.border : 'transparent',
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderRadius: Radius.md,
          paddingVertical: size === 'sm' ? Spacing.two : Spacing.two + Spacing.half,
          paddingHorizontal: Spacing.three,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        full ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' },
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : icon ? (
        <Feather name={icon} size={16} color={fg} />
      ) : null}
      <ThemedText type="smallBold" style={{ color: fg }}>
        {t(label)}
      </ThemedText>
    </Pressable>
  );
}

const TONES: Record<Tone, [softKey: ThemeColor, strongKey: ThemeColor]> = {
  brand: ['brandSoft', 'brand'],
  secondary: ['secondarySoft', 'secondary'],
  success: ['successSoft', 'success'],
  warning: ['warningSoft', 'warning'],
  error: ['errorSoft', 'error'],
  neutral: ['backgroundSelected', 'textSecondary'],
};

export function Chip({ label, tone = 'neutral', solid = false }: { label: string; tone?: Tone; solid?: boolean }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const [softKey, strongKey] = TONES[tone];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: Radius.pill,
        paddingHorizontal: Spacing.two,
        paddingVertical: 3,
        backgroundColor: solid ? theme[strongKey] : theme[softKey],
      }}>
      <ThemedText style={{ fontSize: 11, fontWeight: '600', color: solid ? '#ffffff' : theme[strongKey] }}>
        {t(label)}
      </ThemedText>
    </View>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useLanguage();
  return (
    <View style={{ gap: Spacing.one }}>
      <ThemedText type="small" themeColor="textSecondary">
        {t(label)}
      </ThemedText>
      {children}
    </View>
  );
}

export const TextField = forwardRef<TextInput, TextInputProps>((props, ref) => {
  const theme = useTheme();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={theme.textSecondary}
      {...props}
      style={[
        {
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.backgroundElement,
          borderRadius: Radius.md,
          paddingHorizontal: Spacing.three,
          paddingVertical: Spacing.two + Spacing.half,
          color: theme.text,
          fontSize: 16,
        },
        props.style,
      ]}
    />
  );
});
TextField.displayName = 'TextField';

export function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: ThemeColor }) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: '30%',
        minWidth: 100,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: Radius.md,
        padding: Spacing.two + Spacing.half,
        gap: 2,
        backgroundColor: theme.backgroundElement,
      }}>
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
        {t(label)}
      </ThemedText>
      <ThemedText type="smallBold" numberOfLines={1} themeColor={tone}>
        {String(value)}
      </ThemedText>
    </View>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>{children}</View>;
}

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.border }} />;
}

export function EmptyState({ icon, text }: { icon?: IconName; text: string }) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={{ alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four }}>
      {icon ? <Feather name={icon} size={22} color={theme.textSecondary} /> : null}
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        {t(text)}
      </ThemedText>
    </View>
  );
}

/** Light / dark theme toggle (sun / moon) for screen headers. */
export function ThemeToggle() {
  const theme = useTheme();
  const { scheme, toggle } = useThemeMode();
  return (
    <Pressable
      onPress={toggle}
      accessibilityLabel="Toggle light or dark theme"
      style={{
        width: 36,
        height: 36,
        borderRadius: Radius.pill,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.backgroundElement,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Feather name={scheme === 'dark' ? 'sun' : 'moon'} size={16} color={theme.text} />
    </Pressable>
  );
}

/** Segmented Bangla / English toggle for screen headers. */
export function LanguageToggle() {
  const theme = useTheme();
  const { language, setLanguage } = useLanguage();
  return (
    <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: theme.border, borderRadius: Radius.pill, overflow: 'hidden' }}>
      {(['bn', 'en'] as const).map((lang) => {
        const active = language === lang;
        return (
          <Pressable
            key={lang}
            onPress={() => setLanguage(lang)}
            style={{ paddingHorizontal: Spacing.two + Spacing.half, paddingVertical: Spacing.one, backgroundColor: active ? theme.brand : 'transparent' }}>
            <ThemedText style={{ fontSize: 12, fontWeight: '600', color: active ? '#ffffff' : theme.textSecondary }}>
              {lang === 'bn' ? 'বাংলা' : 'EN'}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

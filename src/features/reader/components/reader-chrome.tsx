import { styles } from '@/features/reader/reader-styles';
import { useTranslation } from '@/shared/i18n/index';
import { clamp } from '@/shared/math';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

export function disabledToolColor(color: string) {
  return color.startsWith('#') ? `${color}66` : 'rgba(120,120,120,0.45)';
}

export function PageTurnButtons({
  foregroundColor,
  onPrevious,
  onNext,
}: {
  foregroundColor: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View pointerEvents="box-none" style={styles.pageButtons}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('previousPage')}
        onPress={onPrevious}
        style={styles.pageButton}>
        <ChevronLeft size={28} color={foregroundColor} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('nextPage')}
        onPress={onNext}
        style={styles.pageButton}>
        <ChevronRight size={28} color={foregroundColor} />
      </Pressable>
    </View>
  );
}

export function BatteryBadge({ value, color }: { value: number | null; color: string }) {
  const { t } = useTranslation();
  const batteryText = value === null ? '--' : String(Math.round(clamp(value, 0, 100)));

  return (
    <View
      style={styles.batteryBadge}
      accessibilityLabel={value === null ? t('batteryUnknown') : t('batteryValue', { value })}>
      <View style={[styles.batteryBody, { borderColor: color }]}>
        <Text style={[styles.batteryBadgeText, { color }]}>{batteryText}</Text>
      </View>
      <View style={[styles.batteryCap, { borderColor: color }]} />
    </View>
  );
}

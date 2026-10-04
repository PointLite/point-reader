import { webDavSortLabels, type WebDavSortState } from '@/features/webdav/browser-model';
import { styles } from '@/features/webdav/browser-styles';
import { useTranslation } from '@/shared/i18n/index';
import { modalAnimationType } from '@/shared/theme/motion';
import { type AppColors } from '@/shared/theme/theme';
import { Spacing, TouchTarget } from '@/shared/theme/tokens';
import { ArrowDownAZ, ArrowUpAZ, Check } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export function SortModal({
  visible,
  colors,
  einkOptimization,
  sort,
  frame,
  screenWidth,
  screenHeight,
  onChange,
  onClose,
}: {
  visible: boolean;
  colors: AppColors;
  einkOptimization: boolean;
  sort: WebDavSortState;
  frame: { x: number; y: number; width: number; height: number } | null;
  screenWidth: number;
  screenHeight: number;
  onChange: (sort: WebDavSortState) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const setField = (field: WebDavSortState['field']) => {
    if (field === sort.field) return;
    void onChange({ ...sort, field });
  };
  const setDirection = (direction: WebDavSortState['direction']) => {
    if (direction === sort.direction) return;
    void onChange({ ...sort, direction });
  };
  const menuWidth = 220;
  const top = frame ? frame.y + frame.height + Spacing.one : Spacing.six;
  const right = frame ? Math.max(Spacing.three, screenWidth - frame.x - frame.width) : Spacing.three;
  const maxHeight = Math.max(TouchTarget * 2, screenHeight - top - Spacing.three);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={modalAnimationType(einkOptimization)}
      onRequestClose={onClose}>
      <View style={styles.sortModalLayer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('closeSort')}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.sortCard,
            {
              width: menuWidth,
              top,
              right,
              maxHeight,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}>
          <Text style={[styles.sortTitle, { color: colors.text }]}>{t('sort')}</Text>
          {(['name', 'modifiedAt'] as const).map((field) => {
            const selected = field === sort.field;
            return (
              <Pressable
                key={field}
                accessibilityRole="button"
                accessibilityLabel={t('sortBy', { label: t(webDavSortLabels[field]) })}
                accessibilityState={{ selected }}
                onPress={() => setField(field)}
                style={({ pressed }) => [
                  styles.sortOption,
                  selected && { backgroundColor: colors.accent },
                  pressed && styles.pressed,
                ]}>
                <View style={styles.sortOptionIcon}>
                  {selected ? <Check size={18} color={colors.surface} strokeWidth={3} /> : null}
                </View>
                <Text
                  style={[
                    styles.sortOptionText,
                    { color: colors.text },
                    selected && { color: colors.surface },
                  ]}>
                  {t(webDavSortLabels[field])}
                </Text>
              </Pressable>
            );
          })}
          <View style={[styles.sortSeparator, { backgroundColor: colors.border }]} />
          {(
            [
              { direction: 'asc', label: t('ascending'), icon: ArrowDownAZ },
              { direction: 'desc', label: t('descending'), icon: ArrowUpAZ },
            ] as const
          ).map((item) => {
            const selected = item.direction === sort.direction;
            const Icon = item.icon;
            return (
              <Pressable
                key={item.direction}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected }}
                onPress={() => setDirection(item.direction)}
                style={({ pressed }) => [
                  styles.sortOption,
                  selected && { backgroundColor: colors.accent },
                  pressed && styles.pressed,
                ]}>
                <Icon size={18} color={selected ? colors.surface : colors.text} />
                <Text
                  style={[
                    styles.sortOptionText,
                    { color: colors.text },
                    selected && { color: colors.surface },
                  ]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

import { type LucideIcon } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useTranslation } from '@/lib/i18n';
import type { AppColors } from '@/lib/theme';

export function ReaderMetricControl({
  value,
  colors,
  min,
  max,
  step,
  leftLabel,
  rightLabel,
  valueLabel,
  icon: Icon,
  accessibilityLabel,
  compact,
  onValue,
}: {
  value: number;
  colors: AppColors;
  min: number;
  max: number;
  step: number;
  leftLabel: string;
  rightLabel: string;
  valueLabel: string;
  icon?: LucideIcon;
  accessibilityLabel: string;
  compact?: boolean;
  onValue: (value: number) => void;
}) {
  const { t } = useTranslation();
  const [trackWidth, setTrackWidth] = useState(0);
  const [localValue, setLocalValue] = useState(value);
  const localValueRef = useRef(value);
  const emittedValueRef = useRef(value);
  const dragging = useRef(false);
  const controlRef = useRef<View>(null);
  const controlPageX = useRef(0);
  const thumbWidth = 48;
  const travelWidth = Math.max(1, trackWidth - thumbWidth);
  const progress = trackWidth ? (localValue - min) / (max - min) : 0;
  const thumbLeft = clamp(progress, 0, 1) * travelWidth;

  useEffect(() => {
    if (dragging.current) return;
    localValueRef.current = value;
    emittedValueRef.current = value;
    setLocalValue(value);
  }, [value]);

  const normalizeValue = useCallback(
    (rawValue: number) => {
      const multiplier = Math.round(1 / step);
      return clamp(Math.round(rawValue * multiplier) / multiplier, min, max);
    },
    [max, min, step]
  );

  const emitValue = useCallback(
    (nextValue: number) => {
      if (Object.is(emittedValueRef.current, nextValue)) return;
      emittedValueRef.current = nextValue;
      onValue(nextValue);
    },
    [onValue]
  );

  const setDraftValue = useCallback(
    (nextValue: number, emit = false) => {
      const normalized = normalizeValue(nextValue);
      localValueRef.current = normalized;
      setLocalValue(normalized);
      if (emit) emitValue(normalized);
    },
    [emitValue, normalizeValue]
  );

  const commitValue = useCallback(
    (nextValue?: number) => {
      const normalized = normalizeValue(nextValue ?? localValueRef.current);
      localValueRef.current = normalized;
      emittedValueRef.current = normalized;
      setLocalValue(normalized);
      onValue(normalized);
    },
    [normalizeValue, onValue]
  );

  const updateValue = useCallback(
    (direction: -1 | 1) => {
      const multiplier = Math.round(1 / step);
      const next = Math.round((localValueRef.current + direction * step) * multiplier) / multiplier;
      commitValue(clamp(next, min, max));
    },
    [commitValue, max, min, step]
  );

  const updateValueFromTrackX = useCallback(
    (x: number) => {
      if (!trackWidth) return;
      const ratio = clamp((x - thumbWidth / 2) / travelWidth, 0, 1);
      setDraftValue(min + ratio * (max - min), true);
    },
    [max, min, setDraftValue, thumbWidth, trackWidth, travelWidth]
  );

  const updateControlPageX = useCallback(() => {
    controlRef.current?.measureInWindow((x) => {
      controlPageX.current = x;
    });
  }, []);

  const updateValueFromPageX = useCallback(
    (pageX: number) => {
      updateValueFromTrackX(pageX - controlPageX.current);
    },
    [updateValueFromTrackX]
  );

  return (
    <View
      ref={controlRef}
      style={[styles.metricControl, { backgroundColor: colors.backgroundElement }, compact && styles.metricControlCompact]}
      onLayout={(event) => {
        setTrackWidth(event.nativeEvent.layout.width);
        updateControlPageX();
      }}
      onStartShouldSetResponder={() => true}
      onStartShouldSetResponderCapture={() => true}
      onMoveShouldSetResponder={() => true}
      onMoveShouldSetResponderCapture={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        dragging.current = true;
        controlRef.current?.measureInWindow((x) => {
          controlPageX.current = x;
          updateValueFromPageX(event.nativeEvent.pageX);
        });
      }}
      onResponderMove={(event) => {
        if (!trackWidth) return;
        updateValueFromPageX(event.nativeEvent.pageX);
      }}
      onResponderRelease={() => {
        dragging.current = false;
        commitValue();
      }}
      onResponderTerminate={() => {
        dragging.current = false;
        commitValue();
      }}>
      <View pointerEvents="none" style={styles.metricTrackLabels}>
        <Text style={[styles.metricSideText, { color: colors.text }, compact && styles.metricSideTextCompact]}>{leftLabel}</Text>
        <Text style={[styles.metricSideText, styles.metricSideTextLarge, { color: colors.text }, compact && styles.metricSideTextCompact]}>{rightLabel}</Text>
      </View>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: valueLabel }}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') updateValue(1);
          if (event.nativeEvent.actionName === 'decrement') updateValue(-1);
        }}
        accessibilityActions={[
          { name: 'increment', label: t('increase') },
          { name: 'decrement', label: t('decrease') },
        ]}
        style={[
          styles.metricThumb,
          { borderColor: colors.backgroundElement, backgroundColor: colors.surface, shadowColor: colors.text },
          compact && styles.metricThumbCompact,
          trackWidth > 0 && { left: thumbLeft, width: thumbWidth },
        ]}>
        {Icon ? <Icon size={compact ? 17 : 19} color={colors.text} strokeWidth={2.4} /> : null}
        {!compact ? <Text style={[styles.metricThumbText, { color: colors.text }]}>{String(Math.round(localValue))}</Text> : null}
      </View>
    </View>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const styles = StyleSheet.create({
  metricControl: {
    position: 'relative',
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: Colors.light.backgroundElement,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'visible',
  },
  metricControlCompact: {
    flex: 1,
    minHeight: 46,
    borderRadius: 23,
  },
  metricTrackLabels: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricSideText: {
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '400',
    color: Colors.light.text,
  },
  metricSideTextLarge: {
    fontSize: 27,
    lineHeight: 31,
  },
  metricSideTextCompact: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '400',
  },
  metricThumb: {
    position: 'absolute',
    top: 0,
    minWidth: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.light.backgroundElement,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.one,
    shadowColor: Colors.light.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  metricThumbCompact: {
    minWidth: 48,
    height: 46,
    borderRadius: 23,
  },
  metricThumbText: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '500',
    color: Colors.light.text,
  },
});

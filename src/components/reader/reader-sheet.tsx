import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ListChevronsUpDown,
  RotateCcw,
  RotateCw,
  SquareDashed,
} from 'lucide-react-native';
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { ReaderMetricControl } from '@/components/reader/metric-control';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTranslation } from '@/lib/i18n';
import { readerBackgrounds } from '@/lib/readerContent';
import type { AppColors } from '@/lib/theme';
import type { ReaderChapter, ReadingSettings } from '@/types/reader';

const READER_TOOLBAR_HEIGHT = 68;
const EMPTY_DISABLED_SHEETS: ('theme' | 'font')[] = [];

export function ReaderSheet({
  sheet,
  settings,
  systemColorScheme,
  colors,
  disabledSheets,
  progress,
  chapters,
  hasChapters,
  currentChapterIndex,
  currentChapterHref,
  onSelectChapter,
  onSettings,
  onStyleChange,
  onSeekProgress,
  resolveChapterIndex,
}: {
  sheet: 'toc' | 'theme' | 'progress' | 'font';
  settings: ReadingSettings;
  systemColorScheme?: 'light' | 'dark' | null;
  colors: AppColors;
  disabledSheets?: ('theme' | 'font')[];
  progress: number;
  chapters: ReaderChapter[];
  hasChapters: boolean;
  currentChapterIndex: number;
  currentChapterHref?: string;
  onSelectChapter: (index: number, href?: string) => void;
  onSettings: (patch: Partial<ReadingSettings>) => void;
  onStyleChange: () => void;
  onSeekProgress: (progress: number) => void;
  resolveChapterIndex?: (href: string | undefined, fallbackIndex: number) => number;
}) {
  const { t } = useTranslation();
  const resolvedDisabledSheets = disabledSheets ?? EMPTY_DISABLED_SHEETS;
  const tocListRef = useRef<FlatList<ReaderChapter>>(null);
  const themeDisabled = resolvedDisabledSheets.includes('theme');
  const fontDisabled = resolvedDisabledSheets.includes('font');
  const sheetTitle = {
    toc: t('toc'),
    theme: t('background'),
    progress: t('progress'),
    font: t('font'),
  }[sheet];

  const applyReaderSettings = (patch: Partial<ReadingSettings>) => {
    onStyleChange();
    onSettings(patch);
  };

  useEffect(() => {
    if (sheet !== 'toc' || !hasChapters || !chapters.length) return;
    const hrefIndex = currentChapterHref
      ? chapters.findIndex((chapter) => isSameEpubHref(chapter.href, currentChapterHref))
      : -1;
    const targetIndex = hrefIndex >= 0 ? hrefIndex : clamp(currentChapterIndex, 0, chapters.length - 1);
    const timer = setTimeout(() => {
      tocListRef.current?.scrollToIndex({
        index: targetIndex,
        viewPosition: 0,
        viewOffset: TouchTarget * 2,
        animated: false,
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [chapters, currentChapterHref, currentChapterIndex, hasChapters, sheet]);

  return (
    <View style={[styles.sheet, { backgroundColor: colors.surface, boxShadow: `0 -4px 14px ${colors.text}1F` }]}>
      <View style={[styles.sheetTitleWrap, { borderBottomColor: colors.backgroundElement }]}>
        <Text style={[styles.sheetTitle, { color: colors.text }]}>{sheetTitle}</Text>
      </View>
      {sheet === 'toc' ? (
        hasChapters ? (
          <FlatList
            ref={tocListRef}
            data={chapters}
            keyExtractor={(chapter, index) => `${chapter.id}-${index}`}
            scrollsToTop={false}
            style={styles.tocList}
            getItemLayout={(_, index) => ({ length: TouchTarget, offset: TouchTarget * index, index })}
            onScrollToIndexFailed={({ index }) => {
              requestAnimationFrame(() => {
                tocListRef.current?.scrollToOffset({
                  offset: Math.max(0, index * TouchTarget - TouchTarget * 2),
                  animated: false,
                });
              });
            }}
            renderItem={({ item: chapter, index }) => {
              const isCurrent = currentChapterHref
                ? isSameEpubHref(chapter.href, currentChapterHref)
                : index === currentChapterIndex;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={chapter.title}
                  accessibilityState={{ selected: isCurrent }}
                  onPress={() => {
                    const targetHref = normalizeEpubDisplayHref(chapter.href);
                    onSelectChapter(resolveChapterIndex?.(targetHref || chapter.href, index) ?? index, targetHref || chapter.href);
                  }}
                  style={[styles.tocItem, { borderBottomColor: colors.backgroundElement }, isCurrent && { backgroundColor: colors.backgroundElement }]}>
                  <Text style={[styles.tocTitle, { color: colors.text }, isCurrent && styles.tocTitleCurrent]} numberOfLines={2}>
                    {chapter.title}
                  </Text>
                </Pressable>
              );
            }}
          />
        ) : (
          <View style={styles.emptyToc}>
            <Text style={[styles.emptyTocText, { color: colors.textSecondary }]}>{t('noChapters')}</Text>
          </View>
        )
      ) : null}
      {sheet === 'theme' && !themeDisabled ? (
        <View style={styles.swatches}>
          {(['white', 'gray', 'yellow', 'green'] as ReadingSettings['background'][]).map((name) => (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityLabel={`${t('background')} ${name}`}
              onPress={() => {
                applyReaderSettings({ background: name });
              }}
              style={[
                styles.swatch,
                { backgroundColor: readerBackgrounds[name] },
                { borderColor: colors.border },
                settings.background === name && [styles.swatchSelected, { borderColor: colors.text }],
              ]}
            />
          ))}
        </View>
      ) : null}
      {sheet === 'progress' ? (
        <ProgressPanel
          colors={colors}
          progress={progress}
          onSeek={onSeekProgress}
          onPreviousChapter={() => {
            const nextIndex = Math.max(0, currentChapterIndex - 1);
            const nextProgress = chapters.length ? nextIndex / chapters.length : 0;
            onSeekProgress(nextProgress);
          }}
          onNextChapter={() => {
            const nextIndex = Math.min(Math.max(0, chapters.length - 1), currentChapterIndex + 1);
            const nextProgress = chapters.length ? nextIndex / chapters.length : 1;
            onSeekProgress(nextProgress);
          }}
        />
      ) : null}
      {sheet === 'font' && !fontDisabled ? (
        <View style={styles.fontPanel}>
          <ReaderMetricControl
            colors={colors}
            value={settings.fontSize}
            min={16}
            max={32}
            step={1}
            leftLabel="A"
            rightLabel="A"
            valueLabel={`${settings.fontSize}`}
            accessibilityLabel={t('fontSize')}
            onValue={(value) => applyReaderSettings({ fontSize: value })}
          />
          <View style={styles.metricGrid}>
            <ReaderMetricControl
              colors={colors}
              value={settings.paddingScale}
              min={0.5}
              max={1.8}
              step={0.1}
              leftLabel={t('small')}
              rightLabel={t('large')}
              valueLabel={t('padding')}
              icon={SquareDashed}
              compact
              accessibilityLabel={t('textPadding')}
              onValue={(value) => applyReaderSettings({ paddingScale: value })}
            />
            <ReaderMetricControl
              colors={colors}
              value={settings.lineHeightScale}
              min={1.2}
              max={1.9}
              step={0.05}
              leftLabel={t('small')}
              rightLabel={t('large')}
              valueLabel={t('lineHeight')}
              icon={ListChevronsUpDown}
              compact
              accessibilityLabel={t('lineHeight')}
              onValue={(value) => applyReaderSettings({ lineHeightScale: value })}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ProgressPanel({
  progress,
  colors,
  onSeek,
  onPreviousChapter,
  onNextChapter,
}: {
  progress: number;
  colors: AppColors;
  onSeek: (progress: number) => void;
  onPreviousChapter: () => void;
  onNextChapter: () => void;
}) {
  const { t } = useTranslation();
  const undoProgress = useRef<number | null>(null);
  const redoProgress = useRef<number | null>(null);
  const currentProgress = useRef(progress);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    currentProgress.current = progress;
  }, [progress]);

  const commitSeek = (nextProgress: number) => {
    const clampedProgress = clamp(nextProgress, 0, 1);
    undoProgress.current = currentProgress.current;
    redoProgress.current = null;
    currentProgress.current = clampedProgress;
    setCanUndo(true);
    setCanRedo(false);
    onSeek(clampedProgress);
  };

  const seekBy = (delta: number) => {
    commitSeek(currentProgress.current + delta);
  };

  const undo = () => {
    if (undoProgress.current === null) return;
    redoProgress.current = currentProgress.current;
    const target = undoProgress.current;
    undoProgress.current = null;
    currentProgress.current = target;
    setCanUndo(false);
    setCanRedo(true);
    onSeek(target);
  };

  const redo = () => {
    if (redoProgress.current === null) return;
    undoProgress.current = currentProgress.current;
    const target = redoProgress.current;
    redoProgress.current = null;
    currentProgress.current = target;
    setCanUndo(true);
    setCanRedo(false);
    onSeek(target);
  };

  const jumpChapter = (direction: -1 | 1) => {
    undoProgress.current = currentProgress.current;
    redoProgress.current = null;
    setCanUndo(true);
    setCanRedo(false);
    if (direction < 0) onPreviousChapter();
    else onNextChapter();
  };

  return (
    <View style={styles.progressPanel}>
      <ReaderProgressControl value={progress} colors={colors} onValue={commitSeek} />
      <View style={styles.progressActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('previousChapter')} onPress={() => jumpChapter(-1)} style={styles.progressActionButton}>
          <ChevronsLeft size={28} color={colors.text} strokeWidth={2.6} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('backALittle')} onPress={() => seekBy(-0.01)} style={styles.progressActionButton}>
          <ChevronLeft size={30} color={colors.text} strokeWidth={2.6} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('undoSeek')}
          accessibilityState={{ disabled: !canUndo }}
          disabled={!canUndo}
          onPress={undo}
          style={styles.progressActionButton}>
          <RotateCcw size={30} color={canUndo ? colors.text : colors.textSecondary} strokeWidth={2.4} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('redoSeek')}
          accessibilityState={{ disabled: !canRedo }}
          disabled={!canRedo}
          onPress={redo}
          style={styles.progressActionButton}>
          <RotateCw size={30} color={canRedo ? colors.text : colors.textSecondary} strokeWidth={2.4} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('forwardALittle')} onPress={() => seekBy(0.01)} style={styles.progressActionButton}>
          <ChevronRight size={30} color={colors.text} strokeWidth={2.6} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('nextChapter')} onPress={() => jumpChapter(1)} style={styles.progressActionButton}>
          <ChevronsRight size={28} color={colors.text} strokeWidth={2.6} />
        </Pressable>
      </View>
    </View>
  );
}

export function ProgressToolIcon({ color, backgroundColor }: { color: string; backgroundColor: string }) {
  return (
    <View style={styles.progressToolIcon} accessibilityElementsHidden>
      <View style={[styles.progressToolIconLine, { backgroundColor: color }]} />
      <View style={[styles.progressToolIconKnob, { borderColor: color, backgroundColor }]} />
    </View>
  );
}

function ReaderProgressControl({ value, colors, onValue }: { value: number; colors: AppColors; onValue: (value: number) => void }) {
  const { t } = useTranslation();
  const [trackWidth, setTrackWidth] = useState(0);
  const [localValue, setLocalValue] = useReducer((_current: number, next: number) => next, value);
  const localValueRef = useRef(value);
  const dragging = useRef(false);
  const controlRef = useRef<View>(null);
  const controlPageX = useRef(0);
  const thumbWidth = 56;
  const travelWidth = Math.max(1, trackWidth - thumbWidth);
  const thumbLeft = clamp(localValue, 0, 1) * travelWidth;

  useEffect(() => {
    if (dragging.current) return;
    localValueRef.current = value;
    setLocalValue(value);
  }, [value]);

  const updateValueFromTrackX = (x: number) => {
    if (!trackWidth) return;
    const ratio = clamp((x - thumbWidth / 2) / travelWidth, 0, 1);
    localValueRef.current = ratio;
    setLocalValue(ratio);
  };

  const updateControlPageX = () => {
    controlRef.current?.measureInWindow((x) => {
      controlPageX.current = x;
    });
  };

  const updateValueFromPageX = (pageX: number) => {
    updateValueFromTrackX(pageX - controlPageX.current);
  };

  const commit = () => {
    onValue(clamp(localValueRef.current, 0, 1));
  };

  return (
    <View
      ref={controlRef}
      accessibilityRole="adjustable"
      accessibilityLabel={t('readingProgress')}
      accessibilityValue={{ text: `${Math.round(localValue * 100)}%` }}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') onValue(clamp(value + 0.01, 0, 1));
        if (event.nativeEvent.actionName === 'decrement') onValue(clamp(value - 0.01, 0, 1));
      }}
      accessibilityActions={[
        { name: 'increment', label: t('forward') },
        { name: 'decrement', label: t('backward') },
      ]}
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
        updateValueFromPageX(event.nativeEvent.pageX);
      }}
      onResponderRelease={() => {
        dragging.current = false;
        commit();
      }}
      onResponderTerminate={() => {
        dragging.current = false;
        commit();
      }}
      style={[styles.progressTrack, { backgroundColor: colors.backgroundElement }]}>
      <View pointerEvents="none" style={[styles.progressTrackFill, { backgroundColor: colors.backgroundSelected, width: trackWidth ? thumbLeft + thumbWidth / 2 : 0 }]} />
      <View pointerEvents="none" style={[styles.progressThumb, { backgroundColor: colors.surface, boxShadow: `0 4px 8px ${colors.text}14` }, trackWidth > 0 && { left: thumbLeft, width: thumbWidth }]}>
        <Text style={[styles.progressThumbText, { color: colors.text }]}>{`${Math.round(localValue * 100)}%`}</Text>
      </View>
    </View>
  );
}


function normalizeEpubHref(href?: string | null) {
  if (!href) return '';
  return href.split('#')[0].replace(/^.*\/([^/]+)$/, '$1');
}

function normalizeEpubDisplayHref(href?: string | null) {
  if (!href) return '';
  return href.replace(/^(..\/)+/, '').replace(/^\/+/, '');
}

function parseEpubScrollLocation(location?: string | null) {
  if (!location?.startsWith('point-reader:epub-scroll:')) return null;
  const match = location.match(/^point-reader:epub-scroll:(\d+):([0-9.]+):(.*)$/);
  if (!match) return null;
  return {
    index: Number(match[1]),
    offset: clamp(Number(match[2]), 0, 1),
    href: decodeURIComponent(match[3] ?? ''),
  };
}

function isSameEpubHref(first?: string | null, second?: string | null) {
  const parsedSecond = parseEpubScrollLocation(second);
  const normalizedFirst = normalizeEpubHref(first);
  const normalizedSecond = normalizeEpubHref(parsedSecond?.href ?? second);
  return Boolean(normalizedFirst && normalizedSecond && normalizedFirst === normalizedSecond);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: READER_TOOLBAR_HEIGHT,
    maxHeight: '42%',
    backgroundColor: Colors.light.surface,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
    zIndex: 20,
    boxShadow: '0 -4px 14px rgba(28,25,23,0.12)',
  },
  sheetTitleWrap: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    marginBottom: Spacing.one,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.backgroundElement,
  },
  sheetTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
  },
  tocList: {
    maxHeight: 320,
  },
  tocItem: {
    minHeight: TouchTarget,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.backgroundElement,
  },
  tocTitle: {
    fontSize: 16,
    lineHeight: 22,
    color: Colors.light.text,
  },
  tocTitleCurrent: {
    fontWeight: '700',
  },
  emptyToc: {
    minHeight: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTocText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  swatches: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  swatch: {
    width: 56,
    height: 56,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: Colors.light.text,
  },
  fontPanel: {
    gap: Spacing.four,
  },
  metricGrid: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  progressPanel: {
    gap: Spacing.four,
    paddingVertical: Spacing.two,
  },
  progressActions: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressActionButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressToolIcon: {
    position: 'relative',
    width: 31,
    height: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressToolIconLine: {
    width: 30,
    height: 3,
    borderRadius: 2,
  },
  progressToolIconKnob: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 3,
    backgroundColor: Colors.light.surface,
  },
  progressTrack: {
    position: 'relative',
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.light.backgroundElement,
    overflow: 'visible',
  },
  progressTrackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 25,
    backgroundColor: 'rgba(28,25,23,0.08)',
  },
  progressThumb: {
    position: 'absolute',
    top: -3,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 8px rgba(28,25,23,0.08)',
  },
  progressThumbText: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '500',
    color: Colors.light.text,
  },
});

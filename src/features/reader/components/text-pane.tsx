import type { Book } from '@/features/library/types';
import { PageTurnButtons } from '@/features/reader/components/reader-chrome';
import { fontFamilyFor } from '@/features/reader/content';
import { tapZoneAction } from '@/features/reader/interactions';
import { styles } from '@/features/reader/reader-styles';
import { type TextBlock, type TextScrollRequest } from '@/features/reader/text';
import type { ReaderChapter } from '@/features/reader/types';
import type { ReadingSettings } from '@/features/settings/types';
import { useTranslation } from '@/shared/i18n/index';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
  type ViewToken,
} from 'react-native';

export function TextScrollPane({
  blocks,
  totalBlocks,
  totalChapters,
  initialBlockIndex,
  scrollRequest,
  settings,
  foregroundColor,
  onLoadMore,
  onProgress,
  onToggleToolbar,
}: {
  blocks: TextBlock[];
  totalBlocks: number;
  totalChapters: number;
  initialBlockIndex: number;
  scrollRequest: TextScrollRequest | null;
  settings: ReadingSettings;
  foregroundColor: string;
  onLoadMore: () => void;
  onProgress: (progress: number, chapter: number, offset: number) => void;
  onToggleToolbar: () => void;
}) {
  const { t } = useTranslation();
  const listRef = useRef<FlatList<TextBlock>>(null);
  const hasRestored = useRef(false);
  const isDragging = useRef(false);
  const touchStart = useRef({ x: 0, y: 0 });
  const pendingScrollIndex = useRef<number | null>(null);
  const scrollRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRetryCount = useRef(0);

  const scrollToBlockTop = (blockIndex: number) => {
    pendingScrollIndex.current = blockIndex;
    listRef.current?.scrollToIndex({
      index: blockIndex,
      animated: false,
      viewPosition: 0,
      viewOffset: 0,
    });
  };
  const scrollToBlockTopEvent = useEffectEvent((blockIndex: number) => {
    scrollToBlockTop(blockIndex);
  });

  useEffect(() => {
    if (hasRestored.current || initialBlockIndex <= 0 || blocks.length <= initialBlockIndex) return;
    hasRestored.current = true;
    scrollRetryCount.current = 0;
    requestAnimationFrame(() => {
      scrollToBlockTopEvent(initialBlockIndex);
    });
  }, [blocks.length, initialBlockIndex]);

  useEffect(() => {
    if (!scrollRequest) return;
    const localIndex = blocks.findIndex((block) => block.blockIndex === scrollRequest.blockIndex);
    if (localIndex < 0) return;
    scrollRetryCount.current = 0;
    requestAnimationFrame(() => {
      scrollToBlockTopEvent(localIndex);
    });
  }, [blocks, scrollRequest]);

  useEffect(
    () => () => {
      if (scrollRetryTimer.current) clearTimeout(scrollRetryTimer.current);
    },
    []
  );

  const onViewableItemsChanged = ({ viewableItems }: { viewableItems: ViewToken<TextBlock>[] }) => {
    const current = viewableItems.reduce<ViewToken<TextBlock> | null>((best, item) => {
      if (!item.isViewable || !item.item) return best;
      if (!best) return item;
      return (item.index ?? Number.MAX_SAFE_INTEGER) < (best.index ?? Number.MAX_SAFE_INTEGER) ? item : best;
    }, null)?.item;
    if (!current) return;
    const progress = totalBlocks ? current.blockIndex / totalBlocks : 0;
    onProgress(progress, current.chapterIndex, current.blockIndex);
  };

  const renderItem = ({ item }: ListRenderItemInfo<TextBlock>) => (
    <View style={styles.chapterBlock}>
      {item.title ? (
        <Text allowFontScaling={false} style={[styles.textChapterTitle, { color: foregroundColor }]}>
          {item.title}
        </Text>
      ) : null}
      <Text
        allowFontScaling={false}
        style={[
          styles.readerText,
          {
            color: foregroundColor,
            fontSize: settings.fontSize,
            lineHeight: settings.fontSize * settings.lineHeightScale,
            fontFamily: fontFamilyFor(settings.fontFamily),
          },
        ]}>
        {item.text}
      </Text>
    </View>
  );

  return (
    <FlatList
      ref={listRef}
      data={blocks}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      scrollsToTop={false}
      showsVerticalScrollIndicator={!settings.hideScrollbar}
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      updateCellsBatchingPeriod={80}
      windowSize={5}
      removeClippedSubviews
      onTouchStart={(event) => {
        isDragging.current = false;
        touchStart.current = {
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
        };
      }}
      onTouchEnd={(event) => {
        const dx = Math.abs(event.nativeEvent.pageX - touchStart.current.x);
        const dy = Math.abs(event.nativeEvent.pageY - touchStart.current.y);
        if (!isDragging.current && dx < 8 && dy < 8) {
          onToggleToolbar();
        }
      }}
      onScrollBeginDrag={() => {
        isDragging.current = true;
      }}
      onScrollEndDrag={() => {
        setTimeout(() => {
          isDragging.current = false;
        }, 120);
      }}
      onMomentumScrollBegin={() => {
        isDragging.current = true;
      }}
      onMomentumScrollEnd={() => {
        setTimeout(() => {
          isDragging.current = false;
        }, 120);
      }}
      onEndReachedThreshold={0.75}
      onEndReached={onLoadMore}
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        pendingScrollIndex.current = index;
        if (scrollRetryCount.current >= 8) return;
        scrollRetryCount.current += 1;
        if (scrollRetryTimer.current) clearTimeout(scrollRetryTimer.current);
        listRef.current?.scrollToOffset({
          offset: Math.max(0, index * averageItemLength),
          animated: false,
        });
        scrollRetryTimer.current = setTimeout(() => {
          const targetIndex = pendingScrollIndex.current;
          if (targetIndex === null || blocks.length <= targetIndex) return;
          scrollToBlockTop(targetIndex);
        }, 120);
      }}
      viewabilityConfig={{ itemVisiblePercentThreshold: 35, minimumViewTime: 220 }}
      onViewableItemsChanged={onViewableItemsChanged}
      ListFooterComponent={
        blocks.length < totalBlocks ? (
          <View style={styles.lazyFooter}>
            <ActivityIndicator color={foregroundColor} />
            <Text style={[styles.lazyFooterText, { color: foregroundColor }]}>{t('loadMoreChapters')}</Text>
          </View>
        ) : null
      }
      contentContainerStyle={[
        styles.textContent,
        {
          paddingHorizontal: 18 + settings.paddingScale * 18,
        },
      ]}
      accessibilityLabel={t('bodyChaptersA11y', { count: totalChapters })}
    />
  );
}

export function TapTextPane({
  book,
  chapters,
  settings,
  turnRequest,
  foregroundColor,
  onProgress,
  onToggleToolbar,
}: {
  book: Book;
  chapters: ReaderChapter[];
  settings: ReadingSettings;
  turnRequest: { delta: -1 | 1; nonce: number } | null;
  foregroundColor: string;
  onProgress: (progress: number, chapter: number, offset: number) => void;
  onToggleToolbar: () => void;
}) {
  const [index, setIndex] = useState(book.currentChapter);
  const chapter = chapters[index] ?? chapters[0];
  const { width } = useWindowDimensions();
  const isDragging = useRef(false);
  const touchStart = useRef({ x: 0, y: 0 });

  const move = (delta: number) => {
    const next = Math.max(0, Math.min(chapters.length - 1, index + delta));
    setIndex(next);
    onProgress(chapters.length ? next / chapters.length : 0, next, 0);
  };
  const moveEvent = useEffectEvent((delta: number) => {
    move(delta);
  });

  useEffect(() => {
    if (!turnRequest) return;
    const timer = setTimeout(() => {
      moveEvent(turnRequest.delta);
    }, 0);
    return () => clearTimeout(timer);
  }, [turnRequest]);

  return (
    <View style={styles.tapPane}>
      <ScrollView
        scrollsToTop={false}
        contentContainerStyle={[styles.textContent, { paddingHorizontal: 18 + settings.paddingScale * 18 }]}
        onTouchStart={(event) => {
          isDragging.current = false;
          touchStart.current = {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          };
        }}
        onTouchEnd={(event) => {
          const dx = Math.abs(event.nativeEvent.pageX - touchStart.current.x);
          const dy = Math.abs(event.nativeEvent.pageY - touchStart.current.y);
          if (!isDragging.current && dx < 8 && dy < 8) {
            const action = tapZoneAction(event.nativeEvent.pageX, width, settings.swapTapZones);
            if (settings.showPageButtons) {
              onToggleToolbar();
            } else if (action === 'previous') {
              move(-1);
            } else if (action === 'next') {
              move(1);
            } else {
              onToggleToolbar();
            }
          }
        }}
        onScrollBeginDrag={() => {
          isDragging.current = true;
        }}
        onScrollEndDrag={() => {
          setTimeout(() => {
            isDragging.current = false;
          }, 120);
        }}
        onMomentumScrollBegin={() => {
          isDragging.current = true;
        }}
        onMomentumScrollEnd={() => {
          setTimeout(() => {
            isDragging.current = false;
          }, 120);
        }}>
        <Text allowFontScaling={false} style={[styles.textChapterTitle, { color: foregroundColor }]}>
          {chapter?.title}
        </Text>
        <Text
          allowFontScaling={false}
          style={[
            styles.readerText,
            {
              color: foregroundColor,
              fontSize: settings.fontSize,
              lineHeight: settings.fontSize * settings.lineHeightScale,
              fontFamily: fontFamilyFor(settings.fontFamily),
            },
          ]}>
          {chapter?.text}
        </Text>
      </ScrollView>
      {settings.showPageButtons ? (
        <PageTurnButtons
          foregroundColor={foregroundColor}
          onPrevious={() => move(settings.swapTapZones ? 1 : -1)}
          onNext={() => move(settings.swapTapZones ? -1 : 1)}
        />
      ) : null}
    </View>
  );
}

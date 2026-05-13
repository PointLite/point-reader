import Slider from '@react-native-community/slider';
import { Reader, useReader, type Location, type Toc } from '@epubjs-react-native/core';
import * as Battery from 'expo-battery';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, ChevronRight, List, Sun, Type, X } from 'lucide-react-native';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type ViewToken,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InkButton } from '@/components/ink-button';
import { PdfPane } from '@/components/reader/pdf-pane';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { getBook, updateBookProgress } from '@/lib/books';
import { useLegacyEpubFileSystem } from '@/lib/epubFileSystem';
import {
  fontFamilyFor,
  loadTextChapters,
  readerBackgrounds,
  readerForeground,
} from '@/lib/readerContent';
import { defaultReadingSettings, loadReadingSettings, saveReadingSettings } from '@/lib/settings';
import type { Book, ReaderChapter, ReadingSettings } from '@/types/reader';

const KEEP_AWAKE_TAG = 'point-reader:reader';
const INITIAL_TEXT_BLOCKS = 18;
const TEXT_BLOCK_INCREMENT = 12;
const MIN_PREVIEW_SCALE = 1;
const MAX_PREVIEW_SCALE = 4;

const EPUB_IMAGE_PREVIEW_SCRIPT = `
(function () {
  if (window.__pointReaderImagePreviewInstalled) {
    true;
    return;
  }

  window.__pointReaderImagePreviewInstalled = true;
  var lastSentAt = 0;
  var reactNativeWebview = window.ReactNativeWebView !== undefined && window.ReactNativeWebView !== null ? window.ReactNativeWebView : window;

  function sendImage(src) {
    if (!src) return;
    var now = Date.now();
    if (now - lastSentAt < 350) return;
    lastSentAt = now;
    reactNativeWebview.postMessage(JSON.stringify({
      type: 'point-reader:image-preview',
      src: src
    }));
  }

  function sendContentTap() {
    reactNativeWebview.postMessage(JSON.stringify({
      type: 'point-reader:content-tap'
    }));
  }

  function findImageTarget(target) {
    var current = target;
    while (current && current.nodeType === 1) {
      var tagName = String(current.tagName || '').toLowerCase();
      if (tagName === 'img' || tagName === 'image') return current;
      current = current.parentElement;
    }
    return null;
  }

  function getImageSrc(documentRef, image) {
    var rawSrc = image.currentSrc || image.src || image.getAttribute('src') || image.getAttribute('xlink:href') || image.getAttribute('href');
    if (!rawSrc) return '';
    try {
      return new URL(rawSrc, documentRef.location.href).toString();
    } catch (error) {
      return rawSrc;
    }
  }

  function toDataUrl(src) {
    return fetch(src)
      .then(function (response) { return response.blob(); })
      .then(function (blob) {
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result || src); };
          reader.onerror = function () { resolve(src); };
          reader.readAsDataURL(blob);
        });
      })
      .catch(function () { return src; });
  }

  function openPreview(documentRef, image, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    var src = getImageSrc(documentRef, image);
    toDataUrl(src).then(sendImage);
  }

  function bindImages(contents) {
    var documentRef = contents && (contents.document || (contents.content && contents.content.document));
    if (!documentRef) return;
    var images = documentRef.querySelectorAll('img, image');
    for (var index = 0; index < images.length; index += 1) {
      var image = images[index];
      if (image.getAttribute('data-point-reader-preview') === '1') continue;
      image.setAttribute('data-point-reader-preview', '1');
      image.style.cursor = 'pointer';
      image.addEventListener('click', function (event) {
        openPreview(documentRef, event.currentTarget, event);
      }, true);
      image.addEventListener('touchend', function (event) {
        if (event.changedTouches && event.changedTouches.length === 1) {
          openPreview(documentRef, event.currentTarget, event);
        }
      }, true);
    }
  }

  function bindDocumentTap(contents) {
    var documentRef = contents && (contents.document || (contents.content && contents.content.document));
    if (!documentRef || documentRef.__pointReaderTapBound) return;
    documentRef.__pointReaderTapBound = true;
    var startX = 0;
    var startY = 0;
    var moved = false;

    documentRef.addEventListener('touchstart', function (event) {
      if (!event.touches || event.touches.length !== 1) return;
      moved = false;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    }, true);

    documentRef.addEventListener('touchmove', function (event) {
      if (!event.touches || event.touches.length !== 1) return;
      var dx = Math.abs(event.touches[0].clientX - startX);
      var dy = Math.abs(event.touches[0].clientY - startY);
      if (dx > 8 || dy > 8) moved = true;
    }, true);

    documentRef.addEventListener('touchend', function (event) {
      if (moved || findImageTarget(event.target)) return;
      sendContentTap();
    }, true);

    documentRef.addEventListener('click', function (event) {
      if (findImageTarget(event.target)) return;
      sendContentTap();
    }, true);
  }

  function bindRenderedContents() {
    try {
      var rendered = rendition.getContents();
      for (var index = 0; index < rendered.length; index += 1) {
        bindImages(rendered[index]);
        bindDocumentTap(rendered[index]);
      }
    } catch (error) {}
  }

  if (typeof rendition !== 'undefined') {
    rendition.hooks.content.register(function (contents) {
      setTimeout(function () {
        bindImages(contents);
        bindDocumentTap(contents);
      }, 0);
    });
    rendition.on('rendered', bindRenderedContents);
    setTimeout(bindRenderedContents, 500);
  }

  true;
})();
`;

type TextBlock = {
  id: string;
  chapterIndex: number;
  blockIndex: number;
  title?: string;
  text: string;
};

export default function ReaderScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const [book, setBook] = useState<Book | null>(null);
  const [settings, setSettings] = useState<ReadingSettings>(defaultReadingSettings);
  const [chapters, setChapters] = useState<ReaderChapter[]>([]);
  const [renderedBlockCount, setRenderedBlockCount] = useState(INITIAL_TEXT_BLOCKS);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [sheet, setSheet] = useState<'toc' | 'theme' | 'font' | null>(null);
  const [time, setTime] = useState('');
  const [battery, setBattery] = useState<number | null>(null);
  const [epubToc, setEpubToc] = useState<Toc>([]);
  const [epubLocation, setEpubLocation] = useState<string | undefined>(undefined);
  const [epubChapterTitle, setEpubChapterTitle] = useState('');
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [displayProgress, setDisplayProgress] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastToolbarToggleAt = useRef(0);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      async function load() {
        if (!bookId) return;
        const [nextBook, nextSettings] = await Promise.all([getBook(bookId), loadReadingSettings()]);
        if (!mounted) return;
        setBook(nextBook);
        setSettings(nextSettings);
        setDisplayProgress(nextBook?.progress ?? 0);
        setEpubLocation(nextBook?.format === 'epub' ? nextBook.currentLocation ?? undefined : undefined);
        setEpubChapterTitle('');
        if (nextBook?.format === 'txt') {
          setChapters(await loadTextChapters(nextBook));
          setRenderedBlockCount(Math.max(INITIAL_TEXT_BLOCKS, Math.floor(nextBook.currentOffset) + TEXT_BLOCK_INCREMENT));
        } else {
          setChapters([]);
        }
      }
      load();
      return () => {
        mounted = false;
      };
    }, [bookId])
  );

  useEffect(() => {
    if (settings.keepAwake) {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      return () => {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      };
    }
    return undefined;
  }, [settings.keepAwake]);

  useEffect(() => {
    const refreshStatus = async () => {
      const now = new Date();
      setTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
      const level = await Battery.getBatteryLevelAsync();
      setBattery(Math.round(level * 100));
    };
    refreshStatus();
    const timer = setInterval(refreshStatus, 60000);
    return () => clearInterval(timer);
  }, []);

  const backgroundColor = readerBackgrounds[settings.background];

  const updateSettings = async (patch: Partial<ReadingSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveReadingSettings(next);
  };

  const scheduleProgressSave = useCallback(
    (progress: number, chapter: number, offset: number, location?: string | null) => {
      const nextProgress = Math.max(0, Math.min(1, progress));
      setDisplayProgress(nextProgress);
      if (!book) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updateBookProgress(book.id, nextProgress, chapter, offset, location);
      }, 280);
    },
    [book]
  );

  const textBlocks = useMemo(() => buildTextBlocks(chapters), [chapters]);
  const visibleTextBlocks = useMemo(
    () => textBlocks.slice(0, Math.min(renderedBlockCount, textBlocks.length)),
    [renderedBlockCount, textBlocks]
  );

  const toggleToolbar = useCallback(() => {
    const now = Date.now();
    if (now - lastToolbarToggleAt.current < 260) return;
    lastToolbarToggleAt.current = now;
    setToolbarOpen((value) => !value);
  }, []);
  const openImagePreview = useCallback((uri: string) => {
    setSheet(null);
    setToolbarOpen(false);
    setPreviewImageUri(uri);
  }, []);
  const handleEpubProgress = useCallback(
    (nextProgress: number, location?: Location | null, chapterTitle?: string) => {
      const cfi = location?.start?.cfi ?? null;
      const sectionIndex = location?.start?.index ?? 0;
      const locationValue = location?.start?.location ?? nextProgress;
      scheduleProgressSave(nextProgress, sectionIndex, locationValue, cfi);
      if (chapterTitle) {
        setEpubChapterTitle((current) => (current === chapterTitle ? current : chapterTitle));
      }
    },
    [scheduleProgressSave]
  );

  if (!book) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor }]}>
        <ActivityIndicator color={readerForeground} />
      </SafeAreaView>
    );
  }

  const progress = Math.round(displayProgress * 100);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor }]}>
      <StatusBar hidden={!settings.alwaysShowStatusBar} />
      <View style={[styles.readerTop, { backgroundColor }]}>
        <Text style={styles.chapterTitle} numberOfLines={1}>
          {book.format === 'txt' ? chapters[book.currentChapter]?.title || book.title : epubChapterTitle || book.title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭阅读"
          onPress={() => router.back()}
          style={styles.closeButton}>
          <X size={22} color={readerForeground} />
        </Pressable>
      </View>

      <View style={styles.readerBody}>
        {book.format === 'epub' ? (
          <EpubPane
            book={book}
            settings={settings}
            onToc={setEpubToc}
            location={epubLocation}
            onToggleToolbar={toggleToolbar}
            onProgress={handleEpubProgress}
            onImagePress={openImagePreview}
          />
        ) : book.format === 'pdf' ? (
          <PdfPane book={book} onProgress={scheduleProgressSave} onToggleToolbar={toggleToolbar} />
        ) : settings.mode === 'scroll' ? (
          <TextScrollPane
            blocks={visibleTextBlocks}
            totalBlocks={textBlocks.length}
            totalChapters={chapters.length}
            initialBlockIndex={Math.floor(book.currentOffset)}
            settings={settings}
            onLoadMore={() =>
              setRenderedBlockCount((count) => Math.min(count + TEXT_BLOCK_INCREMENT, textBlocks.length))
            }
            onProgress={scheduleProgressSave}
            onToggleToolbar={toggleToolbar}
          />
        ) : (
          <TapTextPane
            book={book}
            chapters={chapters}
            settings={settings}
            onProgress={scheduleProgressSave}
            onToggleToolbar={toggleToolbar}
          />
        )}
      </View>

      <View style={[styles.statusBar, { backgroundColor }]}>
        <View style={styles.statusLeft}>
          <Text style={styles.statusText}>{time}</Text>
          <BatteryBadge value={battery} />
        </View>
        <Text style={styles.statusText}>进度 {progress}%</Text>
      </View>

      {toolbarOpen ? (
        <View style={styles.toolbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="目录"
            onPress={() => setSheet(sheet === 'toc' ? null : 'toc')}
            style={[styles.toolbarIconButton, sheet === 'toc' && styles.toolbarIconButtonActive]}>
            <List size={30} strokeWidth={2.2} color={readerForeground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="背景"
            onPress={() => setSheet(sheet === 'theme' ? null : 'theme')}
            style={[styles.toolbarIconButton, sheet === 'theme' && styles.toolbarIconButtonActive]}>
            <Sun size={30} strokeWidth={2.2} color={readerForeground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="字体"
            onPress={() => setSheet(sheet === 'font' ? null : 'font')}
            style={[styles.toolbarIconButton, sheet === 'font' && styles.toolbarIconButtonActive]}>
            <Type size={32} strokeWidth={2.1} color={readerForeground} />
          </Pressable>
        </View>
      ) : null}

      {sheet ? (
        <ReaderSheet
          sheet={sheet}
          settings={settings}
          chapters={book.format === 'epub' ? epubToc.map((item, index) => ({ id: item.href, title: item.label || `章节 ${index + 1}`, text: '', href: item.href })) : chapters}
          onClose={() => setSheet(null)}
          onSelectChapter={(index, href) => {
            if (book.format === 'epub' && href) {
              setEpubLocation(href);
            } else {
              const targetBlock = textBlocks.find((block) => block.chapterIndex === index);
              const nextOffset = targetBlock?.blockIndex ?? 0;
              setRenderedBlockCount(Math.max(INITIAL_TEXT_BLOCKS, nextOffset + TEXT_BLOCK_INCREMENT));
              const nextProgress = textBlocks.length ? nextOffset / textBlocks.length : 0;
              scheduleProgressSave(nextProgress, index, nextOffset);
            }
            setSheet(null);
          }}
          onSettings={updateSettings}
        />
      ) : null}

      <ImagePreviewModal uri={previewImageUri} onClose={() => setPreviewImageUri(null)} />
    </SafeAreaView>
  );
}

function TextScrollPane({
  blocks,
  totalBlocks,
  totalChapters,
  initialBlockIndex,
  settings,
  onLoadMore,
  onProgress,
  onToggleToolbar,
}: {
  blocks: TextBlock[];
  totalBlocks: number;
  totalChapters: number;
  initialBlockIndex: number;
  settings: ReadingSettings;
  onLoadMore: () => void;
  onProgress: (progress: number, chapter: number, offset: number) => void;
  onToggleToolbar: () => void;
}) {
  const listRef = useRef<FlatList<TextBlock>>(null);
  const hasRestored = useRef(false);
  const isDragging = useRef(false);
  const touchStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (hasRestored.current || initialBlockIndex <= 0 || blocks.length <= initialBlockIndex) return;
    hasRestored.current = true;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index: initialBlockIndex,
        animated: false,
        viewPosition: 0,
      });
    });
  }, [blocks.length, initialBlockIndex]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<TextBlock>[] }) => {
      const current = viewableItems.find((item) => item.isViewable)?.item;
      if (!current) return;
      const progress = totalBlocks ? current.blockIndex / totalBlocks : 0;
      onProgress(progress, current.chapterIndex, current.blockIndex);
    },
    [onProgress, totalBlocks]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<TextBlock>) => (
      <View style={styles.chapterBlock}>
        {item.title ? <Text style={styles.textChapterTitle}>{item.title}</Text> : null}
        <Text
          style={[
            styles.readerText,
            {
              fontSize: settings.fontSize,
              lineHeight: settings.fontSize * settings.lineHeightScale,
              fontFamily: fontFamilyFor(settings.fontFamily),
            },
          ]}>
          {item.text}
        </Text>
      </View>
    ),
    [settings.fontFamily, settings.fontSize, settings.lineHeightScale]
  );

  return (
    <FlatList
      ref={listRef}
      data={blocks}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
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
        listRef.current?.scrollToOffset({
          offset: Math.max(0, index * averageItemLength),
          animated: false,
        });
      }}
      viewabilityConfig={{ itemVisiblePercentThreshold: 35, minimumViewTime: 220 }}
      onViewableItemsChanged={onViewableItemsChanged}
      ListFooterComponent={
        blocks.length < totalBlocks ? (
          <View style={styles.lazyFooter}>
            <ActivityIndicator color={readerForeground} />
            <Text style={styles.lazyFooterText}>继续载入后续章节</Text>
          </View>
        ) : null
      }
      contentContainerStyle={[
        styles.textContent,
        {
          paddingHorizontal: 18 + settings.paddingScale * 18,
        },
      ]}
      accessibilityLabel={`正文，共 ${totalChapters} 个章节`}
    />
  );
}

function buildTextBlocks(chapters: ReaderChapter[]): TextBlock[] {
  let blockIndex = 0;

  return chapters.flatMap((chapter, chapterIndex) => {
    const pieces = splitTextForVirtualList(chapter.text);
    return pieces.map((text, pieceIndex) => ({
      id: `${chapter.id}-${pieceIndex}`,
      chapterIndex,
      blockIndex: blockIndex++,
      title: pieceIndex === 0 ? chapter.title : undefined,
      text,
    }));
  });
}

function splitTextForVirtualList(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const source = paragraphs.length ? paragraphs : [text];
  const blocks: string[] = [];

  for (const paragraph of source) {
    if (paragraph.length <= 1800) {
      blocks.push(paragraph);
      continue;
    }
    for (let index = 0; index < paragraph.length; index += 1600) {
      blocks.push(paragraph.slice(index, index + 1600));
    }
  }

  return blocks.length ? blocks : [''];
}

const EpubPane = memo(function EpubPane({
  book,
  settings,
  location,
  onToc,
  onProgress,
  onToggleToolbar,
  onImagePress,
}: {
  book: Book;
  settings: ReadingSettings;
  location?: string;
  onToc: (toc: Toc) => void;
  onProgress: (progress: number, location?: Location | null, chapterTitle?: string) => void;
  onToggleToolbar: () => void;
  onImagePress: (uri: string) => void;
}) {
  const defaultTheme = useMemo(
    () => ({
      body: {
        color: readerForeground,
        background: readerBackgrounds[settings.background],
        'font-size': `${settings.fontSize}px`,
        'line-height': `${settings.lineHeightScale}`,
        'padding-left': `${settings.paddingScale * 16}px`,
        'padding-right': `${settings.paddingScale * 16}px`,
        'font-family': settings.fontFamily === 'serif' ? 'serif' : 'sans-serif',
      },
    }),
    [
      settings.background,
      settings.fontFamily,
      settings.fontSize,
      settings.lineHeightScale,
      settings.paddingScale,
    ]
  );

  const handleWebViewMessage = useCallback(
    (event: { type?: string; src?: unknown }) => {
      if (event.type === 'point-reader:image-preview' && typeof event.src === 'string') {
        onImagePress(event.src);
      }
      if (event.type === 'point-reader:content-tap') {
        onToggleToolbar();
      }
    },
    [onImagePress, onToggleToolbar]
  );

  return (
    <Reader
      src={book.fileUri}
      width="100%"
      height="100%"
      fileSystem={useLegacyEpubFileSystem}
      initialLocation={location}
      flow={settings.mode === 'scroll' ? 'scrolled-continuous' : 'paginated'}
      manager={settings.mode === 'scroll' ? 'continuous' : 'default'}
      enableSwipe={settings.mode === 'tap'}
      defaultTheme={defaultTheme}
      onNavigationLoaded={({ toc }) => onToc(toc)}
      onLocationChange={(_, currentLocation, progress, section) =>
        onProgress(normalizeEpubProgress(progress), currentLocation, section?.label)
      }
      injectedJavascript={EPUB_IMAGE_PREVIEW_SCRIPT}
      onWebViewMessage={handleWebViewMessage}
      onSingleTap={onToggleToolbar}
    />
  );
});

function normalizeEpubProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0;
  return progress > 1 ? progress / 100 : progress;
}

function TapTextPane({
  book,
  chapters,
  settings,
  onProgress,
  onToggleToolbar,
}: {
  book: Book;
  chapters: ReaderChapter[];
  settings: ReadingSettings;
  onProgress: (progress: number, chapter: number, offset: number) => void;
  onToggleToolbar: () => void;
}) {
  const [index, setIndex] = useState(book.currentChapter);
  const chapter = chapters[index] ?? chapters[0];
  const isDragging = useRef(false);
  const touchStart = useRef({ x: 0, y: 0 });

  const move = (delta: number) => {
    const next = Math.max(0, Math.min(chapters.length - 1, index + delta));
    setIndex(next);
    onProgress(chapters.length ? next / chapters.length : 0, next, 0);
  };

  return (
    <View style={styles.tapPane}>
      <ScrollView
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
        }}>
        <Text style={styles.textChapterTitle}>{chapter?.title}</Text>
        <Text
          style={[
            styles.readerText,
            {
              fontSize: settings.fontSize,
              lineHeight: settings.fontSize * settings.lineHeightScale,
              fontFamily: fontFamilyFor(settings.fontFamily),
            },
          ]}>
          {chapter?.text}
        </Text>
      </ScrollView>
      {settings.showPageButtons ? (
        <View style={styles.pageButtons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="上一章"
            onPress={() => move(settings.swapTapZones ? 1 : -1)}
            style={styles.pageButton}>
            <ChevronLeft size={24} color={readerForeground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="下一章"
            onPress={() => move(settings.swapTapZones ? -1 : 1)}
            style={styles.pageButton}>
            <ChevronRight size={24} color={readerForeground} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function ReaderSheet({
  sheet,
  settings,
  chapters,
  onClose,
  onSelectChapter,
  onSettings,
}: {
  sheet: 'toc' | 'theme' | 'font';
  settings: ReadingSettings;
  chapters: ReaderChapter[];
  onClose: () => void;
  onSelectChapter: (index: number, href?: string) => void;
  onSettings: (patch: Partial<ReadingSettings>) => void;
}) {
  const { changeFontSize, changeFontFamily, changeTheme, goToLocation } = useReader();

  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>{sheet === 'toc' ? '目录' : sheet === 'theme' ? '背景颜色' : '字体调节'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭面板" onPress={onClose} style={styles.smallIconButton}>
          <X size={20} color={Colors.light.text} />
        </Pressable>
      </View>
      {sheet === 'toc' ? (
        <ScrollView style={styles.tocList}>
          {chapters.map((chapter, index) => (
            <Pressable
              key={`${chapter.id}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={chapter.title}
              onPress={() => {
                if (chapter.href) goToLocation(chapter.href);
                onSelectChapter(index, chapter.href);
              }}
              style={styles.tocItem}>
              <Text style={styles.tocTitle} numberOfLines={2}>
                {chapter.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {sheet === 'theme' ? (
        <View style={styles.swatches}>
          {(['white', 'gray', 'yellow', 'green'] as ReadingSettings['background'][]).map((name) => (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityLabel={`背景 ${name}`}
              onPress={() => {
                onSettings({ background: name });
                changeTheme({ body: { background: readerBackgrounds[name], color: readerForeground } });
              }}
              style={[
                styles.swatch,
                { backgroundColor: readerBackgrounds[name] },
                settings.background === name && styles.swatchSelected,
              ]}
            />
          ))}
        </View>
      ) : null}
      {sheet === 'font' ? (
        <View style={styles.fontPanel}>
          <Text style={styles.controlLabel}>字体</Text>
          <View style={styles.segmented}>
            {(['system', 'serif', 'mono'] as ReadingSettings['fontFamily'][]).map((font) => (
              <InkButton
                key={font}
                label={font === 'system' ? '系统' : font === 'serif' ? '衬线' : '等宽'}
                selected={settings.fontFamily === font}
                onPress={() => {
                  onSettings({ fontFamily: font });
                  changeFontFamily(font === 'serif' ? 'serif' : font === 'mono' ? 'monospace' : 'sans-serif');
                }}
                style={styles.segmentButton}
              />
            ))}
          </View>
          <SliderControl
            label={`文字大小 ${settings.fontSize}`}
            value={settings.fontSize}
            min={16}
            max={32}
            step={1}
            onValue={(value) => {
              onSettings({ fontSize: value });
              changeFontSize(`${value}px`);
            }}
          />
          <SliderControl
            label="文字内边距"
            value={settings.paddingScale}
            min={0.5}
            max={1.8}
            step={0.1}
            onValue={(value) => onSettings({ paddingScale: value })}
          />
          <SliderControl
            label="行高"
            value={settings.lineHeightScale}
            min={1.2}
            max={1.9}
            step={0.05}
            onValue={(value) => onSettings({ lineHeightScale: value })}
          />
        </View>
      ) : null}
    </View>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onValue: (value: number) => void;
}) {
  return (
    <View style={styles.sliderControl}>
      <Text style={styles.controlLabel}>{label}</Text>
      <Slider
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        minimumTrackTintColor={Colors.light.text}
        maximumTrackTintColor={Colors.light.border}
        thumbTintColor={Colors.light.text}
        onSlidingComplete={onValue}
      />
    </View>
  );
}

function BatteryBadge({ value }: { value: number | null }) {
  return (
    <View style={styles.batteryBadge} accessibilityLabel={`电量 ${value === null ? '未知' : `${value}%`}`}>
      <Text style={styles.batteryBadgeText}>{value === null ? '--' : value}</Text>
      <View style={styles.batteryCap} />
    </View>
  );
}

function ImagePreviewModal({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(1);
  const offsetValue = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(1);
  const tapStart = useRef({ x: 0, y: 0, time: 0 });
  const didPinch = useRef(false);
  const didDrag = useRef(false);

  useEffect(() => {
    scaleValue.current = 1;
    offsetValue.current = { x: 0, y: 0 };
    panStart.current = { x: 0, y: 0 };
    pinchStartDistance.current = 0;
    pinchStartScale.current = 1;
    didPinch.current = false;
    didDrag.current = false;
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
  }, [scale, translateX, translateY, uri]);

  const setPreviewOffset = useCallback(
    (x: number, y: number, nextScale = scaleValue.current) => {
      const maxX = Math.max(0, (width * (nextScale - 1)) / 2);
      const maxY = Math.max(0, (height * (nextScale - 1)) / 2);
      const nextX = clamp(x, -maxX, maxX);
      const nextY = clamp(y, -maxY, maxY);
      offsetValue.current = { x: nextX, y: nextY };
      translateX.setValue(nextX);
      translateY.setValue(nextY);
    },
    [height, translateX, translateY, width]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2,
        onPanResponderGrant: (event) => {
          const touches = event.nativeEvent.touches;
          didPinch.current = touches.length >= 2;
          if (touches.length >= 2) {
            pinchStartDistance.current = distanceBetweenTouches(touches);
            pinchStartScale.current = scaleValue.current;
            return;
          }
          didDrag.current = false;
          panStart.current = offsetValue.current;
          tapStart.current = {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
            time: Date.now(),
          };
        },
        onPanResponderMove: (event, gestureState) => {
          const touches = event.nativeEvent.touches;
          if (touches.length < 2) {
            if (scaleValue.current <= MIN_PREVIEW_SCALE) return;
            if (Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3) {
              didDrag.current = true;
            }
            setPreviewOffset(panStart.current.x + gestureState.dx, panStart.current.y + gestureState.dy);
            return;
          }
          didPinch.current = true;
          const nextDistance = distanceBetweenTouches(touches);
          if (!pinchStartDistance.current || !nextDistance) return;
          const nextScale = clamp(
            pinchStartScale.current * (nextDistance / pinchStartDistance.current),
            MIN_PREVIEW_SCALE,
            MAX_PREVIEW_SCALE
          );
          scaleValue.current = nextScale;
          scale.setValue(nextScale);
          setPreviewOffset(offsetValue.current.x, offsetValue.current.y, nextScale);
        },
        onPanResponderRelease: (event) => {
          if (didPinch.current) {
            didPinch.current = false;
            return;
          }

          if (didDrag.current) {
            didDrag.current = false;
            return;
          }

          const dx = Math.abs(event.nativeEvent.pageX - tapStart.current.x);
          const dy = Math.abs(event.nativeEvent.pageY - tapStart.current.y);
          const duration = Date.now() - tapStart.current.time;
          if (dx < 10 && dy < 10 && duration < 360) {
            onClose();
          }
        },
        onPanResponderTerminate: () => {
          didPinch.current = false;
          didDrag.current = false;
        },
      }),
    [onClose, scale, setPreviewOffset]
  );

  return (
    <Modal visible={Boolean(uri)} transparent animationType="fade" onRequestClose={onClose}>
      <View
        accessible
        accessibilityRole="imagebutton"
        accessibilityLabel="图片预览，点击关闭"
        style={styles.previewBackdrop}
        {...panResponder.panHandlers}>
        {uri ? (
          <Animated.View style={[styles.previewImageFrame, { transform: [{ translateX }, { translateY }, { scale }] }]}>
            <Image source={{ uri }} resizeMode="contain" style={styles.previewImage} />
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

function distanceBetweenTouches(touches: readonly { pageX: number; pageY: number }[]) {
  if (touches.length < 2) return 0;
  const [first, second] = touches;
  return Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  readerTop: {
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(28,25,23,0.16)',
  },
  chapterTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    color: readerForeground,
  },
  closeButton: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readerBody: {
    flex: 1,
  },
  textContent: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.four,
  },
  chapterBlock: {
    gap: Spacing.three,
  },
  textChapterTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '900',
    color: readerForeground,
  },
  readerText: {
    color: readerForeground,
  },
  chapterDivider: {
    height: 1,
    backgroundColor: 'rgba(28,25,23,0.18)',
    marginVertical: Spacing.three,
  },
  lazyFooter: {
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  lazyFooterText: {
    fontSize: 13,
    fontWeight: '800',
    color: readerForeground,
  },
  statusBar: {
    minHeight: 38,
    paddingHorizontal: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,25,23,0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '800',
    color: readerForeground,
  },
  batteryBadge: {
    position: 'relative',
    minWidth: 34,
    height: 18,
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: readerForeground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  batteryBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    color: readerForeground,
  },
  batteryCap: {
    position: 'absolute',
    right: -4,
    width: 3,
    height: 8,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: readerForeground,
  },
  toolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 38,
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.five,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,25,23,0.16)',
    backgroundColor: Colors.light.surface,
  },
  toolbarIconButton: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarIconButtonActive: {
    backgroundColor: Colors.light.backgroundElement,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '58%',
    borderTopWidth: 1,
    borderTopColor: Colors.light.text,
    backgroundColor: Colors.light.surface,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: Colors.light.text,
  },
  smallIconButton: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tocList: {
    maxHeight: 320,
  },
  tocItem: {
    minHeight: TouchTarget,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.backgroundElement,
  },
  tocTitle: {
    fontSize: 16,
    lineHeight: 22,
    color: Colors.light.text,
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
    gap: Spacing.three,
  },
  segmented: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  segmentButton: {
    flex: 1,
  },
  sliderControl: {
    gap: Spacing.one,
  },
  controlLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.light.text,
  },
  tapPane: {
    flex: 1,
  },
  pageButtons: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pageButton: {
    width: 58,
    height: 58,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: 'rgba(28,25,23,0.4)',
    backgroundColor: 'rgba(255,255,255,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(246,244,238,0.98)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  previewImageFrame: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
});

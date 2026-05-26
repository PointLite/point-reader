import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { EpubHtmlBook } from '@/lib/epubContent';
import { readerBackgroundFor, readerForegroundFor } from '@/lib/readerContent';
import type { ReadingSettings } from '@/types/reader';

export type EpubSeekRequest = {
  progress: number;
  nonce: number;
};

export type EpubResumeRequest = {
  nonce: number;
};

type EpubScrollCommand = 'jumpTo' | 'jumpToHref' | 'jumpToOffset' | 'applySettings' | 'resume';

type EpubScrollWebViewMessage =
  | { type: 'tap' }
  | { type: 'image'; src?: unknown }
  | { type: 'progress'; progress?: unknown; index?: unknown; href?: unknown; offset?: unknown }
  | { type: 'ready' };

export function EpubScrollPane({
  book,
  settings,
  systemColorScheme,
  initialIndex,
  initialOffset,
  initialProgress,
  jumpRequest,
  seekRequest,
  resumeRequest,
  onProgress,
  onToggleToolbar,
  onImagePress,
  onRecoverRequired,
}: {
  book: EpubHtmlBook;
  settings: ReadingSettings;
  systemColorScheme?: 'light' | 'dark' | null;
  initialIndex: number;
  initialOffset: number;
  initialProgress: number;
  jumpRequest: { index: number; href?: string; nonce: number } | null;
  seekRequest: EpubSeekRequest | null;
  resumeRequest: EpubResumeRequest | null;
  onProgress: (progress: number, chapterIndex: number, href: string, chapterOffset: number) => void;
  onToggleToolbar: () => void;
  onImagePress: (uri: string) => void;
  onRecoverRequired: () => void;
}) {
  const webViewRef = useRef<WebView>(null);
  const initialIndexRef = useRef(initialIndex);
  const initialOffsetRef = useRef(initialOffset > 0 && initialOffset <= 1 ? initialOffset : 0);
  const initialProgressRef = useRef(initialProgress);
  const initialSettingsRef = useRef(settings);
  const [contentReady, setContentReady] = useState(initialProgressRef.current <= 0.015);
  const html = useMemo(
    () =>
      createEpubScrollHtml(
        book,
        initialSettingsRef.current,
        systemColorScheme,
        initialIndexRef.current,
        initialOffsetRef.current,
        initialProgressRef.current
      ),
    [book, systemColorScheme]
  );
  const source = useMemo(() => ({ html }), [html]);

  useEffect(() => {
    if (!jumpRequest) return;
    if (jumpRequest.href) {
      injectEpubScrollCommand(webViewRef, 'jumpToHref', [jumpRequest.href, jumpRequest.index]);
      return;
    }
    injectEpubScrollCommand(webViewRef, 'jumpTo', [jumpRequest.index]);
  }, [jumpRequest]);

  useEffect(() => {
    if (!seekRequest) return;
    const chapterCount = Math.max(1, book.chapters.length);
    const absolute = clamp(seekRequest.progress, 0, 1) * chapterCount;
    const index = Math.min(chapterCount - 1, Math.max(0, Math.floor(absolute)));
    const offset = index === chapterCount - 1 && seekRequest.progress >= 0.999 ? 1 : clamp(absolute - index, 0, 1);
    injectEpubScrollCommand(webViewRef, 'jumpToOffset', [index, offset]);
  }, [book.chapters.length, seekRequest]);

  useEffect(() => {
    injectEpubScrollCommand(webViewRef, 'applySettings', [createEpubCssVars(settings, systemColorScheme)]);
  }, [settings, systemColorScheme]);

  useEffect(() => {
    if (!resumeRequest) return;
    injectEpubScrollCommand(webViewRef, 'resume', [createEpubCssVars(settings, systemColorScheme)]);
  }, [resumeRequest, settings, systemColorScheme]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const payload = parseEpubScrollMessage(event.nativeEvent.data);
      if (!payload) return;
      if (payload.type === 'tap') {
        onToggleToolbar();
        return;
      }
      if (payload.type === 'image' && typeof payload.src === 'string') {
        onImagePress(payload.src);
        return;
      }
      if (payload.type === 'ready') {
        setContentReady(true);
        return;
      }
      if (payload.type === 'progress') {
        setContentReady(true);
        onProgress(
          clamp(Number(payload.progress), 0, 1),
          Number(payload.index) || 0,
          String(payload.href || ''),
          clamp(Number(payload.offset), 0, 1)
        );
      }
    },
    [onImagePress, onProgress, onToggleToolbar]
  );

  return (
    <View style={styles.webViewReaderHost}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={source}
        javaScriptEnabled
        scrollEnabled
        textZoom={100}
        bounces={false}
        overScrollMode="never"
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
        showsVerticalScrollIndicator={!settings.hideScrollbar}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={(request) => shouldAllowEpubScrollNavigation(request.url)}
        onLoadEnd={() => injectEpubScrollCommand(webViewRef, 'applySettings', [createEpubCssVars(settings, systemColorScheme)])}
        onContentProcessDidTerminate={onRecoverRequired}
        style={[styles.webViewReader, { backgroundColor: readerBackgroundFor(settings, systemColorScheme) }, !contentReady && styles.webViewReaderHidden]}
      />
      {!contentReady ? (
        <View style={[styles.epubRestoreOverlay, { backgroundColor: readerBackgroundFor(settings, systemColorScheme) }]}>
          <ActivityIndicator color={readerForegroundFor(settings, systemColorScheme)} />
        </View>
      ) : null}
    </View>
  );
}

function injectEpubScrollCommand(webViewRef: React.RefObject<WebView | null>, command: EpubScrollCommand, args: unknown[]) {
  webViewRef.current?.injectJavaScript(createEpubScrollCommandScript(command, args));
}

function createEpubScrollCommandScript(command: EpubScrollCommand, args: unknown[]) {
  return `
    (function () {
      var args = ${JSON.stringify(args)};
      function run() {
        var api = window.PointReader;
        if (!api || typeof api[${JSON.stringify(command)}] !== 'function') return false;
        api[${JSON.stringify(command)}].apply(api, args);
        return true;
      }
      if (!run()) setTimeout(run, 0);
    })();
    true;
  `;
}

function parseEpubScrollMessage(data: string): EpubScrollWebViewMessage | null {
  try {
    const payload = JSON.parse(data);
    if (!payload || typeof payload.type !== 'string') return null;
    if (payload.type === 'tap' || payload.type === 'image' || payload.type === 'progress' || payload.type === 'ready') {
      return payload as EpubScrollWebViewMessage;
    }
    return null;
  } catch {
    return null;
  }
}

function shouldAllowEpubScrollNavigation(url?: string) {
  if (!url) return true;
  return url === 'about:blank' || url.startsWith('data:') || url.startsWith('blob:');
}

function createEpubCssVars(settings: ReadingSettings, systemColorScheme?: 'light' | 'dark' | null) {
  const padding = Math.round(18 + settings.paddingScale * 18);
  const background = readerBackgroundFor(settings, systemColorScheme);
  const foreground = readerForegroundFor(settings, systemColorScheme);
  const fontFamily = settings.fontFamily === 'serif' ? 'serif' : settings.fontFamily === 'mono' ? 'monospace' : 'sans-serif';

  return {
    background,
    foreground,
    fontFamily,
    fontSize: `${settings.fontSize}px`,
    lineHeight: String(settings.lineHeightScale),
    padding: `${padding}px`,
  };
}

function createEpubScrollHtml(
  book: EpubHtmlBook,
  settings: ReadingSettings,
  systemColorScheme: 'light' | 'dark' | null | undefined,
  initialIndex: number,
  initialOffset: number,
  initialProgress: number
) {
  const safeInitialIndex = Math.max(0, Math.min(initialIndex, Math.max(0, book.chapters.length - 1)));
  const safeInitialOffset = initialOffset > 0 && initialOffset <= 1 ? initialOffset : 0;
  const safeInitialProgress = clamp(initialProgress, 0, 1);
  const vars = createEpubCssVars(settings, systemColorScheme);

  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
${book.css}
:root { --reader-bg: ${vars.background}; --reader-fg: ${vars.foreground}; --reader-font-family: ${vars.fontFamily}; --reader-font-size: ${vars.fontSize}; --reader-line-height: ${vars.lineHeight}; --reader-padding: ${vars.padding}; }
html, body { width: 100%; max-width: 100%; margin: 0; padding: 0; overflow-x: hidden; overscroll-behavior-x: none; background: var(--reader-bg); color: var(--reader-fg); font-family: var(--reader-font-family); -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; touch-action: pan-y; }
#root { width: 100vw; max-width: 100vw; min-height: 100vh; overflow-x: hidden; }
.chapter { box-sizing: border-box; width: 100vw !important; max-width: 100vw !important; padding: 24px var(--reader-padding) 40px; font-family: var(--reader-font-family) !important; font-size: var(--reader-font-size) !important; line-height: var(--reader-line-height) !important; overflow-wrap: anywhere; word-break: break-word; overflow-x: hidden; }
.chapter p, .chapter div, .chapter span, .chapter section, .chapter article, .chapter li, .chapter blockquote, .chapter h1, .chapter h2, .chapter h3, .chapter h4, .chapter h5, .chapter h6, .chapter strong, .chapter em, .chapter b, .chapter i, .chapter ruby, .chapter rt { font-family: inherit !important; font-size: var(--reader-font-size) !important; line-height: var(--reader-line-height) !important; }
.chapter img, .chapter svg, .chapter video, .chapter canvas, .chapter iframe { width: auto !important; max-width: 100% !important; min-width: 0 !important; height: auto !important; box-sizing: border-box; }
.chapter table { width: 100% !important; max-width: 100% !important; min-width: 0 !important; table-layout: fixed; border-collapse: collapse; box-sizing: border-box; }
.chapter pre, .chapter code { width: auto !important; max-width: 100% !important; min-width: 0 !important; box-sizing: border-box; overflow-wrap: anywhere; white-space: pre-wrap; }
.chapter * { max-width: 100% !important; min-width: 0 !important; box-sizing: border-box; margin-left: 0 !important; margin-right: 0 !important; }
</style>
</head>
<body>
<div id="root"></div>
<script>
(function () {
  var chapters = ${JSON.stringify(book.chapters)};
  var root = document.getElementById('root');
  var topSpacer = document.createElement('div');
  var content = document.createElement('div');
  var bottomSpacer = document.createElement('div');
  var start = Math.max(0, ${safeInitialIndex} - 3);
  var end = Math.min(chapters.length, ${safeInitialIndex} + 3);
  var heightCache = {};
  var averageChapterHeight = Math.max(720, Math.round((window.innerHeight || 720) * 1.2));
  var topSpacerHeight = 0;
  var bottomSpacerHeight = 0;
  var isMutating = false;
  var lastProgressAt = 0;
  var suppressProgressUntil = Date.now() + 1200;
  var restoreTargetIndex = ${safeInitialIndex};
  var restoreTargetOffset = ${safeInitialOffset};
  var restoreTargetProgress = ${safeInitialProgress};
  var restoreLockUntil = restoreTargetProgress > 0.015 ? Date.now() + 4200 : 0;
  var restoreLocking = false;
  var restoreLayoutUntil = restoreTargetProgress > 0.015 ? Date.now() + 2600 : 0;
  var restoreFinalized = false;
  var readySent = false;
  var jumpToken = 0;
  var touchStart = { x: 0, y: 0 };
  var moved = false;

  topSpacer.setAttribute('aria-hidden', 'true');
  bottomSpacer.setAttribute('aria-hidden', 'true');
  root.appendChild(topSpacer);
  root.appendChild(content);
  root.appendChild(bottomSpacer);

  function viewportWidth() {
    return Math.max(1, Math.floor(document.documentElement.clientWidth || window.innerWidth || 1));
  }

  function applyViewportWidth() {
    var width = viewportWidth() + 'px';
    document.documentElement.style.setProperty('width', width, 'important');
    document.documentElement.style.setProperty('max-width', width, 'important');
    document.documentElement.style.setProperty('box-sizing', 'border-box', 'important');
    document.documentElement.style.setProperty('overflow-x', 'hidden', 'important');
    document.documentElement.style.setProperty('margin', '0', 'important');
    document.documentElement.style.setProperty('padding', '0', 'important');
    document.body.style.setProperty('width', width, 'important');
    document.body.style.setProperty('max-width', width, 'important');
    document.body.style.setProperty('box-sizing', 'border-box', 'important');
    document.body.style.setProperty('overflow-x', 'hidden', 'important');
    document.body.style.setProperty('margin', '0', 'important');
    document.body.style.setProperty('padding', '0', 'important');
    root.style.setProperty('width', width, 'important');
    root.style.setProperty('max-width', width, 'important');
    root.style.setProperty('box-sizing', 'border-box', 'important');
    root.style.setProperty('overflow-x', 'hidden', 'important');
    root.style.setProperty('margin', '0', 'important');
    root.style.setProperty('padding', '0', 'important');
    content.style.setProperty('width', width, 'important');
    content.style.setProperty('max-width', width, 'important');
    content.style.setProperty('box-sizing', 'border-box', 'important');
    content.style.setProperty('overflow-x', 'hidden', 'important');
    content.style.setProperty('margin', '0', 'important');
    content.style.setProperty('padding', '0', 'important');
  }

  function post(payload) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }

  function markReady() {
    if (readySent) return;
    readySent = true;
    post({ type: 'ready' });
  }

  function createChapterSection(index) {
    var chapter = chapters[index];
    var section = document.createElement('section');
    section.className = 'chapter';
    section.id = 'chapter-' + index;
    section.setAttribute('data-index', String(index));
    section.setAttribute('data-href', chapter.href);
    section.innerHTML = chapter.html;
    applyReaderStylesToSection(section);
    return section;
  }

  function applyReaderStylesToSection(section) {
    if (!section) return;
    var width = viewportWidth() + 'px';
    section.style.setProperty('width', width, 'important');
    section.style.setProperty('max-width', width, 'important');
    section.style.setProperty('min-width', '0', 'important');
    section.style.setProperty('box-sizing', 'border-box', 'important');
    section.style.setProperty('overflow-x', 'hidden', 'important');
    section.style.setProperty('font-family', 'var(--reader-font-family)', 'important');
    section.style.setProperty('font-size', 'var(--reader-font-size)', 'important');
    section.style.setProperty('line-height', 'var(--reader-line-height)', 'important');
    section.style.setProperty('padding-left', 'var(--reader-padding)', 'important');
    section.style.setProperty('padding-right', 'var(--reader-padding)', 'important');
    section.style.setProperty('margin-left', '0', 'important');
    section.style.setProperty('margin-right', '0', 'important');
    var nodes = section.querySelectorAll('p, div, span, section, article, li, blockquote, h1, h2, h3, h4, h5, h6, strong, em, b, i, ruby, rt');
    for (var index = 0; index < nodes.length; index += 1) {
      nodes[index].style.setProperty('max-width', '100%', 'important');
      nodes[index].style.setProperty('min-width', '0', 'important');
      nodes[index].style.setProperty('box-sizing', 'border-box', 'important');
      nodes[index].style.setProperty('width', 'auto', 'important');
      nodes[index].style.setProperty('margin-left', '0', 'important');
      nodes[index].style.setProperty('margin-right', '0', 'important');
      nodes[index].style.setProperty('font-family', 'inherit', 'important');
      nodes[index].style.setProperty('font-size', 'var(--reader-font-size)', 'important');
      nodes[index].style.setProperty('line-height', 'var(--reader-line-height)', 'important');
    }
    var fixedNodes = section.querySelectorAll('img, svg, video, canvas, iframe, table, pre, code');
    for (var fixedIndex = 0; fixedIndex < fixedNodes.length; fixedIndex += 1) {
      fixedNodes[fixedIndex].style.setProperty('max-width', '100%', 'important');
      fixedNodes[fixedIndex].style.setProperty('min-width', '0', 'important');
      fixedNodes[fixedIndex].style.setProperty('box-sizing', 'border-box', 'important');
      fixedNodes[fixedIndex].style.setProperty('margin-left', '0', 'important');
      fixedNodes[fixedIndex].style.setProperty('margin-right', '0', 'important');
      if (fixedNodes[fixedIndex].tagName === 'TABLE') {
        fixedNodes[fixedIndex].style.setProperty('width', '100%', 'important');
      }
    }
  }

  function applyReaderStylesToRenderedChapters() {
    applyViewportWidth();
    var sections = content ? content.querySelectorAll('.chapter') : [];
    for (var index = 0; index < sections.length; index += 1) {
      applyReaderStylesToSection(sections[index]);
    }
    requestAnimationFrame(clampHorizontalOverflow);
  }

  function clampHorizontalOverflow() {
    var viewport = viewportWidth();
    var sections = content ? content.querySelectorAll('.chapter') : [];
    for (var sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
      var section = sections[sectionIndex];
      var sectionStyle = window.getComputedStyle(section);
      var horizontalPadding =
        (parseFloat(sectionStyle.paddingLeft) || 0) + (parseFloat(sectionStyle.paddingRight) || 0);
      var available = Math.max(1, Math.floor(viewport - horizontalPadding));
      var nodes = section.querySelectorAll('*');
      for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
        var node = nodes[nodeIndex];
        if (!node || !node.style) continue;
        node.style.setProperty('max-width', available + 'px', 'important');
        node.style.setProperty('min-width', '0', 'important');
        node.style.setProperty('box-sizing', 'border-box', 'important');
        node.style.setProperty('margin-left', '0', 'important');
        node.style.setProperty('margin-right', '0', 'important');
        if ((node.scrollWidth || 0) > available || (node.offsetWidth || 0) > available) {
          var tag = String(node.tagName || '').toLowerCase();
          node.style.setProperty('width', tag === 'table' ? '100%' : available + 'px', 'important');
          node.style.setProperty('overflow-x', 'hidden', 'important');
          if (tag === 'pre' || tag === 'code') {
            node.style.setProperty('white-space', 'pre-wrap', 'important');
          }
        }
      }
    }
    if (document.scrollingElement) document.scrollingElement.scrollLeft = 0;
    if (window.scrollX) window.scrollTo(0, window.scrollY || 0);
  }

  function cachedHeight(index) {
    return heightCache[index] || averageChapterHeight;
  }

  function rangeHeight(from, to) {
    var total = 0;
    for (var index = Math.max(0, from); index < Math.min(chapters.length, to); index += 1) {
      total += cachedHeight(index);
    }
    return total;
  }

  function measureRendered() {
    clampHorizontalOverflow();
    var sections = Array.prototype.slice.call(content.querySelectorAll('.chapter'));
    var total = 0;
    var count = 0;
    for (var index = 0; index < sections.length; index += 1) {
      var chapterIndex = Number(sections[index].getAttribute('data-index')) || 0;
      var height = Math.max(1, sections[index].offsetHeight || 0);
      heightCache[chapterIndex] = height;
      total += height;
      count += 1;
    }
    if (count > 0) {
      averageChapterHeight = Math.max(1, Math.round(total / count));
    }
  }

  function updateSpacers() {
    topSpacer.style.height = Math.max(0, Math.round(topSpacerHeight)) + 'px';
    bottomSpacer.style.height = Math.max(0, Math.round(bottomSpacerHeight)) + 'px';
  }

  function resetSpacerHeights() {
    topSpacerHeight = rangeHeight(0, start);
    bottomSpacerHeight = rangeHeight(end, chapters.length);
    updateSpacers();
  }

  function captureAnchor() {
    var section = currentChapter();
    if (!section) {
      return { y: window.scrollY || document.documentElement.scrollTop || 0 };
    }
    return {
      index: Number(section.getAttribute('data-index')) || 0,
      offset: (window.scrollY || document.documentElement.scrollTop || 0) - section.offsetTop,
    };
  }

  function restoreAnchor(anchor) {
    requestAnimationFrame(function () {
      if (anchor && typeof anchor.index === 'number') {
        var element = document.getElementById('chapter-' + anchor.index);
        if (element) {
          window.scrollTo(0, element.offsetTop + (anchor.offset || 0));
        } else if (typeof anchor.y === 'number') {
          window.scrollTo(0, anchor.y);
        }
      } else if (anchor && typeof anchor.y === 'number') {
        window.scrollTo(0, anchor.y);
      }
      setTimeout(function () {
        measureRendered();
        updateSpacers();
        isMutating = false;
        sendProgress();
        setTimeout(maybeLoadMore, 0);
      }, 60);
    });
  }

  function renderRange(nextStart, nextEnd, keepAnchor) {
    var previousY = window.scrollY || document.documentElement.scrollTop || 0;
    isMutating = true;
    start = Math.max(0, nextStart);
    end = Math.min(chapters.length, nextEnd);
    content.innerHTML = '';
    for (var index = start; index < end; index += 1) {
      content.appendChild(createChapterSection(index));
    }
    measureRendered();
    resetSpacerHeights();
    if (keepAnchor === 'preserve') {
      requestAnimationFrame(function () {
        window.scrollTo(0, previousY);
        setTimeout(function () {
          window.scrollTo(0, previousY);
          isMutating = false;
          sendProgress();
        }, 60);
      });
    } else {
      isMutating = false;
    }
  }

  function appendRange(nextEnd) {
    var targetEnd = Math.min(chapters.length, nextEnd);
    if (targetEnd <= end) return;
    var anchor = captureAnchor();
    isMutating = true;
    for (var index = end; index < targetEnd; index += 1) {
      content.appendChild(createChapterSection(index));
    }
    end = targetEnd;
    measureRendered();
    resetSpacerHeights();
    recycleWindow(anchor);
    restoreAnchor(anchor);
  }

  function prependRange(nextStart) {
    if (Date.now() < restoreLayoutUntil) return;
    var targetStart = Math.max(0, nextStart);
    if (targetStart >= start) return;
    var anchor = captureAnchor();
    isMutating = true;
    for (var index = start - 1; index >= targetStart; index -= 1) {
      content.insertBefore(createChapterSection(index), content.firstChild);
    }
    start = targetStart;
    measureRendered();
    resetSpacerHeights();
    recycleWindow(anchor);
    restoreAnchor(anchor);
  }

  function recycleWindow(anchor) {
    if (Date.now() < restoreLayoutUntil) return;
    var section = anchor && typeof anchor.index === 'number' ? document.getElementById('chapter-' + anchor.index) : currentChapter();
    var currentIndex = section ? Number(section.getAttribute('data-index')) || start : start;
    var keepStart = Math.max(0, currentIndex - 4);
    var keepEnd = Math.min(chapters.length, currentIndex + 7);
    if (end - start <= 14) return;
    while (start < keepStart) {
      var first = document.getElementById('chapter-' + start);
      if (!first) break;
      heightCache[start] = Math.max(1, first.offsetHeight || cachedHeight(start));
      topSpacerHeight += heightCache[start];
      first.remove();
      start += 1;
    }
    while (end > keepEnd) {
      var lastIndex = end - 1;
      var last = document.getElementById('chapter-' + lastIndex);
      if (!last) break;
      heightCache[lastIndex] = Math.max(1, last.offsetHeight || cachedHeight(lastIndex));
      bottomSpacerHeight += heightCache[lastIndex];
      last.remove();
      end -= 1;
    }
    updateSpacers();
  }

  function beginJump() {
    jumpToken += 1;
    restoreFinalized = true;
    restoreTargetProgress = 0;
    restoreLockUntil = 0;
    restoreLayoutUntil = 0;
    suppressProgressUntil = Date.now() + 5000;
    return jumpToken;
  }

  function finishJump(token) {
    if (token !== jumpToken) return;
    suppressProgressUntil = 0;
    measureRendered();
    resetSpacerHeights();
    sendProgress(true);
    maybeLoadMore();
  }

  function scrollElementToTop(target, section) {
    if (!target && !section) return;
    var element = target || section;
    var rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
    var y = rect ? rect.top + (window.scrollY || 0) : (element.offsetTop || (section && section.offsetTop) || 0);
    window.scrollTo(0, Math.max(0, Math.round(y)));
  }

  function scrollChapterToOffset(index, offset) {
    var element = document.getElementById('chapter-' + index);
    if (!element) return;
    var scrollableHeight = Math.max(1, element.offsetHeight - (window.innerHeight || 0));
    window.scrollTo(0, element.offsetTop + scrollableHeight * Math.max(0, Math.min(1, Number(offset) || 0)));
  }

  function jumpTo(index) {
    index = Math.max(0, Math.min(Number(index) || 0, chapters.length - 1));
    var token = beginJump();
    renderRange(Math.max(0, index - 3), Math.min(chapters.length, index + 5));
    waitForJumpLayout(index, null, token, function (section) {
      if (token !== jumpToken) return;
      scrollElementToTop(section, section);
      requestAnimationFrame(function () {
        scrollElementToTop(section, section);
        finishJump(token);
      });
    });
  }

  function cleanHref(value) {
    return String(value || '')
      .split('#')[0]
      .split('?')[0]
      .replace(/\\\\/g, '/')
      .replace(/^(\\.\\.\\/)+/, '')
      .replace(/^\\.\\//, '')
      .replace(/^\\/+/, '');
  }

  function hrefFileName(value) {
    var cleaned = cleanHref(value);
    var pieces = cleaned.split('/');
    return pieces[pieces.length - 1] || cleaned;
  }

  function findChapterByHref(rawHref, fallbackIndex) {
    var cleaned = cleanHref(rawHref);
    if (!cleaned) return fallbackIndex;
    var fileName = hrefFileName(cleaned);
    for (var index = 0; index < chapters.length; index += 1) {
      var chapterHref = cleanHref(chapters[index].href);
      if (chapterHref === cleaned || hrefFileName(chapterHref) === fileName) {
        return index;
      }
    }
    return fallbackIndex;
  }

  function findAnchorTarget(section, fragment) {
    if (!section || !fragment) return null;
    var decoded = fragment;
    try {
      decoded = decodeURIComponent(fragment);
    } catch (error) {}
    if (section.ownerDocument && section.ownerDocument.getElementById) {
      var byId = section.ownerDocument.getElementById(decoded);
      if (byId && section.contains(byId)) return byId;
    }
    var nodes = section.querySelectorAll('[id], [name]');
    for (var index = 0; index < nodes.length; index += 1) {
      if (nodes[index].id === decoded || nodes[index].getAttribute('name') === decoded) {
        return nodes[index];
      }
    }
    return null;
  }

  function jumpToHref(rawHref, fallbackIndexOrSource, maybeSourceElement) {
    var href = String(rawHref || '');
    if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
    var sourceElement = maybeSourceElement || (fallbackIndexOrSource && fallbackIndexOrSource.closest ? fallbackIndexOrSource : null);
    var sourceSection = sourceElement && sourceElement.closest ? sourceElement.closest('.chapter') : currentChapter();
    var fallbackIndex =
      typeof fallbackIndexOrSource === 'number'
        ? fallbackIndexOrSource
        : sourceSection
          ? Number(sourceSection.getAttribute('data-index')) || 0
          : start;
    var targetIndex = findChapterByHref(href, fallbackIndex);
    var fragment = href.indexOf('#') >= 0 ? href.slice(href.indexOf('#') + 1) : '';
    var token = beginJump();
    renderRange(Math.max(0, targetIndex - 3), Math.min(chapters.length, targetIndex + 5));
    waitForJumpLayout(targetIndex, fragment, token, function (section, target) {
      if (token !== jumpToken) return;
      scrollElementToTop(target || section, section);
      requestAnimationFrame(function () {
        scrollElementToTop(target || section, section);
        finishJump(token);
      });
    });
    return true;
  }

  function jumpToOffset(index, offset, keepRestoreLock, done) {
    index = Math.max(0, Math.min(Number(index) || 0, chapters.length - 1));
    offset = Math.max(0, Math.min(1, Number(offset) || 0));
    var token = jumpToken;
    if (!keepRestoreLock) {
      restoreLockUntil = 0;
      restoreLayoutUntil = 0;
    }
    suppressProgressUntil = Date.now() + 1200;
    renderRange(Math.max(0, index - 3), Math.min(chapters.length, index + 5));
    function applyScroll() {
      if (token !== jumpToken) return;
      var element = document.getElementById('chapter-' + index);
      if (element) {
        var scrollableHeight = Math.max(1, element.offsetHeight - (window.innerHeight || 0));
        window.scrollTo(0, element.offsetTop + scrollableHeight * offset);
      }
    }
    requestAnimationFrame(function () {
      applyScroll();
      setTimeout(applyScroll, 120);
      setTimeout(function () {
        if (token !== jumpToken) return;
        applyScroll();
        suppressProgressUntil = 0;
        sendProgress(true);
        if (typeof done === 'function') done();
      }, 320);
    });
  }

  function waitForJumpLayout(index, fragment, token, callback) {
    var element = document.getElementById('chapter-' + index);
    if (!element) {
      callback(null, null);
      return;
    }
    var renderedSections = Array.prototype.slice.call(content.querySelectorAll('.chapter'));
    var sectionsBeforeTarget = renderedSections.filter(function (section) {
      return (Number(section.getAttribute('data-index')) || 0) <= index;
    });
    var pendingImages = [];
    sectionsBeforeTarget.forEach(function (section) {
      pendingImages = pendingImages.concat(Array.prototype.slice.call(section.querySelectorAll('img')).filter(function (image) {
        return !image.complete;
      }));
    });
    pendingImages = pendingImages.filter(function (image, imageIndex) {
      return pendingImages.indexOf(image) === imageIndex;
    });
    var pending = pendingImages.length + 1;
    var done = false;
    var lastSignature = '';
    var stableFrames = 0;

    function release() {
      pending -= 1;
      if (pending <= 0) waitForStableLayout();
    }

    function layoutSignature() {
      measureRendered();
      resetSpacerHeights();
      var target = findAnchorTarget(element, fragment) || element;
      var targetTop = target && target.getBoundingClientRect ? target.getBoundingClientRect().top + (window.scrollY || 0) : 0;
      return [
        Math.round(topSpacer.offsetHeight || 0),
        Math.round(content.offsetHeight || 0),
        Math.round(element.offsetTop || 0),
        Math.round(targetTop || 0),
      ].join(':');
    }

    function waitForStableLayout() {
      if (done || token !== jumpToken) return;
      requestAnimationFrame(function () {
        var nextSignature = layoutSignature();
        if (nextSignature === lastSignature) stableFrames += 1;
        else stableFrames = 0;
        lastSignature = nextSignature;
        if (stableFrames >= 3) {
          done = true;
          callback(element, findAnchorTarget(element, fragment) || element);
          return;
        }
        waitForStableLayout();
      });
    }

    pendingImages.forEach(function (image) {
      image.addEventListener('load', release, { once: true });
      image.addEventListener('error', release, { once: true });
    });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(release).catch(release);
    } else {
      release();
    }
  }

  function waitForChapterLayout(index, callback) {
    var element = document.getElementById('chapter-' + index);
    if (!element) {
      callback();
      return;
    }
    var pendingImages = Array.prototype.slice.call(element.querySelectorAll('img')).filter(function (image) {
      return !image.complete;
    });
    var pending = pendingImages.length + 1;
    var done = false;
    var lastHeight = -1;
    var stableFrames = 0;

    function release() {
      pending -= 1;
      if (pending <= 0) waitForStableHeight();
    }

    function waitForStableHeight() {
      if (done) return;
      requestAnimationFrame(function () {
        var nextHeight = element.offsetHeight || 0;
        if (Math.abs(nextHeight - lastHeight) <= 1) stableFrames += 1;
        else stableFrames = 0;
        lastHeight = nextHeight;
        if (stableFrames >= 2) {
          done = true;
          callback();
          return;
        }
        waitForStableHeight();
      });
    }

    pendingImages.forEach(function (image) {
      image.addEventListener('load', release, { once: true });
      image.addEventListener('error', release, { once: true });
    });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(release).catch(release);
    } else {
      release();
    }
  }

  function finalizeInitialRestore() {
    if (restoreFinalized || restoreTargetProgress <= 0.015) {
      markReady();
      return;
    }
    var token = jumpToken;
    waitForJumpLayout(restoreTargetIndex, null, token, function () {
      if (restoreFinalized) return;
      restoreFinalized = true;
      restoreLayoutUntil = 0;
      scrollChapterToOffset(restoreTargetIndex, restoreTargetOffset);
      requestAnimationFrame(function () {
        scrollChapterToOffset(restoreTargetIndex, restoreTargetOffset);
        suppressProgressUntil = 0;
        sendProgress(true);
        markReady();
      });
    });
  }

  function enforceRestoreLock(currentProgress) {
    if (restoreLocking || Date.now() > restoreLockUntil || restoreTargetProgress <= 0.015) return false;
    if (currentProgress + 0.025 >= restoreTargetProgress) return false;
    restoreLocking = true;
    restoreLayoutUntil = Date.now() + 1200;
    suppressProgressUntil = Date.now() + 900;
    jumpToOffset(restoreTargetIndex, restoreTargetOffset, true);
    setTimeout(function () {
      restoreLocking = false;
    }, 980);
    return true;
  }

  function applySettings(vars) {
    var anchor = captureAnchor();
    isMutating = true;
    var style = document.documentElement.style;
    style.setProperty('--reader-bg', vars.background);
    style.setProperty('--reader-fg', vars.foreground);
    style.setProperty('--reader-font-family', vars.fontFamily);
    style.setProperty('--reader-font-size', vars.fontSize);
    style.setProperty('--reader-line-height', vars.lineHeight);
    style.setProperty('--reader-padding', vars.padding);
    document.body.style.background = vars.background;
    document.body.style.color = vars.foreground;
    applyReaderStylesToRenderedChapters();
    restoreAnchor(anchor);
  }

  function resume(vars) {
    if (vars) applySettings(vars);
    requestAnimationFrame(function () {
      measureRendered();
      resetSpacerHeights();
      maybeLoadMore();
      markReady();
      sendProgress(true);
    });
  }

  function maybeLoadMore() {
    if (isMutating) return;
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    var viewport = window.innerHeight || document.documentElement.clientHeight || 0;
    var topHeight = topSpacer.offsetHeight || 0;
    var renderedBottom = content.offsetTop + content.offsetHeight;
    if (y < topHeight + viewport * 1.2 && start > 0) {
      prependRange(start - 4);
      return;
    }
    if (renderedBottom - (y + viewport) < viewport * 2 && end < chapters.length) {
      appendRange(end + 4);
    }
  }

  function currentChapter() {
    var marker = (window.scrollY || 0) + 4;
    var sections = Array.prototype.slice.call(document.querySelectorAll('.chapter'));
    var current = sections[0];
    for (var index = 0; index < sections.length; index += 1) {
      if (sections[index].offsetTop <= marker) current = sections[index];
      else break;
    }
    return current;
  }

  function sendProgress(force) {
    if (!force && Date.now() < suppressProgressUntil) return;
    var now = Date.now();
    if (!force && now - lastProgressAt < 100) return;
    lastProgressAt = now;
    var section = currentChapter();
    if (!section) return;
    var index = Number(section.getAttribute('data-index')) || 0;
    var top = section.offsetTop;
    var height = Math.max(1, section.offsetHeight - (window.innerHeight || 0));
    var local = Math.max(0, Math.min(1, ((window.scrollY || 0) - top) / height));
    var progress = chapters.length ? (index + local) / chapters.length : 0;
    if (enforceRestoreLock(progress)) return;
    post({ type: 'progress', progress: progress, index: index, href: section.getAttribute('data-href'), offset: local });
  }

  document.addEventListener('touchstart', function (event) {
    if (!event.touches || event.touches.length !== 1) return;
    restoreLockUntil = 0;
    restoreLayoutUntil = 0;
    moved = false;
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, true);
  document.addEventListener('touchmove', function (event) {
    if (!event.touches || event.touches.length !== 1) return;
    if (Math.abs(event.touches[0].clientX - touchStart.x) > 8 || Math.abs(event.touches[0].clientY - touchStart.y) > 8) moved = true;
  }, true);
  document.addEventListener('touchend', function (event) {
    var link = event.target && event.target.closest && event.target.closest('a[href], area[href]');
    if (link) return;
    if (!moved) post({ type: 'tap' });
  }, true);
  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest && event.target.closest('a[href], area[href]');
    if (link) {
      event.preventDefault();
      event.stopPropagation();
      jumpToHref(link.getAttribute('href'), link);
      return;
    }
    var image = event.target && event.target.closest && event.target.closest('img');
    if (image && image.src) {
      event.preventDefault();
      post({ type: 'image', src: image.src });
    }
  }, true);
  window.addEventListener('scroll', function () {
    if (window.scrollX) window.scrollTo(0, window.scrollY || 0);
    maybeLoadMore();
    sendProgress();
  }, { passive: true });
  window.addEventListener('resize', function () {
    applyReaderStylesToRenderedChapters();
  });

  window.PointReader = { jumpTo: jumpTo, jumpToOffset: jumpToOffset, jumpToHref: jumpToHref, applySettings: applySettings, resume: resume };
  applyViewportWidth();
  renderRange(start, end);
  requestAnimationFrame(function () {
    jumpToOffset(${safeInitialIndex}, ${safeInitialOffset}, true);
    finalizeInitialRestore();
    setTimeout(markReady, 2600);
  });
})();
</script>
</body>
</html>`;
}


function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const styles = StyleSheet.create({
  webViewReaderHost: {
    flex: 1,
  },
  webViewReader: {
    flex: 1,
  },
  webViewReaderHidden: {
    opacity: 0,
  },
  epubRestoreOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

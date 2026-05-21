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

type EpubScrollCommand = 'jumpTo' | 'jumpToOffset' | 'applySettings';

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
  jumpRequest: { index: number; nonce: number } | null;
  seekRequest: EpubSeekRequest | null;
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
html, body { margin: 0; padding: 0; background: var(--reader-bg); color: var(--reader-fg); font-family: var(--reader-font-family); }
body { -webkit-text-size-adjust: none; }
#root { min-height: 100vh; }
.chapter { box-sizing: border-box; padding: 24px var(--reader-padding) 40px; font-size: var(--reader-font-size); line-height: var(--reader-line-height); overflow-wrap: anywhere; }
.chapter img, .chapter svg { max-width: 100%; height: auto; }
.chapter p { line-height: var(--reader-line-height) !important; }
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
  var touchStart = { x: 0, y: 0 };
  var moved = false;

  topSpacer.setAttribute('aria-hidden', 'true');
  bottomSpacer.setAttribute('aria-hidden', 'true');
  root.appendChild(topSpacer);
  root.appendChild(content);
  root.appendChild(bottomSpacer);

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
    return section;
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

  function jumpTo(index) {
    index = Math.max(0, Math.min(Number(index) || 0, chapters.length - 1));
    restoreLockUntil = 0;
    restoreLayoutUntil = 0;
    suppressProgressUntil = Date.now() + 700;
    renderRange(Math.max(0, index - 3), Math.min(chapters.length, index + 5));
    requestAnimationFrame(function () {
      var element = document.getElementById('chapter-' + index);
      if (element) element.scrollIntoView({ block: 'start' });
      setTimeout(function () {
        suppressProgressUntil = 0;
        sendProgress(true);
      }, 120);
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

  function jumpToHref(rawHref, sourceElement) {
    var href = String(rawHref || '');
    if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
    restoreLockUntil = 0;
    restoreLayoutUntil = 0;
    suppressProgressUntil = Date.now() + 700;
    var sourceSection = sourceElement && sourceElement.closest ? sourceElement.closest('.chapter') : currentChapter();
    var fallbackIndex = sourceSection ? Number(sourceSection.getAttribute('data-index')) || 0 : start;
    var targetIndex = findChapterByHref(href, fallbackIndex);
    var fragment = href.indexOf('#') >= 0 ? href.slice(href.indexOf('#') + 1) : '';
    renderRange(Math.max(0, targetIndex - 3), Math.min(chapters.length, targetIndex + 5));
    requestAnimationFrame(function () {
      var section = document.getElementById('chapter-' + targetIndex);
      var target = findAnchorTarget(section, fragment) || section;
      if (target) {
        var rect = target.getBoundingClientRect ? target.getBoundingClientRect() : null;
        window.scrollTo(0, rect ? rect.top + (window.scrollY || 0) : target.offsetTop || section.offsetTop || 0);
      }
      setTimeout(function () {
        suppressProgressUntil = 0;
        sendProgress(true);
      }, 120);
    });
    return true;
  }

  function jumpToOffset(index, offset, keepRestoreLock, done) {
    index = Math.max(0, Math.min(Number(index) || 0, chapters.length - 1));
    offset = Math.max(0, Math.min(1, Number(offset) || 0));
    if (!keepRestoreLock) {
      restoreLockUntil = 0;
      restoreLayoutUntil = 0;
    }
    suppressProgressUntil = Date.now() + 1200;
    renderRange(Math.max(0, index - 3), Math.min(chapters.length, index + 5));
    function applyScroll() {
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
        applyScroll();
        suppressProgressUntil = 0;
        sendProgress(true);
        if (typeof done === 'function') done();
      }, 320);
    });
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
    waitForChapterLayout(restoreTargetIndex, function () {
      if (restoreFinalized) return;
      restoreFinalized = true;
      restoreLayoutUntil = 0;
      jumpToOffset(restoreTargetIndex, restoreTargetOffset, false, markReady);
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
    restoreAnchor(anchor);
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
    maybeLoadMore();
    sendProgress();
  }, { passive: true });

  window.PointReader = { jumpTo: jumpTo, jumpToOffset: jumpToOffset, jumpToHref: jumpToHref, applySettings: applySettings };
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

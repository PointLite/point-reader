import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { EpubHtmlBook } from '@/lib/epubContent';
import { readerBackgroundFor, readerForegroundFor } from '@/lib/readerContent';
import type { ReadingSettings } from '@/types/reader';

export type EpubPagedSeekRequest = {
  progress: number;
  nonce: number;
};

export type EpubPagedResumeRequest = {
  nonce: number;
};

type EpubPagedCommand = 'go' | 'jumpTo' | 'jumpToOffset' | 'seekToProgress' | 'applySettings' | 'resume';

type EpubPagedMessage =
  | { type: 'tap'; x?: unknown; width?: unknown }
  | { type: 'image'; src?: unknown }
  | { type: 'progress'; progress?: unknown; index?: unknown; href?: unknown; offset?: unknown }
  | { type: 'ready' };

export function EpubPagedPane({
  book,
  settings,
  systemColorScheme,
  initialIndex,
  initialOffset,
  initialProgress,
  jumpRequest,
  seekRequest,
  resumeRequest,
  turnRequest,
  onProgress,
  onTap,
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
  seekRequest: EpubPagedSeekRequest | null;
  resumeRequest: EpubPagedResumeRequest | null;
  turnRequest: { delta: -1 | 1; nonce: number } | null;
  onProgress: (progress: number, chapterIndex: number, href: string, chapterOffset: number) => void;
  onTap: (x: number, width: number) => void;
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
      createEpubPagedHtml(
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
    injectEpubPagedCommand(webViewRef, 'jumpTo', [jumpRequest.index]);
  }, [jumpRequest]);

  useEffect(() => {
    if (!seekRequest) return;
    injectEpubPagedCommand(webViewRef, 'seekToProgress', [seekRequest.progress]);
  }, [seekRequest]);

  useEffect(() => {
    if (!turnRequest) return;
    injectEpubPagedCommand(webViewRef, 'go', [turnRequest.delta]);
  }, [turnRequest]);

  useEffect(() => {
    injectEpubPagedCommand(webViewRef, 'applySettings', [createEpubCssVars(settings, systemColorScheme)]);
  }, [settings, systemColorScheme]);

  useEffect(() => {
    if (!resumeRequest) return;
    injectEpubPagedCommand(webViewRef, 'resume', [createEpubCssVars(settings, systemColorScheme)]);
  }, [resumeRequest, settings, systemColorScheme]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const payload = parseEpubPagedMessage(event.nativeEvent.data);
      if (!payload) return;
      if (payload.type === 'tap') {
        onTap(Number(payload.x), Number(payload.width));
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
    [onImagePress, onProgress, onTap]
  );

  return (
    <View style={styles.webViewReaderHost}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={source}
        javaScriptEnabled
        scrollEnabled={false}
        textZoom={100}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={(request) => shouldAllowEpubPagedNavigation(request.url)}
        onLoadEnd={() => injectEpubPagedCommand(webViewRef, 'applySettings', [createEpubCssVars(settings, systemColorScheme)])}
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

function injectEpubPagedCommand(webViewRef: React.RefObject<WebView | null>, command: EpubPagedCommand, args: unknown[]) {
  webViewRef.current?.injectJavaScript(createEpubPagedCommandScript(command, args));
}

function createEpubPagedCommandScript(command: EpubPagedCommand, args: unknown[]) {
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

function parseEpubPagedMessage(data: string): EpubPagedMessage | null {
  try {
    const payload = JSON.parse(data);
    if (!payload || typeof payload.type !== 'string') return null;
    if (payload.type === 'tap' || payload.type === 'image' || payload.type === 'progress' || payload.type === 'ready') {
      return payload as EpubPagedMessage;
    }
    return null;
  } catch {
    return null;
  }
}

function shouldAllowEpubPagedNavigation(url?: string) {
  if (!url) return true;
  return url === 'about:blank' || url.startsWith('data:') || url.startsWith('blob:');
}

function createEpubCssVars(settings: ReadingSettings, systemColorScheme?: 'light' | 'dark' | null) {
  const padding = Math.round(18 + settings.paddingScale * 18);
  const background = readerBackgroundFor(settings, systemColorScheme);
  const foreground = readerForegroundFor(settings, systemColorScheme);

  return {
    background,
    foreground,
    fontSize: `${settings.fontSize}px`,
    lineHeight: String(settings.lineHeightScale),
    padding: `${padding}px`,
  };
}

function createEpubPagedHtml(
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
:root { --reader-bg: ${vars.background}; --reader-fg: ${vars.foreground}; --reader-font-size: ${vars.fontSize}; --reader-line-height: ${vars.lineHeight}; --reader-padding: ${vars.padding}; }
html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: var(--reader-bg); color: var(--reader-fg); font-family: sans-serif; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body { position: fixed; inset: 0; }
#viewport { position: fixed; inset: 0; overflow: hidden; background: var(--reader-bg); }
#content { height: 100vh; column-gap: 0; column-fill: auto; transform: translate3d(0, 0, 0); will-change: transform; }
.chapter { box-sizing: border-box; width: 100vw; min-height: 100vh; padding: 24px var(--reader-padding) 40px; font-size: var(--reader-font-size); line-height: var(--reader-line-height); overflow-wrap: anywhere; break-before: column; page-break-before: always; }
.chapter:first-child { break-before: auto; page-break-before: auto; }
.chapter img, .chapter svg { max-width: 100%; height: auto; }
.chapter p { line-height: var(--reader-line-height) !important; }
</style>
</head>
<body>
<div id="viewport"><main id="content"></main></div>
<script>
(function () {
  var chapters = ${JSON.stringify(book.chapters)};
  var viewport = document.getElementById('viewport');
  var content = document.getElementById('content');
  var page = 0;
  var pageCount = 1;
  var width = 1;
  var suppressProgressUntil = Date.now() + 900;
  var readySent = false;
  var touchStart = { x: 0, y: 0 };
  var moved = false;
  var lastProgressAt = 0;

  function post(payload) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }

  function markReady() {
    if (readySent) return;
    readySent = true;
    post({ type: 'ready' });
  }

  function createChapterSection(chapter, index) {
    var section = document.createElement('section');
    section.className = 'chapter';
    section.id = 'chapter-' + index;
    section.setAttribute('data-index', String(index));
    section.setAttribute('data-href', chapter.href);
    section.innerHTML = chapter.html;
    return section;
  }

  function renderAll() {
    content.innerHTML = '';
    for (var index = 0; index < chapters.length; index += 1) {
      content.appendChild(createChapterSection(chapters[index], index));
    }
  }

  function measure() {
    width = Math.max(1, viewport.clientWidth || window.innerWidth || 1);
    content.style.width = width + 'px';
    content.style.columnWidth = width + 'px';
    pageCount = Math.max(1, Math.ceil((content.scrollWidth || width) / width));
    page = Math.max(0, Math.min(page, pageCount - 1));
    applyPage(false);
  }

  function rectPage(rect) {
    return Math.max(0, Math.round((rect.left + page * width) / width));
  }

  function chapterPages(index) {
    var element = document.getElementById('chapter-' + index);
    if (!element || !element.getClientRects) return [];
    var rects = Array.prototype.slice.call(element.getClientRects()).filter(function (rect) {
      return rect.width > 1 && rect.height > 1;
    });
    return rects.map(rectPage).sort(function (a, b) { return a - b; });
  }

  function pageForChapter(index, offset) {
    index = Math.max(0, Math.min(Number(index) || 0, chapters.length - 1));
    offset = Math.max(0, Math.min(1, Number(offset) || 0));
    var pages = chapterPages(index);
    if (!pages.length) return Math.max(0, Math.min(pageCount - 1, index));
    var ordinal = Math.round(offset * Math.max(0, pages.length - 1));
    return Math.max(0, Math.min(pageCount - 1, pages[Math.max(0, Math.min(ordinal, pages.length - 1))]));
  }

  function currentChapterInfo() {
    var best = { index: 0, href: chapters[0] ? chapters[0].href : '', offset: 0 };
    for (var index = 0; index < chapters.length; index += 1) {
      var pages = chapterPages(index);
      if (!pages.length) continue;
      var first = pages[0];
      var last = pages[pages.length - 1];
      if (page >= first && page <= last) {
        var offset = pages.length <= 1 ? 0 : (page - first) / Math.max(1, last - first);
        return { index: index, href: chapters[index].href, offset: Math.max(0, Math.min(1, offset)) };
      }
      if (first <= page) {
        best = { index: index, href: chapters[index].href, offset: 1 };
      }
    }
    return best;
  }

  function applyPage(forceProgress) {
    content.style.transform = 'translate3d(' + (-page * width) + 'px, 0, 0)';
    sendProgress(forceProgress);
  }

  function sendProgress(force) {
    if (!force && Date.now() < suppressProgressUntil) return;
    var now = Date.now();
    if (!force && now - lastProgressAt < 80) return;
    lastProgressAt = now;
    var info = currentChapterInfo();
    var progress = pageCount <= 1 ? 0 : page / Math.max(1, pageCount - 1);
    post({ type: 'progress', progress: progress, index: info.index, href: info.href, offset: info.offset });
  }

  function go(delta) {
    var next = Math.max(0, Math.min(page + delta, pageCount - 1));
    if (next === page) return;
    suppressProgressUntil = 0;
    page = next;
    applyPage(true);
  }

  function jumpTo(index) {
    suppressProgressUntil = Date.now() + 200;
    page = pageForChapter(index, 0);
    applyPage(false);
    setTimeout(function () {
      suppressProgressUntil = 0;
      sendProgress(true);
    }, 80);
  }

  function jumpToOffset(index, offset) {
    suppressProgressUntil = Date.now() + 200;
    page = pageForChapter(index, offset);
    applyPage(false);
    setTimeout(function () {
      suppressProgressUntil = 0;
      sendProgress(true);
    }, 80);
  }

  function seekToProgress(progress) {
    suppressProgressUntil = 0;
    page = Math.max(0, Math.min(Math.round(Number(progress || 0) * Math.max(0, pageCount - 1)), pageCount - 1));
    applyPage(true);
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
      if (chapterHref === cleaned || hrefFileName(chapterHref) === fileName) return index;
    }
    return fallbackIndex;
  }

  function jumpToHref(rawHref, sourceElement) {
    var href = String(rawHref || '');
    if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
    var sourceSection = sourceElement && sourceElement.closest ? sourceElement.closest('.chapter') : null;
    var fallbackIndex = sourceSection ? Number(sourceSection.getAttribute('data-index')) || 0 : 0;
    var targetIndex = findChapterByHref(href, fallbackIndex);
    jumpTo(targetIndex);
    return true;
  }

  function applySettings(vars) {
    var currentProgress = pageCount <= 1 ? 0 : page / Math.max(1, pageCount - 1);
    var style = document.documentElement.style;
    style.setProperty('--reader-bg', vars.background);
    style.setProperty('--reader-fg', vars.foreground);
    style.setProperty('--reader-font-size', vars.fontSize);
    style.setProperty('--reader-line-height', vars.lineHeight);
    style.setProperty('--reader-padding', vars.padding);
    document.body.style.background = vars.background;
    document.body.style.color = vars.foreground;
    viewport.style.background = vars.background;
    requestAnimationFrame(function () {
      measure();
      page = Math.max(0, Math.min(Math.round(currentProgress * Math.max(0, pageCount - 1)), pageCount - 1));
      applyPage(true);
    });
  }

  function resume(vars) {
    if (vars) {
      applySettings(vars);
      return;
    }
    requestAnimationFrame(function () {
      measure();
      markReady();
      sendProgress(true);
    });
  }

  function emitTap(event) {
    post({ type: 'tap', x: event.changedTouches && event.changedTouches[0] ? event.changedTouches[0].clientX : event.clientX, width: width });
  }

  document.addEventListener('touchstart', function (event) {
    if (!event.touches || event.touches.length !== 1) return;
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
    if (moved) return;
    var image = event.target && event.target.closest && event.target.closest('img');
    if (image && image.src) {
      event.preventDefault();
      post({ type: 'image', src: image.src });
      return;
    }
    emitTap(event);
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
      event.stopPropagation();
      post({ type: 'image', src: image.src });
    }
  }, true);
  window.addEventListener('resize', function () {
    var currentProgress = pageCount <= 1 ? 0 : page / Math.max(1, pageCount - 1);
    measure();
    page = Math.max(0, Math.min(Math.round(currentProgress * Math.max(0, pageCount - 1)), pageCount - 1));
    applyPage(true);
  });

  window.PointReader = { go: go, jumpTo: jumpTo, jumpToOffset: jumpToOffset, seekToProgress: seekToProgress, applySettings: applySettings, resume: resume };
  renderAll();
  requestAnimationFrame(function () {
    measure();
    jumpToOffset(${safeInitialIndex}, ${safeInitialOffset});
    if (${safeInitialProgress} > 0.015) {
      page = Math.max(page, Math.round(${safeInitialProgress} * Math.max(0, pageCount - 1)));
      applyPage(false);
    }
    setTimeout(function () {
      suppressProgressUntil = 0;
      sendProgress(true);
      markReady();
    }, 240);
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

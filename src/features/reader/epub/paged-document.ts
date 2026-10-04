import type { ReadingSettings } from '@/features/settings/types';
import { clamp } from '@/shared/math';
import { createEpubCssVars } from './appearance';
import { serializeForScript } from './bridge';
import type { EpubHtmlBook } from './content';
import { epubContentCss, epubRuntime } from './runtime';

export function createEpubPagedHtml(
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
${epubContentCss}
:root { --reader-bg: ${vars.background}; --reader-fg: ${vars.foreground}; --reader-font-family: ${vars.fontFamily}; --reader-font-size: ${vars.fontSize}; --reader-line-height: ${vars.lineHeight}; --reader-padding: ${vars.padding}; }
html, body { width: 100%; max-width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; overscroll-behavior-x: none; background: var(--reader-bg); color: var(--reader-fg); font-family: var(--reader-font-family); -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body { position: fixed; inset: 0; touch-action: pan-y; }
#viewport { position: fixed; inset: 0; overflow: hidden; background: var(--reader-bg); }
#content { height: 100vh; column-gap: 0; column-fill: auto; transform: translate3d(0, 0, 0); will-change: transform; }
.chapter { box-sizing: border-box; width: 100vw; max-width: 100vw; min-height: 100vh; padding: 24px var(--reader-padding) 40px; font-family: var(--reader-font-family) !important; font-size: var(--reader-font-size) !important; line-height: var(--reader-line-height) !important; overflow-wrap: anywhere; word-break: break-word; overflow-x: hidden; break-before: column; page-break-before: always; }
.chapter:first-child { break-before: auto; page-break-before: auto; }
</style>
</head>
<body>
<div id="viewport"><main id="content"></main></div>
<script>
(function () {
  var chapters = ${serializeForScript(book.chapters)};
  var readerIsScroll = false;
  function readerViewportWidth() { return Math.max(1, Math.floor(viewport.clientWidth || window.innerWidth || 1)); }
  ${epubRuntime}
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




  function createChapterSection(chapter, index) {
    var section = document.createElement('section');
    section.className = 'chapter';
    section.id = 'chapter-' + index;
    section.setAttribute('data-index', String(index));
    section.setAttribute('data-href', chapter.href);
    section.appendChild(createChapterFragment(chapter.html));
    applyReaderStylesToSection(section);
    return section;
  }



  function applyReaderStylesToRenderedChapters() {
    var sections = content ? content.querySelectorAll('.chapter') : [];
    for (var index = 0; index < sections.length; index += 1) {
      applyReaderStylesToSection(sections[index]);
    }
    requestAnimationFrame(clampHorizontalOverflow);
  }


  function renderAll() {
    content.innerHTML = '';
    for (var index = 0; index < chapters.length; index += 1) {
      content.appendChild(createChapterSection(chapters[index], index));
    }
    applyReaderStylesToRenderedChapters();
  }

  function measure() {
    clampHorizontalOverflow();
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

  function jumpToHref(rawHref, fallbackIndexOrSource, maybeSourceElement) {
    var href = String(rawHref || '');
    if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
    var sourceElement = maybeSourceElement || (fallbackIndexOrSource && fallbackIndexOrSource.closest ? fallbackIndexOrSource : null);
    var sourceSection = sourceElement && sourceElement.closest ? sourceElement.closest('.chapter') : null;
    var fallbackIndex =
      typeof fallbackIndexOrSource === 'number'
        ? fallbackIndexOrSource
        : sourceSection
          ? Number(sourceSection.getAttribute('data-index')) || 0
          : 0;
    var targetIndex = findChapterByHref(href, fallbackIndex);
    jumpTo(targetIndex);
    return true;
  }

  function applySettings(vars) {
    var currentProgress = pageCount <= 1 ? 0 : page / Math.max(1, pageCount - 1);
    var style = document.documentElement.style;
    style.setProperty('--reader-bg', vars.background);
    style.setProperty('--reader-fg', vars.foreground);
    style.setProperty('--reader-font-family', vars.fontFamily);
    style.setProperty('--reader-font-size', vars.fontSize);
    style.setProperty('--reader-line-height', vars.lineHeight);
    style.setProperty('--reader-padding', vars.padding);
    document.body.style.background = vars.background;
    document.body.style.color = vars.foreground;
    viewport.style.background = vars.background;
    applyReaderStylesToRenderedChapters();
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
    var imageSource = imageSourceForTarget(event.target);
    if (imageSource) {
      event.preventDefault();
      post({ type: 'image', src: imageSource });
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
    var imageSource = imageSourceForTarget(event.target);
    if (imageSource) {
      event.preventDefault();
      event.stopPropagation();
      post({ type: 'image', src: imageSource });
    }
  }, true);
  window.addEventListener('resize', function () {
    var currentProgress = pageCount <= 1 ? 0 : page / Math.max(1, pageCount - 1);
    measure();
    page = Math.max(0, Math.min(Math.round(currentProgress * Math.max(0, pageCount - 1)), pageCount - 1));
    applyPage(true);
  });

  window.PointReader = { go: go, jumpTo: jumpTo, jumpToHref: jumpToHref, jumpToOffset: jumpToOffset, seekToProgress: seekToProgress, applySettings: applySettings, resume: resume };
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

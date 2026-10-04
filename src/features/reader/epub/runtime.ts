export const epubRuntime = String.raw`
  function post(payload) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }

  function markReady() {
    if (readySent) return;
    readySent = true;
    post({ type: 'ready' });
  }

  function imageSourceForTarget(target) {
    var image = target && target.closest && target.closest('img, image');
    if (!image) return '';
    return image.currentSrc || image.src || image.getAttribute('href') || image.getAttribute('xlink:href') || '';
  }

  function createChapterFragment(rawHtml) {
    var doc = new DOMParser().parseFromString(String(rawHtml || ''), 'text/html');
    doc.querySelectorAll('script, iframe, object, embed, link, meta, base, form, input, button, textarea, select').forEach(function(node) {
      node.remove();
    });
    doc.body.querySelectorAll('*').forEach(function(node) {
      Array.from(node.attributes).forEach(function(attribute) {
        var name = attribute.name.toLowerCase();
        var value = attribute.value.trim();
        if (name.indexOf('on') === 0 || name === 'srcdoc') {
          node.removeAttribute(attribute.name);
          return;
        }
        if ((name === 'href' || name === 'xlink:href' || name === 'src') && /^(?:javascript|vbscript):/i.test(value)) {
          node.removeAttribute(attribute.name);
        }
      });
    });
    var fragment = document.createDocumentFragment();
    while (doc.body.firstChild) {
      fragment.appendChild(doc.body.firstChild);
    }
    return fragment;
  }
  function applyReaderStylesToSection(section) {
    if (!section) return;
    var width = readerViewportWidth() + 'px';
    section.style.setProperty('width', width, 'important');
    section.style.setProperty('max-width', width, 'important');
    section.style.setProperty('min-width', '0', 'important');
    section.style.setProperty('box-sizing', 'border-box', 'important');
    section.style.setProperty('overflow-x', 'hidden', 'important');
    section.style.setProperty('margin-left', '0', 'important');
    section.style.setProperty('margin-right', '0', 'important');
    section.style.setProperty('font-family', 'var(--reader-font-family)', 'important');
    section.style.setProperty('font-size', 'var(--reader-font-size)', 'important');
    section.style.setProperty('line-height', 'var(--reader-line-height)', 'important');
    section.style.setProperty('padding-left', 'var(--reader-padding)', 'important');
    section.style.setProperty('padding-right', 'var(--reader-padding)', 'important');
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

  function clampHorizontalOverflow() {
    var viewportWidth = readerViewportWidth();
    var sections = content ? content.querySelectorAll('.chapter') : [];
    for (var sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
      var section = sections[sectionIndex];
      var sectionStyle = window.getComputedStyle(section);
      var horizontalPadding =
        (parseFloat(sectionStyle.paddingLeft) || 0) + (parseFloat(sectionStyle.paddingRight) || 0);
      var available = Math.max(1, Math.floor(viewportWidth - horizontalPadding));
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
    if (readerIsScroll) {
      if (document.scrollingElement) document.scrollingElement.scrollLeft = 0;
      if (window.scrollX) window.scrollTo(0, window.scrollY || 0);
    }
  }

`;

export const epubContentCss = `
.chapter p, .chapter div, .chapter span, .chapter section, .chapter article, .chapter li, .chapter blockquote, .chapter h1, .chapter h2, .chapter h3, .chapter h4, .chapter h5, .chapter h6, .chapter strong, .chapter em, .chapter b, .chapter i, .chapter ruby, .chapter rt { font-family: inherit !important; font-size: var(--reader-font-size) !important; line-height: var(--reader-line-height) !important; }
.chapter img, .chapter svg, .chapter video, .chapter canvas, .chapter iframe { width: auto !important; max-width: 100% !important; min-width: 0 !important; height: auto !important; box-sizing: border-box; }
.chapter table { width: 100% !important; max-width: 100% !important; min-width: 0 !important; table-layout: fixed; border-collapse: collapse; box-sizing: border-box; }
.chapter pre, .chapter code { width: auto !important; max-width: 100% !important; min-width: 0 !important; box-sizing: border-box; overflow-wrap: anywhere; white-space: pre-wrap; }
.chapter * { max-width: 100% !important; min-width: 0 !important; box-sizing: border-box; margin-left: 0 !important; margin-right: 0 !important; }
`;

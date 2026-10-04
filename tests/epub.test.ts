import assert from 'node:assert/strict';
import test from 'node:test';
import { Script } from 'node:vm';
import { parseEpubArchive } from '../src/features/reader/epub/archive';
import { createEpubContent } from '../src/features/reader/epub/content';
import { createEpubMetadata } from '../src/features/reader/epub/metadata';
import { createEpubPagedHtml } from '../src/features/reader/epub/paged-document';
import { createEpubScrollHtml } from '../src/features/reader/epub/scroll-document';
import {
  createEpubScrollLocation,
  parseEpubScrollLocation,
  resolveEpubRestorePosition,
} from '../src/features/reader/epub/position';
import { createEpubCommandScript, parseEpubMessage } from '../src/features/reader/epub/bridge';
import { defaultReadingSettings } from '../src/features/settings/defaults';
import { bookFixture, epubFixture } from './fixtures';

for (const version of [2, 3] as const) {
  test(`EPUB ${version}: spine, nested TOC, metadata, image and SVG resources`, () => {
    const archive = parseEpubArchive(epubFixture(version));
    const content = createEpubContent(archive);
    const { metadata, cover } = createEpubMetadata(archive);
    assert.deepEqual(
      content.chapters.map((c) => c.title),
      ['第一章', '第二章']
    );
    assert.equal(content.toc[1].href, 'text/two.xhtml#target');
    assert.match(content.chapters[0].html, /src="data:image\/png;base64,iVBORw=="/);
    assert.match(content.chapters[0].html, /xlink:href="data:image\/png;base64,iVBORw=="/);
    assert.match(content.chapters[0].html, /href="two.xhtml#target"/);
    assert.equal(content.css, 'p { text-align: justify; }');
    assert.equal(metadata.title, '测试书籍');
    assert.equal(metadata.author, 'Author');
    assert.equal(metadata.subject, '阅读、文学');
    assert.equal(metadata.publishedAt, '2024-05-01');
    assert.equal(metadata.description, 'Description');
    assert.equal(metadata.series, 'Series');
    assert.deepEqual(cover?.bytes, new Uint8Array([137, 80, 78, 71]));
  });
}

test('legacy EPUB position strings round-trip; corrupt href cannot crash restore', () => {
  const href = 'text/第一章.xhtml#target';
  const location = createEpubScrollLocation(2, 0.375, href);
  assert.equal(location, `point-reader:epub-scroll:2:0.375000:${encodeURIComponent(href)}`);
  assert.deepEqual(parseEpubScrollLocation(location), { index: 2, offset: 0.375, href });
  assert.equal(parseEpubScrollLocation('point-reader:epub-scroll:2:0.5:%E0'), null);
});

test('restoration preserves legacy href and avoids falling back to the cover', () => {
  const content = createEpubContent(parseEpubArchive(epubFixture()));
  assert.deepEqual(
    resolveEpubRestorePosition(bookFixture({ progress: 0.6, currentChapter: 0, currentOffset: 0 }), content),
    { index: 1, offset: 0.19999999999999996 }
  );
  assert.deepEqual(
    resolveEpubRestorePosition(bookFixture({ progress: 0.5, currentLocation: 'text/two.xhtml' }), content),
    { index: 1, offset: 0 }
  );
  assert.deepEqual(
    resolveEpubRestorePosition(
      bookFixture({ progress: 0.65, currentLocation: createEpubScrollLocation(1, 0.3, 'text/two.xhtml') }),
      content
    ),
    { index: 1, offset: 0.3 }
  );
});

for (const [mode, render] of [
  ['scroll', createEpubScrollHtml],
  ['tap', createEpubPagedHtml],
] as const) {
  test(`${mode} document compiles and preserves SVG handling with script-like book text`, () => {
    const content = createEpubContent(parseEpubArchive(epubFixture()));
    content.chapters[0].html += '<p>Literal </script> text</p>';
    const html = render(content, defaultReadingSettings, 'light', 1, 0.3, 0.65);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    assert.doesNotThrow(() => new Script(scripts[0][1]));
    assert.match(scripts[0][1], /closest\('img, image'\)/);
    assert.match(scripts[0][1], /xlink:href/);
    assert.match(scripts[0][1], /\\u003c\/script>/);
  });
}

test('bridge rejects invalid progress; command serialization invokes the reader API', () => {
  assert.equal(parseEpubMessage('{"type":"progress","progress":"bad"}'), null);
  assert.equal(parseEpubMessage('broken'), null);
  const received: unknown[][] = [];
  new Script(createEpubCommandScript('jumpToHref', ['text/a.xhtml#</script>'])).runInNewContext({
    window: { PointReader: { jumpToHref: (...args: unknown[]) => received.push(args) } },
  });
  assert.deepEqual(received[0], ['text/a.xhtml#</script>']);
});

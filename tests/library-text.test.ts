import assert from 'node:assert/strict';
import test from 'node:test';
import { rebaseDocumentUri, detectFormat } from '../src/features/library/model';
import { buildTextBlocks, parseTextChapters } from '../src/features/reader/text';
import { tapZoneAction } from '../src/features/reader/interactions';

test('iOS sandbox URI rebasing preserves existing books, covers and external URIs', () => {
  assert.equal(
    rebaseDocumentUri('file:///old/Documents/books/a.epub', 'file:///new/Documents/'),
    'file:///new/Documents/books/a.epub'
  );
  assert.equal(
    rebaseDocumentUri('file:///old/Documents/covers/a.png', 'file:///new/Documents/'),
    'file:///new/Documents/covers/a.png'
  );
  assert.equal(
    rebaseDocumentUri('content://provider/books/a.txt', 'file:///new/Documents/'),
    'content://provider/books/a.txt'
  );
  assert.equal(detectFormat('book.EPUB'), 'epub');
  assert.equal(detectFormat('book.zip'), null);
});

test('TXT chapter detection and virtual blocks preserve global offset numbering', () => {
  const chapters = parseTextChapters('第一章 开始\r\n' + '正文'.repeat(1100) + '\n第二章 继续\n结束');
  assert.equal(chapters.length, 3);
  const blocks = buildTextBlocks(chapters);
  assert.equal(blocks.length, 4);
  assert.deepEqual(
    blocks.map((block) => block.blockIndex),
    [0, 1, 2, 3]
  );
  assert.deepEqual(
    blocks.map((block) => block.chapterIndex),
    [0, 0, 1, 2]
  );
  assert.equal(blocks[3].title, '第二章 继续');
  assert.equal(buildTextBlocks(parseTextChapters(''))[0].blockIndex, 0);
});

test('tap zones keep 35% edges and swap only the page directions', () => {
  assert.equal(tapZoneAction(10, 100, false), 'previous');
  assert.equal(tapZoneAction(50, 100, false), 'toolbar');
  assert.equal(tapZoneAction(90, 100, false), 'next');
  assert.equal(tapZoneAction(10, 100, true), 'next');
  assert.equal(tapZoneAction(50, 100, true), 'toolbar');
  assert.equal(tapZoneAction(Number.NaN, 0, false), 'toolbar');
});

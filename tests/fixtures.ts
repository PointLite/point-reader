import { strToU8, zipSync } from 'fflate';
import type { Book } from '../src/features/library/types';

export function epubFixture(version: 2 | 3 = 3) {
  return zipSync({
    'META-INF/container.xml': strToU8(
      '<container><rootfiles><rootfile full-path="OPS/book.opf" /></rootfiles></container>'
    ),
    'OPS/book.opf': strToU8(`<package><metadata>
      <dc:title>测试书籍</dc:title><dc:creator>Author</dc:creator><dc:publisher>Publisher</dc:publisher>
      <dc:date opf:event="publication">2024-05-01</dc:date>
      <dc:subject>阅读</dc:subject><dc:subject>文学</dc:subject><dc:description>&lt;p&gt;Description&lt;/p&gt;</dc:description>
      <meta name="cover" content="cover"/><meta name="calibre:series" content="Series"/>
      <meta property="dcterms:modified">2025-01-01</meta>
      </metadata><manifest>
      <item id="cover" href="images/cover.png" media-type="image/png" properties="cover-image"/>
      <item id="one" href="text/one.xhtml" media-type="application/xhtml+xml"/>
      <item id="two" href="text/two.xhtml" media-type="application/xhtml+xml"/>
      <item id="style" href="style.css" media-type="text/css"/>
      <item id="toc" href="${version === 2 ? 'toc.ncx' : 'nav.xhtml'}" media-type="${version === 2 ? 'application/x-dtbncx+xml' : 'application/xhtml+xml'}" properties="nav"/>
      </manifest><spine toc="toc"><itemref idref="one"/><itemref idref="two"/></spine></package>`),
    'OPS/toc.ncx': strToU8(
      '<ncx><navMap><navPoint><navLabel><text>第一章</text></navLabel><content src="text/one.xhtml"/><navPoint><navLabel><text>第二章</text></navLabel><content src="text/two.xhtml#target"/></navPoint></navPoint></navMap></ncx>'
    ),
    'OPS/nav.xhtml': strToU8(
      '<html><body><nav epub:type="toc"><ol><li><a href="text/one.xhtml">第一章</a><ol><li><a href="text/two.xhtml#target">第二章</a></li></ol></li></ol></nav></body></html>'
    ),
    'OPS/text/one.xhtml': strToU8(
      '<html><head><title>Ignored</title></head><body><h1>第一章</h1><img src="../images/cover.png"/><svg><image xlink:href="../images/cover.png"/></svg><a href="two.xhtml#target">第二章</a><p>阅读正文</p></body></html>'
    ),
    'OPS/text/two.xhtml': strToU8('<html><body><h1 id="target">第二章</h1><p>更多正文</p></body></html>'),
    'OPS/images/cover.png': new Uint8Array([137, 80, 78, 71]),
    'OPS/style.css': strToU8('p { text-align: justify; }'),
  });
}

export function bookFixture(patch: Partial<Book> = {}): Book {
  return {
    id: 'book',
    title: 'Test',
    author: 'Author',
    format: 'epub',
    coverUri: null,
    fileUri: 'file:///Documents/books/book.epub',
    createdAt: 1,
    updatedAt: 1,
    progress: 0,
    currentChapter: 0,
    currentOffset: 0,
    currentLocation: null,
    groupId: null,
    ...patch,
  };
}

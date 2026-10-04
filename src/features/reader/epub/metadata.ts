import { textValue, toArray, type EpubArchive } from './archive';

import { normalizeZipPath } from '@/features/reader/epub/binary';

type EpubMetadata = {
  title?: string;
  author?: string;
  coverUri?: string | null;
};

export type EpubDetailMetadata = EpubMetadata & {
  publisher?: string;
  publishedAt?: string;
  updatedAt?: string;
  createdAt?: string;
  language?: string;
  subject?: string;
  identifier?: string;
  description?: string;
  series?: string;
  seriesIndex?: string;
};

export function createEpubMetadata(archive: EpubArchive | null): {
  metadata: EpubDetailMetadata;
  cover: { bytes: Uint8Array; path: string } | null;
} {
  if (!archive) return { metadata: {} as EpubDetailMetadata, cover: null };
  const { zip, opfDir, pkg, manifestItems } = archive;
  const metadata = pkg?.metadata ?? {};
  const title = textValue(metadata['dc:title']);
  const author = textValue(metadata['dc:creator']);
  const publisher = textValue(metadata['dc:publisher']);
  const language = textValue(metadata['dc:language']);
  const subject = textList(metadata['dc:subject']).join('、') || undefined;
  const identifier = textValue(metadata['dc:identifier']);
  const description = cleanDescription(textValue(metadata['dc:description']));
  const dates = extractDates(metadata);
  const series = extractMetaContent(metadata, ['calibre:series', 'belongs-to-collection']);
  const seriesIndex = extractMetaContent(metadata, ['calibre:series_index', 'group-position']);
  const coverItem = findCoverItem(metadata, manifestItems);
  const coverPath = coverItem?.href ? normalizeZipPath(`${opfDir}${coverItem.href}`) : null;
  const coverBytes = coverPath ? zip[coverPath] : undefined;

  return {
    metadata: {
      title,
      author,
      publisher,
      publishedAt: dates.publishedAt,
      updatedAt: dates.updatedAt,
      createdAt: dates.createdAt,
      language,
      subject,
      identifier,
      description,
      series,
      seriesIndex,
      coverUri: null,
    } satisfies EpubDetailMetadata,
    cover: coverBytes && coverPath ? { bytes: coverBytes, path: coverPath } : null,
  };
}

function findCoverItem(metadata: any, manifestItems: any[]) {
  const metaItems = toArray(metadata?.meta);
  const coverMeta = metaItems.find((item) => item.name === 'cover' && item.content);
  if (coverMeta) {
    const byId = manifestItems.find((item) => item.id === coverMeta.content);
    if (byId) return byId;
  }

  return (
    manifestItems.find((item) =>
      String(item.properties ?? '')
        .split(/\s+/)
        .includes('cover-image')
    ) ??
    manifestItems.find(
      (item) =>
        /cover/i.test(`${item.id ?? ''} ${item.href ?? ''}`) && /^image\//.test(item['media-type'] ?? '')
    )
  );
}

function textList(value: unknown) {
  return toArray(value)
    .map(textValue)
    .filter((item): item is string => Boolean(item));
}

function extractDates(metadata: any) {
  const dateItems = toArray<any>(metadata['dc:date']);
  const allDates = dateItems.map((item) => ({
    value: textValue(item),
    event: item?.event ?? item?.['opf:event'],
  }));
  const publishedAt =
    allDates.find((item) => item.event === 'publication')?.value ??
    allDates.find((item) => item.value)?.value;
  const createdAt = allDates.find((item) => item.event === 'creation')?.value;
  const metaItems = toArray<any>(metadata?.meta);
  const updatedAt =
    metaItems.find((item) => item.property === 'dcterms:modified')?.['#text'] ??
    metaItems.find((item) => item.name === 'calibre:timestamp')?.content;

  return {
    publishedAt,
    updatedAt,
    createdAt,
  };
}

function extractMetaContent(metadata: any, names: string[]) {
  const metaItems = toArray<any>(metadata?.meta);
  const byName = new Map<string, any>();
  const byProperty = new Map<string, any>();
  for (const item of metaItems) {
    if (item.name && item.content && !byName.has(item.name)) {
      byName.set(item.name, item);
    }
    if (item.property && (item['#text'] || item.content) && !byProperty.has(item.property)) {
      byProperty.set(item.property, item);
    }
  }
  for (const name of names) {
    const nameItem = byName.get(name);
    if (nameItem?.content) return String(nameItem.content).trim();
    const propertyItem = byProperty.get(name);
    const value = propertyItem?.['#text'] ?? propertyItem?.content;
    if (value) return String(value).trim();
  }
  return undefined;
}

function cleanDescription(value?: string) {
  if (!value) return undefined;
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

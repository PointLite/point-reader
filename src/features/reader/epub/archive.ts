import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';
import { readZipText } from './binary';

export const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

export type ManifestItem = {
  id: string;
  href: string;
  'media-type': string;
  properties?: string;
};

type EpubPackage = {
  metadata?: Record<string, any>;
  manifest?: { item?: ManifestItem | ManifestItem[] };
  spine?: { itemref?: { idref: string } | { idref: string }[]; toc?: string };
};

export type EpubArchive = {
  zip: Record<string, Uint8Array>;
  pkg: EpubPackage;
  opfDir: string;
  manifestItems: ManifestItem[];
  spineRefs: { idref: string }[];
};

export function parseEpubArchive(bytes: Uint8Array): EpubArchive | null {
  const zip = unzipSync(bytes);
  const container = readZipText(zip, 'META-INF/container.xml');
  if (!container) return null;
  const rootfiles = toArray<{ 'full-path'?: string }>(parser.parse(container).container?.rootfiles?.rootfile);
  const rootfile = rootfiles[0]?.['full-path'];
  if (!rootfile) return null;
  const opf = readZipText(zip, rootfile);
  const pkg: EpubPackage = parser.parse(opf).package ?? {};
  return {
    zip,
    pkg,
    opfDir: rootfile.includes('/') ? rootfile.slice(0, rootfile.lastIndexOf('/') + 1) : '',
    manifestItems: toArray(pkg.manifest?.item),
    spineRefs: toArray(pkg.spine?.itemref),
  };
}

export function toArray<T>(value: T | T[] | undefined | null): T[] {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}

export function textValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return textValue(value[0]);
  if (value && typeof value === 'object') return textValue((value as { '#text'?: unknown })['#text']);
  return undefined;
}

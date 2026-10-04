import { XMLParser } from 'fast-xml-parser';
import type { WebDavEntry } from './types';

function entryName(href: string) {
  const decoded = decodeURIComponent(href.replace(/\/$/, ''));
  return decoded.split('/').filter(Boolean).pop() || decoded || '/';
}

function stringValue(value: unknown) {
  if (Array.isArray(value)) return String(value[0] ?? '');
  return String(value ?? '');
}

function pickProp(propstat: unknown) {
  const propstats = Array.isArray(propstat) ? propstat : [propstat];
  return propstats.find((item: any) => item?.prop)?.prop ?? {};
}

function hasCollectionResourceType(resourceType: unknown): boolean {
  if (!resourceType) return false;
  if (typeof resourceType === 'string') return resourceType.toLowerCase().includes('collection');
  if (Array.isArray(resourceType)) return resourceType.some(hasCollectionResourceType);
  if (typeof resourceType !== 'object') return false;
  const record = resourceType as Record<string, unknown>;
  return (
    Object.keys(record).some((key) => key.toLowerCase() === 'collection') ||
    Object.values(record).some(hasCollectionResourceType)
  );
}

function isSelfHref(itemHref: string, targetUrl: string) {
  try {
    const target = new URL(targetUrl);
    const item = new URL(itemHref, target);
    return (
      decodeURIComponent(item.pathname.replace(/\/$/, '')) ===
      decodeURIComponent(target.pathname.replace(/\/$/, ''))
    );
  } catch {
    return false;
  }
}

export function parseWebDavResponse(xml: string, targetUrl: string): WebDavEntry[] {
  const parsed = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true }).parse(xml);
  const responses: any[] = Array.isArray(parsed.multistatus?.response)
    ? parsed.multistatus.response
    : [parsed.multistatus?.response].filter(Boolean);

  const entries: WebDavEntry[] = responses.map((item: any) => {
    const prop = pickProp(item.propstat);
    const href = stringValue(item.href);
    const directory = hasCollectionResourceType(prop?.resourcetype) || href.endsWith('/');
    return {
      name: stringValue(prop?.displayname) || entryName(href),
      href,
      type: directory ? 'directory' : 'file',
      size: Number(prop?.getcontentlength ?? 0),
      modifiedAt: stringValue(prop?.getlastmodified) || undefined,
    } satisfies WebDavEntry;
  });

  return entries
    .filter((entry) => entry.href && !isSelfHref(entry.href, targetUrl))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

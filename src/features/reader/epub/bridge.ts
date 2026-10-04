export type EpubCommand =
  'go' | 'jumpTo' | 'jumpToHref' | 'jumpToOffset' | 'seekToProgress' | 'applySettings' | 'resume';

export type EpubMessage =
  | { type: 'tap'; x?: number; width?: number }
  | { type: 'image'; src: string }
  | { type: 'progress'; progress: number; index: number; href: string; offset: number }
  | { type: 'ready' };

export function serializeForScript(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function createEpubCommandScript(command: EpubCommand, args: unknown[]) {
  return `
    void (function () {
      var args = ${serializeForScript(args)};
      function run() {
        var api = window.PointReader;
        if (!api || typeof api[${JSON.stringify(command)}] !== 'function') return false;
        api[${JSON.stringify(command)}].apply(api, args);
        return true;
      }
      if (!run()) setTimeout(run, 0);
    }());
    true;
  `;
}

export function parseEpubMessage(data: string): EpubMessage | null {
  try {
    const payload = JSON.parse(data);
    if (!payload || typeof payload !== 'object') return null;
    switch (payload.type) {
      case 'ready':
        return { type: 'ready' };
      case 'tap':
        return { type: 'tap', x: Number(payload.x), width: Number(payload.width) };
      case 'image':
        return typeof payload.src === 'string' ? { type: 'image', src: payload.src } : null;
      case 'progress': {
        const progress = Number(payload.progress),
          index = Number(payload.index),
          offset = Number(payload.offset);
        if (![progress, index, offset].every(Number.isFinite)) return null;
        return { type: 'progress', progress, index, offset, href: String(payload.href || '') };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function shouldAllowEpubNavigation(url?: string) {
  return !url || url === 'about:blank' || url.startsWith('data:') || url.startsWith('blob:');
}

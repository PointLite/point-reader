const TAP_ZONE_EDGE_RATIO = 0.35;

type TapZoneAction = 'previous' | 'toolbar' | 'next';

export function tapZoneAction(x: number, width: number, swapTapZones: boolean): TapZoneAction {
  if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) {
    return 'toolbar';
  }
  const ratio = x / width;
  if (ratio < TAP_ZONE_EDGE_RATIO) {
    return swapTapZones ? 'next' : 'previous';
  }
  if (ratio > 1 - TAP_ZONE_EDGE_RATIO) {
    return swapTapZones ? 'previous' : 'next';
  }
  return 'toolbar';
}

import { clamp } from '@/shared/math';
import * as Battery from 'expo-battery';
import { NativeModules } from 'react-native';

export const KEEP_AWAKE_TAG = 'point-reader:reader';

export const BATTERY_REFRESH_INTERVAL_MS = 30000;

type PointReaderScrollControlModule = {
  setScrollsToTopEnabled?: (enabled: boolean) => void;
};

const pointReaderScrollControl = NativeModules.PointReaderScrollControl as
  PointReaderScrollControlModule | undefined;

export function batteryPercentFromLevel(level: number) {
  if (!Number.isFinite(level) || level < 0) return null;
  return Math.round(clamp(level, 0, 1) * 100);
}

export async function readBatteryPercent() {
  try {
    const powerState = await Battery.getPowerStateAsync();
    const powerStatePercent = batteryPercentFromLevel(powerState.batteryLevel);
    if (powerStatePercent !== null) return powerStatePercent;
  } catch {
    // Fall through to the narrower API below.
  }

  try {
    return batteryPercentFromLevel(await Battery.getBatteryLevelAsync());
  } catch {
    return null;
  }
}

export function setIosScrollsToTopEnabled(enabled: boolean) {
  pointReaderScrollControl?.setScrollsToTopEnabled?.(enabled);
}

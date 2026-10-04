import * as Battery from 'expo-battery';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import {
  BATTERY_REFRESH_INTERVAL_MS,
  batteryPercentFromLevel,
  KEEP_AWAKE_TAG,
  readBatteryPercent,
} from './device';

export function useReaderDeviceStatus(keepAwake: boolean) {
  const [time, setTime] = useState('');
  const [battery, setBattery] = useState<number | null>(null);
  useEffect(() => {
    if (keepAwake) {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      return () => {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      };
    }
    return undefined;
  }, [keepAwake]);

  useEffect(() => {
    let mounted = true;
    const refreshStatus = async () => {
      const now = new Date();
      setTime(
        `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
      );
      const nextBattery = await readBatteryPercent();
      if (mounted && nextBattery !== null) {
        setBattery(nextBattery);
      }
    };
    let batteryLevelSubscription: Battery.Subscription | null = null;
    let batteryStateSubscription: Battery.Subscription | null = null;
    try {
      batteryLevelSubscription = Battery.addBatteryLevelListener((event) => {
        const nextBattery = batteryPercentFromLevel(event.batteryLevel);
        if (mounted && nextBattery !== null) {
          setBattery(nextBattery);
        }
      });
      batteryStateSubscription = Battery.addBatteryStateListener(() => {
        void refreshStatus();
      });
    } catch {
      batteryLevelSubscription = null;
      batteryStateSubscription = null;
    }
    const retryTimers = [120, 650, 1800, 3500].map((delay) => setTimeout(refreshStatus, delay));
    const timer = setInterval(refreshStatus, BATTERY_REFRESH_INTERVAL_MS);
    return () => {
      mounted = false;
      retryTimers.forEach(clearTimeout);
      clearInterval(timer);
      batteryLevelSubscription?.remove();
      batteryStateSubscription?.remove();
    };
  }, []);

  return { time, battery };
}

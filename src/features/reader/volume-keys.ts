import { Platform } from 'react-native';
import { VolumeManager } from 'react-native-volume-manager';

type VolumeKeyDirection = 'up' | 'down';

const CENTER_VOLUME = 0.5;
const EDGE_VOLUME_MIN = 0.08;
const EDGE_VOLUME_MAX = 0.92;

export function addVolumeKeyListener(listener: (direction: VolumeKeyDirection) => void) {
  let active = true;
  let originalVolume = CENTER_VOLUME;
  let stableVolume = CENTER_VOLUME;
  let suppressNextChange = false;

  async function prepareVolumeSession() {
    try {
      await VolumeManager.showNativeVolumeUI({ enabled: false });
      if (Platform.OS === 'ios') {
        await VolumeManager.enable(true, true);
        await VolumeManager.setActive(true, true);
      }
      const result = await VolumeManager.getVolume();
      originalVolume = normalizedVolume(result.volume);
      stableVolume = safeListeningVolume(originalVolume);
      if (Math.abs(stableVolume - originalVolume) > 0.01) {
        suppressNextChange = true;
        await VolumeManager.setVolume(stableVolume, { showUI: false, playSound: false });
      }
    } catch {
      // The package throws before the native client is rebuilt; keep the app usable.
    }
  }

  void prepareVolumeSession();

  const subscription = createVolumeSubscription((result) => {
    if (!active) return;
    const nextVolume = normalizedVolume(result.volume);
    if (suppressNextChange) {
      suppressNextChange = false;
      return;
    }
    if (Math.abs(nextVolume - stableVolume) < 0.01) return;
    listener(nextVolume > stableVolume ? 'up' : 'down');
    suppressNextChange = true;
    void VolumeManager.setVolume(stableVolume, { showUI: false, playSound: false });
  });

  return {
    remove: () => {
      active = false;
      subscription.remove();
      if (Math.abs(originalVolume - stableVolume) > 0.01) {
        void VolumeManager.setVolume(originalVolume, { showUI: false, playSound: false });
      }
      void VolumeManager.showNativeVolumeUI({ enabled: true });
    },
  };
}

function createVolumeSubscription(callback: (result: { volume: number }) => void) {
  try {
    return VolumeManager.addVolumeListener(callback);
  } catch {
    return { remove: () => undefined };
  }
}

function normalizedVolume(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : CENTER_VOLUME));
}

function safeListeningVolume(value: number) {
  if (value <= EDGE_VOLUME_MIN || value >= EDGE_VOLUME_MAX) return CENTER_VOLUME;
  return value;
}

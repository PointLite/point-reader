import { Platform } from 'react-native';
import { VolumeManager } from 'react-native-volume-manager';

type VolumeKeyDirection = 'up' | 'down';

const CENTER_VOLUME = 0.5;
const EDGE_VOLUME_MIN = 0.08;
const EDGE_VOLUME_MAX = 0.92;

export function addVolumeKeyListener(listener: (direction: VolumeKeyDirection) => void) {
  let active = true;
  let lastVolume = CENTER_VOLUME;
  let suppressNextChange = false;

  async function prepareVolumeSession() {
    try {
      await VolumeManager.showNativeVolumeUI({ enabled: false });
      if (Platform.OS === 'ios') {
        await VolumeManager.enable(true, true);
        await VolumeManager.setActive(true, true);
      }
      const result = await VolumeManager.getVolume();
      lastVolume = normalizedVolume(result.volume);
      if (lastVolume <= EDGE_VOLUME_MIN || lastVolume >= EDGE_VOLUME_MAX) {
        suppressNextChange = true;
        await VolumeManager.setVolume(CENTER_VOLUME, { showUI: false, playSound: false });
        lastVolume = CENTER_VOLUME;
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
      lastVolume = nextVolume;
      return;
    }
    if (Math.abs(nextVolume - lastVolume) < 0.01) return;
    listener(nextVolume > lastVolume ? 'up' : 'down');
    lastVolume = nextVolume;
    if (nextVolume <= EDGE_VOLUME_MIN || nextVolume >= EDGE_VOLUME_MAX) {
      suppressNextChange = true;
      lastVolume = CENTER_VOLUME;
      void VolumeManager.setVolume(CENTER_VOLUME, { showUI: false, playSound: false });
    }
  });

  return {
    remove: () => {
      active = false;
      subscription.remove();
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

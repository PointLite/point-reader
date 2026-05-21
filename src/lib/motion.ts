import { useEffect, useState } from 'react';
import { LayoutAnimation, Platform, UIManager } from 'react-native';

import { defaultReadingSettings, loadReadingSettings, subscribeReadingSettings } from '@/lib/settings';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export const INTERACTION_ANIMATION_MS = 180;

export function useEinkOptimization() {
  const [einkOptimization, setEinkOptimization] = useState(defaultReadingSettings.einkOptimization);

  useEffect(() => {
    let mounted = true;
    loadReadingSettings().then((settings) => {
      if (mounted) setEinkOptimization(settings.einkOptimization);
    });
    const unsubscribe = subscribeReadingSettings((settings) => {
      setEinkOptimization(settings.einkOptimization);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return einkOptimization;
}

export function modalAnimationType(einkOptimization: boolean) {
  return einkOptimization ? 'none' : 'fade';
}

export function bottomModalAnimationType(einkOptimization: boolean) {
  return einkOptimization ? 'none' : 'slide';
}

export function animateLayoutIfEnabled(einkOptimization: boolean) {
  if (einkOptimization) return;
  LayoutAnimation.configureNext({
    duration: INTERACTION_ANIMATION_MS,
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  });
}

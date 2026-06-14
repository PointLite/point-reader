import { useEffect, useState } from 'react';

import { defaultReadingSettings, loadReadingSettings, subscribeReadingSettings } from '@/lib/settings';

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

export function animateLayoutIfEnabled(einkOptimization: boolean) {
  void einkOptimization;
}

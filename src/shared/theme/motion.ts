import { useReadingSettings } from '@/features/settings/store';

export const INTERACTION_ANIMATION_MS = 180;

export function useEinkOptimization() {
  return useReadingSettings().settings.einkOptimization;
}

export function modalAnimationType(einkOptimization: boolean) {
  return einkOptimization ? 'none' : 'fade';
}

export function animateLayoutIfEnabled(einkOptimization: boolean) {
  void einkOptimization;
}

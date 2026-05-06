import type { MotionPreset } from './types';

export const motionPresetClass: Record<MotionPreset, string> = {
  fast: 'duration-200 ease-out',
  impact: 'duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
  reveal: 'duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]'
};

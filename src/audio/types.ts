export type SoundEvent =
  | { type: 'attack'; classId: 'guerreiro' | 'mago' | 'arqueiro' | 'druida'; explosive?: boolean }
  | { type: 'gather'; kind: 'wood' | 'stone' | 'cotton'; done?: boolean }
  | { type: 'dayNight'; phase: 'day' | 'night' }
  | { type: 'explosion'; kind: 'mage' };

export type SoundType = SoundEvent['type'];
export type SoundEventOf<T extends SoundType> = Extract<SoundEvent, { type: T }>;

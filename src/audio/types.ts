export type SoundEvent =
  | { type: 'attack'; classId: 'guerreiro' | 'mago' | 'arqueiro' | 'druida'; explosive?: boolean }
  | { type: 'gather'; kind: 'wood' | 'stone' | 'cotton' }
  | { type: 'dayNight'; phase: 'day' | 'night' };

export type SoundType = SoundEvent['type'];
export type SoundEventOf<T extends SoundType> = Extract<SoundEvent, { type: T }>;

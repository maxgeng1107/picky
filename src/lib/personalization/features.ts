/** Attribute strength, not universal beauty. Fixed anchors permit ties across scenes. */
export const DIMENSIONS = [
  { key: 'face_small', name: 'slimmer-looking facial contour', kind: 'beauty', definition: 'Perceived slenderness of the facial contour: 1 broad, 3 intermediate, 5 slender. NOT face size in the frame, distance, identity, or an assumption about side views. null if unreliable.' },
  { key: 'jawline', name: 'visible jaw contour', kind: 'beauty', definition: 'Visibility of the jaw contour: 1 obscured, 3 partially visible, 5 clearly visible. Do not infer attractiveness.' },
  { key: 'big_eyes', name: 'eye opening', kind: 'beauty', definition: 'Visible eye opening: 1 nearly closed, 3 moderate, 5 wide open; null if hidden. Not a beauty judgment.' },
  { key: 'facing_camera', name: 'facing the camera', kind: 'style', definition: '1 full profile, 3 three-quarter view, 5 frontal view.' },
  { key: 'smile_teeth', name: 'visible smile with teeth', kind: 'style', definition: '1 no visible teeth or smile, 3 slight smile, 5 broad tooth-visible smile.' },
  { key: 'camera_high', name: 'camera elevation', kind: 'style', definition: '1 clearly below eye level, 3 eye level, 5 clearly above; null when ambiguous.' },
  { key: 'lighting', name: 'even facial illumination', kind: 'beauty', definition: '1 strongly uneven or clipped facial illumination, 3 mixed, 5 evenly lit with preserved detail.' },
  { key: 'expression', name: 'relaxed expression', kind: 'beauty', definition: '1 visibly tense, 3 ambiguous/intermediate, 5 visibly relaxed. Subjective estimate; null rather than inventing a difference.' },
] as const;
export const FEATURE_VERSION = 'portrait-anchors-v1';
export const KEYS: string[] = DIMENSIONS.map((d) => d.key);

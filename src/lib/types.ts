// Shared contract between the UI (src/app, src/components, src/mock) and the logic (src/lib, server).
// Owner: Lingge. UI imports only — ask before changing a field.

export type PhotoId = string; // MediaLibrary asset id
export type DimensionKey = string; // "face_small", "facing_camera", … (see Picky Taste Dimensions)
export type Scores = Record<DimensionKey, number | null>; // 1–5 within the scene, null = not visible

export interface Photo {
  id: PhotoId;
  uri: string; // for <Image>
  localUri?: string; // file:// for upload
  takenAt: number; // ms epoch (asset.creationTime)
  sizeBytes?: number;
  sceneId: string;
  status: 'kept' | 'binned';
  isGenericPick?: boolean; // what a generic app would keep
  reason?: string; // "Kept: face looks smaller than the others"
  gated?: boolean; // failed a quality gate (eyes closed, blurry…)
  scores?: Scores; // from /api/select
  driveFileId?: string;
  deleted?: boolean;
  rescued?: boolean; // COULD: rescued from the Cloud Bin
}

export interface Scene {
  id: string;
  label?: string; // "Under the tree"
  photoIds: PhotoId[];
  keptIds: PhotoId[];
  genericKeptIds: PhotoId[];
  uncertainIds: PhotoId[]; // challengers for A vs B (max 3)
  reviewed: boolean;
}

export type CriterionStatus = 'unknown' | 'leaning' | 'confident' | 'avoid' | 'doesnt_care';

export interface Criterion {
  key: DimensionKey; // "face_small" — matches Photo.scores
  name: string; // "face looks smaller" (shown in the panel)
  kind: 'beauty' | 'style'; // style = no good/bad direction (angle, smile…)
  support: number; // winner was clearly higher on it
  against: number; // winner was clearly lower on it
  status: CriterionStatus;
  lastChange?: 'new' | 'up' | 'down';
}

export interface TasteProfile {
  criteria: Criterion[];
  summary?: string;
  /** Device-local personal pairwise model. Optional for the existing web mock. */
  preference?: import('./personalization/taste').PreferenceModel;
}

export type Answer = 'keepA' | 'replace' | 'keepBoth' | 'skip';

export interface PickyState {
  photosById: Record<PhotoId, Photo>;
  scenes: Scene[];
  profile: TasteProfile;
  review: { sceneId: string; aId: PhotoId; bId: PhotoId; index: number; total: number } | null;
  busy: boolean;
  status?: string; // progress line while busy, e.g. "Looking at scene 2 of 4…"
  watch?: { newPhotos: number; lastPhotoAt: number; readyAt: number }; // new photos waiting for the shoot to end
  freedBytes: number;
  error?: string;
}

export interface PickyActions {
  loadAlbum(): Promise<void>; // read album + split scenes
  curateNextScene(): Promise<void>; // /api/select for the next unreviewed scene
  simulateNight(): Promise<void>; // curate all scenes, then schedule the "3 need your call" local notification (5 s)
  answer(a: Answer, expected?: NonNullable<PickyState['review']>): Promise<void>; // expected guards stale/double taps
  freeUpSpace(): Promise<void>; // explains preservation; deletion is disabled until backup exists
  rescue(id: PhotoId): void; // COULD: Cloud Bin → kept, learn rescued-vs-kept
  reset(): void;
}

export interface PickyContextValue {
  state: PickyState;
  actions: PickyActions;
}

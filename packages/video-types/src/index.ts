export type RoleName = 'SUPER_ADMIN' | 'USER';

export type JobState =
  | 'QUEUED'
  | 'DOWNLOADING'
  | 'PROBING'
  | 'TRANSCODING'
  | 'TRANSCRIBING'
  | 'ANALYZING'
  | 'SCORING'
  | 'GENERATING_CLIPS'
  | 'RENDERING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';

export type LiveSessionState =
  | 'IDLE'
  | 'CONNECTING'
  | 'RECORDING'
  | 'PROCESSING'
  | 'STOPPED'
  | 'FAILED';

export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5';

export type ExportResolution = '720p' | '1080p' | '1440p' | '4K';

export type ExportPreset =
  | 'TikTok'
  | 'Instagram Reels'
  | 'YouTube Shorts'
  | 'Facebook Reels'
  | 'YouTube Landscape';

export type ReframeMode =
  | 'LEVEL_1_CENTER_CROP'
  | 'LEVEL_2_VISUAL_TRACKING'
  | 'LEVEL_3_SMART_SPLIT_COMPOSITION';

export type SubtitleTemplateName =
  | 'Classic'
  | 'Bold'
  | 'Neon'
  | 'Minimal'
  | 'Gaming'
  | 'Podcast'
  | 'Karaoke'
  | 'Dynamic'
  | 'Premium';

export type GamingPresetName =
  | 'Funny Moments'
  | 'Epic Wins'
  | 'Rage Moments'
  | 'Best Plays'
  | 'Fails'
  | 'Reactions'
  | 'Highlights';

export type SupportedGameId =
  | 'fortnite'
  | 'gtav'
  | 'gtavi'
  | 'valorant'
  | 'minecraft'
  | 'cod'
  | 'sports'
  | 'generic';

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string;
  isFiller?: boolean;
}

export interface ClipQualityScores {
  score_total: number;
  score_hook: number;
  score_story: number;
  score_emotion: number;
  score_engagement: number;
  score_clarity: number;
  score_visual: number;
  score_shareability: number;
  explanation: string;
  algorithmVersion: string;
  weightsUsed: Record<string, number>;
}

export interface SubtitleStyleConfig {
  template: SubtitleTemplateName;
  fontFamily: string;
  fontSize: number;
  primaryColor: string;
  activeWordColor: string;
  outlineColor: string;
  outlineWidth: number;
  shadowDepth: number;
  positionYPercent: number;
  animation: 'none' | 'pop' | 'karaoke-highlight' | 'slide-up' | 'glow';
  backgroundBox: boolean;
  backgroundColor: string;
  maxWordsPerLine: number;
}

export interface ReframeKeyframe {
  timestampSec: number;
  centerXNormalized: number; // 0.0 to 1.0
  centerYNormalized: number; // 0.0 to 1.0
  zoom: number; // 1.0 to 3.0
  layout: 'single' | 'split-two-speaker' | 'gaming-webcam-top';
  webcamRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface TimelineTrackSegment {
  id: string;
  sourceStartSec: number;
  sourceEndSec: number;
  timelineStartSec: number;
  speed: number;
  volume: number;
  muted: boolean;
  transitionIn?: 'none' | 'fade' | 'dissolve' | 'wipeleft' | 'SLIDE';
}

export interface OverlayItem {
  id: string;
  type: 'text' | 'title' | 'image' | 'logo' | 'watermark';
  content: string;
  startSec: number;
  endSec: number;
  xPercent: number;
  yPercent: number;
  scale: number;
  opacity: number;
  style?: Record<string, string | number>;
}

export interface NonDestructiveEditState {
  version: number;
  aspectRatio: AspectRatio;
  reframeMode: ReframeMode;
  reframeKeyframes: ReframeKeyframe[];
  segments: TimelineTrackSegment[];
  overlays: OverlayItem[];
  subtitleStyle: SubtitleStyleConfig;
  deletedWordIds: string[];
  removeSilencesThresholdMs?: number;
}

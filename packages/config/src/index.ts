export const BRAND_CONFIG = {
  appName: 'BANANA CLIPS AI STUDIO',
  shortName: 'BANANA CLIPS',
  defaultLocale: 'es' as const,
  supportedLocales: ['es', 'en'] as const,
  palette: {
    primary: '#FFD43B',
    secondary: '#FFB703',
    background: '#111318',
    surface: '#1B1E25',
    text: '#F8FAFC',
    muted: '#94A3B8',
  },
};

export const HARDWARE_PROFILES = {
  CPU_ONLY: {
    id: 'CPU_ONLY',
    label: 'CPU Only (Universal Fallback)',
    whisperModel: 'base',
    computeType: 'int8',
    maxConcurrency: 1,
    unloadModelsAfterJob: true,
    useNvenc: false,
  },
  NVIDIA_LOW_VRAM: {
    id: 'NVIDIA_LOW_VRAM',
    label: 'NVIDIA Low VRAM (4GB - 8GB VRAM)',
    whisperModel: 'small',
    computeType: 'int8_float16',
    maxConcurrency: 1,
    unloadModelsAfterJob: true,
    useNvenc: true,
  },
  NVIDIA_HIGH_VRAM: {
    id: 'NVIDIA_HIGH_VRAM',
    label: 'NVIDIA High VRAM (12GB+ VRAM)',
    whisperModel: 'large-v3-turbo',
    computeType: 'float16',
    maxConcurrency: 2,
    unloadModelsAfterJob: false,
    useNvenc: true,
  },
} as const;

export const DEFAULT_SCORING_WEIGHTS = {
  algorithmVersion: 'v1.2.0-heuristic-multimodal',
  weights: {
    hook: 0.24,
    story: 0.16,
    emotion: 0.14,
    engagement: 0.16,
    clarity: 0.10,
    visual: 0.10,
    shareability: 0.10,
  },
};

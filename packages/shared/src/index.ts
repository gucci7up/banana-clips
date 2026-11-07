import { DEFAULT_SCORING_WEIGHTS } from '@banana/config';
import type { ClipQualityScores, SubtitleStyleConfig, SubtitleTemplateName } from '@banana/video-types';

/**
 * Validates that an external URL is safe from SSRF (blocks localhost, private RFC1918 IPs, link-local, metadata endpoints, non-http/https).
 */
export function validateSafeExternalUrl(rawUrl: string): { valid: boolean; reason?: string; normalizedUrl?: string } {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, reason: 'Protocolo no permitido. Solo se admite HTTP/HTTPS.' };
    }
    const hostname = parsed.hostname.toLowerCase();
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254', 'metadata.google.internal'];
    if (blockedHosts.includes(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return { valid: false, reason: 'URL interna o privada bloqueada por protección SSRF.' };
    }
    // Check RFC1918 IPv4 ranges
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [_, a, b] = ipv4Match.map(Number);
      if (
        a === 10 ||
        a === 127 ||
        a === 0 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254)
      ) {
        return { valid: false, reason: 'Rango IP privado bloqueado por protección SSRF.' };
      }
    }
    return { valid: true, normalizedUrl: parsed.toString() };
  } catch {
    return { valid: false, reason: 'Formato de URL inválido.' };
  }
}

/**
 * Computes heuristic multimodal quality score (0-100) across the 7 dimensions required by Banana Clips AI Studio.
 */
export function calculateMultimodalClipScore(params: {
  transcriptText: string;
  durationSec: number;
  targetDurationSec: number;
  audioEnergyPeak: number; // 0..1
  visualMotionScore: number; // 0..1
  sceneChangesCount: number;
  startsWithSentenceBoundary: boolean;
  endsWithSentenceBoundary: boolean;
  locale?: 'es' | 'en';
}): ClipQualityScores {
  const text = params.transcriptText.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const firstWords = words.slice(0, 12).join(' ').toLowerCase();

  // 1. HOOK evaluation (questions, exclamations, strong opening triggers, audio energy)
  const hookPatterns = /(\?|¿|!|¡|secreto|increíble|nunca|cómo|por qué|mira|ojo|atención|error|verdad|imagina|wait|how|why|secret|never|watch)/i;
  let score_hook = 58 + Math.round(params.audioEnergyPeak * 22);
  if (hookPatterns.test(firstWords)) score_hook += 16;
  if (params.startsWithSentenceBoundary) score_hook += 6;
  score_hook = Math.min(98, Math.max(25, score_hook));

  // 2. STORY evaluation (narrative progression, sentence completeness, duration fit)
  const durationRatio = Math.min(params.durationSec, params.targetDurationSec) / Math.max(params.durationSec, params.targetDurationSec, 1);
  let score_story = Math.round(52 + durationRatio * 28);
  if (params.startsWithSentenceBoundary && params.endsWithSentenceBoundary) score_story += 14;
  if (words.length >= 25) score_story += 6;
  score_story = Math.min(97, Math.max(30, score_story));

  // 3. EMOTION evaluation (audio intensity + expressive punctuation/vocabulary)
  const emotionPatterns = /(!|¡|increíble|brutal|locura|miedo|feliz|amor|odio|épico|imposible|sorpresa|risa|ganamos|wow|insane|crazy|amazing)/i;
  let score_emotion = Math.round(48 + params.audioEnergyPeak * 35);
  if (emotionPatterns.test(text)) score_emotion += 15;
  score_emotion = Math.min(98, Math.max(28, score_emotion));

  // 4. ENGAGEMENT evaluation (pacing: words per second + visual rhythm)
  const wps = words.length / Math.max(params.durationSec, 1);
  const optimalPacingBonus = wps >= 1.8 && wps <= 3.8 ? 22 : wps >= 1.0 ? 12 : 4;
  let score_engagement = Math.round(50 + optimalPacingBonus + params.visualMotionScore * 24);
  score_engagement = Math.min(98, Math.max(30, score_engagement));

  // 5. CLARITY evaluation (clean sentence structure, low filler density)
  const fillerMatches = text.match(/\b(eh+|este+|mmm+|o sea|bueno pues|uh+|um+|like)\b/gi) || [];
  const fillerPenalty = Math.min(25, fillerMatches.length * 4);
  let score_clarity = Math.round(86 - fillerPenalty + (params.endsWithSentenceBoundary ? 8 : 0));
  score_clarity = Math.min(99, Math.max(35, score_clarity));

  // 6. VISUAL_IMPACT evaluation (motion + scene dynamism)
  const sceneRate = params.sceneChangesCount / Math.max(params.durationSec / 10, 1);
  let score_visual = Math.round(50 + params.visualMotionScore * 34 + Math.min(15, sceneRate * 6));
  score_visual = Math.min(98, Math.max(35, score_visual));

  // 7. SHAREABILITY evaluation
  const score_shareability = Math.min(
    98,
    Math.max(30, Math.round((score_hook * 0.35 + score_emotion * 0.3 + score_story * 0.35)))
  );

  const w = DEFAULT_SCORING_WEIGHTS.weights;
  const score_total = Math.round(
    score_hook * w.hook +
      score_story * w.story +
      score_emotion * w.emotion +
      score_engagement * w.engagement +
      score_clarity * w.clarity +
      score_visual * w.visual +
      score_shareability * w.shareability
  );

  const reasons: string[] = [];
  if (score_hook >= 78) reasons.push('comienza con un gancho inicial de alta retención');
  if (score_emotion >= 75) reasons.push('presenta una intensidad vocal y emocional destacada');
  if (score_story >= 78) reasons.push('mantiene autonomía narrativa con apertura y cierre natural');
  if (score_visual >= 75) reasons.push('exhibe alto dinamismo visual en escena');
  if (reasons.length === 0) {
    reasons.push('presenta un ritmo equilibrado, buena claridad de audio y contexto completo');
  }

  const explanation = `Este clip obtiene una puntuación de ${score_total}/100 porque ${reasons.join(', ')}.`;

  return {
    score_total,
    score_hook,
    score_story,
    score_emotion,
    score_engagement,
    score_clarity,
    score_visual,
    score_shareability,
    explanation,
    algorithmVersion: DEFAULT_SCORING_WEIGHTS.algorithmVersion,
    weightsUsed: { ...w },
  };
}

export const SUBTITLE_TEMPLATES: Record<SubtitleTemplateName, SubtitleStyleConfig> = {
  Classic: {
    template: 'Classic',
    fontFamily: 'Inter',
    fontSize: 46,
    primaryColor: '#FFFFFF',
    activeWordColor: '#FFD43B',
    outlineColor: '#000000',
    outlineWidth: 3,
    shadowDepth: 2,
    positionYPercent: 78,
    animation: 'none',
    backgroundBox: false,
    backgroundColor: '#000000AA',
    maxWordsPerLine: 5,
  },
  Bold: {
    template: 'Bold',
    fontFamily: 'Montserrat',
    fontSize: 54,
    primaryColor: '#FFFFFF',
    activeWordColor: '#FFD43B',
    outlineColor: '#000000',
    outlineWidth: 5,
    shadowDepth: 3,
    positionYPercent: 75,
    animation: 'pop',
    backgroundBox: false,
    backgroundColor: '#00000000',
    maxWordsPerLine: 4,
  },
  Neon: {
    template: 'Neon',
    fontFamily: 'Outfit',
    fontSize: 50,
    primaryColor: '#F8FAFC',
    activeWordColor: '#00F5D4',
    outlineColor: '#7B2CBF',
    outlineWidth: 4,
    shadowDepth: 4,
    positionYPercent: 76,
    animation: 'glow',
    backgroundBox: false,
    backgroundColor: '#00000000',
    maxWordsPerLine: 4,
  },
  Minimal: {
    template: 'Minimal',
    fontFamily: 'Inter',
    fontSize: 40,
    primaryColor: '#F8FAFC',
    activeWordColor: '#FFD43B',
    outlineColor: '#111318',
    outlineWidth: 1,
    shadowDepth: 1,
    positionYPercent: 82,
    animation: 'slide-up',
    backgroundBox: true,
    backgroundColor: '#111318CC',
    maxWordsPerLine: 6,
  },
  Gaming: {
    template: 'Gaming',
    fontFamily: 'Impact',
    fontSize: 56,
    primaryColor: '#FFFFFF',
    activeWordColor: '#FFB703',
    outlineColor: '#000000',
    outlineWidth: 5,
    shadowDepth: 4,
    positionYPercent: 72,
    animation: 'pop',
    backgroundBox: false,
    backgroundColor: '#00000000',
    maxWordsPerLine: 3,
  },
  Podcast: {
    template: 'Podcast',
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 48,
    primaryColor: '#F8FAFC',
    activeWordColor: '#FFD43B',
    outlineColor: '#0F172A',
    outlineWidth: 4,
    shadowDepth: 2,
    positionYPercent: 78,
    animation: 'karaoke-highlight',
    backgroundBox: false,
    backgroundColor: '#00000000',
    maxWordsPerLine: 5,
  },
  Karaoke: {
    template: 'Karaoke',
    fontFamily: 'Montserrat',
    fontSize: 52,
    primaryColor: '#CBD5E1',
    activeWordColor: '#FFD43B',
    outlineColor: '#000000',
    outlineWidth: 4,
    shadowDepth: 3,
    positionYPercent: 76,
    animation: 'karaoke-highlight',
    backgroundBox: true,
    backgroundColor: '#1B1E25D9',
    maxWordsPerLine: 4,
  },
  Dynamic: {
    template: 'Dynamic',
    fontFamily: 'Montserrat',
    fontSize: 54,
    primaryColor: '#FFFFFF',
    activeWordColor: '#38BDF8',
    outlineColor: '#090D16',
    outlineWidth: 5,
    shadowDepth: 3,
    positionYPercent: 74,
    animation: 'pop',
    backgroundBox: false,
    backgroundColor: '#00000000',
    maxWordsPerLine: 3,
  },
  Premium: {
    template: 'Premium',
    fontFamily: 'Cinzel',
    fontSize: 48,
    primaryColor: '#FFFBEB',
    activeWordColor: '#FFD43B',
    outlineColor: '#1C1917',
    outlineWidth: 3,
    shadowDepth: 3,
    positionYPercent: 79,
    animation: 'slide-up',
    backgroundBox: true,
    backgroundColor: '#111318E6',
    maxWordsPerLine: 5,
  },
};

export type MovieSource = string;

export interface ExpressionItem {
  id: string;
  expression: string;
  koreanMeaning: string;
  movie: MovieSource;
  selected: boolean;
  sourceFile?: string;
}

export type StoryFormat = 'dialogue' | 'narration';

export type ArtStyle = '2d' | 'clay' | 'watercolor' | 'live';

export interface SceneConfig {
  place: string;
  characters: string;
  situation: string;
  format: StoryFormat;
  style: ArtStyle;
}

export type BeatId = 'hook' | 'problem' | 'turn' | 'close';

export interface StoryboardBeat {
  id: BeatId;
  label: string;
  koreanLabel: string;
  timeRange: string;
  durationSec: number;
  sceneDescription: string;
  lines: string;
  expressionsUsed: string[];
  sourceMovies: string[];
}

export interface DialogueTurn {
  speaker: string;
  text: string;
}

export interface BeatAudioTurn {
  speaker: string;
  text: string;
  audioBase64: string;
  durationSec: number;
  voiceMode?: 'gemini-tts' | 'browser-tts';
}

export type MediaMode = 'veo' | 'slideshow' | 'canvas-slideshow';

export type BeatStatus = 'idle' | 'generating' | 'ready' | 'error';

export interface BeatMediaState {
  beatId: BeatId;
  status: BeatStatus;
  stageText: string;
  mode?: MediaMode;
  videoUrl?: string;
  imageDataUrl?: string;
  audioTurns: BeatAudioTurn[];
  errorMessage?: string;
}

export interface QuizQuestion {
  id: string;
  expression: string;
  movie: string;
  correctMeaning: string;
  options: string[];
  contextSentence: string;
}

export const SUGGESTED_MOVIES = ['Inside Out 2', 'Notting Hill', 'Minari'];

export function createEmptyExpressionRow(): ExpressionItem {
  return {
    id: `expr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    expression: '',
    koreanMeaning: '',
    movie: '',
    selected: true,
  };
}

export function createEmptyExpressionRows(count = 5): ExpressionItem[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `expr-init-${idx + 1}-${Math.random().toString(36).slice(2, 6)}`,
    expression: '',
    koreanMeaning: '',
    movie: '',
    selected: true,
  }));
}

export const ART_STYLE_LABELS: Record<ArtStyle, { label: string; desc: string }> = {
  '2d': {
    label: '2D 애니메이션',
    desc: '부드러운 선과 따뜻한 색감의 애니메이션',
  },
  clay: {
    label: '클레이 스톱모션',
    desc: '아기자기한 점토 질감의 스톱모션 느낌',
  },
  watercolor: {
    label: '수채화 일러스트',
    desc: '맑고 감성적인 손그림 수채화 분위기',
  },
  live: {
    label: '실사 영화풍',
    desc: '자연광이 살아있는 잔잔한 캠퍼스 단편영화 톤',
  },
};

export const BEAT_TEMPLATES: Array<{
  id: BeatId;
  label: string;
  koreanLabel: string;
  timeRange: string;
  durationSec: number;
}> = [
  { id: 'hook', label: 'Hook', koreanLabel: '도입', timeRange: '0-7s', durationSec: 7 },
  { id: 'problem', label: 'Problem', koreanLabel: '문제', timeRange: '7-15s', durationSec: 8 },
  { id: 'turn', label: 'Turn', koreanLabel: '전환', timeRange: '15-23s', durationSec: 8 },
  { id: 'close', label: 'Close', koreanLabel: '마무리', timeRange: '23-30s', durationSec: 7 },
];

/**
 * Strip phonetic symbols (e.g., /ʌpˈruːt/, [ˈnɪbl]) and "~" from expressions.
 */
export function sanitizeExpressionText(raw: string): string {
  return raw
    .replace(/\/[^/\n]{1,40}\//g, ' ')
    .replace(/\[[^\]]{1,40}\]/g, ' ')
    .replace(/~/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse lines into spoken turns, stripping optional "Name:" prefixes for word count & TTS.
 */
export function parseDialogueLines(
  lines: string,
  format: StoryFormat,
  defaultSpeaker = 'Narrator'
): DialogueTurn[] {
  const rawLines = lines
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (rawLines.length === 0) {
    return [];
  }

  if (format === 'narration') {
    const cleaned = rawLines
      .map((l) => l.replace(/^[A-Za-z][A-Za-z0-9\s.'-]{0,20}:\s*/, '').trim())
      .filter(Boolean)
      .join(' ');
    return cleaned ? [{ speaker: defaultSpeaker, text: cleaned }] : [];
  }

  return rawLines
    .map((line) => {
      const match = line.match(/^([A-Za-z][A-Za-z0-9\s.'-]{0,20}):\s*(.+)$/);
      if (match) {
        return {
          speaker: match[1].trim(),
          text: match[2].trim(),
        };
      }
      return {
        speaker: defaultSpeaker,
        text: line,
      };
    })
    .filter((t) => t.text.length > 0);
}

/**
 * Count spoken English words across beats in code (excluding speaker prefixes).
 */
export function countBeatWords(lines: string): number {
  const rawLines = lines
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let total = 0;
  for (const line of rawLines) {
    const withoutSpeaker = line.replace(/^[A-Za-z][A-Za-z0-9\s.'-]{0,20}:\s+/, '').trim();
    if (!withoutSpeaker) continue;
    const words = withoutSpeaker.split(/\s+/).filter(Boolean);
    total += words.length;
  }
  return total;
}

export function countTotalWords(beats: StoryboardBeat[]): number {
  return beats.reduce((sum, beat) => sum + countBeatWords(beat.lines), 0);
}

/**
 * Check exact presence of each selected expression in a single beat's lines.
 */
export function findBeatMatchedExpressions(
  lines: string,
  selectedExpressions: ExpressionItem[]
): ExpressionItem[] {
  return selectedExpressions.filter(
    (item) => item.expression.trim().length > 0 && lines.includes(item.expression.trim())
  );
}

/**
 * Check which selected expressions are missing across all 4 beats.
 */
export function findMissingExpressions(
  beats: StoryboardBeat[],
  selectedExpressions: ExpressionItem[]
): ExpressionItem[] {
  const combinedLines = beats.map((b) => b.lines).join('\n');
  return selectedExpressions.filter(
    (item) => item.expression.trim().length > 0 && !combinedLines.includes(item.expression.trim())
  );
}

/**
 * Split a subtitle string into max 2 lines, keeping one idea per line without altering words.
 */
export function formatSubtitleTwoLines(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (normalized.length <= 36) {
    return [normalized];
  }

  const mid = Math.floor(normalized.length / 2);
  let bestSplit = -1;
  let bestScore = Infinity;

  // Prefer splitting right after clause punctuation (, . ? ! ;)
  for (let i = 10; i < normalized.length - 8; i++) {
    const prev = normalized[i - 1];
    const curr = normalized[i];
    if (curr === ' ' && (prev === ',' || prev === '.' || prev === '?' || prev === '!' || prev === ';')) {
      const dist = Math.abs(i - mid);
      const score = dist * 0.4;
      if (score < bestScore) {
        bestScore = score;
        bestSplit = i;
      }
    }
  }

  // Otherwise split at a natural space near middle (prefer before conjunctions/prepositions)
  if (bestSplit === -1) {
    const breakWords = new Set(['and', 'but', 'so', 'or', 'if', 'when', 'while', 'because', 'to', 'for', 'that', 'with']);
    for (let i = 8; i < normalized.length - 8; i++) {
      if (normalized[i] === ' ') {
        const nextWord = normalized.slice(i + 1).split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
        const dist = Math.abs(i - mid);
        const bonus = breakWords.has(nextWord) ? -12 : 0;
        const score = dist + bonus;
        if (score < bestScore) {
          bestScore = score;
          bestSplit = i;
        }
      }
    }
  }

  if (bestSplit === -1) {
    return [normalized];
  }

  const line1 = normalized.slice(0, bestSplit).trim();
  const line2 = normalized.slice(bestSplit + 1).trim();
  if (!line1 || !line2) return [normalized];
  return [line1, line2];
}

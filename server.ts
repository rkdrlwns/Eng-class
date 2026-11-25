import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const hasGeminiApiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || 'missing-api-key',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface SelectedExpression {
  id: string;
  expression: string;
  koreanMeaning: string;
  movie: string;
}

interface SceneInput {
  place: string;
  characters: string;
  situation: string;
  format: 'dialogue' | 'narration';
  style: '2d' | 'clay' | 'watercolor' | 'live';
}

interface BeatInput {
  id: 'hook' | 'problem' | 'turn' | 'close';
  label: string;
  koreanLabel: string;
  timeRange: string;
  durationSec: number;
  sceneDescription: string;
  lines: string;
  expressionsUsed: string[];
  sourceMovies: string[];
}

const BEAT_META = [
  { id: 'hook' as const, label: 'Hook', koreanLabel: '도입', timeRange: '0-7s', durationSec: 7 },
  { id: 'problem' as const, label: 'Problem', koreanLabel: '문제', timeRange: '7-15s', durationSec: 8 },
  { id: 'turn' as const, label: 'Turn', koreanLabel: '전환', timeRange: '15-23s', durationSec: 8 },
  { id: 'close' as const, label: 'Close', koreanLabel: '마무리', timeRange: '23-30s', durationSec: 7 },
];

const ART_STYLE_PROMPTS: Record<SceneInput['style'], string> = {
  '2d': 'Warm modern 2D hand-drawn animation style, expressive clean line art, soft pastel daylight palette, gentle cinematic shading, Studio-inspired cozy university slice-of-life animation',
  clay: 'Charming handcrafted claymation stop-motion style, tactile matte polymer clay textures, soft miniature studio lighting, gentle depth of field',
  watercolor: 'Soft hand-painted watercolor illustration animation, delicate ink outlines, warm translucent washes on textured paper, calm sunlit atmosphere',
  live: 'Warm natural-light live-action short film cinematography, 35mm lens shallow depth of field, soft film color grading, calm everyday campus realism',
};

function countBeatWordsServer(lines: string): number {
  const rawLines = lines
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let total = 0;
  for (const line of rawLines) {
    const withoutSpeaker = line.replace(/^[A-Za-z][A-Za-z0-9\s.'-]{0,20}:\s+/, '').trim();
    if (!withoutSpeaker) continue;
    total += withoutSpeaker.split(/\s+/).filter(Boolean).length;
  }
  return total;
}

function countTotalWordsServer(beats: BeatInput[]): number {
  return beats.reduce((sum, b) => sum + countBeatWordsServer(b.lines), 0);
}

function findMissingExpressionsServer(
  beats: BeatInput[],
  selectedExpressions: SelectedExpression[]
): SelectedExpression[] {
  const combined = beats.map((b) => b.lines).join('\n');
  return selectedExpressions.filter(
    (item) => item.expression.trim().length > 0 && !combined.includes(item.expression.trim())
  );
}

function enrichBeats(
  rawBeats: Array<{ id?: string; sceneDescription?: string; lines?: string }>,
  selectedExpressions: SelectedExpression[]
): BeatInput[] {
  return BEAT_META.map((meta, idx) => {
    const found =
      rawBeats.find((b) => b.id === meta.id) ||
      rawBeats[idx] || {
        sceneDescription: 'Everyday campus scene with warm lighting.',
        lines: '',
      };

    const lines = String(found.lines ?? '').trim();
    const matched = selectedExpressions.filter(
      (e) => e.expression.trim().length > 0 && lines.includes(e.expression.trim())
    );
    const movies = Array.from(
      new Set(matched.map((m) => m.movie).filter((m) => m.length > 0))
    );

    return {
      id: meta.id,
      label: meta.label,
      koreanLabel: meta.koreanLabel,
      timeRange: meta.timeRange,
      durationSec: meta.durationSec,
      sceneDescription: String(found.sceneDescription ?? '').trim(),
      lines,
      expressionsUsed: matched.map((m) => m.expression),
      sourceMovies: movies,
    };
  });
}

function parseWavDurationSec(wavBuffer: Buffer): number {
  try {
    if (wavBuffer.length >= 44 && wavBuffer.toString('ascii', 0, 4) === 'RIFF') {
      const byteRate = wavBuffer.readUInt32LE(28);
      // Locate 'data' chunk
      let offset = 12;
      while (offset + 8 <= wavBuffer.length) {
        const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
        const chunkSize = wavBuffer.readUInt32LE(offset + 4);
        if (chunkId === 'data' && byteRate > 0) {
          return Math.max(0.5, chunkSize / byteRate);
        }
        offset += 8 + chunkSize;
      }
      if (byteRate > 0) {
        return Math.max(0.5, (wavBuffer.length - 44) / byteRate);
      }
    }
  } catch {
    // Fallback to 24kHz mono 16-bit calculation
  }
  return Math.max(0.5, Math.max(0, wavBuffer.length - 44) / (24000 * 2));
}

function getKoreanApiError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403')) {
    return {
      status: 403,
      message: 'Gemini API 키 권한이 없거나 유효하지 않습니다. Settings > Secrets에서 API 키를 확인해 주세요.',
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota')) {
    return {
      status: 429,
      message: '요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
  return {
    status: 500,
    message: `AI 처리 중 오류가 발생했습니다: ${msg}`,
  };
}

function parseJsonSafe<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = trimmed.match(/```json\s*([\s\S]*?)\s*```/) || trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) {
      try {
        return JSON.parse(match[1]) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

function extractEnglishSpeakerNames(charactersText: string): [string, string] {
  const matches = charactersText.match(/[A-Za-z][A-Za-z0-9'-]{1,14}/g) ?? [];
  const filtered = matches.filter((w) => w.length >= 2);
  if (filtered.length >= 2) {
    return [filtered[0], filtered[1]];
  }
  if (filtered.length === 1) {
    return [filtered[0], filtered[0] === 'Jun' ? 'Mina' : 'Jun'];
  }
  return ['Mina', 'Jun'];
}

function wrapExpressionInSentence(expr: string, beatIdx: number): string {
  const clean = expr.trim();
  const endsPunct = /[?!.]$/.test(clean);
  const startsUpper = /^[A-Z]/.test(clean);

  if (startsUpper) {
    if (endsPunct) {
      return `${clean} That thought stayed with me right away.`;
    }
    if (beatIdx === 0) return `${clean} — that is how my day started.`;
    if (beatIdx === 1) return `${clean} seemed harder than we expected.`;
    if (beatIdx === 2) return `${clean} became our turning point today.`;
    return `${clean} really helped us finish well.`;
  }

  if (endsPunct) {
    return `Honestly, ${clean}`;
  }
  if (beatIdx === 0) return `At first, things felt like ${clean} today.`;
  if (beatIdx === 1) return `Then we had to handle ${clean} together.`;
  if (beatIdx === 2) return `Still, keeping ${clean} in mind changed everything.`;
  return `In the end, ${clean} made us smile again.`;
}

function trimWordsFromPlainSentence(sentence: string, excess: number): string {
  const words = sentence.trim().split(/\s+/).filter(Boolean);
  if (words.length <= excess + 3) return '';
  return words.slice(0, words.length - excess).join(' ').replace(/[,;:-]+$/, '') + '.';
}

function buildFallbackStoryboard(
  expressions: SelectedExpression[],
  scene: SceneInput
): BeatInput[] {
  const [speakerA, speakerB] = extractEnglishSpeakerNames(scene.characters);
  const buckets: SelectedExpression[][] = [[], [], [], []];
  expressions.forEach((expr, idx) => {
    buckets[idx % 4].push(expr);
  });

  const sceneDescs = [
    `Wide warm shot at an everyday campus hangout, introducing the main character in soft daylight.`,
    `Medium shot showing a small tense moment over notebooks and warm drinks.`,
    `Close-up shot capturing a calm realization and encouraging eye contact.`,
    `Gentle closing shot as everyone relaxes and smiles together in warm sunlight.`,
  ];

  const beatLines = buckets.map((bucket, beatIdx) => {
    const sentences = bucket.map((item) => wrapExpressionInSentence(item.expression, beatIdx));
    if (scene.format === 'dialogue') {
      return sentences
        .map((s, sIdx) => `${sIdx % 2 === 0 ? speakerA : speakerB}: ${s}`)
        .join('\n');
    }
    return sentences.join(' ');
  });

  // Pad with natural conversational filler lines until total spoken words >= 60
  const fillerPool = [
    'Today felt busy from the very first class.',
    'Let us pause and take one calm breath together.',
    'Talking honestly always makes a hard moment much lighter.',
    'We learned something useful and felt ready for tomorrow.',
    'Even small progress counts when we keep moving forward.',
    'Everything felt clearer once we shared how we felt.',
  ];

  let beats = BEAT_META.map((meta, idx) => ({
    id: meta.id,
    sceneDescription: sceneDescs[idx],
    lines: beatLines[idx],
  }));

  let enriched = enrichBeats(beats, expressions);
  let wordCount = countTotalWordsServer(enriched);
  let fillerIdx = 0;

  while (wordCount < 60 && fillerIdx < 12) {
    // Add to the shortest beat
    let shortestIdx = 0;
    let minW = Infinity;
    enriched.forEach((b, i) => {
      const w = countBeatWordsServer(b.lines);
      if (w < minW) {
        minW = w;
        shortestIdx = i;
      }
    });
    const filler = fillerPool[fillerIdx % fillerPool.length];
    fillerIdx += 1;
    const prefix = scene.format === 'dialogue' ? `${fillerIdx % 2 === 0 ? speakerA : speakerB}: ` : '';
    beats[shortestIdx].lines = `${beats[shortestIdx].lines}\n${prefix}${filler}`.trim();
    enriched = enrichBeats(beats, expressions);
    wordCount = countTotalWordsServer(enriched);
  }

  // If still > 70, trim non-expression filler words safely
  let guard = 0;
  while (wordCount > 70 && guard < 10) {
    guard += 1;
    const excess = wordCount - 66;
    let trimmed = false;
    for (let i = 0; i < beats.length; i++) {
      const linesArr = beats[i].lines.split(/\r?\n/).filter(Boolean);
      const safeLineIdx = linesArr.findIndex(
        (line) => !expressions.some((e) => line.includes(e.expression))
      );
      if (safeLineIdx !== -1) {
        const line = linesArr[safeLineIdx];
        const speakerMatch = line.match(/^([A-Za-z][A-Za-z0-9\s.'-]{0,20}:\s*)(.+)$/);
        const body = speakerMatch ? speakerMatch[2] : line;
        const shortened = trimWordsFromPlainSentence(body, excess);
        if (!shortened) {
          linesArr.splice(safeLineIdx, 1);
        } else {
          linesArr[safeLineIdx] = `${speakerMatch ? speakerMatch[1] : ''}${shortened}`;
        }
        beats[i].lines = linesArr.join('\n');
        trimmed = true;
        break;
      }
    }
    if (!trimmed) break;
    enriched = enrichBeats(beats, expressions);
    wordCount = countTotalWordsServer(enriched);
  }

  return enriched;
}

function buildFallbackCharacterSheet(scene: SceneInput): string {
  const styleDesc = ART_STYLE_PROMPTS[scene.style];
  return `${styleDesc}. Original everyday university students (${scene.characters}) in ${scene.place}. Character 1 wears a soft cream knit cardigan over a white t-shirt and navy slacks, warm friendly expression, neat dark hair. Character 2 (if dialogue) wears a muted sage overshirt over a light shirt and charcoal trousers. Soft natural daylight, consistent calm pastel-neutral palette, no logos, no text, family-friendly.`;
}

function buildFallbackTitle(scene: SceneInput): string {
  const combined = `${scene.place} ${scene.situation}`.toLowerCase();
  if (combined.includes('카페') || combined.includes('커피') || combined.includes('cafe')) {
    return 'A Quiet Cafe Moment';
  }
  if (combined.includes('도서관') || combined.includes('library')) {
    return 'Study Table Talks';
  }
  if (combined.includes('알바') || combined.includes('편의점')) {
    return 'Warm Shift Smile';
  }
  if (combined.includes('공원') || combined.includes('강아지') || combined.includes('산책')) {
    return 'Afternoon Park Walk';
  }
  if (combined.includes('여행') || combined.includes('기차') || combined.includes('trip')) {
    return 'Before We Depart';
  }
  if (combined.includes('발표') || combined.includes('시험') || combined.includes('팀플')) {
    return 'Before the Presentation';
  }
  return 'Everyday Movie English';
}

function estimateSpeechDurationSec(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1.4, Math.min(7.2, Number((words * 0.43 + 0.45).toFixed(2))));
}

const app = express();
app.use(express.json({ limit: '50mb' }));

// 1. Generate 4-beat storyboard with automatic up-to-2x rewrite verification
app.post('/api/generate-storyboard', async (req, res) => {
  try {
    const rawExpressions = req.body?.expressions as SelectedExpression[] | undefined;
    const scene = req.body?.scene as SceneInput | undefined;

    const expressions: SelectedExpression[] = Array.isArray(rawExpressions)
      ? rawExpressions
          .map((e) => ({
            id: String(e?.id ?? ''),
            expression: String(e?.expression ?? '').trim(),
            koreanMeaning: String(e?.koreanMeaning ?? '').trim(),
            movie: String(e?.movie ?? '').trim(),
          }))
          .filter((e) => e.expression.length > 0)
      : [];

    if (expressions.length < 5) {
      res.status(400).json({ error: '최소 5개 이상의 영어 표현을 입력해 주세요.' });
      return;
    }
    const uniqueMovies = new Set(expressions.map((e) => e.movie.toLowerCase()).filter(Boolean));
    if (uniqueMovies.size < 2) {
      res.status(400).json({ error: '2개 이상의 서로 다른 영화에서 표현을 입력해 주세요.' });
      return;
    }
    if (!scene || !scene.place || !scene.characters || !scene.situation) {
      res.status(400).json({ error: '장소, 등장인물, 상황을 모두 입력해 주세요.' });
      return;
    }

    const expressionListText = expressions
      .map((e, i) => `${i + 1}. "${e.expression}" (뜻: ${e.koreanMeaning || '없음'}, 영화: ${e.movie || '미지정'})`)
      .join('\n');

    const formatGuide =
      scene.format === 'dialogue'
        ? `Format: Two-person natural everyday dialogue using two original character first names (based on "${scene.characters}"). In each beat's "lines", write 1 or 2 short turns formatted strictly as "Name: sentence" separated by a newline.`
        : `Format: One-person narration (first-person "I" perspective). Do NOT include any "Name:" speaker prefix in "lines".`;

    const basePrompt = [
      'Write a fresh, original, family-friendly 30-second English short-film storyboard for Korean university students.',
      `Setting / Place: ${scene.place}`,
      `Original Characters: ${scene.characters}`,
      `Everyday Situation: ${scene.situation}`,
      formatGuide,
      `Visual Style: ${ART_STYLE_PROMPTS[scene.style]}`,
      '',
      'Selected English expressions (MUST use EVERY single expression below EXACTLY as typed, same spelling and capitalization):',
      expressionListText,
      '',
      'CRITICAL RULES:',
      '1. Split the 30 seconds into exactly 4 beats: "hook" (0-7s), "problem" (7-15s), "turn" (15-23s), "close" (23-30s).',
      '2. Put 1 to 2 of the selected expressions naturally in EACH beat, so ALL selected expressions appear across the 4 beats.',
      '3. NEVER copy any movie dialogue, movie plot, movie characters (including Inside Out emotions), celebrities, real people, or brand logos.',
      '4. TOTAL SPOKEN WORD COUNT across all 4 beats MUST be strictly between 60 and 70 words (about 15 to 18 spoken words per beat). Speaker name prefixes like "Mina:" do NOT count toward spoken words.',
      '5. Keep each beat natural, conversational, and easy to read aloud in 7-8 seconds.',
      '6. sceneDescription must be in English, describing visual action only (no text or speech instructions).',
      '7. Also provide a short, catchy English title (2 to 5 words) in "title" suitable for a thumbnail.',
    ].join('\n');

    const schema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        beats: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              sceneDescription: { type: Type.STRING },
              lines: { type: Type.STRING },
            },
            required: ['id', 'sceneDescription', 'lines'],
          },
        },
      },
      required: ['title', 'beats'],
    };

    let beats: BeatInput[];
    let title = buildFallbackTitle(scene);
    let wordCount = 0;
    let missing: SelectedExpression[] = [];
    let rewriteAttempts = 0;
    let warning: string | null = null;

    try {
      if (!hasGeminiApiKey) {
        throw new Error('NO_API_KEY');
      }

      const callModel = async (prompt: string): Promise<{ beats: BeatInput[]; title?: string }> => {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        });
        const parsed = parseJsonSafe<{
          title?: string;
          beats?: Array<{ id?: string; sceneDescription?: string; lines?: string }>;
        }>(response.text, { beats: [] });
        return {
          title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : undefined,
          beats: enrichBeats(parsed.beats ?? [], expressions),
        };
      };

      const initialResult = await callModel(basePrompt);
      beats = initialResult.beats;
      if (initialResult.title) title = initialResult.title;
      wordCount = countTotalWordsServer(beats);
      missing = findMissingExpressionsServer(beats, expressions);
      let hasEmptyBeat = beats.some((b) => b.expressionsUsed.length === 0);

      while ((wordCount < 60 || wordCount > 70 || missing.length > 0 || hasEmptyBeat) && rewriteAttempts < 2) {
        rewriteAttempts += 1;
        const issues: string[] = [];
        if (wordCount < 60) {
          issues.push(`Current total spoken word count is ${wordCount}, which is TOO SHORT. Add ${65 - wordCount} more natural English words so total is strictly 60-70 words.`);
        } else if (wordCount > 70) {
          issues.push(`Current total spoken word count is ${wordCount}, which is TOO LONG. Trim ${wordCount - 65} words so total is strictly 60-70 words.`);
        }
        if (missing.length > 0) {
          issues.push(`These exact expressions are MISSING and MUST be included verbatim: ${missing.map((m) => `"${m.expression}"`).join(', ')}`);
        }
        if (hasEmptyBeat) {
          issues.push('Every single beat (hook, problem, turn, close) must contain at least 1 selected expression verbatim.');
        }

        const rewritePrompt = [
          basePrompt,
          '',
          'PREVIOUS DRAFT TO FIX:',
          JSON.stringify(beats.map((b) => ({ id: b.id, sceneDescription: b.sceneDescription, lines: b.lines }))),
          '',
          'VALIDATION ISSUES TO FIX NOW:',
          ...issues,
          'Remember: count spoken words carefully (excluding "Name:" labels) so total across all 4 beats is strictly 60-70 words.',
        ].join('\n');

        const rewrittenResult = await callModel(rewritePrompt);
        beats = rewrittenResult.beats;
        if (rewrittenResult.title) title = rewrittenResult.title;
        wordCount = countTotalWordsServer(beats);
        missing = findMissingExpressionsServer(beats, expressions);
        hasEmptyBeat = beats.some((b) => b.expressionsUsed.length === 0);
      }

      if (wordCount < 60 || wordCount > 70 || missing.length > 0) {
        const parts: string[] = [];
        if (wordCount < 60 || wordCount > 70) {
          parts.push(`현재 총 단어 수가 ${wordCount}단어입니다 (권장 60~70단어).`);
        }
        if (missing.length > 0) {
          parts.push(`누락된 표현: ${missing.map((m) => m.expression).join(', ')}`);
        }
        warning = `자동 재작성 ${rewriteAttempts}회 후에도 일부 조건이 맞지 않습니다. 대사를 직접 조금 다듬어 주세요. (${parts.join(' / ')})`;
      }
    } catch (aiErr) {
      console.warn('generate-storyboard fallback activated:', aiErr instanceof Error ? aiErr.message : aiErr);
      beats = buildFallbackStoryboard(expressions, scene);
      title = buildFallbackTitle(scene);
      wordCount = countTotalWordsServer(beats);
      missing = findMissingExpressionsServer(beats, expressions);
      warning = 'API 연결 없이 기본 대본 생성 모드로 스토리보드를 만들었습니다. 필요하면 대사를 직접 수정해 주세요.';
    }

    res.json({
      title,
      beats,
      wordCount,
      missingExpressions: missing.map((m) => m.expression),
      rewriteAttempts,
      warning,
    });
  } catch (err) {
    console.error('generate-storyboard error:', err);
    const { status, message } = getKoreanApiError(err);
    res.status(status).json({ error: message });
  }
});

// 3. Regenerate a single beat
app.post('/api/regenerate-beat', async (req, res) => {
  try {
    const beatIndex = Number(req.body?.beatIndex);
    const beats = req.body?.beats as BeatInput[] | undefined;
    const rawExpressions = req.body?.expressions as SelectedExpression[] | undefined;
    const scene = req.body?.scene as SceneInput | undefined;

    if (!Number.isInteger(beatIndex) || beatIndex < 0 || beatIndex > 3 || !Array.isArray(beats) || beats.length !== 4) {
      res.status(400).json({ error: '유효하지 않은 비트 요청입니다.' });
      return;
    }
    if (!Array.isArray(rawExpressions) || !scene) {
      res.status(400).json({ error: '표현 또는 장면 정보가 누락되었습니다.' });
      return;
    }

    const expressions: SelectedExpression[] = rawExpressions
      .map((e) => ({
        id: String(e?.id ?? ''),
        expression: String(e?.expression ?? '').trim(),
        koreanMeaning: String(e?.koreanMeaning ?? '').trim(),
        movie: String(e?.movie ?? '').trim(),
      }))
      .filter((e) => e.expression.length > 0);

    const targetBeat = beats[beatIndex];
    const otherBeats = beats.filter((_, idx) => idx !== beatIndex);
    const otherWords = otherBeats.reduce((sum, b) => sum + countBeatWordsServer(b.lines), 0);
    const targetMin = Math.max(10, 60 - otherWords);
    const targetMax = Math.max(targetMin + 4, Math.min(25, 70 - otherWords));

    const usedInOthers = new Set<string>();
    for (const b of otherBeats) {
      for (const expr of expressions) {
        if (b.lines.includes(expr.expression)) {
          usedInOthers.add(expr.expression);
        }
      }
    }
    const mustInclude = expressions.filter((e) => !usedInOthers.has(e.expression));
    const preferred = mustInclude.length > 0 ? mustInclude : expressions.filter((e) => targetBeat.lines.includes(e.expression));

    const prompt = [
      `Rewrite ONLY beat "${targetBeat.id}" (${targetBeat.timeRange}, ${targetBeat.label}) of a 30-second original English story.`,
      `Setting: ${scene.place}`,
      `Characters: ${scene.characters}`,
      `Situation: ${scene.situation}`,
      scene.format === 'dialogue'
        ? 'Format: Two-person dialogue. Write 1-2 short turns formatted as "Name: spoken line" separated by newline.'
        : 'Format: One-person narration. No "Name:" prefix.',
      '',
      'Other beats context (DO NOT repeat or overwrite these):',
      ...otherBeats.map((b) => `- ${b.id} (${b.timeRange}): ${b.lines}`),
      '',
      `Previous version of ${targetBeat.id}: ${targetBeat.lines}`,
      preferred.length > 0
        ? `MUST include these exact expressions verbatim: ${preferred.map((e) => `"${e.expression}"`).join(', ')}`
        : `Include 1-2 of these exact expressions verbatim: ${expressions.map((e) => `"${e.expression}"`).join(', ')}`,
      `Target spoken word count for THIS beat ONLY: between ${targetMin} and ${targetMax} words (excluding "Name:" labels).`,
      'No movie characters, no real people, no brand logos.',
    ].join('\n');

    let parsed: { sceneDescription?: string; lines?: string } = {};
    try {
      if (!hasGeminiApiKey) {
        throw new Error('NO_API_KEY');
      }
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sceneDescription: { type: Type.STRING },
              lines: { type: Type.STRING },
            },
            required: ['sceneDescription', 'lines'],
          },
        },
      });
      parsed = parseJsonSafe<{ sceneDescription?: string; lines?: string }>(response.text, {});
    } catch (aiErr) {
      console.warn('regenerate-beat fallback activated:', aiErr instanceof Error ? aiErr.message : aiErr);
      const fallbackBeats = buildFallbackStoryboard(expressions, scene);
      parsed = {
        sceneDescription: fallbackBeats[beatIndex]?.sceneDescription || targetBeat.sceneDescription,
        lines: fallbackBeats[beatIndex]?.lines || targetBeat.lines,
      };
    }

    const updatedRaw = beats.map((b, idx) =>
      idx === beatIndex
        ? {
            id: b.id,
            sceneDescription: parsed.sceneDescription || b.sceneDescription,
            lines: parsed.lines || b.lines,
          }
        : {
            id: b.id,
            sceneDescription: b.sceneDescription,
            lines: b.lines,
          }
    );
    const enriched = enrichBeats(updatedRaw, expressions);

    res.json({
      beat: enriched[beatIndex],
      wordCount: countTotalWordsServer(enriched),
      missingExpressions: findMissingExpressionsServer(enriched, expressions).map((m) => m.expression),
    });
  } catch (err) {
    console.error('regenerate-beat error:', err);
    const { status, message } = getKoreanApiError(err);
    res.status(status).json({ error: message });
  }
});

// 4. Generate consistent Character Sheet for all 4 beats (with offline fallback)
app.post('/api/generate-character-sheet', async (req, res) => {
  try {
    const scene = req.body?.scene as SceneInput | undefined;
    const beats = req.body?.beats as BeatInput[] | undefined;

    if (!scene || !Array.isArray(beats)) {
      res.status(400).json({ error: '장면 및 스토리보드 정보가 필요합니다.' });
      return;
    }

    const prompt = [
      'Create a concise, ultra-consistent English visual "Character Sheet" for a 30-second animated short film.',
      `Place: ${scene.place}`,
      `Requested characters: ${scene.characters}`,
      `Format: ${scene.format}`,
      `Art style: ${ART_STYLE_PROMPTS[scene.style]}`,
      `Story summary:\n${beats.map((b) => `- ${b.label}: ${b.sceneDescription}`).join('\n')}`,
      '',
      'Rules:',
      '- Original everyday young adults / Korean university students only. NO real people, NO celebrities, NO movie characters, NO brand logos.',
      '- Specify exact character names, age look, hairstyle & hair color, facial vibe, exact outfit pieces and exact colors (e.g., "cream knit cardigan over white tee, dark navy slacks, round silver glasses"), and consistent color palette + background environment details.',
      '- Write as one clear, reusable visual prompt block (~80-120 words) so every beat keeps the exact same character looks, outfits, colors, and art style.',
    ].join('\n');

    let characterSheet = '';
    let fallback = false;
    try {
      if (!hasGeminiApiKey) {
        throw new Error('NO_API_KEY');
      }
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      characterSheet = (response.text ?? '').trim();
    } catch (aiErr) {
      console.warn('generate-character-sheet fallback activated:', aiErr instanceof Error ? aiErr.message : aiErr);
    }

    if (!characterSheet) {
      characterSheet = buildFallbackCharacterSheet(scene);
      fallback = true;
    }

    res.json({ characterSheet, fallback });
  } catch (err) {
    console.error('generate-character-sheet error:', err);
    const { status, message } = getKoreanApiError(err);
    res.status(status).json({ error: message });
  }
});

// 5. Generate Beat Media (Veo / Omni Flash first -> Image Slideshow fallback -> Canvas Slideshow fallback)
app.post('/api/generate-beat-media', async (req, res) => {
  const beat = req.body?.beat as BeatInput | undefined;
  const characterSheet = String(req.body?.characterSheet ?? '').trim();
  const scene = req.body?.scene as SceneInput | undefined;

  if (!beat || !scene || !characterSheet) {
    res.status(400).json({ error: '비트 정보, 장면 설정, 캐릭터 시트가 필요합니다.' });
    return;
  }

  const styleDesc = ART_STYLE_PROMPTS[scene.style];
  const videoPrompt = [
    `Art Style: ${styleDesc}.`,
    `Character Sheet (keep 100% consistent): ${characterSheet}`,
    `Setting: ${scene.place}.`,
    `Beat (${beat.timeRange} ${beat.label}): ${beat.sceneDescription}`,
    'STRICT VISUAL CONSTRAINTS: Silent visual animation only. NO speech, NO talking lips sync needed, NO text, NO letters, NO subtitles, NO speech bubbles, NO watermarks, NO brand logos, NO music in the picture. Family-friendly original characters.',
  ].join('\n');

  // Attempt 1 & 2 only if GEMINI_API_KEY is configured
  let veoErrorMsg = '';
  let imageErrorMsg = '';
  if (hasGeminiApiKey) {
    try {
      const interaction = await ai.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input: videoPrompt,
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: '9:16',
            duration: '8s',
            resolution: '720p',
          },
        },
        { timeout: 180000 }
      );

      const videoPart = interaction.output_video;
      if (videoPart?.data) {
        const mime = videoPart.mime_type || 'video/mp4';
        res.json({
          mode: 'veo',
          videoUrl: `data:${mime};base64,${videoPart.data}`,
        });
        return;
      }
      if (videoPart?.uri) {
        const videoResp = await fetch(videoPart.uri, {
          headers: process.env.GEMINI_API_KEY
            ? { 'x-goog-api-key': process.env.GEMINI_API_KEY }
            : undefined,
        });
        if (videoResp.ok) {
          const arrBuf = await videoResp.arrayBuffer();
          const b64 = Buffer.from(arrBuf).toString('base64');
          const mime = videoPart.mime_type || 'video/mp4';
          res.json({
            mode: 'veo',
            videoUrl: `data:${mime};base64,${b64}`,
          });
          return;
        }
      }
      veoErrorMsg = 'Veo 응답에 영상 데이터가 포함되지 않았습니다.';
    } catch (err) {
      veoErrorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[Beat ${beat.id}] Veo unavailable, falling back to image slideshow:`, veoErrorMsg);
    }

    try {
      const imagePrompt = [
        `Art Style: ${styleDesc}.`,
        `Character Sheet (keep 100% consistent): ${characterSheet}`,
        `Setting: ${scene.place}.`,
        `Scene Moment (${beat.label}): ${beat.sceneDescription}`,
        'Vertical 9:16 composition, cinematic framing, NO text, NO letters, NO speech bubbles, NO watermarks, NO logos, family-friendly.',
      ].join('\n');

      const imgResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: {
          parts: [{ text: imagePrompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: '9:16',
          },
        },
      });

      for (const part of imgResponse.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          res.json({
            mode: 'slideshow',
            imageDataUrl: `data:${mime};base64,${part.inlineData.data}`,
            fallbackReason: `Veo 영상 생성을 사용할 수 없어 AI 일러스트 슬라이드쇼 모드로 전환했습니다.`,
          });
          return;
        }
      }
      imageErrorMsg = '이미지 응답에 데이터가 없습니다.';
    } catch (err) {
      imageErrorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[Beat ${beat.id}] Image generation fallback unavailable:`, imageErrorMsg);
    }
  }

  // Attempt 3: Return canvas-slideshow mode cleanly without API error
  res.json({
    mode: 'canvas-slideshow',
    imageDataUrl: null,
    fallbackReason:
      '유료 영상/이미지 API 없이도 작동하도록 화풍 맞춤 캔버스 슬라이드쇼 모드로 자동 전환했습니다.',
    detail: veoErrorMsg || imageErrorMsg || 'NO_API_KEY',
  });
});

// 6. Generate Beat English Voice via Gemini TTS (with browser Web Speech fallback if API unavailable)
app.post('/api/generate-beat-audio', async (req, res) => {
  try {
    const beat = req.body?.beat as BeatInput | undefined;
    const format = req.body?.format as 'dialogue' | 'narration' | undefined;

    if (!beat || !beat.lines) {
      res.status(400).json({ error: '음성을 생성할 대사가 없습니다.' });
      return;
    }

    const rawLines = beat.lines
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const turnsToSynthesize: Array<{ speaker: string; text: string }> = [];
    if (format === 'narration') {
      const text = rawLines
        .map((l) => l.replace(/^[A-Za-z][A-Za-z0-9\s.'-]{0,20}:\s*/, '').trim())
        .filter(Boolean)
        .join(' ');
      if (text) {
        turnsToSynthesize.push({ speaker: 'Narrator', text });
      }
    } else {
      for (const line of rawLines) {
        const match = line.match(/^([A-Za-z][A-Za-z0-9\s.'-]{0,20}):\s*(.+)$/);
        if (match) {
          turnsToSynthesize.push({ speaker: match[1].trim(), text: match[2].trim() });
        } else {
          turnsToSynthesize.push({ speaker: 'Speaker 1', text: line });
        }
      }
    }

    if (turnsToSynthesize.length === 0) {
      res.status(400).json({ error: '음성을 생성할 영어 문장이 비어 있습니다.' });
      return;
    }

    // Assign a distinct voice per speaker across the beat
    const speakerVoiceMap = new Map<string, string>();
    const voicePool = ['Kore', 'Puck', 'Zephyr', 'Charon'];
    const providedSpeakers: string[] = Array.isArray(req.body?.speakerOrder)
      ? req.body.speakerOrder.map(String)
      : [];

    providedSpeakers.forEach((sp, idx) => {
      if (sp && !speakerVoiceMap.has(sp)) {
        speakerVoiceMap.set(sp, voicePool[idx % voicePool.length]);
      }
    });

    const audioTurns: Array<{
      speaker: string;
      text: string;
      audioBase64: string;
      durationSec: number;
      voiceMode: 'gemini-tts' | 'browser-tts';
    }> = [];

    for (const turn of turnsToSynthesize) {
      if (!speakerVoiceMap.has(turn.speaker)) {
        speakerVoiceMap.set(turn.speaker, voicePool[speakerVoiceMap.size % voicePool.length]);
      }
      const voiceName = speakerVoiceMap.get(turn.speaker) || 'Kore';

      try {
        if (!hasGeminiApiKey) {
          throw new Error('NO_API_KEY');
        }
        const ttsResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: turn.text,
                  speechMetadata: {
                    style: 'Clear, natural, warm everyday English spoken at a learner-friendly pace',
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        });

        const base64Audio =
          ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

        if (!base64Audio) {
          throw new Error(`EMPTY_TTS_AUDIO`);
        }

        const wavBuf = Buffer.from(base64Audio, 'base64');
        const durationSec = parseWavDurationSec(wavBuf);

        audioTurns.push({
          speaker: turn.speaker,
          text: turn.text,
          audioBase64: base64Audio,
          durationSec,
          voiceMode: 'gemini-tts',
        });
      } catch (ttsErr) {
        console.warn(
          `[Beat ${beat.id}] Gemini TTS unavailable (${turn.speaker}), falling back to browser TTS:`,
          ttsErr instanceof Error ? ttsErr.message : ttsErr
        );
        audioTurns.push({
          speaker: turn.speaker,
          text: turn.text,
          audioBase64: '',
          durationSec: estimateSpeechDurationSec(turn.text),
          voiceMode: 'browser-tts',
        });
      }
    }

    res.json({ turns: audioTurns });
  } catch (err) {
    console.error('generate-beat-audio error:', err);
    const { status, message } = getKoreanApiError(err);
    res.status(status).json({ error: message });
  }
});

// 7. Generate Korean meaning quiz for the expressions used in the 30s video
const FALLBACK_MEANING_DICT: Record<string, string> = {
  'get ahead of myself': '너무 앞서 나가다, 성급하게 굴다',
  'freak out': '패닉에 빠지다, 몹시 당황하다',
  'worst-case': '최악의 상황',
  forgive: '용서하다',
  'no worries': '걱정 마세요, 괜찮아요',
  "let's move on": '넘어가자, 계속 나아가자',
  'look up to': '~를 존경하다',
  'off to a rough start': '시작이 순탄치 않다',
  'get it together': '정신을 차리다, 마음을 다잡다',
  'act casual': '태연한 척하다',
  'stay in one place': '한 곳에 가만히 있다',
  'laying it on a bit thick': '조금 과장해서 말하다',
  'on the other hand': '반면에',
  'surreal but nice': '비현실적이지만 좋다',
  'just over the street': '길 건너 바로 앞',
  'get cleaned up': '깔끔하게 씻고 정돈하다',
  'spick and span': '깨끗하고 말끔한',
  'low point': '최악의 순간',
  nevertheless: '그럼에도 불구하고',
  'no excuse for': '~는 변명의 여지가 없다',
  'in comparison to': '~와 비교해서',
  'change my mind': '마음을 바꾸다',
  'vicious circle': '악순환',
  'kill two birds with one stone': '일석이조',
  'give away': '드러내다, 폭로하다',
  'see through': '~의 본질을 꿰뚫어보다',
  'deal with': '~을 처리하다, 다루다',
  'to make things worse': '설상가상으로',
  'sort it out': '해결하다, 정리하다',
  'turn down': '거절하다',
  uproot: '뿌리째 뽑다, 터전을 떠나게 하다',
  'scrape by': '근근이 살아가다',
  venture: '(모험적인) 사업, 벤처',
  adversity: '역경, 고난',
  livelihood: '생계 (수단)',
  assimilate: '동화되다, 적응해 섞이다',
  perseverance: '인내, 끈기',
  bittersweet: '씁쓸하면서도 달콤한',
  'hear me out': '제 얘기 좀 들어봐요',
  'think about the long run': '장기적으로 생각해 봐요',
  "i see where you're coming from": '무슨 말인지 알겠지만',
  "what if it doesn't work out?": '잘 안 되면 어떡하죠?',
  "let's meet halfway": '서로 한 발씩 양보해요',
  'fair enough': '일리 있네요',
};

const DISTRACTOR_POOL = [
  '서로를 오해하고 멀어지다',
  '예상보다 훨씬 일찍 끝내다',
  '아무 말 없이 자리를 떠나다',
  '작은 실수를 크게 부풀리다',
  '잠시 멈추고 숨을 고르다',
  '새로운 취미를 함께 시작하다',
  '중요한 약속을 깜빡 잊다',
  '기대 이상으로 순조롭게 풀리다',
  '변명을 늘어놓으며 책임을 피하다',
  '우연히 오래된 친구를 마주치다',
  '끝까지 포기하지 않고 버티다',
  '마음을 비우고 편하게 받아들이다',
];

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function findContextSentenceForExpr(beats: BeatInput[], expression: string): string {
  for (const beat of beats) {
    const lines = beat.lines.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.includes(expression)) {
        return line.replace(/^[A-Za-z][A-Za-z0-9\s.'-]{0,20}:\s*/, '').trim();
      }
    }
  }
  return '';
}

function buildFallbackQuizQuestions(
  expressions: SelectedExpression[],
  beats: BeatInput[]
) {
  const allProvidedMeanings = expressions
    .map((e) => e.koreanMeaning.trim() || FALLBACK_MEANING_DICT[e.expression.toLowerCase()] || '')
    .filter(Boolean);

  return expressions.map((item, idx) => {
    const correctMeaning =
      item.koreanMeaning.trim() ||
      FALLBACK_MEANING_DICT[item.expression.toLowerCase()] ||
      `"${item.expression}"의 자연스러운 문맥 의미`;

    const candidateDistractors = shuffleArray(
      Array.from(new Set([...allProvidedMeanings, ...DISTRACTOR_POOL])).filter(
        (m) => m !== correctMeaning
      )
    ).slice(0, 3);

    return {
      id: item.id || `quiz-${idx + 1}`,
      expression: item.expression,
      movie: item.movie || '직접 입력',
      correctMeaning,
      options: shuffleArray([correctMeaning, ...candidateDistractors]),
      contextSentence: findContextSentenceForExpr(beats, item.expression),
    };
  });
}

app.post('/api/generate-quiz', async (req, res) => {
  try {
    const rawExpressions = req.body?.expressions as SelectedExpression[] | undefined;
    const beats = (Array.isArray(req.body?.beats) ? req.body.beats : []) as BeatInput[];

    const expressions: SelectedExpression[] = Array.isArray(rawExpressions)
      ? rawExpressions
          .map((e) => ({
            id: String(e?.id ?? ''),
            expression: String(e?.expression ?? '').trim(),
            koreanMeaning: String(e?.koreanMeaning ?? '').trim(),
            movie: String(e?.movie ?? '').trim(),
          }))
          .filter((e) => e.expression.length > 0)
      : [];

    if (expressions.length === 0) {
      res.status(400).json({ error: '퀴즈를 만들 영어 표현이 없습니다.' });
      return;
    }

    try {
      if (!hasGeminiApiKey) {
        throw new Error('NO_API_KEY');
      }

      const exprSummary = expressions
        .map((e, i) => {
          const ctx = findContextSentenceForExpr(beats, e.expression);
          return `${i + 1}. id="${e.id}", expression="${e.expression}", userMeaning="${e.koreanMeaning || '(empty)'}", context="${ctx}"`;
        })
        .join('\n');

      const prompt = [
        'Create a Korean meaning multiple-choice quiz for Korean university English learners based on the expressions they just used in their 30-second video.',
        'For EACH expression below:',
        '- If userMeaning is provided, keep it as correctMeaning (or polish slightly only if needed while preserving the exact meaning). If userMeaning is empty, provide the natural accurate Korean meaning for the expression in its context.',
        '- Provide exactly 3 plausible but clearly WRONG Korean distractors (wrongMeanings) of similar length and tone.',
        '',
        'Expressions:',
        exprSummary,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    expression: { type: Type.STRING },
                    correctMeaning: { type: Type.STRING },
                    wrongMeanings: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ['expression', 'correctMeaning', 'wrongMeanings'],
                },
              },
            },
            required: ['items'],
          },
        },
      });

      const parsed = parseJsonSafe<{
        items?: Array<{
          expression?: string;
          correctMeaning?: string;
          wrongMeanings?: string[];
        }>;
      }>(response.text, {});

      if (!parsed.items || parsed.items.length === 0) {
        throw new Error('EMPTY_QUIZ');
      }

      const questions = expressions.map((expr, idx) => {
        const found =
          parsed.items?.find(
            (q) => q.expression?.trim().toLowerCase() === expr.expression.toLowerCase()
          ) || parsed.items?.[idx];

        const correctMeaning =
          expr.koreanMeaning.trim() ||
          found?.correctMeaning?.trim() ||
          FALLBACK_MEANING_DICT[expr.expression.toLowerCase()] ||
          `"${expr.expression}"의 의미`;

        const wrongs = (found?.wrongMeanings ?? [])
          .map((w) => w.trim())
          .filter((w) => w && w !== correctMeaning);

        while (wrongs.length < 3) {
          const extra = DISTRACTOR_POOL.find((d) => d !== correctMeaning && !wrongs.includes(d));
          if (!extra) break;
          wrongs.push(extra);
        }

        return {
          id: expr.id || `quiz-${idx + 1}`,
          expression: expr.expression,
          movie: expr.movie || '직접 입력',
          correctMeaning,
          options: shuffleArray([correctMeaning, ...wrongs.slice(0, 3)]),
          contextSentence: findContextSentenceForExpr(beats, expr.expression),
        };
      });

      res.json({ questions });
    } catch (aiErr) {
      console.warn('generate-quiz fallback activated:', aiErr instanceof Error ? aiErr.message : aiErr);
      res.json({ questions: buildFallbackQuizQuestions(expressions, beats) });
    }
  } catch (err) {
    console.error('generate-quiz error:', err);
    const { status, message } = getKoreanApiError(err);
    res.status(status).json({ error: message });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`[ESL] server running on http://0.0.0.0:${port}`);
  });
}

startServer();

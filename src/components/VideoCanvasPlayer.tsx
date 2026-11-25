import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Download, Loader2, Volume2, Music } from 'lucide-react';
import {
  ArtStyle,
  BeatMediaState,
  SceneConfig,
  StoryboardBeat,
  formatSubtitleTwoLines,
} from '../types';

interface VideoCanvasPlayerProps {
  beats: StoryboardBeat[];
  mediaStates: BeatMediaState[];
  scene: SceneConfig;
  videoTitle?: string;
  showCreditsAtEnd?: boolean;
  enableDownload?: boolean;
}

const CANVAS_W = 720;
const CANVAS_H = 1280;
const TOTAL_DURATION = 30;

interface TurnTiming {
  speaker: string;
  text: string;
  startLocal: number;
  endLocal: number;
  audioBase64: string;
}

function getBeatTimings(beats: StoryboardBeat[], mediaStates: BeatMediaState[]) {
  let cursor = 0;
  return beats.map((beat, idx) => {
    const start = cursor;
    const end = cursor + beat.durationSec;
    cursor = end;

    const media = mediaStates[idx];
    const turns = media?.audioTurns ?? [];
    const totalAudioDur = turns.reduce((s, t) => s + t.durationSec, 0);

    // Map turns neatly inside the beat duration so subtitles match the voice word-for-word
    const turnTimings: TurnTiming[] = [];
    if (turns.length > 0) {
      const scale =
        totalAudioDur > beat.durationSec - 0.15 && totalAudioDur > 0
          ? (beat.durationSec - 0.15) / totalAudioDur
          : 1;
      let tCursor = 0.1;
      for (const turn of turns) {
        const dur = turn.durationSec * scale;
        turnTimings.push({
          speaker: turn.speaker,
          text: turn.text,
          startLocal: tCursor,
          endLocal: Math.min(beat.durationSec, tCursor + dur),
          audioBase64: turn.audioBase64,
        });
        tCursor += dur + 0.08;
      }
    }

    return {
      beat,
      media,
      start,
      end,
      turnTimings,
    };
  });
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Procedural art-style-matched fallback canvas scene when both Veo and image APIs are unavailable.
 */
function drawStylizedFallbackScene(
  ctx: CanvasRenderingContext2D,
  beatIndex: number,
  localT: number,
  duration: number,
  style: ArtStyle,
  isDialogue: boolean
) {
  const progress = Math.min(1, Math.max(0, localT / duration));

  const palettes: Record<ArtStyle, Array<[string, string, string]>> = {
    '2d': [
      ['#F6EFE2', '#DDE8E4', '#2A6F68'],
      ['#F9ECE4', '#E6DFD5', '#475569'],
      ['#E8F1F5', '#D6E6E2', '#1F534E'],
      ['#FDF4E3', '#DCE8E1', '#2A6F68'],
    ],
    clay: [
      ['#F4EDE2', '#E5D5C3', '#8C5E3C'],
      ['#EFE7DF', '#D9CFC7', '#6B4F4B'],
      ['#E7EFEA', '#C9DDD4', '#3D6B5E'],
      ['#F7EFE1', '#E7D8B9', '#7A5C38'],
    ],
    watercolor: [
      ['#F8F6F0', '#DCE7EC', '#3A6B7C'],
      ['#F7F0EE', '#E7D9DE', '#6B5B7B'],
      ['#EEF5F1', '#D3E5DD', '#2E6B5E'],
      ['#FAF5E8', '#E9E2CC', '#5A6D4E'],
    ],
    live: [
      ['#E5E8EC', '#CBD5E1', '#1E293B'],
      ['#EAE6E1', '#D6CFC7', '#334155'],
      ['#E2E8EE', '#C2D1DF', '#1E3A5F'],
      ['#EFEAE2', '#D8D0C5', '#293548'],
    ],
  };

  const [bgTop, bgBottom, accent] = palettes[style][beatIndex % 4];

  // Slow Ken Burns camera transform
  const zoom = 1 + (beatIndex % 2 === 0 ? 0.08 * progress : 0.08 * (1 - progress));
  const panX = (beatIndex % 2 === 0 ? -18 : 18) * (progress - 0.5);
  const panY = -12 * (progress - 0.5);

  ctx.save();
  ctx.translate(CANVAS_W / 2 + panX, CANVAS_H / 2 + panY);
  ctx.scale(zoom, zoom);
  ctx.translate(-CANVAS_W / 2, -CANVAS_H / 2);

  // Soft background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0, bgTop);
  grad.addColorStop(1, bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(-60, -60, CANVAS_W + 120, CANVAS_H + 120);

  // Soft ambient window light & architectural backdrop
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.arc(CANVAS_W * 0.78, CANVAS_H * 0.24, 180, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(70, 170, 260, 380);

  // Table / horizon surface
  ctx.fillStyle = style === 'clay' ? '#D7C4B0' : '#E2DDD3';
  ctx.fillRect(-40, CANVAS_H * 0.66, CANVAS_W + 80, CANVAS_H * 0.4);

  // Warm accent cup / notebook prop on table
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(CANVAS_W * 0.44, CANVAS_H * 0.64, 90, 24, 8);
  ctx.fill();

  // Draw 1 or 2 gentle stylized original characters (abstract editorial shapes)
  const bob1 = Math.sin(localT * 2.2) * 5;
  const drawPerson = (cx: number, cy: number, shirtColor: string, hairColor: string, bob: number) => {
    // Shoulders / torso
    ctx.fillStyle = shirtColor;
    ctx.beginPath();
    ctx.roundRect(cx - 88, cy + 72 + bob, 176, 220, 64);
    ctx.fill();

    // Neck & Head
    ctx.fillStyle = '#F5D6BA';
    ctx.beginPath();
    ctx.arc(cx, cy + bob, 58, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    ctx.arc(cx, cy - 12 + bob, 60, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
  };

  if (isDialogue) {
    const bob2 = Math.sin(localT * 2.2 + 1.4) * 5;
    drawPerson(CANVAS_W * 0.31, CANVAS_H * 0.47, accent, '#2D3748', bob1);
    drawPerson(CANVAS_W * 0.69, CANVAS_H * 0.49, '#64748B', '#3E2723', bob2);
  } else {
    drawPerson(CANVAS_W * 0.5, CANVAS_H * 0.47, accent, '#2D3748', bob1);
  }

  ctx.restore();
}

function drawSubtitlesOnCanvas(ctx: CanvasRenderingContext2D, text: string) {
  const lines = formatSubtitleTwoLines(text);
  if (lines.length === 0) return;

  ctx.save();
  ctx.font = '700 34px "Plus Jakarta Sans", "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  // Soft bottom readability scrim
  const scrimGrad = ctx.createLinearGradient(0, CANVAS_H - 290, 0, CANVAS_H);
  scrimGrad.addColorStop(0, 'rgba(15, 23, 42, 0)');
  scrimGrad.addColorStop(1, 'rgba(15, 23, 42, 0.58)');
  ctx.fillStyle = scrimGrad;
  ctx.fillRect(0, CANVAS_H - 290, CANVAS_W, 290);

  const lineHeight = 46;
  const baseBottomY = CANVAS_H - 96;
  const startY = baseBottomY - (lines.length - 1) * lineHeight;

  lines.forEach((line, idx) => {
    const y = startY + idx * lineHeight;
    // Soft dark outline for readability
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.lineWidth = 9;
    ctx.strokeText(line, CANVAS_W / 2, y, CANVAS_W - 64);

    // Bold white text
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(line, CANVAS_W / 2, y, CANVAS_W - 64);
  });

  ctx.restore();
}

function drawEndingCreditOnCanvas(ctx: CanvasRenderingContext2D, alpha: number) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 32px "Outfit", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('[ELS]', CANVAS_W / 2, CANVAS_H / 2 - 36);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.font = '600 26px "Plus Jakarta Sans", "Noto Sans KR", sans-serif';
  ctx.fillText('Made with Google AI Studio · Script by [Gijun]', CANVAS_W / 2, CANVAS_H / 2 + 18, CANVAS_W - 64);

  ctx.restore();
}

function drawThumbnailOverlayOnCanvas(ctx: CanvasRenderingContext2D, title: string) {
  ctx.save();
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  bg.addColorStop(0, 'rgba(15, 23, 42, 0.25)');
  bg.addColorStop(0.5, 'rgba(15, 23, 42, 0.56)');
  bg.addColorStop(1, 'rgba(15, 23, 42, 0.68)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Small top badge
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = '600 22px "Outfit", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('[ELS] · 30s MOVIE ENGLISH', CANVAS_W / 2, CANVAS_H * 0.36);

  // Wrap title cleanly across max 2 lines
  const cleanTitle = title.trim() || 'Everyday Movie English';
  const words = cleanTitle.split(/\s+/);
  const lines: string[] = [];
  if (cleanTitle.length <= 18 || words.length <= 2) {
    lines.push(cleanTitle);
  } else {
    const mid = Math.ceil(words.length / 2);
    lines.push(words.slice(0, mid).join(' '));
    lines.push(words.slice(mid).join(' '));
  }

  ctx.font = '700 52px "Outfit", "Plus Jakarta Sans", "Noto Sans KR", sans-serif';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#FFFFFF';
  const startY = CANVAS_H * 0.45 - ((lines.length - 1) * 64) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, CANVAS_W / 2, startY + i * 64, CANVAS_W - 88);
  });

  // Subtle play circle cue
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = 'rgba(42, 111, 104, 0.92)';
  ctx.beginPath();
  ctx.arc(CANVAS_W / 2, CANVAS_H * 0.61, 44, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(CANVAS_W / 2 - 12, CANVAS_H * 0.61 - 18);
  ctx.lineTo(CANVAS_W / 2 + 20, CANVAS_H * 0.61);
  ctx.lineTo(CANVAS_W / 2 - 12, CANVAS_H * 0.61 + 18);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

interface BgmProfile {
  label: string;
  stepSec: number;
  wave: OscillatorType;
  chords: number[][];
  melody: number[];
}

function getBgmProfile(scene: SceneConfig): BgmProfile {
  const text = `${scene.place} ${scene.situation}`.toLowerCase();
  if (scene.style === 'clay' || text.includes('공원') || text.includes('강아지') || text.includes('여행')) {
    return {
      label: '밝고 경쾌한 마림바 멜로디',
      stepSec: 0.52,
      wave: 'sine',
      chords: [
        [174.61, 220.0, 261.63, 329.63], // Fmaj7
        [196.0, 246.94, 293.66, 329.63], // G6
        [164.81, 196.0, 246.94, 293.66], // Em7
        [220.0, 261.63, 329.63, 392.0], // Am7
      ],
      melody: [523.25, 587.33, 659.25, 523.25, 440.0, 523.25, 587.33, 392.0],
    };
  }
  if (scene.style === 'watercolor') {
    return {
      label: '잔잔한 어쿠스틱 하프 선율',
      stepSec: 0.68,
      wave: 'sine',
      chords: [
        [146.83, 220.0, 277.18, 369.99], // Dmaj7
        [123.47, 185.0, 220.0, 293.66], // Bm7
        [196.0, 246.94, 293.66, 369.99], // Gmaj7
        [220.0, 277.18, 329.63, 369.99], // A6
      ],
      melody: [587.33, 554.37, 440.0, 369.99, 493.88, 554.37, 587.33, 440.0],
    };
  }
  if (scene.style === 'live' || text.includes('발표') || text.includes('시험')) {
    return {
      label: '차분한 로파이 일렉트릭 피아노',
      stepSec: 0.64,
      wave: 'triangle',
      chords: [
        [155.56, 196.0, 233.08, 293.66], // Ebmaj7
        [130.81, 196.0, 233.08, 311.13], // Cm7
        [207.65, 261.63, 311.13, 392.0], // Abmaj7
        [233.08, 293.66, 349.23, 392.0], // Bb6
      ],
      melody: [466.16, 523.25, 587.33, 466.16, 392.0, 466.16, 523.25, 349.23],
    };
  }
  return {
    label: '따뜻한 카페 로파이 코드',
    stepSec: 0.62,
    wave: 'triangle',
    chords: [
      [130.81, 196.0, 246.94, 329.63], // Cmaj7
      [220.0, 261.63, 329.63, 392.0], // Am7
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [196.0, 246.94, 293.66, 329.63], // G6
    ],
    melody: [523.25, 493.88, 392.0, 440.0, 523.25, 587.33, 523.25, 392.0],
  };
}

/**
 * Synthesize a calm content-matched song at 10% of normal dialogue volume (gain = 0.10).
 */
function scheduleBackgroundMusic(
  audioCtx: AudioContext,
  destNode: AudioNode,
  startCtxTime: number,
  offsetSec: number,
  totalDurationSec: number,
  profile: BgmProfile
): AudioScheduledSourceNode[] {
  const createdNodes: AudioScheduledSourceNode[] = [];
  const bgmMaster = audioCtx.createGain();
  // ~10% of dialogue volume
  bgmMaster.gain.value = 0.10;

  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 950;

  bgmMaster.connect(lowpass);
  lowpass.connect(destNode);

  const chordDur = profile.stepSec * 4;
  const totalSteps = Math.ceil((totalDurationSec - offsetSec) / profile.stepSec);

  for (let s = 0; s < totalSteps; s++) {
    const absTime = offsetSec + s * profile.stepSec;
    if (absTime >= totalDurationSec) break;

    const when = startCtxTime + (absTime - offsetSec);
    const barIdx = Math.floor(absTime / chordDur) % profile.chords.length;
    const stepInBar = Math.floor(absTime / profile.stepSec) % 4;
    const chord = profile.chords[barIdx];

    // Gentle chord pad on beat 0 of each bar
    if (stepInBar === 0 || s === 0) {
      for (const freq of chord) {
        const osc = audioCtx.createOscillator();
        const env = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, when);

        const padDur = Math.min(chordDur * 0.95, totalDurationSec - absTime);
        env.gain.setValueAtTime(0.0001, when);
        env.gain.linearRampToValueAtTime(0.18, when + 0.08);
        env.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.25, padDur));

        osc.connect(env);
        env.connect(bgmMaster);
        osc.start(when);
        osc.stop(when + Math.max(0.28, padDur) + 0.02);
        createdNodes.push(osc);
      }
    }

    // Soft melody pluck
    const melIdx = Math.floor(absTime / profile.stepSec) % profile.melody.length;
    const melFreq = profile.melody[melIdx];
    const melOsc = audioCtx.createOscillator();
    const melEnv = audioCtx.createGain();
    melOsc.type = profile.wave;
    melOsc.frequency.setValueAtTime(melFreq, when);

    const noteDur = Math.min(profile.stepSec * 0.88, totalDurationSec - absTime);
    melEnv.gain.setValueAtTime(0.0001, when);
    melEnv.gain.linearRampToValueAtTime(0.32, when + 0.03);
    melEnv.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.18, noteDur));

    melOsc.connect(melEnv);
    melEnv.connect(bgmMaster);
    melOsc.start(when);
    melOsc.stop(when + Math.max(0.2, noteDur) + 0.02);
    createdNodes.push(melOsc);
  }

  return createdNodes;
}

export const VideoCanvasPlayer: React.FC<VideoCanvasPlayerProps> = ({
  beats,
  mediaStates,
  scene,
  videoTitle = 'Everyday Movie English',
  showCreditsAtEnd = false,
  enableDownload = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoElemsRef = useRef<Array<HTMLVideoElement | null>>([null, null, null, null]);
  const imageElemsRef = useRef<Array<HTMLImageElement | null>>([null, null, null, null]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeAudioNodesRef = useRef<AudioScheduledSourceNode[]>([]);
  const speechTimersRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const playStartWallRef = useRef<number>(0);
  const playStartOffsetRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);

  const bgmProfile = useMemo(() => getBgmProfile(scene), [scene]);
  const timelines = getBeatTimings(beats, mediaStates);

  // Preload images and videos into offscreen elements when mediaStates update
  useEffect(() => {
    mediaStates.forEach((m, idx) => {
      if (m.mode === 'veo' && m.videoUrl) {
        const vid = document.createElement('video');
        vid.src = m.videoUrl;
        vid.muted = true;
        vid.playsInline = true;
        vid.crossOrigin = 'anonymous';
        vid.preload = 'auto';
        videoElemsRef.current[idx] = vid;
      } else {
        videoElemsRef.current[idx] = null;
      }

      if (m.mode === 'slideshow' && m.imageDataUrl) {
        const img = new Image();
        img.src = m.imageDataUrl;
        imageElemsRef.current[idx] = img;
      } else {
        imageElemsRef.current[idx] = null;
      }
    });
  }, [mediaStates]);

  const drawFrameAtTime = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const clampedT = Math.max(0, Math.min(TOTAL_DURATION, t));
      const activeIdx = Math.max(
        0,
        timelines.findIndex((item) => clampedT >= item.start && clampedT < item.end)
      );
      const item = timelines[activeIdx === -1 ? timelines.length - 1 : activeIdx];
      const beatIndex = timelines.indexOf(item);
      const localT = Math.max(0, clampedT - item.start);
      const media = item.media;

      // 1. Visual Layer
      const vid = videoElemsRef.current[beatIndex];
      const img = imageElemsRef.current[beatIndex];

      if (media?.mode === 'veo' && vid && vid.readyState >= 2) {
        // Cover-draw trimmed 8s Veo clip
        const scale = Math.max(CANVAS_W / (vid.videoWidth || CANVAS_W), CANVAS_H / (vid.videoHeight || CANVAS_H));
        const dw = (vid.videoWidth || CANVAS_W) * scale;
        const dh = (vid.videoHeight || CANVAS_H) * scale;
        ctx.drawImage(vid, (CANVAS_W - dw) / 2, (CANVAS_H - dh) / 2, dw, dh);
      } else if (media?.mode === 'slideshow' && img && img.complete && img.naturalWidth > 0) {
        // Ken Burns slow zoom + pan
        const progress = Math.min(1, localT / item.beat.durationSec);
        const kenZoom = 1 + (beatIndex % 2 === 0 ? 0.08 * progress : 0.08 * (1 - progress));
        const panX = (beatIndex % 2 === 0 ? -24 : 24) * (progress - 0.5);
        const panY = -16 * (progress - 0.5);

        const baseScale = Math.max(CANVAS_W / img.naturalWidth, CANVAS_H / img.naturalHeight);
        const dw = img.naturalWidth * baseScale * kenZoom;
        const dh = img.naturalHeight * baseScale * kenZoom;
        ctx.drawImage(img, (CANVAS_W - dw) / 2 + panX, (CANVAS_H - dh) / 2 + panY, dw, dh);
      } else {
        drawStylizedFallbackScene(
          ctx,
          beatIndex,
          localT,
          item.beat.durationSec,
          scene.style,
          scene.format === 'dialogue'
        );
      }

      // 2. Subtitle Layer (word-for-word synced with active voice turn)
      const activeTurn =
        item.turnTimings.find((tt) => localT >= tt.startLocal && localT <= tt.endLocal) ||
        (item.turnTimings.length > 0 && localT < item.turnTimings[0].startLocal
          ? item.turnTimings[0]
          : null);

      if (activeTurn && (!showCreditsAtEnd || clampedT < 27.4)) {
        drawSubtitlesOnCanvas(ctx, activeTurn.text);
      } else if (!activeTurn && item.turnTimings.length === 0 && item.beat.lines.trim()) {
        // If audio hasn't been generated yet, preview clean lines
        const fallbackText = item.beat.lines
          .replace(/^[A-Za-z][A-Za-z0-9\s.'-]{0,20}:\s*/gm, '')
          .replace(/\n+/g, ' ')
          .trim();
        if (fallbackText && (!showCreditsAtEnd || clampedT < 27.4)) {
          drawSubtitlesOnCanvas(ctx, fallbackText);
        }
      }

      // 3. Ending credit at end of video (27.4s - 30.0s)
      if (showCreditsAtEnd && clampedT >= 27.4) {
        const fadeAlpha = Math.min(1, (clampedT - 27.4) / 0.8);
        drawEndingCreditOnCanvas(ctx, fadeAlpha);
      }

      // 4. Title thumbnail overlay before video starts playing
      if (!isPlaying && !isExporting && clampedT < 0.05) {
        drawThumbnailOverlayOnCanvas(ctx, videoTitle);
      }
    },
    [isExporting, isPlaying, scene.format, scene.style, showCreditsAtEnd, timelines, videoTitle]
  );

  // Draw initial frame whenever data updates
  useEffect(() => {
    if (!isPlaying && !isExporting) {
      drawFrameAtTime(currentTime);
    }
  }, [currentTime, drawFrameAtTime, isExporting, isPlaying]);

  const stopAudioAndLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    speechTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    speechTimersRef.current = [];
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore speechSynthesis cancel errors
      }
    }
    activeAudioNodesRef.current.forEach((node) => {
      try {
        node.stop();
      } catch {
        // Ignore already stopped
      }
    });
    activeAudioNodesRef.current = [];
    videoElemsRef.current.forEach((v) => {
      if (v) v.pause();
    });
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    return () => {
      stopAudioAndLoop();
    };
  }, [stopAudioAndLoop]);

  const startPlayback = async (fromTime = currentTime) => {
    if (isExporting) return;
    stopAudioAndLoop();

    const startOffset = fromTime >= TOTAL_DURATION - 0.1 ? 0 : fromTime;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContextClass();
    }
    const audioCtx = audioCtxRef.current;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    // Schedule Gemini TTS audio buffers and/or browser Web Speech English fallback
    const nowCtx = audioCtx.currentTime;
    const nodes: AudioScheduledSourceNode[] = [];
    const speakerOrder: string[] = [];
    const synthAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
    const enVoices = synthAvailable
      ? window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'))
      : [];

    for (const item of timelines) {
      for (const turn of item.turnTimings) {
        if (turn.speaker && !speakerOrder.includes(turn.speaker)) {
          speakerOrder.push(turn.speaker);
        }
        const speakerIdx = Math.max(0, speakerOrder.indexOf(turn.speaker));

        const absStart = item.start + turn.startLocal;
        const absEnd = item.start + turn.endLocal;
        if (absEnd <= startOffset) continue;

        if (turn.audioBase64) {
          try {
            const buf = await audioCtx.decodeAudioData(base64ToArrayBuffer(turn.audioBase64));
            const src = audioCtx.createBufferSource();
            src.buffer = buf;
            src.connect(audioCtx.destination);

            if (absStart >= startOffset) {
              src.start(nowCtx + (absStart - startOffset));
            } else {
              const skip = startOffset - absStart;
              if (skip < buf.duration) {
                src.start(nowCtx, skip);
              }
            }
            nodes.push(src);
          } catch {
            // Ignore malformed audio buffer
          }
        } else if (synthAvailable && turn.text.trim()) {
          const delayMs = Math.max(0, (absStart - startOffset) * 1000);
          const timerId = window.setTimeout(() => {
            try {
              const utter = new SpeechSynthesisUtterance(turn.text);
              utter.lang = 'en-US';
              utter.rate = 0.94;
              utter.pitch = speakerIdx % 2 === 0 ? 1.04 : 0.92;
              if (enVoices.length > 0) {
                utter.voice = enVoices[speakerIdx % enVoices.length];
              }
              window.speechSynthesis.speak(utter);
            } catch {
              // Ignore browser TTS error
            }
          }, delayMs);
          speechTimersRef.current.push(timerId);
        }
      }
    }

    if (bgmEnabled) {
      const bgmNodes = scheduleBackgroundMusic(
        audioCtx,
        audioCtx.destination,
        nowCtx,
        startOffset,
        TOTAL_DURATION,
        bgmProfile
      );
      nodes.push(...bgmNodes);
    }

    activeAudioNodesRef.current = nodes;

    playStartWallRef.current = performance.now();
    playStartOffsetRef.current = startOffset;
    setIsPlaying(true);

    let lastActiveVidIdx = -1;

    const tick = () => {
      const elapsed = (performance.now() - playStartWallRef.current) / 1000;
      const t = playStartOffsetRef.current + elapsed;

      if (t >= TOTAL_DURATION) {
        setCurrentTime(TOTAL_DURATION);
        drawFrameAtTime(TOTAL_DURATION);
        stopAudioAndLoop();
        return;
      }

      // Sync hidden Veo video element if active
      const activeIdx = timelines.findIndex((item) => t >= item.start && t < item.end);
      if (activeIdx !== -1 && activeIdx !== lastActiveVidIdx) {
        if (lastActiveVidIdx !== -1 && videoElemsRef.current[lastActiveVidIdx]) {
          videoElemsRef.current[lastActiveVidIdx]!.pause();
        }
        const activeVid = videoElemsRef.current[activeIdx];
        if (activeVid) {
          activeVid.currentTime = Math.max(0, t - timelines[activeIdx].start);
          activeVid.play().catch(() => {});
        }
        lastActiveVidIdx = activeIdx;
      }

      setCurrentTime(t);
      drawFrameAtTime(t);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      stopAudioAndLoop();
    } else {
      startPlayback(currentTime);
    }
  };

  const handleRestart = () => {
    setCurrentTime(0);
    startPlayback(0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setCurrentTime(val);
    if (isPlaying) {
      startPlayback(val);
    } else {
      drawFrameAtTime(val);
    }
  };

  const handleDownloadVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas || isExporting) return;

    stopAudioAndLoop();
    setExportError(null);
    setIsExporting(true);
    setExportProgress(0);

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const exportAudioCtx = new AudioContextClass();
      const dest = exportAudioCtx.createMediaStreamDestination();

      // Keep an active silent audio stream so MediaRecorder always succeeds even without WAV buffers
      const keepAliveOsc = exportAudioCtx.createOscillator();
      const keepAliveGain = exportAudioCtx.createGain();
      keepAliveGain.gain.value = 0.00001;
      keepAliveOsc.connect(keepAliveGain);
      keepAliveGain.connect(dest);
      keepAliveOsc.start();

      // Schedule all Gemini TTS audio turns into MediaStreamAudioDestinationNode
      const startAudioTime = exportAudioCtx.currentTime + 0.1;
      for (const item of timelines) {
        for (const turn of item.turnTimings) {
          if (!turn.audioBase64) continue;
          try {
            const buf = await exportAudioCtx.decodeAudioData(base64ToArrayBuffer(turn.audioBase64));
            const src = exportAudioCtx.createBufferSource();
            src.buffer = buf;
            src.connect(dest);
            src.start(startAudioTime + item.start + turn.startLocal);
          } catch {
            // Skip invalid turn
          }
        }
      }

      if (bgmEnabled) {
        scheduleBackgroundMusic(
          exportAudioCtx,
          dest,
          startAudioTime,
          0,
          TOTAL_DURATION,
          bgmProfile
        );
      }

      const canvasStream = canvas.captureStream(30);
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      const preferredTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ];
      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';

      const recorder = mimeType
        ? new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 3_000_000 })
        : new MediaRecorder(combinedStream);

      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      const stoppedPromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
        };
      });

      recorder.start(250);

      const renderStart = performance.now();
      let lastVidIdx = -1;

      await new Promise<void>((resolve) => {
        const step = () => {
          const t = (performance.now() - renderStart) / 1000;
          if (t >= TOTAL_DURATION) {
            drawFrameAtTime(TOTAL_DURATION);
            setExportProgress(100);
            resolve();
            return;
          }

          const activeIdx = timelines.findIndex((item) => t >= item.start && t < item.end);
          if (activeIdx !== -1 && activeIdx !== lastVidIdx) {
            if (lastVidIdx !== -1 && videoElemsRef.current[lastVidIdx]) {
              videoElemsRef.current[lastVidIdx]!.pause();
            }
            const activeVid = videoElemsRef.current[activeIdx];
            if (activeVid) {
              activeVid.currentTime = Math.max(0, t - timelines[activeIdx].start);
              activeVid.play().catch(() => {});
            }
            lastVidIdx = activeIdx;
          }

          drawFrameAtTime(t);
          setExportProgress(Math.min(99, Math.round((t / TOTAL_DURATION) * 100)));
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

      videoElemsRef.current.forEach((v) => v?.pause());
      try {
        keepAliveOsc.stop();
      } catch {
        // Ignore stop error
      }
      recorder.stop();
      const blob = await stoppedPromise;
      await exportAudioCtx.close();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ELS_30s_English_Clip.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      setExportError(
        err instanceof Error
          ? `영상 파일 저장 중 오류가 발생했습니다: ${err.message}`
          : '브라우저에서 영상 파일 녹화를 지원하지 않습니다.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const activeBeat =
    timelines.find((item) => currentTime >= item.start && currentTime < item.end) ||
    timelines[timelines.length - 1];

  return (
    <div className="space-y-4">
      <div className="mx-auto w-full max-w-[360px] sm:max-w-[390px]">
        {/* 9:16 Player Frame */}
        <div
          onClick={!isPlaying && !isExporting ? handleTogglePlay : undefined}
          className={`relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-300 shadow-sm aspect-[9/16] ${
            !isPlaying && !isExporting ? 'cursor-pointer' : ''
          }`}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="w-full h-full block"
          />

          {/* Subtle Top Beat Label */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
            <span className="px-2.5 py-1 rounded-lg bg-slate-900/65 text-white text-xs font-semibold backdrop-blur-xs">
              {activeBeat?.beat.timeRange} · {activeBeat?.beat.label}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-900/65 text-white text-xs font-mono-num backdrop-blur-xs flex items-center gap-1">
              <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{currentTime.toFixed(1)}s / 30.0s</span>
            </span>
          </div>
        </div>

        {/* Scrubber & Controls */}
        <div className="mt-3 p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
          <input
            type="range"
            min={0}
            max={TOTAL_DURATION}
            step={0.1}
            value={currentTime}
            disabled={isExporting}
            onChange={handleSeek}
            aria-label="영상 재생 위치"
            className="w-full accent-[#2A6F68] cursor-pointer"
          />

          <div className="flex items-center justify-between gap-2 px-1 text-xs text-slate-600">
            <span className="flex items-center gap-1.5 truncate">
              <Music className="w-3.5 h-3.5 text-[#2A6F68] shrink-0" aria-hidden="true" />
              <span className="truncate">
                배경음: {bgmProfile.label} (대화 음량의 10%)
              </span>
            </span>
            <button
              type="button"
              disabled={isPlaying || isExporting}
              onClick={() => setBgmEnabled((v) => !v)}
              className={`px-2 py-0.5 rounded-md font-semibold shrink-0 transition-colors disabled:opacity-50 ${
                bgmEnabled
                  ? 'bg-[#E9F3F1] text-[#1F534E]'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {bgmEnabled ? '켜짐' : '꺼짐'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isExporting}
              onClick={handleTogglePlay}
              className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-[#2A6F68] hover:bg-[#225B55] text-white font-semibold text-base flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-5 h-5" aria-hidden="true" />
                  <span>일시정지</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" aria-hidden="true" />
                  <span>30초 영상 재생</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isExporting}
              onClick={handleRestart}
              aria-label="처음부터 다시 재생"
              className="min-w-[46px] min-h-[46px] px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center"
            >
              <RotateCcw className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {enableDownload && (
            <button
              type="button"
              disabled={isExporting}
              onClick={handleDownloadVideo}
              className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-base flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                  <span>영상 파일 렌더링 중... ({exportProgress}%)</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" aria-hidden="true" />
                  <span>영상 파일 다운로드 (.webm)</span>
                </>
              )}
            </button>
          )}

          {exportError && (
            <p className="text-xs text-rose-600 font-medium">{exportError}</p>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Film,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';
import {
  BeatMediaState,
  MediaMode,
  SceneConfig,
  StoryboardBeat,
  parseDialogueLines,
} from '../types';
import { VideoCanvasPlayer } from './VideoCanvasPlayer';

interface Step5VideoProps {
  beats: StoryboardBeat[];
  scene: SceneConfig;
  videoTitle: string;
  characterSheet: string;
  mediaStates: BeatMediaState[];
  onSetCharacterSheet: (sheet: string) => void;
  onUpdateMediaStates: React.Dispatch<React.SetStateAction<BeatMediaState[]>>;
  onBack: () => void;
  onNext: () => void;
}

function describeOverallMode(mediaStates: BeatMediaState[]): {
  label: string;
  detail: string;
  kind: MediaMode | 'mixed' | 'pending';
} {
  const ready = mediaStates.filter((m) => m.status === 'ready' && m.mode);
  if (ready.length === 0) {
    return {
      label: '생성 준비 중',
      detail: '캐릭터 시트와 4개 비트의 영상·음성을 준비합니다.',
      kind: 'pending',
    };
  }
  const hasGeminiVoice = ready.some((r) => r.audioTurns.some((t) => Boolean(t.audioBase64)));
  const voiceSuffix = hasGeminiVoice ? 'Gemini 영어 음성' : '브라우저 영어 음성';

  const modes = new Set(ready.map((r) => r.mode!));
  if (modes.has('veo') && modes.size === 1) {
    return {
      label: 'Veo AI 영상 모드',
      detail: `8초 Veo 클립을 비트 길이(7·8·8·7초)에 맞춰 편집하고 ${voiceSuffix}·자막을 입혔어요.`,
      kind: 'veo',
    };
  }
  if (modes.has('slideshow') && !modes.has('veo') && !modes.has('canvas-slideshow')) {
    return {
      label: 'AI 일러스트 슬라이드쇼 모드',
      detail: `Veo 영상 생성이 제한되어 AI 이미지 + 부드러운 줌/팬 슬라이드쇼와 ${voiceSuffix}로 제작했어요.`,
      kind: 'slideshow',
    };
  }
  if (modes.has('canvas-slideshow') && !modes.has('veo') && !modes.has('slideshow')) {
    return {
      label: '화풍 맞춤 캔버스 슬라이드쇼 모드',
      detail: `유료 API 없이도 작동하도록 화풍 맞춤 캔버스 슬라이드쇼 + ${voiceSuffix}·자막으로 제작했어요.`,
      kind: 'canvas-slideshow',
    };
  }
  return {
    label: '혼합 모드 (영상 + 슬라이드쇼)',
    detail: `일부 비트는 Veo 영상으로, 일부 비트는 슬라이드쇼와 ${voiceSuffix} 모드로 제작되었어요.`,
    kind: 'mixed',
  };
}

export const Step5Video: React.FC<Step5VideoProps> = ({
  beats,
  scene,
  videoTitle,
  characterSheet,
  mediaStates,
  onSetCharacterSheet,
  onUpdateMediaStates,
  onBack,
  onNext,
}) => {
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const hasStartedPipelineRef = useRef(false);

  // Collect global speaker order so Speaker 1 and Speaker 2 keep consistent voices across all 4 beats
  const globalSpeakerOrder = useMemo(() => {
    const order: string[] = [];
    for (const beat of beats) {
      const turns = parseDialogueLines(beat.lines, scene.format);
      for (const t of turns) {
        if (t.speaker && !order.includes(t.speaker)) {
          order.push(t.speaker);
        }
      }
    }
    return order;
  }, [beats, scene.format]);

  const generateSingleBeat = async (beatIndex: number, sheetText: string) => {
    const beat = beats[beatIndex];
    if (!beat) return;

    onUpdateMediaStates((prev) =>
      prev.map((item, idx) =>
        idx === beatIndex
          ? {
              ...item,
              status: 'generating',
              stageText: '비주얼(Veo / 슬라이드쇼) 생성 중...',
              errorMessage: undefined,
            }
          : item
      )
    );

    try {
      // 1. Visual media (Veo -> Image Slideshow -> Canvas Slideshow fallback)
      let mode: MediaMode = 'canvas-slideshow';
      let videoUrl: string | undefined;
      let imageDataUrl: string | undefined;

      try {
        const mediaResp = await fetch('/api/generate-beat-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            beat,
            characterSheet: sheetText,
            scene,
          }),
        });
        if (mediaResp.ok) {
          const mediaData = await mediaResp.json();
          mode = (mediaData.mode as MediaMode) || 'canvas-slideshow';
          videoUrl = mediaData.videoUrl;
          imageDataUrl = mediaData.imageDataUrl ?? undefined;
        }
      } catch {
        mode = 'canvas-slideshow';
      }

      onUpdateMediaStates((prev) =>
        prev.map((item, idx) =>
          idx === beatIndex
            ? {
                ...item,
                stageText: '영어 음성 준비 중...',
                mode,
                videoUrl,
                imageDataUrl,
              }
            : item
        )
      );

      // 2. Gemini TTS voice (with local browser-tts fallback if API unavailable)
      let audioTurns = [] as BeatMediaState['audioTurns'];
      try {
        const audioResp = await fetch('/api/generate-beat-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            beat,
            format: scene.format,
            speakerOrder: globalSpeakerOrder,
          }),
        });
        if (audioResp.ok) {
          const audioData = await audioResp.json();
          audioTurns = audioData.turns ?? [];
        }
      } catch {
        audioTurns = [];
      }

      if (audioTurns.length === 0) {
        const parsedTurns = parseDialogueLines(beat.lines, scene.format);
        audioTurns = parsedTurns.map((t) => {
          const words = t.text.trim().split(/\s+/).filter(Boolean).length;
          return {
            speaker: t.speaker,
            text: t.text,
            audioBase64: '',
            durationSec: Math.max(1.4, Math.min(7.2, Number((words * 0.43 + 0.45).toFixed(2)))),
            voiceMode: 'browser-tts',
          };
        });
      }

      onUpdateMediaStates((prev) =>
        prev.map((item, idx) =>
          idx === beatIndex
            ? {
                ...item,
                status: 'ready',
                stageText: '완료',
                mode,
                videoUrl,
                imageDataUrl,
                audioTurns,
                errorMessage: undefined,
              }
            : item
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '비트 생성 중 오류가 발생했습니다.';
      onUpdateMediaStates((prev) =>
        prev.map((item, idx) =>
          idx === beatIndex
            ? {
                ...item,
                status: 'error',
                stageText: '생성 실패',
                errorMessage: msg,
              }
            : item
        )
      );
    }
  };

  const runFullPipeline = async () => {
    setSheetError(null);
    let sheet = characterSheet;

    if (!sheet) {
      setIsCreatingSheet(true);
      try {
        const res = await fetch('/api/generate-character-sheet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scene, beats }),
        });
        const data = await res.json();
        if (res.ok && data.characterSheet) {
          sheet = data.characterSheet;
        }
      } catch {
        // Fallback below
      }

      if (!sheet) {
        sheet = `Consistent ${scene.style} style for original everyday characters (${scene.characters}) at ${scene.place}. Clean everyday outfits, calm daylight palette, no text or logos.`;
      }
      onSetCharacterSheet(sheet);
      setIsCreatingSheet(false);
    }

    // Generate beats that are not yet ready
    for (let i = 0; i < beats.length; i++) {
      const current = mediaStates[i];
      if (current?.status === 'ready') continue;
      await generateSingleBeat(i, sheet);
    }
  };

  useEffect(() => {
    if (hasStartedPipelineRef.current) return;
    const allReady = mediaStates.every((m) => m.status === 'ready');
    if (allReady) return;
    hasStartedPipelineRef.current = true;
    runFullPipeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allBeatsReady = mediaStates.every((m) => m.status === 'ready');
  const anyGenerating =
    isCreatingSheet || mediaStates.some((m) => m.status === 'generating');
  const modeInfo = describeOverallMode(mediaStates);

  return (
    <div className="space-y-6 pb-24 sm:pb-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">
              AI 캐릭터 · 영상 · 영어 음성 만들기
            </h1>
            <p className="mt-1 text-sm sm:text-base text-slate-600">
              4개 비트 모두 동일한 캐릭터 시트를 사용해 인물과 화풍을 일관되게 유지합니다.
            </p>
          </div>

          <button
            type="button"
            disabled={anyGenerating}
            onClick={() => runFullPipeline()}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span>미완료 비트 이어서 생성</span>
          </button>
        </div>

        {/* Mode Notification Banner */}
        <div className="p-4 rounded-xl bg-[#F3F8F7] border border-[#2A6F68]/25 flex items-start gap-3">
          {modeInfo.kind === 'veo' ? (
            <Film className="w-5 h-5 text-[#2A6F68] shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <ImageIcon className="w-5 h-5 text-[#2A6F68] shrink-0 mt-0.5" aria-hidden="true" />
          )}
          <div>
            <div className="text-sm font-bold text-[#1F534E]">
              현재 제작 모드: {modeInfo.label}
            </div>
            <p className="text-sm text-slate-600 mt-0.5">{modeInfo.detail}</p>
          </div>
        </div>

        {/* Character Sheet Card */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#2A6F68]" aria-hidden="true" />
              통일 캐릭터 시트 (4개 비트 공통 적용)
            </span>
            {isCreatingSheet && (
              <span className="text-xs text-[#2A6F68] font-semibold flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                생성 중...
              </span>
            )}
          </div>

          {sheetError ? (
            <div className="text-sm text-rose-700 flex items-center justify-between gap-2">
              <span>{sheetError}</span>
              <button
                type="button"
                onClick={runFullPipeline}
                className="px-3 py-1.5 rounded-lg bg-rose-100 text-rose-800 text-xs font-semibold shrink-0"
              >
                다시 시도
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-600 leading-relaxed">
              {characterSheet || '캐릭터 시트를 준비하고 있습니다...'}
            </p>
          )}
        </div>

        {/* Per-Beat Progress + Retry */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {beats.map((beat, idx) => {
            const state = mediaStates[idx];
            const isBusy = state?.status === 'generating';
            const isDone = state?.status === 'ready';
            const isErr = state?.status === 'error';

            return (
              <div
                key={beat.id}
                className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                  isErr
                    ? 'bg-rose-50/70 border-rose-200'
                    : isDone
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num text-xs font-bold text-[#2A6F68]">
                        {beat.timeRange}
                      </span>
                      <span className="font-bold text-slate-900">
                        {beat.label} ({beat.koreanLabel})
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                      {beat.lines}
                    </p>
                  </div>

                  <div className="shrink-0">
                    {isBusy && (
                      <Loader2
                        className="w-5 h-5 text-[#2A6F68] animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    {isDone && (
                      <CheckCircle2
                        className="w-5 h-5 text-emerald-600"
                        aria-hidden="true"
                      />
                    )}
                    {isErr && (
                      <AlertCircle
                        className="w-5 h-5 text-rose-600"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
                  <span className="text-xs font-medium text-slate-600">
                    {isErr
                      ? state.errorMessage || '생성 오류'
                      : isDone
                      ? `${
                          state.mode === 'veo'
                            ? 'Veo 영상'
                            : state.mode === 'slideshow'
                            ? 'AI 이미지'
                            : '캔버스 배경'
                        } · ${
                          state.audioTurns.some((t) => Boolean(t.audioBase64))
                            ? 'Gemini 음성'
                            : '브라우저 음성'
                        } ${state.audioTurns.length}구간 완료`
                      : state?.stageText || '대기 중'}
                  </span>

                  <button
                    type="button"
                    disabled={isBusy || isCreatingSheet || !characterSheet}
                    onClick={() => generateSingleBeat(idx, characterSheet)}
                    className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 disabled:opacity-40 shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{isErr ? '다시 시도' : '재생성'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 30s Preview Player */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <h2 className="font-display text-xl font-bold text-slate-900 mb-1">
          30초 미리보기 플레이어
        </h2>
        <p className="text-sm text-slate-600 mb-5">
          흰색 굵은 자막이 영어 음성과 단어 단위로 정확히 맞춰 화면 아래에 표시됩니다.
        </p>

        <VideoCanvasPlayer
          beats={beats}
          mediaStates={mediaStates}
          scene={scene}
          videoTitle={videoTitle}
          showCreditsAtEnd={false}
          enableDownload={false}
        />
      </section>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 sm:static bg-white/95 sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none border-t sm:border-t-0 border-slate-200 p-3 sm:p-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] px-5 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-base flex items-center gap-2 shrink-0"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            <span>이전</span>
          </button>

          <button
            type="button"
            disabled={!allBeatsReady || anyGenerating}
            onClick={onNext}
            className="flex-1 sm:flex-none min-h-[48px] px-7 py-3 rounded-xl bg-[#2A6F68] hover:bg-[#225B55] text-white font-semibold text-base flex items-center justify-center gap-2 transition-colors disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
          >
            <span>다음: 최종 영상 완성 & 저장</span>
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

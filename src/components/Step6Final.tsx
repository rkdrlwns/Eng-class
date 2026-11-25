import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Film,
  BookOpen,
  Hash,
  Palette,
  HelpCircle,
} from 'lucide-react';
import {
  ART_STYLE_LABELS,
  ArtStyle,
  BeatMediaState,
  ExpressionItem,
  SceneConfig,
  StoryboardBeat,
  countTotalWords,
} from '../types';
import { VideoCanvasPlayer } from './VideoCanvasPlayer';

interface Step6FinalProps {
  beats: StoryboardBeat[];
  mediaStates: BeatMediaState[];
  selectedExpressions: ExpressionItem[];
  scene: SceneConfig;
  videoTitle: string;
  onRemakeWithStyle: (newStyle: ArtStyle) => void;
  onGoToQuiz: () => void;
  onBack: () => void;
  onStartOver: () => void;
}

export const Step6Final: React.FC<Step6FinalProps> = ({
  beats,
  mediaStates,
  selectedExpressions,
  scene,
  videoTitle,
  onRemakeWithStyle,
  onGoToQuiz,
  onBack,
  onStartOver,
}) => {
  const otherStyles = useMemo(
    () => (Object.keys(ART_STYLE_LABELS) as ArtStyle[]).filter((s) => s !== scene.style),
    [scene.style]
  );
  const [pickedStyle, setPickedStyle] = useState<ArtStyle>(otherStyles[0] ?? 'clay');

  const totalWords = useMemo(() => countTotalWords(beats), [beats]);
  const combinedLines = useMemo(() => beats.map((b) => b.lines).join('\n'), [beats]);

  const usedExpressions = useMemo(
    () =>
      selectedExpressions.filter(
        (e) => e.expression.trim().length > 0 && combinedLines.includes(e.expression.trim())
      ),
    [combinedLines, selectedExpressions]
  );

  const usedMovies = useMemo(
    () => Array.from(new Set(usedExpressions.map((e) => e.movie).filter(Boolean))),
    [usedExpressions]
  );

  const modesUsed = useMemo(() => {
    const set = new Set(mediaStates.map((m) => m.mode).filter(Boolean));
    if (set.has('veo') && set.size === 1) return 'Veo AI 영상';
    if (set.has('slideshow') && !set.has('veo')) return 'AI 일러스트 슬라이드쇼';
    if (set.has('canvas-slideshow')) return '화풍 맞춤 캔버스 슬라이드쇼';
    return '혼합 모드';
  }, [mediaStates]);

  return (
    <div className="space-y-6 pb-24 sm:pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Full 30s Player & Download */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
          <div className="mb-4">
            <h1 className="font-display text-2xl font-bold text-slate-900">
              30초 영어 클립 완성!
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              제목 썸네일을 눌러 30초 영상을 감상하고(배경음은 대화 음량의 10%), 아래 버튼으로 다음 퀴즈나 다른 그림체 재제작을 선택할 수 있어요.
            </p>
          </div>

          <VideoCanvasPlayer
            beats={beats}
            mediaStates={mediaStates}
            scene={scene}
            videoTitle={videoTitle}
            showCreditsAtEnd={true}
            enableDownload={true}
          />
        </section>

        {/* Right: Art Style Remake Question + Learning Summary */}
        <div className="lg:col-span-6 space-y-5">
          {/* Prompt: Remake with a different art style? */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#E9F3F1] text-[#2A6F68] flex items-center justify-center shrink-0">
                <Palette className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  다른 그림체로 영상을 다시 제작할까요?
                </h2>
                <p className="text-sm text-slate-600 mt-0.5">
                  현재 그림체는 <span className="font-semibold text-[#1F534E]">{ART_STYLE_LABELS[scene.style].label}</span>입니다. 같은 대본으로 다른 화풍 버전을 바로 만들어 볼 수 있어요.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {otherStyles.map((styleKey) => {
                const info = ART_STYLE_LABELS[styleKey];
                const active = pickedStyle === styleKey;
                return (
                  <button
                    key={styleKey}
                    type="button"
                    onClick={() => setPickedStyle(styleKey)}
                    className={`min-h-[56px] p-3 rounded-xl border text-left transition-colors ${
                      active
                        ? 'bg-[#E9F3F1] border-[#2A6F68] text-[#1F534E]'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold text-sm">{info.label}</div>
                    <div className="text-[11px] opacity-80 mt-0.5 line-clamp-2">{info.desc}</div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => onRemakeWithStyle(pickedStyle)}
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Palette className="w-4 h-4" aria-hidden="true" />
                <span>{ART_STYLE_LABELS[pickedStyle].label}로 다시 제작하기</span>
              </button>

              <button
                type="button"
                onClick={onGoToQuiz}
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#2A6F68] hover:bg-[#225B55] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <HelpCircle className="w-4 h-4" aria-hidden="true" />
                <span>아니요, 퀴즈 풀기</span>
              </button>
            </div>
          </section>

          {/* Learning Summary */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900">
                학습 요약 리포트
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                이번 30초 작품에 담긴 표현과 영화, 전체 단어 수입니다.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>사용 표현</span>
                </div>
                <div className="mt-1 text-xl font-bold text-slate-900 font-mono-num">
                  {usedExpressions.length}개
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                  <Film className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>영화</span>
                </div>
                <div className="mt-1 text-xl font-bold text-slate-900 font-mono-num">
                  {usedMovies.length}편
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>총 단어 수</span>
                </div>
                <div className="mt-1 text-xl font-bold text-slate-900 font-mono-num">
                  {totalWords}단어
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#F3F8F7] border border-[#2A6F68]/20 space-y-1.5 text-sm text-slate-700">
              <div>
                <span className="font-semibold text-[#1F534E]">영상 제목:</span> {videoTitle}
              </div>
              <div>
                <span className="font-semibold text-[#1F534E]">장면 설정:</span> {scene.place} ·{' '}
                {scene.format === 'dialogue' ? '두 캐릭터 대화' : '1인 내레이션'} ·{' '}
                {ART_STYLE_LABELS[scene.style].label}
              </div>
              <div>
                <span className="font-semibold text-[#1F534E]">포함 영화:</span>{' '}
                {usedMovies.join(', ') || '미지정'}
              </div>
              <div>
                <span className="font-semibold text-[#1F534E]">영상 방식:</span> {modesUsed}
              </div>
              <div className="pt-1 text-xs text-slate-500">
                엔딩 크레딧: Made with Google AI Studio · Script by [Gijun]
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-2.5">
                영상 속 영어 표현 ({usedExpressions.length}개)
              </h3>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {usedExpressions.map((expr) => (
                  <div
                    key={expr.id}
                    className="p-3.5 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
                  >
                    <div>
                      <div className="font-bold text-slate-900 text-base">
                        {expr.expression}
                      </div>
                      <div className="text-sm text-slate-600">
                        {expr.koreanMeaning || '퀴즈에서 뜻을 맞혀 보세요!'}
                      </div>
                    </div>
                    <div className="text-xs font-medium text-[#2A6F68] shrink-0">
                      {expr.movie || '직접 입력'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 sm:static bg-white/95 sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none border-t sm:border-t-0 border-slate-200 p-3 sm:p-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="min-h-[48px] px-4 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm sm:text-base flex items-center gap-1.5 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>제작 화면</span>
            </button>

            <button
              type="button"
              onClick={onStartOver}
              className="min-h-[48px] px-4 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm sm:text-base flex items-center gap-1.5 shrink-0"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">처음부터</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onGoToQuiz}
            className="flex-1 sm:flex-none min-h-[48px] px-6 py-3 rounded-xl bg-[#2A6F68] hover:bg-[#225B55] text-white font-semibold text-base flex items-center justify-center gap-2 transition-colors"
          >
            <span>다음: 사용한 단어 뜻 퀴즈 풀기</span>
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

import { useMemo, useState } from 'react';
import { StepHeader } from './components/StepHeader';
import { Step2Expressions } from './components/Step2Expressions';
import { Step3Scene } from './components/Step3Scene';
import { Step4Storyboard } from './components/Step4Storyboard';
import { Step5Video } from './components/Step5Video';
import { Step6Final } from './components/Step6Final';
import { Step7Quiz } from './components/Step7Quiz';
import {
  ArtStyle,
  BEAT_TEMPLATES,
  BeatMediaState,
  ExpressionItem,
  SceneConfig,
  StoryboardBeat,
  createEmptyExpressionRows,
} from './types';

function createInitialMediaStates(): BeatMediaState[] {
  return BEAT_TEMPLATES.map((t) => ({
    beatId: t.id,
    status: 'idle',
    stageText: '대기 중',
    audioTurns: [],
  }));
}

export default function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [maxReachedStep, setMaxReachedStep] = useState(1);

  const [expressions, setExpressions] = useState<ExpressionItem[]>(() =>
    createEmptyExpressionRows(5)
  );
  const [scene, setScene] = useState<SceneConfig>({
    place: '대학교 앞 조용한 카페',
    characters: 'Mina (대학생 2학년) & Jun (같은 과 친구)',
    situation: '중간고사 팀플 발표 직전 긴장을 풀며 서로 응원하는 대화',
    format: 'dialogue',
    style: '2d',
  });

  const [beats, setBeats] = useState<StoryboardBeat[]>([]);
  const [videoTitle, setVideoTitle] = useState('A Quiet Cafe Moment');
  const [storyboardWarning, setStoryboardWarning] = useState<string | null>(null);
  const [storyboardError, setStoryboardError] = useState<string | null>(null);
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  const [regeneratingBeatIdx, setRegeneratingBeatIdx] = useState<number | null>(null);

  const [characterSheet, setCharacterSheet] = useState('');
  const [mediaStates, setMediaStates] = useState<BeatMediaState[]>(createInitialMediaStates);

  const selectedExpressions = useMemo(
    () =>
      expressions
        .map((e) => ({
          ...e,
          expression: e.expression.trim(),
          koreanMeaning: e.koreanMeaning.trim(),
          movie: e.movie.trim(),
        }))
        .filter((e) => e.expression.length > 0),
    [expressions]
  );

  const goToStep = (step: number) => {
    setCurrentStep(step);
    setMaxReachedStep((prev) => Math.max(prev, step));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGenerateStoryboard = async () => {
    setStoryboardError(null);
    setStoryboardWarning(null);
    setIsGeneratingStoryboard(true);

    try {
      const res = await fetch('/api/generate-storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expressions: selectedExpressions,
          scene,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '스토리보드 생성에 실패했습니다.');
      }

      if (data.title) {
        setVideoTitle(String(data.title));
      }
      setBeats(data.beats ?? []);
      setStoryboardWarning(data.warning ?? null);
      setCharacterSheet('');
      setMediaStates(createInitialMediaStates());
      goToStep(3);
    } catch (err) {
      setStoryboardError(
        err instanceof Error ? err.message : '스토리보드 생성 중 오류가 발생했습니다.'
      );
    } finally {
      setIsGeneratingStoryboard(false);
    }
  };

  const handleRegenerateBeat = async (beatIndex: number) => {
    setRegeneratingBeatIdx(beatIndex);
    setStoryboardWarning(null);

    try {
      const res = await fetch('/api/regenerate-beat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beatIndex,
          beats,
          expressions: selectedExpressions,
          scene,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '비트 다시 생성에 실패했습니다.');
      }

      if (data.beat) {
        setBeats((prev) => prev.map((b, idx) => (idx === beatIndex ? data.beat : b)));
        setMediaStates((prev) =>
          prev.map((m, idx) =>
            idx === beatIndex
              ? { beatId: m.beatId, status: 'idle', stageText: '대기 중', audioTurns: [] }
              : m
          )
        );
      }
    } catch (err) {
      setStoryboardWarning(
        err instanceof Error ? err.message : '비트 재생성 중 오류가 발생했습니다.'
      );
    } finally {
      setRegeneratingBeatIdx(null);
    }
  };

  const handleUpdateBeats = (nextBeats: StoryboardBeat[]) => {
    setBeats(nextBeats);
    setMediaStates((prev) =>
      prev.map((m, idx) => {
        const prevBeat = beats[idx];
        const nextBeat = nextBeats[idx];
        if (prevBeat && nextBeat && prevBeat.lines !== nextBeat.lines) {
          return { ...m, status: 'idle', stageText: '대본 수정됨 · 다시 생성 필요', audioTurns: [] };
        }
        return m;
      })
    );
  };

  const handleRemakeWithStyle = (newStyle: ArtStyle) => {
    setScene((prev) => ({ ...prev, style: newStyle }));
    setCharacterSheet('');
    setMediaStates(createInitialMediaStates());
    goToStep(4);
  };

  const handleStartOver = () => {
    setCurrentStep(1);
    setMaxReachedStep(1);
    setBeats([]);
    setCharacterSheet('');
    setMediaStates(createInitialMediaStates());
    setStoryboardWarning(null);
    setStoryboardError(null);
  };

  const usedExpressions = useMemo(() => {
    const combined = beats.map((b) => b.lines).join('\n');
    const matched = selectedExpressions.filter((e) => combined.includes(e.expression));
    return matched.length > 0 ? matched : selectedExpressions;
  }, [beats, selectedExpressions]);

  return (
    <div className="min-h-screen bg-[#F6F8FA] text-[#1E293B]">
      <StepHeader
        currentStep={currentStep}
        maxReachedStep={maxReachedStep}
        onSelectStep={goToStep}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {currentStep === 1 && (
          <Step2Expressions
            expressions={expressions}
            onChange={setExpressions}
            onNext={() => goToStep(2)}
          />
        )}

        {currentStep === 2 && (
          <Step3Scene
            scene={scene}
            selectedCount={selectedExpressions.length}
            isGenerating={isGeneratingStoryboard}
            errorMsg={storyboardError}
            onChange={(next) => {
              setScene(next);
              setCharacterSheet('');
              setMediaStates(createInitialMediaStates());
            }}
            onBack={() => goToStep(1)}
            onGenerateStoryboard={handleGenerateStoryboard}
          />
        )}

        {currentStep === 3 && (
          <Step4Storyboard
            beats={beats}
            selectedExpressions={selectedExpressions}
            serverWarning={storyboardWarning}
            regeneratingBeatIdx={regeneratingBeatIdx}
            onUpdateBeats={handleUpdateBeats}
            onRegenerateBeat={handleRegenerateBeat}
            onRegenerateAll={handleGenerateStoryboard}
            isRegeneratingAll={isGeneratingStoryboard}
            onBack={() => goToStep(2)}
            onNext={() => goToStep(4)}
          />
        )}

        {currentStep === 4 && (
          <Step5Video
            beats={beats}
            scene={scene}
            videoTitle={videoTitle}
            characterSheet={characterSheet}
            mediaStates={mediaStates}
            onSetCharacterSheet={setCharacterSheet}
            onUpdateMediaStates={setMediaStates}
            onBack={() => goToStep(3)}
            onNext={() => goToStep(5)}
          />
        )}

        {currentStep === 5 && (
          <Step6Final
            beats={beats}
            mediaStates={mediaStates}
            selectedExpressions={selectedExpressions}
            scene={scene}
            videoTitle={videoTitle}
            onRemakeWithStyle={handleRemakeWithStyle}
            onGoToQuiz={() => goToStep(6)}
            onBack={() => goToStep(4)}
            onStartOver={handleStartOver}
          />
        )}

        {currentStep === 6 && (
          <Step7Quiz
            usedExpressions={usedExpressions}
            beats={beats}
            onBack={() => goToStep(5)}
            onStartOver={handleStartOver}
          />
        )}
      </main>
    </div>
  );
}

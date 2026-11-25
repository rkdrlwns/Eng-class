import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
  Trophy,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react';
import { ExpressionItem, QuizQuestion, StoryboardBeat } from '../types';

interface Step7QuizProps {
  usedExpressions: ExpressionItem[];
  beats: StoryboardBeat[];
  onBack: () => void;
  onStartOver: () => void;
}

const LOCAL_DISTRACTORS = [
  '서로를 오해하고 멀어지다',
  '예상보다 훨씬 일찍 끝내다',
  '아무 말 없이 자리를 떠나다',
  '작은 실수를 크게 부풀리다',
  '잠시 멈추고 숨을 고르다',
  '중요한 약속을 깜빡 잊다',
  '기대 이상으로 순조롭게 풀리다',
  '끝까지 포기하지 않고 버티다',
];

function shuffleLocal<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildClientFallbackQuiz(
  usedExpressions: ExpressionItem[],
  beats: StoryboardBeat[]
): QuizQuestion[] {
  const meanings = usedExpressions.map((e) => e.koreanMeaning.trim()).filter(Boolean);
  return usedExpressions.map((expr, idx) => {
    const correctMeaning = expr.koreanMeaning.trim() || `"${expr.expression}"의 문맥 의미`;
    const distractors = shuffleLocal(
      Array.from(new Set([...meanings, ...LOCAL_DISTRACTORS])).filter((m) => m !== correctMeaning)
    ).slice(0, 3);

    let contextSentence = '';
    for (const beat of beats) {
      const lines = beat.lines.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const hit = lines.find((l) => l.includes(expr.expression.trim()));
      if (hit) {
        contextSentence = hit.replace(/^[A-Za-z][A-Za-z0-9\s.'-]{0,20}:\s*/, '').trim();
        break;
      }
    }

    return {
      id: expr.id || `quiz-${idx + 1}`,
      expression: expr.expression,
      movie: expr.movie || '직접 입력',
      correctMeaning,
      options: shuffleLocal([correctMeaning, ...distractors]),
      contextSentence,
    };
  });
}

export const Step7Quiz: React.FC<Step7QuizProps> = ({
  usedExpressions,
  beats,
  onBack,
  onStartOver,
}) => {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showHint, setShowHint] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  const loadQuiz = useCallback(async () => {
    setIsLoading(true);
    setCurrentIndex(0);
    setAnswers({});
    setShowHint(false);
    setIsFinished(false);

    try {
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expressions: usedExpressions,
          beats,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.questions) && data.questions.length > 0) {
          setQuestions(data.questions);
          setIsLoading(false);
          return;
        }
      }
    } catch {
      // Fallback below
    }

    setQuestions(buildClientFallbackQuiz(usedExpressions, beats));
    setIsLoading(false);
  }, [beats, usedExpressions]);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  const activeQuestion = questions[currentIndex];
  const selectedAnswer = activeQuestion ? answers[activeQuestion.id] : undefined;
  const hasAnsweredCurrent = Boolean(selectedAnswer);

  const score = questions.reduce(
    (sum, q) => (answers[q.id] === q.correctMeaning ? sum + 1 : sum),
    0
  );

  const handleSelectOption = (option: string) => {
    if (!activeQuestion || hasAnsweredCurrent) return;
    setAnswers((prev) => ({
      ...prev,
      [activeQuestion.id]: option,
    }));
  };

  const handleNextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setShowHint(false);
    } else {
      setIsFinished(true);
    }
  };

  const handleRetrySameQuiz = () => {
    setQuestions((prev) =>
      prev.map((q) => ({
        ...q,
        options: shuffleLocal(q.options),
      }))
    );
    setCurrentIndex(0);
    setAnswers({});
    setShowHint(false);
    setIsFinished(false);
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#2A6F68] mx-auto" aria-hidden="true" />
        <p className="text-base font-semibold text-slate-800">
          방금 영상에서 사용한 표현들로 뜻 맞추기 퀴즈를 준비하고 있어요...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24 sm:pb-8">
      {!isFinished && activeQuestion ? (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 space-y-6">
          {/* Top Quiz Progress */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900">
                사용한 표현 뜻 맞추기 퀴즈
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                영상 속에서 들었던 영어 표현의 알맞은 한국어 뜻을 골라 보세요.
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm font-bold font-mono-num shrink-0">
              <span className="px-3 py-1 rounded-lg bg-[#E9F3F1] text-[#1F534E]">
                문제 {currentIndex + 1} / {questions.length}
              </span>
              <span className="text-slate-700">점수 {score}점</span>
            </div>
          </div>

          {/* Question Card */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#F6F8FA] border border-slate-200 space-y-3 text-center">
            <div className="text-xs font-semibold text-[#2A6F68]">
              출처 영화: {activeQuestion.movie}
            </div>
            <div className="font-display text-2xl sm:text-3xl font-bold text-slate-900 break-words">
              {activeQuestion.expression}
            </div>

            {activeQuestion.contextSentence && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowHint((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#2A6F68] px-3 py-1.5 rounded-lg bg-white border border-slate-200"
                >
                  {showHint ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>문장 힌트 숨기기</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>영상 속 문장 힌트 보기</span>
                    </>
                  )}
                </button>
                {showHint && (
                  <p className="mt-2.5 text-sm sm:text-base text-slate-700 italic bg-white p-3 rounded-xl border border-slate-200">
                    "{activeQuestion.contextSentence}"
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 4 Options */}
          <div className="grid grid-cols-1 gap-3">
            {activeQuestion.options.map((opt, idx) => {
              const isSelected = selectedAnswer === opt;
              const isCorrect = opt === activeQuestion.correctMeaning;

              let cardStyle =
                'bg-white border-slate-200 hover:border-[#2A6F68] hover:bg-[#F3F8F7]/60 text-slate-800';
              if (hasAnsweredCurrent) {
                if (isCorrect) {
                  cardStyle = 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold';
                } else if (isSelected && !isCorrect) {
                  cardStyle = 'bg-rose-50 border-rose-400 text-rose-900';
                } else {
                  cardStyle = 'bg-slate-50 border-slate-200 text-slate-400';
                }
              }

              return (
                <button
                  key={`${activeQuestion.id}-opt-${idx}`}
                  type="button"
                  disabled={hasAnsweredCurrent}
                  onClick={() => handleSelectOption(opt)}
                  className={`min-h-[54px] w-full p-4 rounded-xl border text-left text-base font-medium transition-colors flex items-center justify-between gap-3 ${cardStyle}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold font-mono-num flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span>{opt}</span>
                  </div>

                  {hasAnsweredCurrent && isCorrect && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
                  )}
                  {hasAnsweredCurrent && isSelected && !isCorrect && (
                    <XCircle className="w-5 h-5 text-rose-600 shrink-0" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Immediate Feedback & Next Question */}
          {hasAnsweredCurrent && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
              <div
                className={`text-sm sm:text-base font-semibold ${
                  selectedAnswer === activeQuestion.correctMeaning
                    ? 'text-emerald-700'
                    : 'text-rose-700'
                }`}
              >
                {selectedAnswer === activeQuestion.correctMeaning
                  ? '정답입니다! 영상 속 표현을 정확히 기억하고 있어요.'
                  : `아쉬워요! 정답은 "${activeQuestion.correctMeaning}" 입니다.`}
              </div>

              <button
                type="button"
                onClick={handleNextQuestion}
                className="min-h-[46px] px-6 py-2.5 rounded-xl bg-[#2A6F68] hover:bg-[#225B55] text-white font-semibold text-base flex items-center justify-center gap-2 shrink-0"
              >
                <span>
                  {currentIndex < questions.length - 1 ? '다음 문제' : '퀴즈 결과 보기'}
                </span>
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          )}
        </section>
      ) : (
        /* Quiz Summary Result */
        <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 space-y-6">
          <div className="text-center space-y-2 py-4 border-b border-slate-100">
            <div className="w-14 h-14 rounded-2xl bg-[#E9F3F1] text-[#2A6F68] flex items-center justify-center mx-auto">
              <Trophy className="w-7 h-7" aria-hidden="true" />
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
              퀴즈 완료! {questions.length}문제 중 {score}문제 정답
            </h1>
            <p className="text-sm sm:text-base text-slate-600">
              직접 만든 30초 영화 영어 클립과 퀴즈로 오늘의 표현을 복습했어요.
            </p>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {questions.map((q) => {
              const userPick = answers[q.id];
              const isOk = userPick === q.correctMeaning;
              return (
                <div
                  key={q.id}
                  className="p-4 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      {isOk ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-600 shrink-0" aria-hidden="true" />
                      )}
                      <span className="font-bold text-slate-900">{q.expression}</span>
                      <span className="text-xs text-slate-400">({q.movie})</span>
                    </div>
                    <div className="text-sm text-slate-700 mt-0.5 pl-6">
                      정답: <span className="font-semibold">{q.correctMeaning}</span>
                      {!isOk && userPick && (
                        <span className="text-rose-600 ml-2">(내 선택: {userPick})</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleRetrySameQuiz}
              className="flex-1 min-h-[48px] px-5 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-base flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-5 h-5" aria-hidden="true" />
              <span>퀴즈 다시 풀기</span>
            </button>

            <button
              type="button"
              onClick={onStartOver}
              className="flex-1 min-h-[48px] px-5 py-3 rounded-xl bg-[#2A6F68] hover:bg-[#225B55] text-white font-semibold text-base flex items-center justify-center gap-2"
            >
              <span>새 표현으로 영상 만들기</span>
            </button>
          </div>
        </section>
      )}

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 sm:static bg-white/95 sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none border-t sm:border-t-0 border-slate-200 p-3 sm:p-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] px-5 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-base flex items-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            <span>영상 화면으로</span>
          </button>
        </div>
      </div>
    </div>
  );
};

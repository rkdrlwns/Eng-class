import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  Loader2,
  Edit3,
  Eye,
} from 'lucide-react';
import {
  ExpressionItem,
  StoryboardBeat,
  countBeatWords,
  countTotalWords,
  findBeatMatchedExpressions,
  findMissingExpressions,
} from '../types';

interface Step4StoryboardProps {
  beats: StoryboardBeat[];
  selectedExpressions: ExpressionItem[];
  serverWarning: string | null;
  regeneratingBeatIdx: number | null;
  onUpdateBeats: (next: StoryboardBeat[]) => void;
  onRegenerateBeat: (beatIndex: number) => Promise<void>;
  onRegenerateAll: () => Promise<void>;
  isRegeneratingAll: boolean;
  onBack: () => void;
  onNext: () => void;
}

export const Step4Storyboard: React.FC<Step4StoryboardProps> = ({
  beats,
  selectedExpressions,
  serverWarning,
  regeneratingBeatIdx,
  onUpdateBeats,
  onRegenerateBeat,
  onRegenerateAll,
  isRegeneratingAll,
  onBack,
  onNext,
}) => {
  const [editingBeatId, setEditingBeatId] = useState<string | null>(null);
  const [popupExpr, setPopupExpr] = useState<ExpressionItem | null>(null);

  const totalWords = useMemo(() => countTotalWords(beats), [beats]);
  const missingExprs = useMemo(
    () => findMissingExpressions(beats, selectedExpressions),
    [beats, selectedExpressions]
  );

  const isWordCountOk = totalWords >= 60 && totalWords <= 70;
  const isAllExprOk = missingExprs.length === 0;

  const handleFieldChange = (
    beatIndex: number,
    field: 'sceneDescription' | 'lines',
    value: string
  ) => {
    const next = beats.map((beat, idx) => {
      if (idx !== beatIndex) return beat;
      const updatedLines = field === 'lines' ? value : beat.lines;
      const matched = findBeatMatchedExpressions(updatedLines, selectedExpressions);
      const movies = Array.from(
        new Set(matched.map((m) => m.movie).filter((m): m is Exclude<typeof m, ''> => m !== ''))
      );
      return {
        ...beat,
        [field]: value,
        expressionsUsed: matched.map((m) => m.expression),
        sourceMovies: movies,
      };
    });
    onUpdateBeats(next);
  };

  /**
   * Render English lines with exact selected expressions highlighted in bold & color.
   * Clicking a highlighted expression opens the meaning + source movie popup.
   */
  const renderHighlightedLines = (lines: string) => {
    const sortedExprs = [...selectedExpressions]
      .filter((e) => e.expression.trim().length > 0)
      .sort((a, b) => b.expression.length - a.expression.length);

    if (sortedExprs.length === 0) {
      return <span className="whitespace-pre-line">{lines}</span>;
    }

    const renderSegment = (text: string, keyPrefix: string): React.ReactNode[] => {
      if (!text) return [];

      // Find earliest occurrence of any selected expression
      let earliestIndex = -1;
      let earliestExpr: ExpressionItem | null = null;

      for (const expr of sortedExprs) {
        const needle = expr.expression.trim();
        if (!needle) continue;
        const idx = text.indexOf(needle);
        if (idx !== -1 && (earliestIndex === -1 || idx < earliestIndex)) {
          earliestIndex = idx;
          earliestExpr = { ...expr, expression: needle };
        }
      }

      if (earliestIndex === -1 || !earliestExpr) {
        return [<span key={`${keyPrefix}-plain`}>{text}</span>];
      }

      const before = text.slice(0, earliestIndex);
      const matchStr = text.slice(earliestIndex, earliestIndex + earliestExpr.expression.length);
      const after = text.slice(earliestIndex + earliestExpr.expression.length);

      return [
        before ? <span key={`${keyPrefix}-b`}>{before}</span> : null,
        <button
          key={`${keyPrefix}-m-${earliestExpr.id}`}
          type="button"
          onClick={() => setPopupExpr(earliestExpr)}
          title="클릭해서 뜻과 출처 영화 보기"
          className="inline-block px-1.5 py-0.5 mx-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold underline decoration-amber-500/70 decoration-2 underline-offset-2 transition-colors cursor-pointer"
        >
          {matchStr}
        </button>,
        ...renderSegment(after, `${keyPrefix}-a`),
      ].filter(Boolean);
    };

    const lineList = lines.split(/\r?\n/);
    return (
      <div className="space-y-1.5 leading-relaxed">
        {lineList.map((line, i) => (
          <p key={i} className="text-slate-900 text-base">
            {renderSegment(line, `line-${i}`)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-24 sm:pb-6">
      {/* Word Count & Expression Check Header */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">
              30초 스토리보드 확인 및 다듬기
            </h1>
            <p className="mt-1 text-sm sm:text-base text-slate-600">
              강조된 영어 표현을 누르면 한국어 뜻과 출처 영화를 볼 수 있어요. 대사를 수정하거나 비트별로 다시 만들 수 있습니다.
            </p>
          </div>

          <button
            type="button"
            disabled={isRegeneratingAll || regeneratingBeatIdx !== null}
            onClick={onRegenerateAll}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
          >
            {isRegeneratingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
            )}
            <span>전체 대본 다시 쓰기</span>
          </button>
        </div>

        {/* Live Metrics & Validation */}
        <div
          className={`mt-5 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
            isWordCountOk && isAllExprOk
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              : 'bg-amber-50/90 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {isWordCountOk && isAllExprOk ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div className="text-sm sm:text-base space-y-1">
              <p className="font-semibold">
                {isWordCountOk && isAllExprOk
                  ? '단어 수(60~70단어)와 선택한 표현이 모두 알맞게 들어갔어요!'
                  : '아래 항목을 확인한 뒤 필요하면 대사를 조금 수정해 주세요:'}
              </p>
              {!isWordCountOk && (
                <p className="text-sm">
                  • 현재 {totalWords}단어입니다. 30초 속도에 맞게 60~70단어 사이로 맞추는 것을 권장해요.
                </p>
              )}
              {!isAllExprOk && (
                <p className="text-sm">
                  • 누락된 표현({missingExprs.length}개):{' '}
                  <span className="font-semibold">
                    {missingExprs.map((m) => m.expression).join(', ')}
                  </span>
                </p>
              )}
              {serverWarning && <p className="text-sm opacity-90">• {serverWarning}</p>}
            </div>
          </div>

          <div className="text-sm sm:text-base font-bold font-mono-num shrink-0">
            총 단어 수: {totalWords} / 60–70단어
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="mt-5 hidden lg:block overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4 w-32">시간 / 비트</th>
                <th className="py-3 px-4 w-64">장면 설명</th>
                <th className="py-3 px-4">영어 대사 (= 자막)</th>
                <th className="py-3 px-4 w-48">사용된 표현</th>
                <th className="py-3 px-4 w-36">출처 영화</th>
                <th className="py-3 px-4 w-32 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {beats.map((beat, idx) => {
                const isEditing = editingBeatId === beat.id;
                const isRegen = regeneratingBeatIdx === idx;
                const beatWords = countBeatWords(beat.lines);
                const matched = findBeatMatchedExpressions(beat.lines, selectedExpressions);

                return (
                  <tr key={beat.id} className="align-top bg-white">
                    <td className="py-4 px-4">
                      <div className="font-mono-num text-sm font-bold text-[#2A6F68]">
                        {beat.timeRange}
                      </div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">
                        {beat.label}
                      </div>
                      <div className="text-xs text-slate-500">{beat.koreanLabel}</div>
                      <div className="mt-2 text-xs text-slate-500 font-mono-num">
                        {beatWords}단어
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      {isEditing ? (
                        <textarea
                          rows={4}
                          value={beat.sceneDescription}
                          onChange={(e) =>
                            handleFieldChange(idx, 'sceneDescription', e.target.value)
                          }
                          className="w-full p-2.5 rounded-lg border border-slate-300 text-sm text-slate-800 focus:outline-none focus:border-[#2A6F68]"
                        />
                      ) : (
                        <p className="text-sm text-slate-600 leading-relaxed">
                          {beat.sceneDescription}
                        </p>
                      )}
                    </td>

                    <td className="py-4 px-4">
                      {isEditing ? (
                        <textarea
                          rows={4}
                          value={beat.lines}
                          onChange={(e) => handleFieldChange(idx, 'lines', e.target.value)}
                          className="w-full p-3 rounded-lg border border-[#2A6F68] text-base text-slate-900 focus:outline-none"
                        />
                      ) : (
                        renderHighlightedLines(beat.lines)
                      )}
                    </td>

                    <td className="py-4 px-4">
                      {matched.length === 0 ? (
                        <span className="text-xs text-rose-600 font-medium">
                          표현이 포함되지 않았어요
                        </span>
                      ) : (
                        <div className="flex flex-col gap-1.5 items-start">
                          {matched.map((expr) => (
                            <button
                              key={expr.id}
                              type="button"
                              onClick={() => setPopupExpr(expr)}
                              className="text-left text-sm font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition-colors"
                            >
                              {expr.expression}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="py-4 px-4 text-sm text-slate-700">
                      {matched.length > 0
                        ? Array.from(new Set(matched.map((m) => m.movie).filter(Boolean))).join(
                            ' · '
                          ) || '미지정'
                        : '-'}
                    </td>

                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingBeatId(isEditing ? null : beat.id)}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5"
                        >
                          {isEditing ? (
                            <>
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>완료</span>
                            </>
                          ) : (
                            <>
                              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>직접 수정</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={isRegen || isRegeneratingAll}
                          onClick={() => onRegenerateBeat(idx)}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#E9F3F1] hover:bg-[#D7EBE7] text-[#1F534E] text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {isRegen ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          <span>다시 생성</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile & Tablet Card View */}
        <div className="mt-5 space-y-4 lg:hidden">
          {beats.map((beat, idx) => {
            const isEditing = editingBeatId === beat.id;
            const isRegen = regeneratingBeatIdx === idx;
            const beatWords = countBeatWords(beat.lines);
            const matched = findBeatMatchedExpressions(beat.lines, selectedExpressions);
            const movies = Array.from(new Set(matched.map((m) => m.movie).filter(Boolean)));

            return (
              <div
                key={beat.id}
                className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-white space-y-3"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num text-sm font-bold text-[#2A6F68]">
                        {beat.timeRange}
                      </span>
                      <span className="text-base font-bold text-slate-900">
                        {beat.label} ({beat.koreanLabel})
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono-num">
                      {beatWords}단어 · {movies.length > 0 ? movies.join(', ') : '출처 영화 없음'}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingBeatId(isEditing ? null : beat.id)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold flex items-center gap-1"
                    >
                      {isEditing ? (
                        <>
                          <Eye className="w-4 h-4" aria-hidden="true" />
                          <span>완료</span>
                        </>
                      ) : (
                        <>
                          <Edit3 className="w-4 h-4" aria-hidden="true" />
                          <span>수정</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={isRegen || isRegeneratingAll}
                      onClick={() => onRegenerateBeat(idx)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#E9F3F1] text-[#1F534E] text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                    >
                      {isRegen ? (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <RefreshCw className="w-4 h-4" aria-hidden="true" />
                      )}
                      <span>재생성</span>
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1">장면 설명</div>
                  {isEditing ? (
                    <textarea
                      rows={3}
                      value={beat.sceneDescription}
                      onChange={(e) =>
                        handleFieldChange(idx, 'sceneDescription', e.target.value)
                      }
                      className="w-full p-3 rounded-lg border border-slate-300 text-sm text-slate-800 focus:outline-none focus:border-[#2A6F68]"
                    />
                  ) : (
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {beat.sceneDescription}
                    </p>
                  )}
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1">
                    영어 대사 (= 자막)
                  </div>
                  {isEditing ? (
                    <textarea
                      rows={3}
                      value={beat.lines}
                      onChange={(e) => handleFieldChange(idx, 'lines', e.target.value)}
                      className="w-full p-3 rounded-lg border border-[#2A6F68] text-base text-slate-900 focus:outline-none"
                    />
                  ) : (
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      {renderHighlightedLines(beat.lines)}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs font-semibold text-slate-500 mr-1">사용된 표현:</span>
                  {matched.length === 0 ? (
                    <span className="text-xs text-rose-600 font-medium">없음</span>
                  ) : (
                    matched.map((expr) => (
                      <button
                        key={expr.id}
                        type="button"
                        onClick={() => setPopupExpr(expr)}
                        className="text-xs font-bold text-amber-900 bg-amber-100 px-2.5 py-1 rounded-md"
                      >
                        {expr.expression}
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Meaning Popup Modal */}
      {popupExpr && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="expr-popup-title"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPopupExpr(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-[#2A6F68]">선택한 영어 표현</div>
                <h2 id="expr-popup-title" className="font-display text-2xl font-bold text-slate-900 mt-1">
                  {popupExpr.expression}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPopupExpr(null)}
                aria-label="팝업 닫기"
                className="min-w-[40px] min-h-[40px] rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div>
                <div className="text-xs font-semibold text-slate-500">한국어 뜻</div>
                <div className="text-lg font-semibold text-slate-900 mt-0.5">
                  {popupExpr.koreanMeaning || '등록된 뜻이 없습니다.'}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-500">출처 영화</div>
                <div className="text-base font-medium text-slate-700 mt-0.5">
                  {popupExpr.movie || '직접 입력 / 미지정'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPopupExpr(null)}
              className="w-full min-h-[44px] rounded-xl bg-slate-900 text-white font-semibold text-sm"
            >
              확인
            </button>
          </div>
        </div>
      )}

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
            disabled={regeneratingBeatIdx !== null || isRegeneratingAll}
            onClick={onNext}
            className="flex-1 sm:flex-none min-h-[48px] px-7 py-3 rounded-xl bg-[#2A6F68] hover:bg-[#225B55] text-white font-semibold text-base flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <span>다음: AI 영상·음성 만들기</span>
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useMemo } from 'react';
import {
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Keyboard,
} from 'lucide-react';
import {
  ExpressionItem,
  SUGGESTED_MOVIES,
  createEmptyExpressionRow,
} from '../types';

interface Step2ExpressionsProps {
  expressions: ExpressionItem[];
  onChange: (next: ExpressionItem[]) => void;
  onNext: () => void;
}

export const Step2Expressions: React.FC<Step2ExpressionsProps> = ({
  expressions,
  onChange,
  onNext,
}) => {
  const filledItems = useMemo(
    () => expressions.filter((e) => e.expression.trim().length > 0),
    [expressions]
  );

  const filledCount = filledItems.length;

  const distinctMovies = useMemo(() => {
    return new Set(
      filledItems
        .map((e) => e.movie.trim().toLowerCase())
        .filter((m) => m.length > 0)
    );
  }, [filledItems]);

  const hasUnassignedMovie = filledItems.some((e) => e.movie.trim().length === 0);

  const duplicateSpellings = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const item of filledItems) {
      const norm = item.expression.trim().toLowerCase();
      if (seen.has(norm)) {
        dupes.add(item.expression.trim());
      } else {
        seen.add(norm);
      }
    }
    return Array.from(dupes);
  }, [filledItems]);

  const isCountValid = filledCount >= 5;
  const isMovieCountValid = distinctMovies.size >= 2;
  const canProceed = isCountValid && isMovieCountValid && !hasUnassignedMovie;

  const updateField = <K extends keyof ExpressionItem>(
    id: string,
    key: K,
    value: ExpressionItem[K]
  ) => {
    onChange(
      expressions.map((item) =>
        item.id === id ? { ...item, [key]: value, selected: true } : item
      )
    );
  };

  const deleteRow = (id: string) => {
    onChange(expressions.filter((item) => item.id !== id));
  };

  const addManualRow = () => {
    onChange([...expressions, createEmptyExpressionRow()]);
  };

  return (
    <div className="space-y-5 pb-24 sm:pb-6">
      <datalist id="els-movie-suggestions">
        {SUGGESTED_MOVIES.map((title) => (
          <option key={title} value={title} />
        ))}
      </datalist>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2A6F68] mb-1">
              <Keyboard className="w-4 h-4" aria-hidden="true" />
              <span>직접 스펠링 입력</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900">
              사용할 영어 표현 직접 입력하기
            </h1>
            <p className="mt-1 text-sm sm:text-base text-slate-600">
              외우거나 쓰고 싶은 영어 표현의 스펠링을 직접 입력하세요. 입력하신 철자와 대소문자 그대로 30초 대본과 자막에 들어갑니다.
            </p>
          </div>

          <button
            type="button"
            onClick={addManualRow}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#E9F3F1] hover:bg-[#D7EBE7] text-[#1F534E] font-semibold text-sm flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>표현 칸 추가</span>
          </button>
        </div>

        {/* Validation Status Bar */}
        <div
          className={`mt-5 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
            canProceed
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              : 'bg-amber-50/90 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {canProceed ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div className="text-sm sm:text-base">
              {canProceed ? (
                <span className="font-semibold">
                  조건을 모두 충족했어요! 다음 단계로 넘어가 장면을 설정하세요.
                </span>
              ) : (
                <div className="space-y-0.5">
                  <p className="font-semibold">다음 조건을 맞춰 주세요:</p>
                  <p className="text-sm">
                    {!isCountValid && '• 최소 5개 이상의 영어 표현 스펠링을 입력해 주세요. '}
                    {!isMovieCountValid && '• 2편 이상의 서로 다른 영화에서 표현을 입력해 주세요. '}
                    {hasUnassignedMovie && '• 입력한 표현의 출처 영화를 적어 주세요.'}
                  </p>
                </div>
              )}
              {duplicateSpellings.length > 0 && (
                <p className="text-xs text-amber-800 mt-1">
                  중복 입력된 표현이 있어요: {duplicateSpellings.join(', ')}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm font-medium shrink-0 font-mono-num">
            <span>입력: {filledCount} / 5개 이상</span>
            <span aria-hidden="true" className="opacity-40">
              ·
            </span>
            <span>영화: {distinctMovies.size} / 2편 이상</span>
          </div>
        </div>

        {/* Direct Input Table (Desktop) / Card List (Mobile) */}
        {expressions.length === 0 ? (
          <div className="mt-6 py-12 text-center border border-dashed border-slate-200 rounded-xl text-slate-500">
            <p className="text-base">입력 칸이 없습니다. 새 표현 입력 칸을 추가해 주세요.</p>
            <button
              type="button"
              onClick={addManualRow}
              className="mt-3 min-h-[44px] px-4 py-2 rounded-xl bg-[#2A6F68] text-white text-sm font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>표현 칸 추가하기</span>
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="mt-5 hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4 w-14 text-center">번호</th>
                    <th className="py-3 px-3">영어 표현 스펠링 (대본에 들어갈 정확한 형태)</th>
                    <th className="py-3 px-3">한국어 뜻 (선택)</th>
                    <th className="py-3 px-3 w-52">출처 영화 (직접 입력)</th>
                    <th className="py-3 px-3 w-16 text-center">삭제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expressions.map((item, idx) => {
                    const isFilled = item.expression.trim().length > 0;
                    const needsMovie = isFilled && item.movie.trim().length === 0;
                    return (
                      <tr
                        key={item.id}
                        className={isFilled ? 'bg-[#F3F8F7]/60' : 'bg-white hover:bg-slate-50/70'}
                      >
                        <td className="py-2.5 px-4 text-center font-mono-num text-sm font-semibold text-slate-500">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={item.expression}
                            autoComplete="off"
                            autoCapitalize="none"
                            spellCheck={true}
                            placeholder="예: get ahead of myself"
                            onChange={(e) => updateField(item.id, 'expression', e.target.value)}
                            aria-label={`${idx + 1}번 영어 표현 스펠링`}
                            className="w-full min-h-[42px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-900 font-medium text-sm focus:outline-none focus:border-[#2A6F68]"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={item.koreanMeaning}
                            placeholder="예: 너무 앞서 나가다 (비워도 됨)"
                            onChange={(e) => updateField(item.id, 'koreanMeaning', e.target.value)}
                            aria-label={`${idx + 1}번 한국어 뜻`}
                            className="w-full min-h-[42px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm focus:outline-none focus:border-[#2A6F68]"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            list="els-movie-suggestions"
                            value={item.movie}
                            placeholder="예: Inside Out 2"
                            onChange={(e) => updateField(item.id, 'movie', e.target.value)}
                            aria-label={`${idx + 1}번 출처 영화`}
                            className={`w-full min-h-[42px] px-3 py-1.5 rounded-lg border text-sm bg-white focus:outline-none focus:border-[#2A6F68] ${
                              needsMovie
                                ? 'border-amber-300 text-amber-900 bg-amber-50/40'
                                : 'border-slate-200 text-slate-800'
                            }`}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => deleteRow(item.id)}
                            aria-label={`${idx + 1}번 표현 삭제`}
                            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Rows */}
            <div className="mt-4 space-y-3 md:hidden">
              {expressions.map((item, idx) => {
                const isFilled = item.expression.trim().length > 0;
                const needsMovie = isFilled && item.movie.trim().length === 0;
                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      isFilled
                        ? 'bg-[#F3F8F7] border-[#2A6F68]/40'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-sm font-bold text-[#2A6F68] font-mono-num">
                        표현 {idx + 1}
                      </span>

                      <button
                        type="button"
                        onClick={() => deleteRow(item.id)}
                        aria-label={`${idx + 1}번 표현 삭제`}
                        className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="w-5 h-5" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          영어 표현 스펠링 (필수)
                        </label>
                        <input
                          type="text"
                          value={item.expression}
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={true}
                          placeholder="예: get ahead of myself"
                          onChange={(e) => updateField(item.id, 'expression', e.target.value)}
                          className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 font-semibold text-base focus:outline-none focus:border-[#2A6F68]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          한국어 뜻 (선택)
                        </label>
                        <input
                          type="text"
                          value={item.koreanMeaning}
                          placeholder="예: 너무 앞서 나가다 (비워도 됨)"
                          onChange={(e) => updateField(item.id, 'koreanMeaning', e.target.value)}
                          className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-base focus:outline-none focus:border-[#2A6F68]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          출처 영화 (필수 · 직접 입력)
                        </label>
                        <input
                          type="text"
                          list="els-movie-suggestions"
                          value={item.movie}
                          placeholder="예: Inside Out 2, Notting Hill, Minari"
                          onChange={(e) => updateField(item.id, 'movie', e.target.value)}
                          className={`w-full min-h-[44px] px-3 py-2 rounded-lg border text-base bg-white focus:outline-none focus:border-[#2A6F68] ${
                            needsMovie
                              ? 'border-amber-300 text-amber-900 bg-amber-50/40'
                              : 'border-slate-200 text-slate-800'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={addManualRow}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-dashed border-slate-300 hover:border-[#2A6F68] hover:bg-[#F3F8F7]/60 text-slate-700 hover:text-[#1F534E] font-semibold text-sm flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>표현 칸 하나 더 추가하기</span>
              </button>
            </div>
          </>
        )}
      </section>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 sm:static bg-white/95 sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none border-t sm:border-t-0 border-slate-200 p-3 sm:p-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={!canProceed}
            onClick={onNext}
            className="w-full sm:w-auto min-h-[48px] px-7 py-3 rounded-xl bg-[#2A6F68] hover:bg-[#225B55] text-white font-semibold text-base flex items-center justify-center gap-2 transition-colors disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
          >
            <span>다음: 장면 설정하기</span>
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

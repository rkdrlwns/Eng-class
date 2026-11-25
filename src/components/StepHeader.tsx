import React from 'react';
import { Check } from 'lucide-react';

export interface StepDef {
  id: number;
  shortLabel: string;
  fullLabel: string;
}

export const APP_STEPS: StepDef[] = [
  { id: 1, shortLabel: '표현', fullLabel: '1. 표현 입력' },
  { id: 2, shortLabel: '장면', fullLabel: '2. 장면 설정' },
  { id: 3, shortLabel: '대본', fullLabel: '3. 스토리보드' },
  { id: 4, shortLabel: '제작', fullLabel: '4. 영상 제작' },
  { id: 5, shortLabel: '완성', fullLabel: '5. 최종 완성' },
  { id: 6, shortLabel: '퀴즈', fullLabel: '6. 단어 퀴즈' },
];

interface StepHeaderProps {
  currentStep: number;
  maxReachedStep: number;
  onSelectStep: (step: number) => void;
}

export const StepHeader: React.FC<StepHeaderProps> = ({
  currentStep,
  maxReachedStep,
  onSelectStep,
}) => {
  const progressPercent = Math.round(((currentStep - 1) / (APP_STEPS.length - 1)) * 100);

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="h-12 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onSelectStep(1)}
            className="font-display text-lg font-bold tracking-tight text-[#1E293B] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2A6F68] rounded-md px-1"
          >
            [ELS]
          </button>

          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600 whitespace-nowrap shrink-0">
            <span className="font-semibold text-[#2A6F68] font-mono-num">
              {currentStep} / {APP_STEPS.length}단계
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-medium text-slate-700 truncate max-w-[140px] sm:max-w-none">
              {APP_STEPS[currentStep - 1]?.fullLabel.replace(/^\d+\.\s*/, '')}
            </span>
          </div>
        </div>

        <div className="pb-2.5">
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-[#2A6F68] transition-all duration-300 ease-out rounded-full"
              style={{ width: `${Math.max(10, progressPercent)}%` }}
            />
          </div>

          <nav
            aria-label="진행 단계"
            className="grid grid-cols-6 gap-1 sm:gap-2"
          >
            {APP_STEPS.map((step) => {
              const isCurrent = step.id === currentStep;
              const isCompleted = step.id < currentStep;
              const isClickable = step.id <= maxReachedStep;

              return (
                <button
                  key={step.id}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onSelectStep(step.id)}
                  className={`min-h-[36px] sm:min-h-[40px] px-1 sm:px-2 rounded-lg text-[11px] sm:text-xs font-medium flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                    isCurrent
                      ? 'bg-[#2A6F68] text-white font-semibold'
                      : isCompleted
                      ? 'bg-[#E9F3F1] text-[#1F534E] hover:bg-[#D7EBE7]'
                      : isClickable
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      : 'bg-transparent text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-3.5 h-3.5 shrink-0 hidden sm:inline" aria-hidden="true" />
                  ) : (
                    <span className="font-mono-num">{step.id}.</span>
                  )}
                  <span className="truncate">{step.shortLabel}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};

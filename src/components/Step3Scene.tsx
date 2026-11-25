import React from 'react';
import { ArrowLeft, ArrowRight, Loader2, Users, User, AlertCircle } from 'lucide-react';
import { ART_STYLE_LABELS, ArtStyle, SceneConfig, StoryFormat } from '../types';

interface Step3SceneProps {
  scene: SceneConfig;
  selectedCount: number;
  isGenerating: boolean;
  errorMsg: string | null;
  onChange: (next: SceneConfig) => void;
  onBack: () => void;
  onGenerateStoryboard: () => void;
}

const PLACE_PRESETS = [
  '대학교 앞 조용한 카페',
  '캠퍼스 도서관 라운지',
  '아르바이트 중인 편의점',
  '강아지와 산책하는 공원',
  '여행길 기차역 플랫폼',
];

const SITUATION_PRESETS = [
  '중간고사 팀플 발표 직전 긴장되는 순간',
  '알바 중 음료 실수를 수습하고 화해하는 상황',
  '새로운 동아리나 학교에 적응하며 고민하는 대화',
  '주말 여행 계획을 세우다 의견이 갈린 상황',
  '강아지 산책 중 뜻밖의 해프닝이 벌어진 일상',
];

export const Step3Scene: React.FC<Step3SceneProps> = ({
  scene,
  selectedCount,
  isGenerating,
  errorMsg,
  onChange,
  onBack,
  onGenerateStoryboard,
}) => {
  const isFormValid =
    scene.place.trim().length > 0 &&
    scene.characters.trim().length > 0 &&
    scene.situation.trim().length > 0;

  const setFormat = (format: StoryFormat) => {
    const defaultChars =
      format === 'dialogue'
        ? '지훈 (대학생 2학년, 밝은 성격) & 서연 (같은 과 친구, 차분한 성격)'
        : '하은 (졸업반 대학생 1인, 내레이터)';
    onChange({
      ...scene,
      format,
      characters:
        scene.characters.trim().length === 0 ||
        scene.characters.includes('지훈') ||
        scene.characters.includes('하은')
          ? defaultChars
          : scene.characters,
    });
  };

  return (
    <div className="space-y-5 pb-24 sm:pb-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            장면과 화풍 설정하기
          </h1>
          <p className="mt-1 text-sm sm:text-base text-slate-600">
            고른 {selectedCount}개의 표현이 자연스럽게 어우러질 우리만의 새 이야기를 설계해요.
            영화 캐릭터나 실존 인물 대신 새로운 인물과 일상을 적어 주세요.
          </p>
        </div>

        {/* 1. Format */}
        <div>
          <label className="block text-sm font-bold text-slate-800 mb-2">
            형식 선택
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFormat('dialogue')}
              className={`min-h-[64px] p-4 rounded-xl border text-left transition-colors flex items-center gap-3.5 ${
                scene.format === 'dialogue'
                  ? 'bg-[#E9F3F1] border-[#2A6F68] text-[#1F534E]'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Users className="w-6 h-6 shrink-0" aria-hidden="true" />
              <div>
                <div className="font-bold text-base">두 캐릭터의 대화</div>
                <div className="text-xs sm:text-sm opacity-80">
                  두 인물이 서로 다른 목소리로 대화를 나눠요
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setFormat('narration')}
              className={`min-h-[64px] p-4 rounded-xl border text-left transition-colors flex items-center gap-3.5 ${
                scene.format === 'narration'
                  ? 'bg-[#E9F3F1] border-[#2A6F68] text-[#1F534E]'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <User className="w-6 h-6 shrink-0" aria-hidden="true" />
              <div>
                <div className="font-bold text-base">1인 내레이션</div>
                <div className="text-xs sm:text-sm opacity-80">
                  주인공 한 명의 일기/독백처럼 이야기를 들려줘요
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* 2. Place */}
        <div>
          <label htmlFor="scene-place" className="block text-sm font-bold text-slate-800 mb-2">
            장소
          </label>
          <input
            id="scene-place"
            type="text"
            value={scene.place}
            onChange={(e) => onChange({ ...scene, place: e.target.value })}
            placeholder="예: 대학교 앞 조용한 카페, 캠퍼스 벤치"
            className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-base focus:outline-none focus:border-[#2A6F68]"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PLACE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onChange({ ...scene, place: preset })}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  scene.place === preset
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Characters */}
        <div>
          <label htmlFor="scene-characters" className="block text-sm font-bold text-slate-800 mb-1">
            등장인물 (새로운 창작 인물)
          </label>
          <p className="text-xs sm:text-sm text-slate-500 mb-2">
            영화 속 인물·감정 캐릭터·연예인 대신 새로운 한국 대학생이나 일상 인물을 적어 주세요.
          </p>
          <input
            id="scene-characters"
            type="text"
            value={scene.characters}
            onChange={(e) => onChange({ ...scene, characters: e.target.value })}
            placeholder="예: Mina (대학생) & Jun (같은 동아리 친구)"
            className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-base focus:outline-none focus:border-[#2A6F68]"
          />
        </div>

        {/* 4. Situation */}
        <div>
          <label htmlFor="scene-situation" className="block text-sm font-bold text-slate-800 mb-2">
            상황 (캠퍼스·카페·알바·여행·반려동물 등)
          </label>
          <textarea
            id="scene-situation"
            rows={2}
            value={scene.situation}
            onChange={(e) => onChange({ ...scene, situation: e.target.value })}
            placeholder="예: 카페에서 아르바이트를 하다 실수로 커피를 쏟았지만, 솔직하게 사과하고 함께 수습하는 이야기"
            className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-base focus:outline-none focus:border-[#2A6F68]"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SITUATION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onChange({ ...scene, situation: preset })}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs sm:text-sm font-medium text-left transition-colors ${
                  scene.situation === preset
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Style Menu */}
        <div>
          <label className="block text-sm font-bold text-slate-800 mb-2">
            영상 화풍 선택
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(Object.keys(ART_STYLE_LABELS) as ArtStyle[]).map((styleKey) => {
              const info = ART_STYLE_LABELS[styleKey];
              const active = scene.style === styleKey;
              return (
                <button
                  key={styleKey}
                  type="button"
                  onClick={() => onChange({ ...scene, style: styleKey })}
                  className={`min-h-[68px] p-4 rounded-xl border text-left transition-colors ${
                    active
                      ? 'bg-[#E9F3F1] border-[#2A6F68] text-[#1F534E]'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="font-bold text-base">{info.label}</div>
                  <div className="mt-0.5 text-xs sm:text-sm opacity-80">{info.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2.5 text-sm sm:text-base"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}
      </section>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 sm:static bg-white/95 sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none border-t sm:border-t-0 border-slate-200 p-3 sm:p-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={isGenerating}
            onClick={onBack}
            className="min-h-[48px] px-5 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-base flex items-center gap-2 shrink-0"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            <span>이전</span>
          </button>

          <button
            type="button"
            disabled={!isFormValid || isGenerating}
            onClick={onGenerateStoryboard}
            className="flex-1 sm:flex-none min-h-[48px] px-7 py-3 rounded-xl bg-[#2A6F68] hover:bg-[#225B55] text-white font-semibold text-base flex items-center justify-center gap-2 transition-colors disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                <span>30초 스토리보드 작성 중...</span>
              </>
            ) : (
              <>
                <span>다음: 30초 스토리보드 만들기</span>
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

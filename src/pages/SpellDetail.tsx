import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Clock, Target, Zap, Hourglass } from 'lucide-react';
import spellsData from '@/data/spells.json';

const levelLabels: Record<number, string> = {
  0: '戏法',
  1: '1环',
  2: '2环',
  3: '3环',
  4: '4环',
  5: '5环',
  6: '6环',
  7: '7环',
  8: '8环',
  9: '9环',
};

export default function SpellDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const spell = spellsData.find((s) => s.id === id);

  if (!spell) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/spells')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light"
        >
          <ArrowLeft className="w-4 h-4" />
          返回列表
        </button>
        <div className="text-center py-20">
          <p className="text-lg dark:text-text-dark-muted light:text-text-light-muted">
            未找到该法术
          </p>
        </div>
      </div>
    );
  }

  const renderDescription = (text: string) => {
    return text.split('\n\n').map((paragraph, index) => (
      <p key={index} className={index > 0 ? 'mt-4' : ''}>
        {paragraph}
      </p>
    ));
  };

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/spells')}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light"
      >
        <ArrowLeft className="w-4 h-4" />
        返回列表
      </button>

      <div className="rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light overflow-hidden">
        <div className="px-6 py-5 border-b dark:border-border-dark light:border-border-light">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
                <Sparkles className="w-6 h-6 text-primary" />
                {spell.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    spell.level === 0
                      ? 'bg-gray-500/20 text-gray-400'
                      : 'bg-primary/20 text-primary'
                  }`}
                >
                  {levelLabels[spell.level]}
                </span>
                <span className="dark:text-text-dark light:text-text-light">{spell.school}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg dark:bg-white/5 light:bg-white/50">
              <div className="flex items-center gap-2 text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1">
                <Clock className="w-3.5 h-3.5" />
                施法时间
              </div>
              <div className="text-sm font-medium dark:text-text-dark light:text-text-light">
                {spell.castingTime}
              </div>
            </div>
            <div className="p-3 rounded-lg dark:bg-white/5 light:bg-white/50">
              <div className="flex items-center gap-2 text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1">
                <Target className="w-3.5 h-3.5" />
                射程
              </div>
              <div className="text-sm font-medium dark:text-text-dark light:text-text-light">
                {spell.range}
              </div>
            </div>
            <div className="p-3 rounded-lg dark:bg-white/5 light:bg-white/50">
              <div className="flex items-center gap-2 text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1">
                <Zap className="w-3.5 h-3.5" />
                成分
              </div>
              <div className="text-sm font-medium dark:text-text-dark light:text-text-light">
                {[
                  spell.components.verbal && 'V',
                  spell.components.somatic && 'S',
                  spell.components.material && 'M',
                ]
                  .filter(Boolean)
                  .join(', ') || '无'}
              </div>
            </div>
            <div className="p-3 rounded-lg dark:bg-white/5 light:bg-white/50">
              <div className="flex items-center gap-2 text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1">
                <Hourglass className="w-3.5 h-3.5" />
                持续时间
              </div>
              <div className="text-sm font-medium dark:text-text-dark light:text-text-light">
                {spell.duration}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2 dark:text-text-dark light:text-text-light">
              描述
            </h3>
            <div className="p-4 rounded-lg dark:bg-white/5 light:bg-white/50 text-sm leading-relaxed dark:text-text-dark light:text-text-light">
              {renderDescription(spell.description)}
            </div>
          </div>

          {spell.notes && (
            <div>
              <h3 className="text-sm font-semibold mb-2 dark:text-text-dark light:text-text-light">
                备注
              </h3>
              <div className="p-4 rounded-lg bg-primary/10 text-sm dark:text-text-dark light:text-text-light border border-primary/20">
                {spell.notes}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold mb-2 dark:text-text-dark light:text-text-light">
              可用职业
            </h3>
            <div className="flex flex-wrap gap-2">
              {spell.classes.map((cls) => (
                <span
                  key={cls}
                  className="px-3 py-1 rounded-full text-sm dark:bg-white/10 light:bg-white/70 dark:text-text-dark light:text-text-light"
                >
                  {cls}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

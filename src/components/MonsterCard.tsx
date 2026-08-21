import { Card, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import type { NpcTemplate } from '@/types/combat';

interface MonsterCardProps {
  template: NpcTemplate;
}

export default function MonsterCard({ template }: MonsterCardProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/monsters/${template.id}`);
  };

  const crLabel = template.cr !== undefined ? (template.cr % 1 === 0 ? template.cr : template.cr) : '—';
  const sizeLabel = template.size || '—';
  const typeLabel = template.type || '—';
  const alignmentLabel = template.alignment || '—';

  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-shadow dark:bg-bg-card dark:border-border-card light:bg-bg-card light:border-border-card"
      onClick={handleClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base dark:text-text-dark light:text-text-light truncate">
              {template.name}
            </h3>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                CR {crLabel}
              </span>
              <span>{sizeLabel}</span>
              <span>{typeLabel}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="font-medium dark:text-text-dark light:text-text-light">AC</span>
            <span>{template.ac}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-medium dark:text-text-dark light:text-text-light">HP</span>
            <span>{template.maxHp}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-medium dark:text-text-dark light:text-text-light">速度</span>
            <span>{template.speed}尺</span>
          </div>
        </div>
        {template.attacks.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium dark:text-text-dark light:text-text-light">
              {template.attacks.length} 种攻击
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

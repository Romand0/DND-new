import { NodeTypeMeta } from '@/types/flow';

interface NodeCardGhostProps {
  meta: NodeTypeMeta;
}

function NodeCardGhost({ meta }: NodeCardGhostProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/40 bg-primary/10 shadow-lg shadow-primary/20">
      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: meta.color }} />
      <span className="text-sm font-medium dark:text-text-dark light:text-text-light whitespace-nowrap">
        {meta.label}
      </span>
    </div>
  );
}

export default NodeCardGhost;
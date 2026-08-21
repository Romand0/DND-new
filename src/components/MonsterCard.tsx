// 使用 Tailwind CSS 直接实现卡片样式
import { useNavigate } from 'react-router-dom';
import type { NpcTemplate } from '@/types/combat';

interface MonsterCardProps {
  template: NpcTemplate;
}

export default function MonsterCard({ template }: MonsterCardProps) {
  const navigate = useNavigate();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow cursor-pointer">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {template.name}
        </h3>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          CR {template.cr}
        </span>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {template.race}
          </span>
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {template.class}
          </span>
        </div>
        
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {template.description?.substring(0, 100)}...
        </div>
      </div>
      
      <button
        onClick={() => navigate(`/monsters/${template.id}`)}
        className="mt-4 w-full py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
      >
        查看详情
      </button>
    </div>
  );
}

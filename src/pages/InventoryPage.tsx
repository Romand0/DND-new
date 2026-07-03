import { Link } from 'react-router-dom';
import { Package, Coins, ChevronRight, Clock } from 'lucide-react';

export default function InventoryPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">
        物资钱币
      </h1>

      <div className="grid gap-4">
        {/* 装备库 */}
        <Link
          to="/equipment"
          className="block p-6 rounded-xl border transition-all hover:scale-[1.02] dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light hover:border-primary group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Package className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold dark:text-text-dark light:text-text-light group-hover:text-primary transition-colors">
                  装备库
                </h2>
                <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                  浏览和管理所有装备
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 dark:text-text-dark-muted light:text-text-light-muted group-hover:text-primary transition-colors" />
          </div>
        </Link>

        {/* 记录功能 - 即将推出 */}
        <div className="block p-6 rounded-xl border border-dashed dark:bg-card-dark/50 dark:border-border-dark/50 light:bg-card-light/50 light:border-border-light/50 opacity-60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-accent/10">
                <Coins className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold dark:text-text-dark light:text-text-light">
                  记录功能
                </h2>
                <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  即将推出
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

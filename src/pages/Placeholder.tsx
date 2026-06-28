// DM Toolkit - Placeholder Page Component
import { Construction } from 'lucide-react';

interface PlaceholderProps {
  title: string;
  description?: string;
}

export default function Placeholder({ title, description }: PlaceholderProps) {
  return (
    <div className="text-center py-20">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-accent/30 to-primary/30 flex items-center justify-center">
        <Construction className="w-10 h-10 text-accent" />
      </div>
      <h1 className="text-3xl font-bold mb-3 dark:text-text-dark light:text-text-light">
        {title}
      </h1>
      <p className="max-w-md mx-auto dark:text-text-dark-muted light:text-text-light-muted">
        {description || '该功能正在开发中，敬请期待...'}
      </p>
    </div>
  );
}

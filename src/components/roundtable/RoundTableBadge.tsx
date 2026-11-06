// 玩家端圆桌未读角标：pending 检定任务数（Navbar 常驻轮询，DM 端不启用）
import { useRoundTableInbox } from '@/hooks/useRoundTableInbox';
import { hasAuthToken } from '@/lib/api';

export default function RoundTableBadge() {
  const enabled = hasAuthToken();
  const { messages } = useRoundTableInbox({ enabled });
  if (!enabled) return null;
  const pending = messages.filter(m => m.type === 'check_request' && m.status === 'pending').length;
  if (pending === 0) return null;
  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
      {pending > 99 ? '99+' : pending}
    </span>
  );
}

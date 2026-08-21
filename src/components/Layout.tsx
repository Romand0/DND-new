import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import SyncButton from './SyncButton';
import { useAuth } from '@/contexts/AuthContext';

const HIDE_SYNC_BUTTON_PATHS: RegExp[] = [
  /\/inventory\/treasures\/[^/]+\/distribute$/,
  /\/flow-editor\/.+/,
  /\/flows\/[^/]+\/edit$/,
  /\/settings\/flows\/[^/]+\/edit$/,
  /^\/spells$/,
  /^\/spells\/[^/]+$/,
];

export default function Layout() {
  const { user, isDM } = useAuth();
  const location = useLocation();

  const hideSyncButton = HIDE_SYNC_BUTTON_PATHS.some((re) => re.test(location.pathname));

  // 调试:确认 AuthContext 状态
  console.log('Layout render:', { user: user?.username, role: user?.role, isDM });

  return (
    <div className="min-h-screen dark:bg-bg-dark light:bg-bg-light overflow-x-hidden">
      <Navbar variant={isDM ? 'dm' : 'player'} />
      <main className="pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Outlet />
        </div>
      </main>
      {!hideSyncButton && <SyncButton />}
    </div>
  );
}

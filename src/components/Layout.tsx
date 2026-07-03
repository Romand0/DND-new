import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import SyncButton from './SyncButton';
import { useAuth } from '@/contexts/AuthContext';

export default function Layout() {
  const { user, isDM } = useAuth();

  // 调试：确认 AuthContext 状态
  console.log('Layout render:', { user: user?.username, role: user?.role, isDM });

  return (
    <div className="min-h-screen dark:bg-bg-dark light:bg-bg-light">
      <Navbar variant={isDM ? 'dm' : 'player'} />
      <main className="pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Outlet />
        </div>
      </main>
      <SyncButton />
    </div>
  );
}

import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import SyncButton from './SyncButton';
import { hasToken } from '@/lib/api';

export default function Layout() {
  const isDM = hasToken();
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

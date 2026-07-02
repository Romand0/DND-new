// DM Toolkit - Page Layout Component
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import SyncButton from './SyncButton';

export default function Layout() {
  return (
    <div className="min-h-screen dark:bg-bg-dark light:bg-bg-light">
      <Navbar />
      <main className="pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Outlet />
        </div>
      </main>
      <SyncButton />
    </div>
  );
}

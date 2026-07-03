// DM Toolkit - 玩家端布局（精简导航栏，不显示角色卡库和剧情笔记）
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function PlayerLayout() {
  return (
    <div className="min-h-screen dark:bg-bg-dark light:bg-bg-light">
      <Navbar variant="player" />
      <main className="pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

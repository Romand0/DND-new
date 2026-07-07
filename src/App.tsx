// DM Toolkit - Application Router
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import Layout from '@/components/Layout';
import PlayerLayout from '@/components/PlayerLayout';
import Home from '@/pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import CharacterList from '@/pages/CharacterList';
import CharacterDetail from '@/pages/CharacterDetail';
import CharacterInventory from '@/pages/CharacterInventory';
import SpellList from '@/pages/SpellList';
import SpellDetail from '@/pages/SpellDetail';
import Settings from '@/pages/Settings';
import AdminAuth from '@/pages/AdminAuth';
import MigrationBackup from '@/pages/MigrationBackup';
import Placeholder from '@/pages/Placeholder';
import InventoryPage from '@/pages/InventoryPage';
import EquipmentList from '@/pages/EquipmentList';
import EquipmentDetail from '@/pages/EquipmentDetail';
import PlayerHome from '@/pages/PlayerHome';
import PlayerView from '@/pages/PlayerView';
import PlayerInventory from '@/pages/PlayerInventory';
import DataManagement from '@/pages/DataManagement';

// 根路径壳：按 role 分流，永远返回 Layout 保证 Outlet 存在
function RoleShell() {
  const { user } = useAuth();
  // loading 由 ProtectedRoute 层吞掉，这里 user 一定已就绪
  if (user?.role === 'player') {
    return <Navigate to="/player/home" replace />;
  }
  return <Layout />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* 公开路由（无需登录） */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* 独立页面（需要登录） */}
            <Route
              path="/characters/:id/inventory"
              element={
                <ProtectedRoute>
                  <CharacterInventory />
                </ProtectedRoute>
              }
            />

            {/* 玩家端（精简导航栏）- 需要登录 */}
            <Route
              element={
                <ProtectedRoute>
                  <PlayerLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/player/home" element={<PlayerHome />} />
              <Route path="/player/:playerId" element={<PlayerView />} />
              <Route path="/player/:playerId/inventory" element={<PlayerInventory />} />
              <Route
                path="/player/combat"
                element={<Placeholder title="战斗记录" description="战斗追踪与回合管理功能即将上线" />}
              />
              <Route path="/player/inventory" element={<InventoryPage />} />
              <Route path="/player/spells" element={<SpellList />} />
              <Route path="/player/spells/:id" element={<SpellDetail />} />
              <Route path="/player/settings" element={<Settings />} />
              {/* 公共资料库 - 玩家端也能访问 */}
              <Route path="/equipment" element={<EquipmentList />} />
              <Route path="/equipment/:id" element={<EquipmentDetail />} />
              <Route path="/spells" element={<SpellList />} />
              <Route path="/spells/:id" element={<SpellDetail />} />
            </Route>

            {/* DM 端（完整导航栏）- 需要登录 + DM 角色 */}
            <Route
              path="/"
              element={
                <ProtectedRoute requireDM>
                  <RoleShell />
                </ProtectedRoute>
              }
            >
              <Route index element={<Home />} />
              <Route path="characters" element={<CharacterList />} />
              <Route path="characters/:id" element={<CharacterDetail />} />
              <Route
                path="combat"
                element={<Placeholder title="战斗记录" description="战斗追踪与回合管理功能即将上线" />}
              />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="equipment" element={<EquipmentList />} />
              <Route path="equipment/:id" element={<EquipmentDetail />} />
              <Route path="spells" element={<SpellList />} />
              <Route path="spells/:id" element={<SpellDetail />} />
              {/* Settings 改为嵌套路由壳 */}
              <Route path="settings" element={<Settings />}>
                <Route index element={<Navigate to="/settings/admin" replace />} />
                <Route path="admin" element={<AdminAuth />} />
                <Route path="migration" element={<MigrationBackup />} />
                <Route path="data" element={<DataManagement />} />
              </Route>
              {/* 旧路径重定向，保兼容 */}
              <Route path="data-management" element={<Navigate to="/settings/data" replace />} />
              <Route
                path="notes"
                element={<Placeholder title="剧情笔记" description="剧情记录与世界设定管理功能即将上线" />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

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
import MonsterList from '@/pages/MonsterList';
import MonsterDetail from '@/pages/MonsterDetail';
import Settings from '@/pages/Settings';
import AdminAuth from '@/pages/AdminAuth';
import AdminAccounts from '@/pages/AdminAccounts';
import MigrationBackup from '@/pages/MigrationBackup';
import Placeholder from '@/pages/Placeholder';
import InventoryPage from '@/pages/InventoryPage';
import TradePage from '@/pages/TradePage';
import EquipmentList from '@/pages/EquipmentList';
import EquipmentDetail from '@/pages/EquipmentDetail';
import PlayerHome from '@/pages/PlayerHome';
import PlayerView from '@/pages/PlayerView';
import PlayerInventory from '@/pages/PlayerInventory';
import DataManagement from '@/pages/DataManagement';
import CombatList from '@/pages/CombatList';
import CombatSession from '@/pages/CombatSession';
import BattlegroundEditor from '@/pages/BattlegroundEditor';
import FlowEditor from '@/pages/FlowEditor';
import FlowList from '@/pages/FlowList';
import GameClockPage from '@/pages/GameClockPage';
import CalendarPage from '@/pages/CalendarPage';
import NotesPage from '@/pages/NotesPage';
import DicePage from '@/pages/DicePage';
import UserProfile from '@/pages/UserProfile';
import TripleTapGesture from '@/components/TripleTapGesture';
import TreasureList from '@/pages/TreasureList';
import TreasureEdit from '@/pages/TreasureEdit';
import TreasureDistribute from '@/pages/TreasureDistribute';

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
          <TripleTapGesture />
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
              <Route path="/player/account" element={<UserProfile />} />
            </Route>

            {/* 公共资料库：DM 和玩家都能访问，走 Layout（variant 按 isDM 推导） */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/equipment" element={<EquipmentList />} />
              <Route path="/equipment/:id" element={<EquipmentDetail />} />
              <Route path="/spells" element={<SpellList />} />
            <Route path="/monsters" element={<MonsterList />} />
            <Route path="/monsters/:id" element={<MonsterDetail />} />
              <Route path="/spells/:id" element={<SpellDetail />} />
              <Route path="/combat" element={<CombatList />} />
              {/* ✅ 修改1：参数名从 :id 改为 :sessionId，和 CombatSession 里的 useParams 对齐 */}
                    <Route path="/combat/:sessionId" element={<CombatSession />} />
                    <Route path="/combat/:sessionId/battleground-editor" element={<BattlegroundEditor />} />
              {/* 独立访问的流程编辑器路由 */}
              <Route path="/flow-editor/:id" element={<FlowEditor />} />
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
              {/* ✅ 修改2：删除旧占位符路由，战斗功能已实现，无需占位 */}
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="inventory/trade" element={<TradePage />} />
              <Route path="inventory/treasures" element={<TreasureList />} />
              <Route path="inventory/treasures/new" element={<TreasureEdit />} />
              <Route path="inventory/treasures/:id/edit" element={<TreasureEdit />} />
              <Route path="inventory/treasures/:id/distribute" element={<TreasureDistribute />} />
              <Route path="flows" element={<FlowList />} />
              <Route path="flows/:id/edit" element={<FlowEditor />} />
              {/* 独立访问的流程编辑器路由 */}
              <Route path="flow-editor/:id" element={<FlowEditor />} />
              {/* Settings 嵌套路由壳 */}
              <Route path="settings" element={<Settings />}>
                <Route index element={<Navigate to="/settings/admin" replace />} />
                <Route path="admin" element={<AdminAuth />} />
                <Route path="accounts" element={<AdminAccounts />} />
                <Route path="migration" element={<MigrationBackup />} />
                <Route path="data" element={<DataManagement />} />
                <Route path="flows" element={<FlowList />} />
                <Route path="flows/:id/edit" element={<FlowEditor />} />
              </Route>
              {/* 旧路径重定向，保兼容 */}
              <Route path="data-management" element={<Navigate to="/settings/data" replace />} />
              <Route path="notes" element={<NotesPage />} />
              <Route path="clock" element={<GameClockPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="dice" element={<DicePage />} />
              <Route path="account" element={<UserProfile />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

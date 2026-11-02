// DM Toolkit - Application Router
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CampaignProvider } from './contexts/CampaignContext';
import ProtectedRoute from './components/ProtectedRoute';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import Layout from '@/components/Layout';
import PublicLayout from '@/components/PublicLayout';
import PlayerLayout from '@/components/PlayerLayout';
import Home from '@/pages/Home';
import CampaignHome from '@/pages/CampaignHome';
import Login from './pages/Login';
import Register from './pages/Register';
import CharacterList from '@/pages/CharacterList';
import CharacterDetail from '@/pages/CharacterDetail';
import CharacterInventory from '@/pages/CharacterInventory';
import SpellList from '@/pages/SpellList';
import OptionsPage from '@/pages/OptionsPage';
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
import PlayerView from '@/pages/PlayerView';
import PlayerInventory from '@/pages/PlayerInventory';
import DataManagement from '@/pages/DataManagement';
import CombatList from '@/pages/CombatList';
import CombatSession from '@/pages/CombatSession';
import BattlegroundEditor from '@/pages/BattlegroundEditor';
import FlowEditor from '@/pages/FlowEditor';
import FlowList from '@/pages/FlowList';
import FlowView from '@/pages/FlowView';
import LocalStorageManager from '@/pages/LocalStorageManager';
import GameClockPage from '@/pages/GameClockPage';
import CalendarPage from '@/pages/CalendarPage';
import NotesPage from '@/pages/NotesPage';
import CampaignSettings from '@/pages/CampaignSettings';
import DicePage from '@/pages/DicePage';
import UserProfile from '@/pages/UserProfile';
import { getCampaignId } from '@/data/campaignScope';
import TripleTapGesture from '@/components/TripleTapGesture';
import KeyboardShortcutDetector from '@/components/KeyboardShortcutDetector';
import TreasureList from '@/pages/TreasureList';
import TreasureEdit from '@/pages/TreasureEdit';
import TreasureDistribute from '@/pages/TreasureDistribute';
import { BindingService } from '@/services/bindingService';

// 根路径壳：DM 专属路由的布局壳（requireAdmin 由 ProtectedRoute 保证）
function RoleShell() {
  const { isAdmin } = useAuth();
  // loading 由 ProtectedRoute 层吞掉，这里状态一定已就绪
  if (!isAdmin) {
    return <Navigate to="/player/home" replace />;
  }
  return <Layout />;
}

// 四库自适应壳：登录用户用完整导航（菜单直达），未登录访客用前厅公开壳。
// 无路由守卫——公开可读由后端保证，写入口由页面级登录态守卫收敛。
function LibraryShellGate() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-bg-dark light:bg-bg-light">
        <div className="text-gray-500 dark:text-gray-400">加载中...</div>
      </div>
    );
  }
  return isAuthenticated ? <Layout /> : <PublicLayout />;
}

// 旧玩家首页路径：重定向到当前团组的团组内主页（保旧书签兼容）
function PlayerHomeRedirect() {
  return <Navigate to={`/c/${getCampaignId()}/home`} replace />;
}

export default function App() {
  // 初始化双向同步引擎
  BindingService.init();

  return (
    <ThemeProvider>
      <AuthProvider>
        <CampaignProvider>
        <BrowserRouter>
          <TripleTapGesture />
          <KeyboardShortcutDetector>
            <Routes>
            {/* 公开路由（无需登录） */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* 公开资料库（前厅）：未登录访客可浏览出版物条目；登录用户走完整导航壳 */}
            <Route element={<LibraryShellGate />}>
              <Route path="/equipment" element={<EquipmentList />} />
              <Route path="/equipment/:id" element={<EquipmentDetail />} />
              <Route path="/spells" element={<SpellList />} />
              <Route path="/spells/:id" element={<SpellDetail />} />
              <Route path="/options" element={<OptionsPage />} />
              <Route path="/monsters" element={<MonsterList />} />
              <Route path="/monsters/:id" element={<MonsterDetail />} />
            </Route>

            {/* 团组外主页（前厅枢纽；登录用户保留完整顶栏导航） */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Home />} />
            </Route>

            {/* 团组内主页（以团组 ID 寻址；URL 驱动当前团组对齐，按身份分流 DM/玩家主页） */}
            <Route
              path="/c/:campaignId/home"
              element={
                <ProtectedRoute>
                  <CampaignHome />
                </ProtectedRoute>
              }
            />

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
              <Route path="/player/home" element={<PlayerHomeRedirect />} />
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

            {/* 团组内数据页（战斗记录/流程编辑器）：需要登录，DM 与玩家都能访问 */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/combat" element={<CombatList />} />
              <Route path="/combat/:sessionId" element={<CombatSession />} />
              <Route path="/combat/:sessionId/battleground-editor" element={<BattlegroundEditor />} />
              {/* 独立访问的流程编辑器路由 */}
              <Route path="/flow-editor/:id" element={<FlowEditor />} />
              <Route path="/flow-editor/:id/view" element={<FlowView />} />
            </Route>

            {/* DM 端（完整导航栏）- 需要登录 + 站点管理员；团组内主页在 /c/:campaignId/home */}
            <Route
              element={
                <ProtectedRoute requireAdmin>
                  <RoleShell />
                </ProtectedRoute>
              }
            >
              <Route path="characters" element={<CharacterList />} />
              <Route path="characters/:id" element={<CharacterDetail />} />
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
              <Route path="flow-editor/:id/view" element={<FlowView />} />
              {/* LocalStorage管理工具 */}
              <Route path="local-storage-manager" element={<LocalStorageManager />} />
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
              <Route path="campaign" element={<CampaignSettings />} />
              <Route path="notes" element={<NotesPage />} />
              <Route path="clock" element={<GameClockPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="dice" element={<DicePage />} />
              <Route path="account" element={<UserProfile />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>

            {/* 顶层兜底：未匹配路径回前厅主页 */}
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </KeyboardShortcutDetector>
        </BrowserRouter>
        </CampaignProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

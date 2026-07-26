import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Toaster } from '@/components/ui/toaster';

// 布局与保护组件
import RoleShell from '@/components/layout/RoleShell';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

// 公共页面
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import Register from '@/pages/Register';

// DM 页面
import CharacterList from '@/pages/CharacterList';
import CharacterDetail from '@/pages/CharacterDetail';
import CombatList from '@/pages/CombatList';
import CombatSession from '@/pages/CombatSession'; // ✅ 确保导入了 CombatSession
import NPCTracker from '@/pages/NPCTracker';
import DiceRollerPage from '@/pages/DiceRollerPage';
import RulesReference from '@/pages/RulesReference';
import Settings from '@/pages/Settings';

// 玩家页面
import PlayerHome from '@/pages/PlayerHome';
import PlayerCharacters from '@/pages/PlayerCharacters';
import PlayerDiceRoller from '@/pages/PlayerDiceRoller';
import PlayerRules from '@/pages/PlayerRules';
import PlayerSettings from '@/pages/PlayerSettings';

// 其他
import NotFound from '@/pages/NotFound';
import './i18n'; // i18n 初始化

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Routes>
          {/* ====================================== */}
          {/* 公开路由 (无需登录)                    */}
          {/* ====================================== */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* ====================================== */}
          {/* 受保护的主路由 (需要登录)              */}
          {/* RoleShell 负责区分 DM/Player 的侧边栏   */}
          {/* ====================================== */}
          <Route path="/" element={<ProtectedRoute><RoleShell /></ProtectedRoute>}>
            
            {/* --- 默认首页 --- */}
            <Route index element={<Home />} />

            {/* ====================================== */}
            {/* DM 专用路由                            */}
            {/* ====================================== */}
            {/* 注意：RoleShell 内部会检查 user.role === 'dm'，否则重定向 */}
            <Route path="characters" element={<CharacterList />} />
            <Route path="characters/:id" element={<CharacterDetail />} />
            
            {/* 战斗记录路由 */}
            <Route path="combat" element={<CombatList />} />
            {/* ✅ 关键修复：战斗会话路由 (必须放在 combat 下，且在 * 之前) */}
            <Route path="combat/:sessionId" element={<CombatSession />} />
            
            <Route path="npcs" element={<NPCTracker />} />
            <Route path="dice" element={<DiceRollerPage />} />
            <Route path="rules" element={<RulesReference />} />
            <Route path="settings" element={<Settings />} />

            {/* ====================================== */}
            {/* 玩家专用路由                          */}
            {/* ====================================== */}
            {/* RoleShell 内部会检查 user.role === 'player' */}
            <Route path="player/home" element={<PlayerHome />} />
            <Route path="player/characters" element={<PlayerCharacters />} />
            <Route path="player/dice" element={<PlayerDiceRoller />} />
            <Route path="player/rules" element={<PlayerRules />} />
            <Route path="player/settings" element={<PlayerSettings />} />

            {/* ====================================== */}
            {/* 兜底路由 (404)                         */}
            {/* 必须放在最后                            */}
            {/* ====================================== */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
        <Toaster />
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;

// DM Toolkit - Application Router
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import CharacterList from '@/pages/CharacterList';
import CharacterDetail from '@/pages/CharacterDetail';
import CharacterInventory from '@/pages/CharacterInventory';
import SpellList from '@/pages/SpellList';
import SpellDetail from '@/pages/SpellDetail';
import Settings from '@/pages/Settings';
import Placeholder from '@/pages/Placeholder';
import InventoryPage from '@/pages/InventoryPage';
import EquipmentList from '@/pages/EquipmentList';
import EquipmentDetail from '@/pages/EquipmentDetail';
import PlayerView from '@/pages/PlayerView';
import PlayerInventory from '@/pages/PlayerInventory';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/characters/:id/inventory" element={<CharacterInventory />} />
          <Route path="/player/:playerId/inventory" element={<PlayerInventory />} />
          <Route path="/player/:playerId" element={<PlayerView />} />
          <Route path="/" element={<Layout />}>
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
            <Route path="settings" element={<Settings />} />
            <Route
              path="notes"
              element={<Placeholder title="剧情笔记" description="剧情记录与世界设定管理功能即将上线" />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

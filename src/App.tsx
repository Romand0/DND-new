// DM Toolkit - Application Router
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import CharacterList from '@/pages/CharacterList';
import CharacterDetail from '@/pages/CharacterDetail';
import SpellList from '@/pages/SpellList';
import SpellDetail from '@/pages/SpellDetail';
import Placeholder from '@/pages/Placeholder';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="characters" element={<CharacterList />} />
            <Route path="characters/:id" element={<CharacterDetail />} />
            <Route
              path="combat"
              element={<Placeholder title="战斗记录" description="战斗追踪与回合管理功能即将上线" />}
            />
            <Route
              path="inventory"
              element={<Placeholder title="物资钱币" description="装备、货币、经验值变动记录功能即将上线" />}
            />
            <Route path="spells" element={<SpellList />} />
            <Route path="spells/:id" element={<SpellDetail />} />
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

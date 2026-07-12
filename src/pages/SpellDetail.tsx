import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Clock, Target, Zap, Hourglass, Edit2, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import SpellEditor from '@/components/SpellEditor';
import type { Spell } from '@/types/spell';

const levelLabels: Record<number, string> = {
  0: '戏法', 1: '1环', 2: '2环', 3: '3环', 4: '4环',
  5: '5环', 6: '6环', 7: '7环', 8: '8环', 9: '9环',
};
// 解析 Wikidot 表格表头
function parseWikidotHeaders(wikidot: string): string[] {
  const lines = wikidot.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  for (const line of lines) {
    if (line.startsWith('||')) {
      return line.slice(2, -2).split('||').map(c => c.trim());
    }
  }
  return [];
}

// 解析 Wikidot 表格数据行
function parseWikidotRows(wikidot: string): string[][] {
  const lines = wikidot.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const rows: string[][] = [];
  for (const line of lines) {
    if (line.startsWith('|') && !line.startsWith('||')) {
      const cells = line.slice(1, -1).split('|').map(c => c.trim());
      rows.push(cells);
    }
  }
  return rows;
}

function renderWithDice(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\d+)d(4|6|8|10|12|20)/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;


  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <span key={key++} className="inline-flex items-baseline mx-0.5">
        <span className="text-primary font-bold">{match[1]}</span>
        <span className="px-1.5 py-0.5 mx-0.5 rounded bg-accent/20 text-accent font-mono text-sm font-semibold">
          d{match[2]}
        </span>
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts;
}

export default function SpellDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDM } = useAuth();
  const [spell, setSpell] = useState<Spell | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  // 从后端加载单条法术
  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const data = await apiFetch(`/spells/${id}`, { method: 'GET', headers });
      setSpell(data);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleSave = async (updatedSpell: Spell) => {
    if (!isDM || !id) return;
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      await apiFetch(`/spells/${id}`, { method: 'PUT', body: JSON.stringify(updatedSpell), headers });
      setEditorOpen(false);
      load();
    } catch (e: any) {
      setError(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isDM || !id) return;
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      await apiFetch(`/spells/${id}`, { method: 'DELETE', headers });
      navigate('/spells');
    } catch (e: any) {
      setError(e.message || '删除失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>;

  if (!spell) {
    return (
      <div className="space-y-6">
        <button onClick={() => navigate('/spells')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light">
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </button>
        <div className="text-center py-20">
          <p className="text-lg dark:text-text-dark-muted light:text-text-light-muted">{error || '未找到该法术'}</p>
        </div>
      </div>
    );
  }

  const renderDescription = (text: string) => {
    return text.split('\n\n').map((paragraph, index) => (
      <p key={index} className={index > 0 ? 'mt-4' : ''}>{renderWithDice(paragraph)}</p>
    ));
  };

  return (
    <div className="space-y-6">
      {/* 顶部导航 + DM 操作 */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/spells')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light">
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </button>
        {isDM && (
          <div className="flex gap-2">
            <button onClick={() => setEditorOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark hover:bg-white/10 light:border-border-light light:text-text-light">
              <Edit2 className="w-4 h-4" /> 编辑
            </button>
            <button onClick={() => setDeleteConfirm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20">
              <Trash2 className="w-4 h-4" /> 删除
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-danger/20 text-danger text-sm">{error}</div>
      )}

      <div className="rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light overflow-hidden">
        <div className="px-6 py-5 border-b dark:border-border-dark light:border-border-light">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
                <Sparkles className="w-6 h-6 text-primary" /> {spell.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${spell.level === 0 ? 'bg-gray-500/20 text-gray-400' : 'bg-primary/20 text-primary'}`}>
                  {levelLabels[spell.level]}
                </span>
                <span className="dark:text-text-dark light:text-text-light">{spell.school}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* 四格基础信息 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg dark:bg-white/5 light:bg-white/50">
              <div className="flex items-center gap-2 text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1"><Clock className="w-3.5 h-3.5" />施法时间</div>
              <div className="text-sm font-medium dark:text-text-dark light:text-text-light">{spell.castingTime}</div>
            </div>
            <div className="p-3 rounded-lg dark:bg-white/5 light:bg-white/50">
              <div className="flex items-center gap-2 text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1"><Target className="w-3.5 h-3.5" />射程</div>
              <div className="text-sm font-medium dark:text-text-dark light:text-text-light">{spell.range}</div>
            </div>
            <div className="p-3 rounded-lg dark:bg-white/5 light:bg-white/50">
              <div className="flex items-center gap-2 text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1"><Zap className="w-3.5 h-3.5" />成分</div>
              <div className="text-sm font-medium dark:text-text-dark light:text-text-light">
                {[spell.components.verbal && 'V', spell.components.somatic && 'S', spell.components.material && 'M'].filter(Boolean).join(', ') || '无'}
              </div>
              {spell.components.material && spell.materialInfo && (
                <div className="mt-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">{spell.materialInfo}</div>
              )}
            </div>
            <div className="p-3 rounded-lg dark:bg-white/5 light:bg-white/50">
              <div className="flex items-center gap-2 text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1"><Hourglass className="w-3.5 h-3.5" />持续时间</div>
              <div className="text-sm font-medium dark:text-text-dark light:text-text-light">{spell.duration}</div>
            </div>
          </div>

          {/* 描述 */}
          <div>
            <h3 className="text-sm font-semibold mb-2 dark:text-text-dark light:text-text-light">描述</h3>
            <div className="p-4 rounded-lg dark:bg-white/5 light:bg-white/50 text-sm leading-relaxed dark:text-text-dark light:text-text-light">
              {renderDescription(spell.description)}
            </div>
          </div>

          {/* 升环效果 */}
          {spell.hasHeightened && spell.heightenedEffect && (
            <div>
              <h3 className="text-sm font-semibold mb-2 dark:text-text-dark light:text-text-light">升环效果</h3>
              <div className="p-4 rounded-lg bg-accent/10 text-sm dark:text-text-dark light:text-text-light border border-accent/20">
                {renderDescription(spell.heightenedEffect)}
              </div>
            </div>
          )}

          {/* 备注 */}
          {spell.notes && (
            <div>
              <h3 className="text-sm font-semibold mb-2 dark:text-text-dark light:text-text-light">备注</h3>
              <div className="p-4 rounded-lg bg-primary/10 text-sm dark:text-text-dark light:text-text-light border border-primary/20">
                {spell.notes}
              </div>
            </div>
          )}

          {/* 可用职业 */}
          <div>
            <h3 className="text-sm font-semibold mb-2 dark:text-text-dark light:text-text-light">可用职业</h3>
            <div className="flex flex-wrap gap-2">
              {spell.classes.map((cls) => (
                <span key={cls} className="px-3 py-1 rounded-full text-sm dark:bg-white/10 light:bg-white/70 dark:text-text-dark light:text-text-light">{cls}</span>
              ))}
            </div>
          </div>
        </div>

        {/* 表格（Wikidot 语法） */}
{(spell as any).table && (
  <div>
    <h3 className="text-sm font-semibold mb-2 dark:text-text-dark light:text-text-light">表格</h3>
    <div className="overflow-x-auto rounded-lg border dark:border-border-dark light:border-border-light">
      <table className="w-full text-sm">
        <thead>
          <tr className="dark:bg-card-dark light:bg-card-light font-bold">
            {parseWikidotHeaders((spell as any).table).map((header, i) => (
              <th key={i} className="px-3 py-2 text-left whitespace-nowrap">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parseWikidotRows((spell as any).table).map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-white dark:bg-transparent'}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 border-t dark:border-border-dark/50 light:border-border-light/50">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}

      </div>

      {/* SpellEditor 模态框 */}
      {editorOpen && (
        <SpellEditor
          spell={spell}
          isOpen={editorOpen}
          onClose={() => setEditorOpen(false)}
          onSave={handleSave}
        />
      )}

      {/* 删除确认 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirm(false)} />
          <div className="relative w-full max-w-sm rounded-xl border p-6 dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl">
            <h3 className="text-lg font-bold mb-2 dark:text-text-dark light:text-text-light">确认删除</h3>
            <p className="text-sm mb-6 dark:text-text-dark-muted light:text-text-light-muted">
              确定要删除法术「{spell.name}」吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(false)} disabled={saving}
                className="px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10 disabled:opacity-50">
                取消
              </button>
              <button onClick={handleDelete} disabled={saving}
                className="px-4 py-2 bg-danger hover:bg-danger/80 text-white rounded-lg disabled:opacity-50">
                {saving ? '删除中...' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

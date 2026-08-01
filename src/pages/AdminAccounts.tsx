import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users as UsersIcon,
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  Pencil,
  Trash2,
  KeyRound,
  AlertCircle,
  X,
  Check,
} from 'lucide-react';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const VERIFIED_KEY = 'dm_token_verified';

interface UserRow {
  id: string;
  username: string;
  role: 'player' | 'dm';
  createdAt: number;
  online: boolean;
}

type ModalState =
  | { type: 'role'; user: UserRow }
  | { type: 'delete'; user: UserRow }
  | { type: 'password'; user: UserRow }
  | null;

export default function AdminAccounts() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [pendingRole, setPendingRole] = useState<'player' | 'dm'>('player');
  const [newPassword, setNewPassword] = useState('');
  const [modalError, setModalError] = useState('');

  // 当前浏览者是否为已通过验证的 DM Token 持有者
  const isVerifiedAdmin = localStorage.getItem(VERIFIED_KEY) === 'true';

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.fetchAdminUsers<{ users: UserRow[] }>();
      setUsers(res.users || []);
    } catch (e: any) {
      // 401：DM Token 无效，清除本地 token 并引导重新认证
      if (e?.message?.includes('401') || e?.message?.includes('DM Token')) {
        api.setDmToken(null);
        localStorage.removeItem(VERIFIED_KEY);
        navigate('/settings/admin');
        return;
      }
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2000);
  };

  const handleRoleChange = async () => {
    if (!modal || modal.type !== 'role') return;
    setSubmitting(true);
    setModalError('');
    try {
      await api.updateUserRole(modal.user.id, pendingRole);
      setModal(null);
      showNotice(`已更新 ${modal.user.username} 的权限`);
      loadUsers();
    } catch (e: any) {
      setModalError(e?.message || '修改失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!modal || modal.type !== 'delete') return;
    setSubmitting(true);
    setModalError('');
    try {
      await api.deleteAdminUser(modal.user.id);
      setModal(null);
      showNotice(`已删除账号 ${modal.user.username}`);
      loadUsers();
    } catch (e: any) {
      setModalError(e?.message || '删除失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!modal || modal.type !== 'password') return;
    if (!newPassword || newPassword.length < 6) {
      setModalError('新密码长度至少 6 位');
      return;
    }
    setSubmitting(true);
    setModalError('');
    try {
      await api.resetUserPassword(modal.user.id, newPassword);
      setModal(null);
      setNewPassword('');
      showNotice(`已重置 ${modal.user.username} 的密码`);
    } catch (e: any) {
      setModalError(e?.message || '重置失败');
    } finally {
      setSubmitting(false);
    }
  };

  const closeModal = () => {
    setModal(null);
    setModalError('');
    setNewPassword('');
  };

  const isSelf = (id: string) => currentUser?.id === id;

  return (
    <div className="space-y-6">
      {/* 返回按钮 */}
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center gap-2 text-sm hover:opacity-80 dark:text-text-dark light:text-text-light"
      >
        <ArrowLeft className="w-4 h-4" />
        返回设置
      </button>

      <div className="rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2 dark:text-text-dark light:text-text-light">
              <UsersIcon className="w-5 h-5 text-primary" />
              账号一览
            </h2>
            <p className="mt-1 text-sm dark:text-text-dark-muted light:text-text-light-muted">
              查看和管理全部注册账号。仅持有 DM Token 的管理员可见。
            </p>
          </div>
          <button
            onClick={loadUsers}
            disabled={loading}
            className="px-3 py-2 text-sm border border-primary/50 text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        {notice && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 text-success text-sm">
            <Check className="w-4 h-4" />
            {notice}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-danger/10 text-danger text-sm">
            <AlertCircle className="w-4 h-4" />
            <span className="flex-1">{error}</span>
            <button onClick={loadUsers} className="text-xs underline">
              重试
            </button>
          </div>
        )}

        {/* 账号列表 */}
        {loading ? (
          <div className="py-12 text-center text-sm dark:text-text-dark-muted light:text-text-light-muted">
            加载中…
          </div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-sm dark:text-text-dark-muted light:text-text-light-muted">
            暂无账号
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left dark:text-text-dark-muted light:text-text-light-muted border-b dark:border-border-dark light:border-border-light">
                  <th className="py-2 pr-4 font-medium">名称</th>
                  <th className="py-2 pr-4 font-medium">ID</th>
                  <th className="py-2 pr-4 font-medium">权限</th>
                  <th className="py-2 pr-4 font-medium">身份</th>
                  <th className="py-2 pr-4 font-medium">登录状态</th>
                  <th className="py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const self = isSelf(u.id);
                  const admin = self && isVerifiedAdmin;
                  return (
                    <tr
                      key={u.id}
                      className="border-b dark:border-border-dark/40 light:border-border-light/40 hover:bg-white/5"
                    >
                      <td className="py-2 pr-4 font-medium dark:text-text-dark light:text-text-light">
                        {u.username}
                        {self && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                            我
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 dark:text-text-dark-muted light:text-text-light-muted font-mono text-xs">
                        {u.id}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            u.role === 'dm'
                              ? 'bg-danger/15 text-danger'
                              : 'bg-info/15 text-info'
                          }`}
                        >
                          {u.role === 'dm' ? 'DM' : '玩家'}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            admin
                              ? 'bg-amber-500/15 text-amber-500'
                              : 'dark:text-text-dark-muted light:text-text-light-muted'
                          }`}
                        >
                          {admin ? '管理员' : '成员'}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs ${
                            u.online ? 'text-success' : 'dark:text-text-dark-muted light:text-text-light-muted'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${u.online ? 'bg-success' : 'bg-gray-500'}`}
                          />
                          {u.online ? '在线' : '离线'}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setPendingRole(u.role);
                              setModalError('');
                              setModal({ type: 'role', user: u });
                            }}
                            className="p-1.5 rounded hover:bg-primary/10 text-primary transition-colors"
                            title="修改权限"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setModalError('');
                              setModal({ type: 'password', user: u });
                            }}
                            className="p-1.5 rounded hover:bg-amber-500/10 text-amber-500 transition-colors"
                            title="重置密码"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (self) return;
                              setModalError('');
                              setModal({ type: 'delete', user: u });
                            }}
                            disabled={self}
                            className="p-1.5 rounded hover:bg-danger/10 text-danger transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={self ? '不能删除当前管理员账号' : '删除账号'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 操作弹窗 */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={closeModal}
        >
          <div
            className="rounded-xl dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light p-5 w-full max-w-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold dark:text-text-dark light:text-text-light">
                {modal.type === 'role' && '修改权限'}
                {modal.type === 'delete' && '删除账号'}
                {modal.type === 'password' && '重置密码'}
              </h3>
              <button onClick={closeModal} className="p-1 rounded hover:bg-white/10 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {modal.type === 'role' && (
              <>
                <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                  账号：<span className="font-medium dark:text-text-dark light:text-text-light">{modal.user.username}</span>
                </p>
                <div className="flex gap-2">
                  {(['player', 'dm'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setPendingRole(r)}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${
                        pendingRole === r
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5'
                      }`}
                    >
                      {r === 'dm' ? 'DM' : '玩家'}
                    </button>
                  ))}
                </div>
              </>
            )}

            {modal.type === 'delete' && (
              <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                确定删除账号 <span className="font-medium text-danger">{modal.user.username}</span> 吗？此操作不可撤销。
              </p>
            )}

            {modal.type === 'password' && (
              <div>
                <label className="block text-sm font-medium mb-1.5 dark:text-text-dark light:text-text-light">
                  新密码（至少 6 位）
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setModalError('');
                  }}
                  placeholder="输入新密码"
                  className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
              </div>
            )}

            {modalError && (
              <div className="flex items-center gap-2 text-sm text-danger">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {modalError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={
                  modal.type === 'role'
                    ? handleRoleChange
                    : modal.type === 'delete'
                    ? handleDelete
                    : handleResetPassword
                }
                disabled={submitting}
                className={`px-4 py-2 text-sm rounded-lg text-white transition-colors flex items-center gap-2 disabled:opacity-50 ${
                  modal.type === 'delete' ? 'bg-danger hover:bg-danger/80' : 'bg-primary hover:bg-primary-dark'
                }`}
              >
                {submitting ? '处理中…' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 管理员说明 */}
      <div className="rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-4">
        <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
          身份为管理员仅适用于当前持有并已验证 DM Token 的登录账号；修改权限或重置密码后，该账号需重新登录生效。
        </p>
      </div>
    </div>
  );
}

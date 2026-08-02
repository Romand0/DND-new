import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserCircle,
  Pencil,
  ShieldCheck,
  User as UserIcon,
  KeyRound,
  LogOut,
  X,
  AlertCircle,
  Check,
  Loader2,
} from 'lucide-react';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const VERIFIED_KEY = 'dm_token_verified';
const MAX_AVATAR_SIZE = 256;

/** 将图片压缩到 MAX_AVATAR_SIZE 内，返回 base64 data URL */
async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_AVATAR_SIZE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL(file.type.includes('png') ? 'image/png' : 'image/jpeg', 0.85);
}

export default function UserProfile() {
  const navigate = useNavigate();
  const { user, token, updateUser, logout } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [avatarDraft, setAvatarDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState('');

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwNotice, setPwNotice] = useState('');

  // 权限：DM Token 持有者派生（成员/管理员），与账号一览页判定一致
  const isVerifiedAdmin = localStorage.getItem(VERIFIED_KEY) === 'true';
  const permissionLabel = isVerifiedAdmin ? '管理员' : '成员';
  const typeLabel = user?.role === 'dm' ? 'DM' : '玩家';

  const openEdit = () => {
    setUsernameDraft(user?.username || '');
    setAvatarDraft(user?.avatar || null);
    setEditError('');
    setEditOpen(true);
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setEditError('仅支持图片文件');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setEditError('图片大小不能超过 2MB');
      return;
    }
    try {
      const dataUrl = await compressImage(file);
      setAvatarDraft(dataUrl);
      setEditError('');
    } catch {
      setEditError('图片处理失败');
    }
  };

  const submitEdit = async () => {
    const name = usernameDraft.trim();
    if (name.length < 2) {
      setEditError('用户名至少 2 个字符');
      return;
    }
    if (name === user?.username && avatarDraft === (user.avatar || null)) {
      setEditOpen(false);
      return;
    }
    setEditing(true);
    setEditError('');
    try {
      const payload: { username?: string; avatar?: string } = {};
      if (name !== user?.username) payload.username = name;

      const avatarChanged = avatarDraft !== (user.avatar || null);
      if (avatarChanged) {
        if (avatarDraft === null) {
          // 移除头像：显式置空
          payload.avatar = '';
        } else if (avatarDraft.startsWith('data:')) {
          // 新上传图片：先经上传端点校验，拿回 data URL 再随资料写入
          const res = await api.uploadAvatar<{ url: string }>(avatarDraft);
          payload.avatar = res.url;
        } else {
          payload.avatar = avatarDraft;
        }
      }

      const res = await api.updateProfile<{ user: { id: string; username: string; role: string; avatar: string | null } }>(payload);
      updateUser({
        username: res.user.username,
        avatar: res.user.avatar || null,
      });
      setEditOpen(false);
    } catch (e: any) {
      setEditError(e?.message || '保存失败');
    } finally {
      setEditing(false);
    }
  };

  const submitPassword = async () => {
    setPwError('');
    setPwNotice('');
    if (!oldPassword) {
      setPwError('请输入原密码');
      return;
    }
    if (newPassword.length < 6) {
      setPwError('新密码至少 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('两次输入的新密码不一致');
      return;
    }
    setChanging(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setPwNotice('密码已修改，正在重新登录…');
      setTimeout(() => {
        // 改密成功后后端已清会话，强制重新登录
        logout();
        navigate('/login', { replace: true });
      }, 800);
    } catch (e: any) {
      setPwError(e?.message || '修改失败');
    } finally {
      setChanging(false);
    }
  };

  const handleLogout = async () => {
    try {
      // 先清后端会话，使账号一览页「在线」状态失效
      if (token) {
        await api.logoutUser();
      }
    } catch {
      // 后端失败也继续本地登出
    }
    logout();
    navigate('/login', { replace: true });
  };

  if (!user) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light p-6 space-y-6">
        {/* 头像 + 用户名 */}
        <div className="flex flex-col items-center gap-3 relative">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.username}
              className="w-24 h-24 rounded-full object-cover border-2 border-border-dark"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-bg-dark-2 border-2 border-border-dark flex items-center justify-center">
              <UserCircle className="w-16 h-16 text-gray-400" />
            </div>
          )}
          <div className="text-center">
            <div className="text-xl font-semibold dark:text-text-dark light:text-text-light">
              {user.username}
            </div>
            <div className="text-xs text-gray-400 mt-1 break-all select-all">
              ID: {user.id}
            </div>
          </div>
          <button
            onClick={openEdit}
            className="absolute top-0 right-0 flex items-center gap-1 px-3 py-1.5 rounded-lg border dark:border-border-dark light:border-border-light text-sm dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            编辑
          </button>
        </div>

        {/* 权限 / 类型 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg dark:bg-bg-dark-2 light:bg-gray-100 p-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              权限
            </div>
            <div className="mt-1 text-sm font-medium dark:text-text-dark light:text-text-light">
              {permissionLabel}
            </div>
          </div>
          <div className="rounded-lg dark:bg-bg-dark-2 light:bg-gray-100 p-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <UserIcon className="w-3.5 h-3.5" />
              类型
            </div>
            <div className="mt-1 text-sm font-medium dark:text-text-dark light:text-text-light">
              {typeLabel}
            </div>
          </div>
        </div>

        {/* 修改密码 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium dark:text-text-dark light:text-text-light">
            <KeyRound className="w-4 h-4" />
            修改密码
          </div>
          <div className="space-y-2">
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="原密码"
              className="w-full px-3 py-2 rounded-lg dark:bg-bg-dark-2 light:bg-gray-100 dark:border-border-dark light:border-border-light border text-sm dark:text-text-dark light:text-text-light placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="新密码（至少 6 位）"
              className="w-full px-3 py-2 rounded-lg dark:bg-bg-dark-2 light:bg-gray-100 dark:border-border-dark light:border-border-light border text-sm dark:text-text-dark light:text-text-light placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="确认新密码"
              className="w-full px-3 py-2 rounded-lg dark:bg-bg-dark-2 light:bg-gray-100 dark:border-border-dark light:border-border-light border text-sm dark:text-text-dark light:text-text-light placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {pwError && (
            <div className="flex items-center gap-1.5 text-xs text-danger">
              <AlertCircle className="w-3.5 h-3.5" />
              {pwError}
            </div>
          )}
          {pwNotice && (
            <div className="flex items-center gap-1.5 text-xs text-green-500">
              <Check className="w-3.5 h-3.5" />
              {pwNotice}
            </div>
          )}
          <button
            onClick={submitPassword}
            disabled={changing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {changing && <Loader2 className="w-4 h-4 animate-spin" />}
            修改密码
          </button>
        </div>

        {/* 退出登录 */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-danger/40 text-danger text-sm font-medium hover:bg-danger/10 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          退出登录
        </button>
      </div>

      {/* 编辑资料弹窗 */}
      {editOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => !editing && setEditOpen(false)}
        >
          <div
            className="rounded-xl dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light p-5 w-full max-w-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold dark:text-text-dark light:text-text-light">编辑资料</h3>
              <button
                onClick={() => setEditOpen(false)}
                disabled={editing}
                className="p-1 rounded hover:bg-white/10 text-gray-400 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 头像 */}
            <div className="flex flex-col items-center gap-2">
              {avatarDraft ? (
                <img
                  src={avatarDraft}
                  alt="头像预览"
                  className="w-20 h-20 rounded-full object-cover border-2 border-border-dark"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-bg-dark-2 border-2 border-border-dark flex items-center justify-center">
                  <UserCircle className="w-14 h-14 text-gray-400" />
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={editing}
                  className="px-3 py-1.5 rounded-lg border dark:border-border-dark light:border-border-light text-xs dark:text-text-dark light:text-text-light hover:bg-white/5 disabled:opacity-50"
                >
                  上传头像
                </button>
                {user?.avatar && (
                  <button
                    onClick={() => setAvatarDraft(null)}
                    disabled={editing}
                    className="px-3 py-1.5 rounded-lg border dark:border-border-dark light:border-border-light text-xs text-gray-400 hover:bg-white/5 disabled:opacity-50"
                  >
                    移除头像
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  onPickFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>

            {/* 用户名 */}
            <div>
              <label className="block text-sm font-medium mb-1.5 dark:text-text-dark light:text-text-light">
                用户名
              </label>
              <input
                type="text"
                value={usernameDraft}
                onChange={(e) => {
                  setUsernameDraft(e.target.value);
                  setEditError('');
                }}
                className="w-full px-3 py-2 rounded-lg dark:bg-bg-dark-2 light:bg-gray-100 dark:border-border-dark light:border-border-light border text-sm dark:text-text-dark light:text-text-light focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {editError && (
              <div className="flex items-center gap-1.5 text-xs text-danger">
                <AlertCircle className="w-3.5 h-3.5" />
                {editError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setEditOpen(false)}
                disabled={editing}
                className="flex-1 px-4 py-2 rounded-lg dark:border-border-dark light:border-border-light border text-sm dark:text-text-dark light:text-text-light hover:bg-white/5 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={submitEdit}
                disabled={editing}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {editing && <Loader2 className="w-4 h-4 animate-spin" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

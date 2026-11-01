// 团组管理页：信息编辑、规则书集（三宝书分组勾选）、成员管理、邀请码。
// DM 或站点管理员可改设置与成员；成员只读。角色移入移出团组在角色列表页操作。

import { useCallback, useEffect, useState } from 'react';
import { Users, RefreshCw, Link2, Check, X, Shield, User } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import {
  fetchCampaign,
  updateCampaign,
  fetchCampaignMembers,
  updateCampaignMemberRole,
  removeCampaignMember,
  resetCampaignInviteCode,
} from '@/lib/api';
import type { Campaign, CampaignMember } from '@/types/campaign';
import { PUBLICATION_GROUPS, listPublications } from '@/data/publications';

export default function CampaignSettings() {
  const { current, campaignRole, refresh: refreshContext } = useCampaign();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [publications, setPublications] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const isDM = campaignRole === 'dm';

  const load = useCallback(async () => {
    if (!current) return;
    try {
      const [detail, memberList] = await Promise.all([
        fetchCampaign<Campaign & { inviteCode: string }>(current.id),
        fetchCampaignMembers<CampaignMember[]>(current.id),
      ]);
      setCampaign(detail);
      setInviteCode(detail.inviteCode || '');
      setMembers(memberList);
      setPublications(listPublications());
    } catch (e) {
      console.error('[CampaignSettings] 加载失败:', e);
    }
  }, [current]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveInfo = async () => {
    if (!current || !campaign) return;
    try {
      await updateCampaign(current.id, { name: campaign.name, description: campaign.description });
      await refreshContext();
      alert('已保存');
    } catch (e) {
      alert(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const toggleRulebook = async (book: string) => {
    if (!current || !campaign) return;
    const next = campaign.rulebooks.includes(book)
      ? campaign.rulebooks.filter((b) => b !== book)
      : [...campaign.rulebooks, book];
    setCampaign({ ...campaign, rulebooks: next });
    try {
      await updateCampaign(current.id, { rulebooks: next });
      await refreshContext();
    } catch (e) {
      alert(`规则书集更新失败：${e instanceof Error ? e.message : String(e)}`);
      setCampaign({ ...campaign, rulebooks: campaign.rulebooks });
    }
  };

  const toggleGroup = async (books: string[]) => {
    if (!current || !campaign) return;
    const allIn = books.every((b) => campaign.rulebooks.includes(b));
    const next = allIn
      ? campaign.rulebooks.filter((b) => !books.includes(b))
      : [...new Set([...campaign.rulebooks, ...books])];
    setCampaign({ ...campaign, rulebooks: next });
    try {
      await updateCampaign(current.id, { rulebooks: next });
      await refreshContext();
    } catch (e) {
      alert(`规则书集更新失败：${e instanceof Error ? e.message : String(e)}`);
      setCampaign({ ...campaign, rulebooks: campaign.rulebooks });
    }
  };

  const handleRoleChange = async (userId: string, role: 'dm' | 'player') => {
    if (!current) return;
    try {
      await updateCampaignMemberRole(current.id, userId, role);
      await load();
    } catch (e) {
      alert(`角色变更失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleRemove = async (userId: string, username: string) => {
    if (!current) return;
    if (!confirm(`确定把 ${username} 移出团组？其产生的数据（角色卡等）保留在团组内。`)) return;
    try {
      await removeCampaignMember(current.id, userId);
      await load();
    } catch (e) {
      alert(`移出失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleResetInvite = async () => {
    if (!current) return;
    if (!confirm('重置后旧邀请码立即失效，确定？')) return;
    try {
      const res = await resetCampaignInviteCode<{ inviteCode: string }>(current.id);
      setInviteCode(res.inviteCode);
    } catch (e) {
      alert(`重置失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt('复制以下邀请码：', inviteCode);
    }
  };

  if (!current) {
    return (
      <div className="p-8 text-center text-sm dark:text-text-dark-muted light:text-text-light-muted">
        尚未加入任何团组；可在顶栏切换器中创建或凭邀请码加入
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <section className="p-4 rounded-xl border dark:border-border-dark light:border-border-light space-y-3">
        <h2 className="text-sm font-semibold dark:text-text-dark light:text-text-light flex items-center gap-2">
          <Users className="w-4 h-4" />
          团组信息
        </h2>
        <div className="grid gap-2">
          <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted">名称</label>
          <input
            value={campaign?.name ?? ''}
            disabled={!isDM}
            onChange={(e) => campaign && setCampaign({ ...campaign, name: e.target.value })}
            className="px-2 py-1.5 rounded-lg border text-sm bg-transparent dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light disabled:opacity-60"
          />
          <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted">描述</label>
          <textarea
            value={campaign?.description ?? ''}
            disabled={!isDM}
            rows={2}
            onChange={(e) => campaign && setCampaign({ ...campaign, description: e.target.value })}
            className="px-2 py-1.5 rounded-lg border text-sm bg-transparent dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light disabled:opacity-60"
          />
          {isDM && (
            <button
              onClick={handleSaveInfo}
              className="self-start px-3 py-1.5 rounded-lg text-xs bg-primary text-white hover:bg-primary/90 transition-colors"
            >
              保存信息
            </button>
          )}
        </div>
      </section>

      <section className="p-4 rounded-xl border dark:border-border-dark light:border-border-light space-y-3">
        <h2 className="text-sm font-semibold dark:text-text-dark light:text-text-light">规则书集</h2>
        <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
          团组内查询装备库/法术库/角色选项/怪物图鉴时，只显示所选出版物的条目加上本团组自建条目；出版物数据保持全局，此处仅是筛选配置
        </p>
        <div className="space-y-2">
          {PUBLICATION_GROUPS.map((g) => {
            const allIn = g.books.every((b) => campaign?.rulebooks.includes(b));
            return (
              <button
                key={g.name}
                disabled={!isDM}
                onClick={() => toggleGroup(g.books)}
                className={`w-full px-3 py-2 rounded-lg border text-sm flex items-center justify-between transition-colors disabled:opacity-60 ${
                  allIn
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:border-primary/50'
                }`}
              >
                <span>{g.name}</span>
                <span className="text-xs opacity-70">{g.books.join(' · ')}</span>
              </button>
            );
          })}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {publications
              .filter((b) => !PUBLICATION_GROUPS.some((g) => g.books.includes(b)))
              .map((book) => {
                const inSet = campaign?.rulebooks.includes(book);
                return (
                  <button
                    key={book}
                    disabled={!isDM}
                    onClick={() => toggleRulebook(book)}
                    className={`px-2 py-1 rounded-full text-xs border transition-colors disabled:opacity-60 ${
                      inSet
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'dark:border-border-dark dark:text-text-dark-muted light:border-border-light light:text-text-light-muted'
                    }`}
                  >
                    {inSet && <Check className="w-3 h-3 inline mr-1" />}
                    {book}
                  </button>
                );
              })}
          </div>
        </div>
      </section>

      <section className="p-4 rounded-xl border dark:border-border-dark light:border-border-light space-y-3">
        <h2 className="text-sm font-semibold dark:text-text-dark light:text-text-light flex items-center gap-2">
          <Link2 className="w-4 h-4" />
          邀请码
        </h2>
        <div className="flex items-center gap-2">
          <code className="px-3 py-1.5 rounded-lg bg-white/5 border dark:border-border-dark light:border-border-light text-sm font-mono tracking-widest dark:text-text-dark light:text-text-light">
            {inviteCode || '—'}
          </code>
          <button onClick={copyInvite} className="px-2 py-1.5 rounded-lg text-xs dark:text-text-dark-muted light:text-text-light-muted hover:text-primary transition-colors">
            {copied ? <Check className="w-3.5 h-3.5" /> : '复制'}
          </button>
          {isDM && (
            <button
              onClick={handleResetInvite}
              className="px-2 py-1.5 rounded-lg text-xs dark:text-text-dark-muted light:text-text-light-muted hover:text-primary transition-colors flex items-center gap-1"
              title="重置后旧邀请码立即失效"
            >
              <RefreshCw className="w-3 h-3" />
              重置
            </button>
          )}
        </div>
        <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
          玩家凭此码在顶栏切换器「凭邀请码加入」中加入本团组，角色为玩家
        </p>
      </section>

      <section className="p-4 rounded-xl border dark:border-border-dark light:border-border-light space-y-3">
        <h2 className="text-sm font-semibold dark:text-text-dark light:text-text-light">成员（{members.length}）</h2>
        <div className="space-y-1.5">
          {members.map((m) => (
            <div key={m.userId} className="flex items-center gap-2 px-3 py-2 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
              {m.role === 'dm' ? (
                <Shield className="w-4 h-4 text-primary flex-shrink-0" />
              ) : (
                <User className="w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted flex-shrink-0" />
              )}
              <span className="text-sm dark:text-text-dark light:text-text-light flex-1 truncate">{m.username}</span>
              {isDM && m.userId !== current.createdBy && (
                <>
                  <button
                    onClick={() => handleRoleChange(m.userId, m.role === 'dm' ? 'player' : 'dm')}
                    className="px-2 py-1 rounded text-xs dark:text-text-dark-muted light:text-text-light-muted hover:text-primary transition-colors"
                    title={m.role === 'dm' ? '降为玩家' : '升为 DM'}
                  >
                    {m.role === 'dm' ? '降为玩家' : '升为 DM'}
                  </button>
                  <button
                    onClick={() => handleRemove(m.userId, m.username)}
                    className="p-1 rounded hover:bg-danger/20 text-danger"
                    title="移出团组"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              {(!isDM || m.userId === current.createdBy) && (
                <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                  {m.role === 'dm' ? 'DM' : '玩家'}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

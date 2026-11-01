// 团组类型（一场跑团战役的数据容器）

export type CampaignRole = 'dm' | 'player';

export interface Campaign {
  id: string;
  name: string;
  description: string;
  rulebooks: string[];
  createdBy?: string;
  createdAt?: number;
  /** 当前账号在该团组内的角色（成员关系属性，作用域单场团组） */
  myRole: CampaignRole;
}

export interface CampaignMember {
  userId: string;
  role: CampaignRole;
  joinedAt: number;
  username: string;
  avatar: string;
}

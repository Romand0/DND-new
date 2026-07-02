// GitHub API 集成模块
// DM 端使用 Token 提交数据，玩家端通过 Raw URL 读取数据

const TOKEN_KEY = 'github_token';

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
}

/**
 * 获取 GitHub 配置（从环境变量）
 */
export function getGitHubConfig(): GitHubConfig {
  return {
    owner: import.meta.env.VITE_GITHUB_OWNER || '',
    repo: import.meta.env.VITE_GITHUB_REPO || '',
    branch: import.meta.env.VITE_GITHUB_BRANCH || 'main',
  };
}

/**
 * 获取 GitHub Token
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * 设置 GitHub Token
 */
export function setToken(token: string): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

/**
 * 检查是否已配置 Token（DM 模式）
 */
export function hasToken(): boolean {
  return !!getToken();
}

/**
 * 提交文件到 GitHub 仓库
 * 使用 GitHub Contents API
 */
export async function commitFile(
  path: string,
  content: string,
  message?: string,): Promise<void> {
  const token = getToken();
  if (!token) {
    throw new Error('未配置 GitHub Token');
  }

  const { owner, repo, branch } = getGitHubConfig();
  if (!owner || !repo) {
    throw new Error('未配置 GitHub owner/repo（请检查 .env 文件）');
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const body = {
    message: message || `chore: update ${path}`,
    content: btoa(unescape(encodeURIComponent(content))),
    branch,
  };

  const MAX_RETRIES = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let sha: string | undefined;
    try {
      const res = await fetch(`${url}?ref=${branch}&t=${Date.now()}`, {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        sha = data.sha;
      }
    } catch {
      // 文件不存在，继续创建
    }

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify(sha ? { ...body, sha } : body),
    });

    if (res.ok) {
      return;
    }

    const errData = await res.json().catch(() => ({}));
    lastError = new Error(`GitHub API 错误: ${res.status} ${errData.message || res.statusText}`);

    if ((res.status === 409 || res.status === 422) && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      continue;
    }
    throw lastError;
  }
  throw lastError || new Error('GitHub 提交失败');
}

/**
 * 从 GitHub Raw 读取文件（玩家端使用，无需 Token）
 */
export async function readFileFromGitHub<T = string>(path: string): Promise<T> {
  const { owner, repo, branch } = getGitHubConfig();
  if (!owner || !repo) {
    throw new Error('未配置 GitHub owner/repo');
  }

  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const res = await fetch(url, {
    cache: 'no-cache',
  });

  if (!res.ok) {
    throw new Error(`读取失败: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/**
 * 从 GitHub 删除文件
 */
export async function deleteFileFromGitHub(path: string, message?: string): Promise<void> {
  const token = getToken();
  if (!token) {
    throw new Error('未配置 GitHub Token');
  }

  const { owner, repo, branch } = getGitHubConfig();
  if (!owner || !repo) {
    throw new Error('未配置 GitHub owner/repo（请检查 .env 文件）');
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  // 获取文件 sha
  let sha: string | undefined;
  try {
    const res = await fetch(`${url}?ref=${branch}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (res.ok) {
      const data = await res.json();
      sha = data.sha;
    }
  } catch {
    // 文件不存在，无需删除
    return;
  }

  if (!sha) {
    // 文件不存在，无需删除
    return;
  }

  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({
      message: message || `chore: delete ${path}`,
      sha,
      branch,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub API 错误: ${res.status} ${err.message || res.statusText}`);
  }
}

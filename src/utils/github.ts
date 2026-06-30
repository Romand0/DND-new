const GITHUB_API = 'https://api.github.com';

function getConfig() {
  const owner = import.meta.env.VITE_GITHUB_OWNER || '';
  const repo = import.meta.env.VITE_GITHUB_REPO || '';
  const branch = import.meta.env.VITE_GITHUB_BRANCH || 'main';
  const token = localStorage.getItem('github_token') || '';

  if (!token) {
    throw new Error('请先在设置中配置 GitHub Token');
  }
  if (!owner || !repo) {
    throw new Error('请配置 VITE_GITHUB_OWNER 和 VITE_GITHUB_REPO 环境变量');
  }

  return { owner, repo, branch, token };
}

function encodeContent(content: string): string {
  return btoa(unescape(encodeURIComponent(content)));
}

async function getFileSha(
  owner: string,
  repo: string,
  path: string,
  branch: string,
  token: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`获取文件失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.sha;
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return null;
    }
    throw error;
  }
}

export async function commitFile(
  path: string,
  content: string,
  message: string
): Promise<void> {
  const { owner, repo, branch, token } = getConfig();

  const sha = await getFileSha(owner, repo, path, branch, token);

  const body: Record<string, string> = {
    message,
    content: encodeContent(content),
    branch,
  };

  if (sha) {
    body.sha = sha;
  }

  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `提交文件失败: ${response.statusText}${errorData.message ? ` - ${errorData.message}` : ''}`
    );
  }
}

export async function fetchFile(path: string): Promise<string | null> {
  try {
    const owner = import.meta.env.VITE_GITHUB_OWNER || '';
    const repo = import.meta.env.VITE_GITHUB_REPO || '';
    const branch = import.meta.env.VITE_GITHUB_BRANCH || 'main';
    const token = localStorage.getItem('github_token') || '';

    if (!owner || !repo) {
      return null;
    }

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3.raw',
    };
    if (token) {
      headers.Authorization = `token ${token}`;
    }

    const response = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      { headers }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`获取文件失败: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    console.error('获取文件失败:', error);
    return null;
  }
}

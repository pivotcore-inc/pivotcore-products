/**
 * PivotCore 製品管理 中継 Worker
 * --------------------------------
 * 管理画面(admin.html)から GitHub API を直接呼ばず、この Worker を中継させる。
 * 認証情報(GitHubトークン・管理パスワード)は Worker の Secret として保持し、
 * ブラウザには一切露出させない。
 *
 * 必要な環境変数 / Secret（Cloudflare ダッシュボード or wrangler で設定）:
 *   ADMIN_PASSWORD  … 管理画面ログインパスワード        (Secret)
 *   GITHUB_TOKEN    … repo 権限を持つ Fine-grained PAT  (Secret)
 *   GITHUB_OWNER    … GitHub ユーザー/Org 名             (Var)  例: pivotcore
 *   GITHUB_REPO     … リポジトリ名                       (Var)  例: pivotcore-products
 *   GITHUB_BRANCH   … 対象ブランチ                       (Var)  例: main
 *   FILE_PATH       … products.json のパス               (Var)  例: products-data/products.json
 *   ALLOWED_ORIGIN  … 管理画面のオリジン（CORS用）        (Var)  例: https://admin.pivotcore.jp  ※ * も可
 *
 * エンドポイント:
 *   GET  /products  … 現在の products.json と sha を返す
 *   PUT  /products  … products を受け取り GitHub にコミット
 */

const GH_API = 'https://api.github.com';

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8', ...corsHeaders(env) },
  });
}

/** タイミング攻撃を緩和する定数時間比較 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function ghHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'pivotcore-admin-worker',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function fileUrl(env) {
  return `${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.FILE_PATH}?ref=${env.GITHUB_BRANCH}`;
}

// UTF-8 安全な base64
function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function fromBase64Utf8(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    // 認証（全リクエストでパスワードヘッダを検証）
    const pw = request.headers.get('X-Admin-Password') || '';
    if (!env.ADMIN_PASSWORD || !safeEqual(pw, env.ADMIN_PASSWORD)) {
      return json({ error: 'unauthorized' }, 401, env);
    }

    if (url.pathname !== '/products') {
      return json({ error: 'not found' }, 404, env);
    }

    // ----- 取得 -----
    if (request.method === 'GET') {
      const res = await fetch(fileUrl(env), { headers: ghHeaders(env) });
      if (!res.ok) {
        return json({ error: 'github_fetch_failed', status: res.status }, 502, env);
      }
      const data = await res.json();
      const content = fromBase64Utf8(data.content);
      let parsed;
      try { parsed = JSON.parse(content); } catch (e) { parsed = null; }
      return json({ sha: data.sha, data: parsed, raw: content }, 200, env);
    }

    // ----- 更新（コミット） -----
    if (request.method === 'PUT') {
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'invalid_json' }, 400, env); }

      const { data, sha, message } = body || {};
      if (!data || !Array.isArray(data.products)) {
        return json({ error: 'products array required' }, 400, env);
      }

      const newContent = JSON.stringify(data, null, 2) + '\n';
      if(newContent.length > 2 * 1024 * 1024){return json({error:'data_too_large',detail:'製品データが2MBを超えています'},400,env);}
      const payload = {
        message: message || `chore: 製品データ更新 (${new Date().toISOString()})`,
        content: toBase64Utf8(newContent),
        branch: env.GITHUB_BRANCH,
        ...(sha ? { sha } : {}),
      };

      const res = await fetch(
        `${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.FILE_PATH}`,
        { method: 'PUT', headers: ghHeaders(env), body: JSON.stringify(payload) }
      );

      if (!res.ok) {
        const txt = await res.text();
        return json({ error: 'github_commit_failed', status: res.status, detail: txt }, 502, env);
      }
      const result = await res.json();
      return json({ ok: true, commit: result.commit?.html_url, sha: result.content?.sha }, 200, env);
    }

    return json({ error: 'method not allowed' }, 405, env);
  },
};

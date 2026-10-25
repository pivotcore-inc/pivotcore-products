/**
 * 本番リバースプロキシ Worker
 * --------------------------------------------------------------------------
 * 目的: www.pivotcore.jp/products* へのアクセスを WordPress（ConoHa WING）へ
 *       透過的に転送する。これにより既存サイト（GitHub Pages）はそのまま残しつつ、
 *       /products/ 配下だけを WordPress が提供する構成を実現する。
 *
 * 仕組み:
 *   - この Worker は wrangler.toml の routes で /products と /products/* のみに紐づく。
 *   - それ以外のパス（トップページや会社情報など）はこの Worker を経由せず、
 *     通常どおり既存オリジン（GitHub Pages）へ到達する。
 *
 * 設定（wrangler.toml の [vars]）:
 *   PAGES_HOST … 転送先ホスト（例: pivotcore-wp.com）
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 念のため /products 配下のみを受け付ける（ルート設定の保険）
    if (!(url.pathname === '/products' || url.pathname.startsWith('/products/'))) {
      return new Response('Not found', { status: 404 });
    }

    const pagesHost = env.PAGES_HOST;
    if (!pagesHost) {
      return new Response('Misconfigured: PAGES_HOST is not set', { status: 500 });
    }

    // パスはそのまま（/products/... を /products/... へ）転送
    const upstream = `https://${pagesHost}${url.pathname}${url.search}`;

    // Host ヘッダーを転送先に書き換え（ConoHa WING が正しい仮想ホストで応答するため）
    const headers = new Headers(request.headers);
    headers.set('Host', pagesHost);
    headers.set('X-Forwarded-Host', url.hostname);
    headers.set('X-Forwarded-Proto', 'https');

    const method = request.method.toUpperCase();
    const init = {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : request.body,
      redirect: 'manual', // WordPress 側の 3xx を書き換えずそのまま返す
    };

    let resp;
    try {
      resp = await fetch(upstream, init);
    } catch (e) {
      return new Response('Upstream fetch failed', { status: 502 });
    }

    // レスポンスヘッダーを複製し、Location ヘッダーのドメインを書き換え
    const respHeaders = new Headers(resp.headers);
    const location = respHeaders.get('Location');
    if (location) {
      respHeaders.set('Location', location.replace(
        `https://${pagesHost}`, `https://${url.hostname}`
      ));
    }

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    });
  },
};

#!/usr/bin/env node
/**
 * PivotCore 製品ページ静的生成スクリプト
 * --------------------------------------
 * products-data/products.json を読み込み、
 *   dist/index.html            … 型番一覧ページ
 *   dist/{slug}/index.html     … 各製品ページ
 *   dist/sitemap.xml           … サイトマップ
 *   dist/robots.txt            … robots
 * を生成します。外部依存なし（Node 標準モジュールのみ）。
 *
 * 使い方:  node build.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'products-data', 'products.json');
const TPL_DIR = path.join(ROOT, 'templates');
const OUT_DIR = path.join(ROOT, 'dist');

// ---------- ユーティリティ ----------

/** HTML特殊文字をエスケープ（XSS / 表示崩れ防止） */
function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 属性値用エスケープ（検索データ等） */
function attr(str) { return esc(str); }

/** 型番 → URLスラッグ。英数字以外はハイフン化し小文字へ。 */
function toSlug(partNumber) {
  return String(partNumber)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** テンプレート中の {{KEY}} を一括置換 */
function fill(template, map) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(map, key) ? map[key] : m
  );
}

function readTpl(name) {
  return fs.readFileSync(path.join(TPL_DIR, name), 'utf8');
}

/** dist をクリーンに再生成 */
function resetDist() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function writeFile(relPath, content) {
  const full = path.join(OUT_DIR, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

// マウント先（productsPath、例: "products"）配下に出力する。
// これにより *.pages.dev のプレビューでも本番プロキシ配下でも
// 同一の /products/... パスでページが解決できる（全環境で同一成果物）。
let MOUNT = '';
function writeMounted(relPath, content) {
  writeFile(MOUNT ? path.join(MOUNT, relPath) : relPath, content);
}

// ---------- バリデーション ----------

const REQUIRED = ['partNumber', 'manufacturer', 'category'];

function validate(products) {
  const errors = [];
  const seenSlug = new Map();
  products.forEach((p, i) => {
    REQUIRED.forEach((f) => {
      if (!p[f] || String(p[f]).trim() === '') {
        errors.push(`[${i}] 必須項目「${f}」が未入力です（partNumber: ${p.partNumber || '不明'}）`);
      }
    });
    if (p.partNumber) {
      const slug = p.slug ? toSlug(p.slug) : toSlug(p.partNumber);
      if (!slug) {
        errors.push(`[${i}] slug を生成できません（partNumber: ${p.partNumber}）`);
      } else if (seenSlug.has(slug)) {
        errors.push(`[${i}] slug が重複しています: "${slug}" （${seenSlug.get(slug)} と ${p.partNumber}）`);
      } else {
        seenSlug.set(slug, p.partNumber);
      }
    }
  });
  return errors;
}

// ---------- ページ生成 ----------

function buildProductPage(p, site, tpl, allProducts) {
  const slug = p.slug ? toSlug(p.slug) : toSlug(p.partNumber);
  const canonical = `${site.baseUrl}${site.productsPath}/${slug}/`;
  const makerUrl = `${site.productsPath}/?maker=${encodeURIComponent(p.manufacturer)}`;
  const rfqPrefill = `${site.baseUrl}/?model=${encodeURIComponent(p.partNumber)}#rfq`;

  // meta description（説明文を120字程度に整形）
  const descSrc = (p.description || '').replace(/\s+/g, ' ').trim();
  const metaDesc = `${p.partNumber}（${p.manufacturer}／${p.category}）の調達・在庫確認・お見積りはピボットコアへ。${descSrc}`.slice(0, 120);

  // スペック表（2列ペアレイアウト：メーカー/カテゴリ/パッケージ/RoHS/データシート含む）
  const TH = 'bg-slate-50 text-left p-3 font-bold text-slate-500 border-r border-slate-200';
  const TD = 'p-3 border-r border-slate-200';
  const TDL = 'p-3'; // 行末セル（右borderなし）
  // パッケージはp.packageから表示するため、specs配列から除外
  const dynamicSpecs = (Array.isArray(p.specs) ? p.specs : []).filter(s => s.label !== 'パッケージ');
  // 要件定義書の並び: メーカー, 1番目スペック, カテゴリ, 2番目以降スペック..., パッケージ, RoHS, データシート
  const allSpecs = [];
  allSpecs.push({ l: 'メーカー', v: esc(p.manufacturer) });
  if (dynamicSpecs[0]) allSpecs.push({ l: dynamicSpecs[0].label, v: esc(dynamicSpecs[0].value) });
  allSpecs.push({ l: 'カテゴリ', v: esc(p.category) });
  for (let i = 1; i < dynamicSpecs.length; i++) allSpecs.push({ l: dynamicSpecs[i].label, v: esc(dynamicSpecs[i].value) });
  if (p.package) allSpecs.push({ l: 'パッケージ', v: esc(p.package) });
  if (p.rohs) allSpecs.push({ l: 'RoHS', v: esc(p.rohs) });
  if (p.datasheetUrl) {
    allSpecs.push({ l: 'データシート', v: `<a href="${esc(p.datasheetUrl)}" target="_blank" rel="noopener nofollow" class="text-[#163A8D] hover:text-red-700 underline">メーカー公式ページで確認する <i class="fas fa-external-link-alt text-[10px] ml-1"></i></a>` });
  }
  let specRows = '';
  for (let i = 0; i < allSpecs.length; i += 2) {
    const a = allSpecs[i];
    const b = allSpecs[i + 1];
    specRows += `<tr class="border-b border-slate-200">`;
    specRows += `<th class="${TH}" style="width:22%">${esc(a.l)}</th><td class="${TD}">${a.v}</td>`;
    if (b) {
      specRows += `<th class="${TH}" style="width:22%">${esc(b.l)}</th><td class="${TDL}">${b.v}</td>`;
    } else {
      specRows += `<th class="${TH}"></th><td class="${TDL}"></td>`;
    }
    specRows += '</tr>';
  }

  // データシートブロック（スペック表に統合済み）
  const datasheetBlock = '';

  // 用途例
  const apps = Array.isArray(p.applications) ? p.applications : [];
  const applications = apps.length
    ? apps.map((a) => `<li class="bg-slate-100 text-slate-700 text-[14px] px-4 py-2 rounded-full">${esc(a)}</li>`).join('')
    : '<li class="text-slate-500 text-[14px]">用途例は準備中です。</li>';

  // 構造化データ（Product + BreadcrumbList）
  const jsonld = JSON.stringify([
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.partNumber,
      sku: p.partNumber,
      mpn: p.partNumber,
      category: p.category,
      description: descSrc,
      brand: { '@type': 'Brand', name: p.manufacturer },
      manufacturer: { '@type': 'Organization', name: p.manufacturer },
      url: canonical,
      offers: {
        '@type': 'Offer',
        availability: 'https://schema.org/InStock',
        priceCurrency: 'JPY',
        price: '0',
        seller: { '@type': 'Organization', name: site.company },
        url: rfqPrefill
      }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'ホーム', item: `${site.baseUrl}/` },
        { '@type': 'ListItem', position: 2, name: '型番検索', item: `${site.baseUrl}${site.productsPath}/` },
        { '@type': 'ListItem', position: 3, name: p.manufacturer, item: `${site.baseUrl}${makerUrl}` },
        { '@type': 'ListItem', position: 4, name: p.partNumber, item: canonical }
      ]
    }
  ]).replace(/</g, '\\u003c'); // </script> 混入防止

  const html = fill(tpl, {
    TITLE: esc(`${p.partNumber} ${p.manufacturer}の調達・見積依頼 | ${site.company}`),
    META_DESCRIPTION: esc(metaDesc),
    KEYWORDS: esc((p.keywords || [p.partNumber, p.manufacturer, p.category]).join(',')),
    CANONICAL: esc(canonical),
    OG_TITLE: esc(`${p.partNumber} の調達・見積依頼`),
    OG_IMAGE: esc(site.ogImage || site.logo),
    COMPANY: esc(site.company),
    COMPANY_EN: esc(site.companyEn),
    JSONLD: jsonld,
    BASE_URL: esc(site.baseUrl),
    PRODUCTS_URL: esc(site.productsPath),
    RFQ_URL: esc(site.rfqUrl),
    RFQ_PREFILL_URL: esc(rfqPrefill),
    LOGO: esc(site.logo),
    TEL: esc(site.tel),
    TEL_HOURS: esc(site.telHours),
    PART_NUMBER: esc(p.partNumber),
    MANUFACTURER: esc(p.manufacturer),
    MAKER_URL: esc(site.baseUrl + makerUrl),
    CATEGORY: esc(p.category),
    PACKAGE: esc(p.package || '—'),
    LONGLEAD_BADGE: p.longLead !== false ? '<span class="badge-longlead">長納期対応</span>' : '',
    PACKAGE_BADGE: p.package ? `<span class="text-xs font-bold bg-[#0d2260] px-3 py-1 rounded-sm">パッケージ：${esc(p.package)}</span>` : '',
    PROCUREMENT_STATUS: p.longLead !== false
      ? '<span class="text-red-700 font-bold"><i class="fas fa-exclamation-triangle mr-1"></i>長納期品・要相談</span>'
      : '<span class="text-slate-700"><i class="fas fa-check text-green-600 mr-1"></i>調達対応可（お問い合わせください）</span>',
    DESCRIPTION: esc(descSrc),
    SPEC_ROWS: specRows,
    DATASHEET_BLOCK: datasheetBlock,
    APPLICATIONS: applications,
    RELATED_PRODUCTS: buildRelatedProducts(p, site, allProducts),
    YEAR: new Date().getFullYear()
  });

  writeMounted(path.join(slug, 'index.html'), html);
  return { slug, canonical };
}

function buildRelatedProducts(p, site, allProducts) {
  const related = (allProducts || [])
    .filter(x => x.category === p.category && x.partNumber !== p.partNumber)
    .slice(0, 3);
  if (!related.length) return '';
  const cards = related.map(r => {
    const rSlug = toSlug(r.partNumber);
    return `<a href="${site.productsPath}/${rSlug}/" class="block border border-slate-200 rounded p-4 hover:shadow-md transition">
            <div class="text-xs text-slate-400 mb-1">${esc(r.category)}</div>
            <div class="font-bold text-[#163A8D] font-mono text-sm break-all">${esc(r.partNumber)}</div>
            <div class="text-xs text-slate-500 mt-1">${esc(r.manufacturer)}</div>
        </a>`;
  }).join('');
  return `<section class="mb-8">
        <h2 class="text-xl font-bold text-[#163A8D] border-l-4 border-red-700 pl-4 mb-6">関連製品（${esc(p.category)}）</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">${cards}</div>
    </section>`;
}

function buildIndexPage(products, site, tpl) {
  // 一覧カード（静的生成：SEOのため全リンクをHTMLに含める）
  const cards = products.map((p) => {
    const slug = p.slug ? toSlug(p.slug) : toSlug(p.partNumber);
    const url = `${site.productsPath}/${slug}/`;
    const searchData = [p.partNumber, p.manufacturer, p.category, p.package, ...(p.keywords || [])]
      .filter(Boolean).join(' ');
    const longLeadBadge = p.longLead !== false
      ? '<div class="mb-3"><span class="badge-longlead">長納期対応</span></div>' : '';
    return `<a data-card href="${esc(url)}" data-maker="${attr(p.manufacturer)}" data-cat="${attr(p.category)}" data-search="${attr(searchData)}" class="flex flex-col bg-white border border-slate-200 rounded-sm shadow-sm card-hover overflow-hidden accent-border p-5">
        <div class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">${esc(p.category)}</div>
        <div class="text-lg font-bold text-[#163A8D] font-mono break-all mb-1">${esc(p.partNumber)}</div>
        <div class="text-sm text-slate-500 mb-3">${esc(p.manufacturer)}</div>
        ${longLeadBadge}
        <div class="mt-auto bg-red-700 hover:bg-red-800 text-white text-center py-2.5 text-sm font-bold transition">詳細・見積依頼 <i class="fas fa-chevron-right ml-1"></i></div>
        <div class="text-center text-xs text-slate-400 mt-2">クリックで詳細ページを確認</div>
    </a>`;
  }).join('\n');

  // メーカー・カテゴリのチップ
  const makers = [...new Set(products.map((p) => p.manufacturer))];
  const cats = [...new Set(products.map((p) => p.category))];
  const makerChips = makers.map((m) =>
    `<button data-maker="${attr(m)}" class="filter-chip text-[13px] border border-slate-300 rounded-full px-4 py-1.5 transition hover:border-[#163A8D]">${esc(m)}</button>`
  ).join('\n');
  const catChips = cats.map((c) =>
    `<button data-cat="${attr(c)}" class="filter-chip text-[13px] border border-slate-300 rounded-full px-4 py-1.5 transition hover:border-[#163A8D]">${esc(c)}</button>`
  ).join('\n');

  const canonical = `${site.baseUrl}${site.productsPath}/`;
  const metaDesc = `半導体・電子部品の調達対応型番一覧。STM32・FPGA・電源IC・パワー半導体など、長納期品・調達困難品・EOL品の在庫確認とお見積りをピボットコアが承ります。`;

  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '調達対応型番一覧',
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: site.company, url: `${site.baseUrl}/` }
  }).replace(/</g, '\\u003c');

  const html = fill(tpl, {
    TITLE: esc(`調達対応型番一覧（型番検索） | ${site.company}`),
    META_DESCRIPTION: esc(metaDesc),
    CANONICAL: esc(canonical),
    OG_TITLE: esc(`調達対応型番一覧 | ${site.company}`),
    OG_IMAGE: esc(site.ogImage || site.logo),
    COMPANY: esc(site.company),
    COMPANY_EN: esc(site.companyEn),
    JSONLD: jsonld,
    BASE_URL: esc(site.baseUrl),
    PRODUCTS_URL: esc(site.productsPath),
    RFQ_URL: esc(site.rfqUrl),
    LOGO: esc(site.logo),
    TEL: esc(site.tel),
    PRODUCT_CARDS: cards,
    MAKER_CHIPS: makerChips,
    CAT_CHIPS: catChips,
    YEAR: new Date().getFullYear()
  });

  writeMounted('index.html', html);
}

function buildSitemap(entries, site) {
  const now = new Date().toISOString().slice(0, 10);
  const urls = [
    `${site.baseUrl}${site.productsPath}/`,
    ...entries.map((e) => e.canonical)
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>weekly</changefreq>\n  </url>`).join('\n')}
</urlset>
`;
  writeMounted('sitemap.xml', xml);
}

function buildRobots(site) {
  const txt = `User-agent: *
Allow: /

Sitemap: ${site.baseUrl}${site.productsPath}/sitemap.xml
`;
  writeMounted('robots.txt', txt);
}

// ---------- メイン ----------

function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`✗ データファイルが見つかりません: ${DATA_FILE}`);
    process.exit(1);
  }

  let json;
  try {
    json = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('✗ products.json の JSON 構文エラー:', e.message);
    process.exit(1);
  }

  const site = json.site || {};
  const products = Array.isArray(json.products) ? json.products : [];

  // 既定値の補完（環境変数があれば優先：CI で環境ごとに上書き可能）
  site.baseUrl = (process.env.BASE_URL || site.baseUrl || 'https://www.pivotcore.jp').replace(/\/$/, '');
  site.productsPath = process.env.PRODUCTS_PATH || site.productsPath || '/products';
  site.productsPath = '/' + site.productsPath.replace(/^\/+|\/+$/g, ''); // 先頭1つのスラッシュに正規化
  site.company = site.company || '株式会社ピボットコア';
  site.companyEn = site.companyEn || 'PivotCore Inc.';
  site.rfqUrl = site.rfqUrl || `${site.baseUrl}/#rfq`;
  site.tel = site.tel || '050-6863-4302';
  site.telHours = site.telHours || '平日 9:00-17:30';
  site.logo = site.logo || `${site.baseUrl}/pivotcore_logo.png`;

  const errors = validate(products);
  if (errors.length) {
    console.error('✗ バリデーションエラー:');
    errors.forEach((e) => console.error('  - ' + e));
    process.exit(1);
  }

  resetDist();

  // 出力をマウント先（例: products）配下に揃える
  MOUNT = site.productsPath.replace(/^\/+|\/+$/g, '');

  // プロジェクトのルートに来たアクセスを一覧へ誘導（テスター/プレビュー用の利便性）。
  // *.pages.dev は _redirects を解釈する。ローカルの静的サーバ用に index.html も置く。
  if (MOUNT) {
    writeFile('_redirects', `/    ${site.productsPath}/    302\n`);
    writeFile('index.html',
      `<!doctype html><meta charset="utf-8"><title>${site.company}</title>` +
      `<meta http-equiv="refresh" content="0; url=${site.productsPath}/">` +
      `<link rel="canonical" href="${site.baseUrl}${site.productsPath}/">` +
      `<p><a href="${site.productsPath}/">${site.productsPath}/ へ移動</a></p>`);
  }

  const productTpl = readTpl('product.html');
  const indexTpl = readTpl('index.html');

  const entries = products.map((p) => buildProductPage(p, site, productTpl, products));
  buildIndexPage(products, site, indexTpl);
  buildSitemap(entries, site);
  buildRobots(site);

  // 管理画面を dist に含める（固定URLでアクセス可能にする）
  const adminSrc = path.join(ROOT, 'admin', 'admin.html');
  if (fs.existsSync(adminSrc)) {
    writeFile(path.join('admin', 'index.html'), fs.readFileSync(adminSrc, 'utf8'));
  }

  console.log(`✓ ${products.length} 件の製品ページを生成しました。`);
  console.log(`  出力先: ${OUT_DIR}`);
  entries.forEach((e) => console.log(`  - ${site.productsPath}/${e.slug}/`));
  console.log(`  + ${site.productsPath}/ （一覧）, sitemap.xml, robots.txt`);
  if (fs.existsSync(adminSrc)) console.log(`  + /admin/ （管理画面）`);
}

main();

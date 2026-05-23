#!/usr/bin/env node
// build.js - products.json から型番一覧・個別ページを自動生成するビルドスクリプト

const fs = require('fs');
const path = require('path');

// =========================================
// 設定
// =========================================
const PRODUCTS_JSON = path.join(__dirname, 'products.json');
const OUTPUT_DIR    = path.join(__dirname, 'dist');
const RFQ_URL       = 'https://www.pivotcore.jp/#rfq';
const SITE_URL      = 'https://www.pivotcore.jp';
const PRODUCTS_URL  = `${SITE_URL}/products`;

// =========================================
// データ読み込み
// =========================================
const products = JSON.parse(fs.readFileSync(PRODUCTS_JSON, 'utf8'));

// カテゴリ一覧（一覧ページのフィルター用）
const categories = ['全て', ...new Set(products.map(p => p.category))];

// =========================================
// ヘルパー
// =========================================
function mkdirp(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// 既存サイトと共通のヘッダーHTML
function header(title, description, canonicalPath) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${PRODUCTS_URL}${canonicalPath}">
  <!-- OGP -->
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${PRODUCTS_URL}${canonicalPath}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="株式会社ピボットコア">
  <!-- Tailwind CSS（既存サイトと同一） -->
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap');
    body { font-family: 'Noto Sans JP', sans-serif; }
    .nav-link::after { content: ''; display: block; width: 0; height: 2px; background: #b91c1c; transition: width .3s; }
    .nav-link:hover::after { width: 100%; }
    .accent-border { border-top: 4px solid #b91c1c; }
    .badge-longlead { display: inline-block; background: #b91c1c; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; letter-spacing: 0.05em; vertical-align: middle; margin-left: 8px; }
    .card-hover { transition: box-shadow .2s, transform .2s; }
    .card-hover:hover { box-shadow: 0 8px 24px rgba(22,58,141,0.12); transform: translateY(-2px); }
    .filter-btn { transition: background .2s, color .2s; }
    .filter-btn.active { background: #163A8D; color: #fff; }
  </style>
</head>
<body class="bg-white text-slate-900 leading-relaxed">

<!-- ヘッダー（既存サイトと同一構成） -->
<header class="bg-white border-b border-slate-200 sticky top-0 z-50">
  <div class="container mx-auto px-6 py-4 flex flex-col lg:flex-row justify-between items-center">
    <a href="${SITE_URL}" class="flex flex-col items-start mb-4 lg:mb-0">
      <img src="${SITE_URL}/pivotcore_logo.png" alt="PivotCoreロゴ" class="h-10 md:h-12 object-contain">
      <p class="text-[10px] md:text-xs font-bold text-slate-500 tracking-[0.1em] mt-1 ml-2">株式会社ピボットコア</p>
    </a>
    <nav class="flex items-center space-x-8">
      <ul class="flex space-x-8 text-sm font-bold text-slate-700">
        <li><a href="${SITE_URL}/#top" class="nav-link hover:text-[#163A8D] transition">ホーム</a></li>
        <li><a href="${SITE_URL}/#business" class="nav-link hover:text-[#163A8D] transition">事業内容</a></li>
        <li><a href="${PRODUCTS_URL}/" class="nav-link hover:text-[#163A8D] transition text-[#163A8D]">調達対応型番</a></li>
        <li><a href="${SITE_URL}/#rfq" class="nav-link hover:text-[#163A8D] transition">見積依頼 (RFQ)</a></li>
      </ul>
      <div class="hidden md:block">
        <a href="tel:050-6863-4302" class="flex items-center text-[#163A8D] font-bold">
          <i class="fas fa-phone-alt mr-2 text-red-700"></i>
          <span>050-6863-4302</span>
        </a>
      </div>
    </nav>
  </div>
</header>`;
}

// 共通フッター
function footer() {
  return `
<!-- フッター（既存サイトと同一） -->
<footer class="bg-[#002060] text-white py-20">
  <div class="container mx-auto px-6">
    <div class="grid md:grid-cols-3 gap-12 border-b border-[#001a4d] pb-12 mb-12">
      <div>
        <div class="mb-4">
          <img src="${SITE_URL}/pivotcore_logo.png" alt="PivotCoreロゴ" class="h-12 object-contain mb-1">
          <p class="text-xs font-semibold text-slate-300 tracking-[0.1em] ml-2">株式会社ピボットコア</p>
        </div>
        <p class="text-sm text-slate-400 leading-loose">半導体・電子部品の安定供給を通じ、<br>ものづくりの未来を支えるBtoB商社です。</p>
      </div>
      <div>
        <h4 class="text-sm font-bold mb-6 border-b border-[#001a4d] pb-2 uppercase tracking-widest italic text-red-700">クイックリンク</h4>
        <ul class="text-sm space-y-3 text-slate-400">
          <li><a href="${SITE_URL}/#top" class="hover:text-white transition">ホーム</a></li>
          <li><a href="${SITE_URL}/#business" class="hover:text-white transition">事業内容</a></li>
          <li><a href="${PRODUCTS_URL}/" class="hover:text-white transition">調達対応型番一覧</a></li>
          <li><a href="${SITE_URL}/#rfq" class="hover:text-white transition">見積依頼 (RFQ)</a></li>
        </ul>
      </div>
      <div>
        <h4 class="text-sm font-bold mb-6 border-b border-[#001a4d] pb-2 uppercase tracking-widest italic text-red-700">事業所</h4>
        <address class="text-sm text-slate-400 not-italic space-y-2">
          <p>株式会社ピボットコア</p>
          <p>〒160-0023 東京都新宿区西新宿3-3-13<br>西新宿水間ビル6F</p>
          <p class="pt-2">TEL: <a href="tel:050-6863-4302" class="hover:text-white transition">050-6863-4302</a></p>
        </address>
      </div>
    </div>
    <div class="flex flex-col md:flex-row justify-between items-center text-[10px] text-slate-400 tracking-widest font-bold">
      <p>&copy; 2026 PivotCore Inc. All Rights Reserved.</p>
      <div class="mt-4 md:mt-0 space-x-6">
        <a href="${SITE_URL}/#privacy" class="hover:text-white transition">Privacy Policy</a>
        <a href="${SITE_URL}/#sitemap" class="hover:text-white transition">Site Map</a>
      </div>
    </div>
  </div>
</footer>
</body>
</html>`;
}

// =========================================
// 1. 型番一覧ページ（index.html）を生成
// =========================================
function buildIndexPage() {
  const filterButtons = categories.map((cat, i) =>
    `<button class="filter-btn px-4 py-2 border border-[#163A8D] text-sm font-bold rounded-sm${i === 0 ? ' active' : ' text-[#163A8D]'}" data-cat="${cat}">${cat}</button>`
  ).join('\n        ');

  const cards = products.map(p => `
    <div class="product-card card-hover bg-white border rounded-sm shadow-sm overflow-hidden accent-border" data-cat="${p.category}">
      <div class="p-6">
        <div class="flex items-start justify-between mb-3">
          <span class="text-xs font-bold text-slate-400 uppercase tracking-widest">${p.category}</span>
          ${p.longLead ? '<span class="badge-longlead">長納期対応</span>' : ''}
        </div>
        <h2 class="text-lg font-bold text-[#163A8D] font-mono mb-2 break-all">${p.partNumber}</h2>
        <p class="text-sm text-slate-500 mb-4">${p.maker}</p>
        <a href="${PRODUCTS_URL}/${p.slug}/"
           class="block w-full text-center bg-red-700 hover:bg-red-800 text-white py-2 px-4 text-sm font-bold transition">
          詳細・見積依頼 <i class="fas fa-chevron-right ml-1"></i>
        </a>
      </div>
    </div>`).join('');

  const html = `${header(
    '調達対応型番一覧 | 株式会社ピボットコア',
    '長納期品・EOL品・需給逼迫品の調達に対応。STM32、FPGA、電源IC、MOSFETなど半導体・電子部品の型番一覧です。',
    '/'
  )}

<main>
  <!-- ページヘッダー -->
  <div class="bg-[#163A8D] py-20 text-white">
    <div class="container mx-auto px-6">
      <!-- パンくず -->
      <nav class="text-sm text-blue-200 mb-4">
        <a href="${SITE_URL}" class="hover:text-white transition">ホーム</a>
        <span class="mx-2">/</span>
        <span>調達対応型番一覧</span>
      </nav>
      <h1 class="text-4xl font-bold italic mb-3">調達対応型番一覧</h1>
      <p class="text-blue-100 text-lg">長納期品・EOL品・需給逼迫品にも対応。お気軽にご相談ください。</p>
    </div>
  </div>

  <!-- 一覧セクション -->
  <div class="container mx-auto px-6 py-16">

    <!-- カテゴリフィルター -->
    <div class="flex flex-wrap gap-3 mb-8" id="filter-area">
      ${filterButtons}
    </div>

    <!-- 検索ボックス -->
    <div class="mb-10">
      <div class="relative max-w-md">
        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
        <input type="text" id="search-input" placeholder="型番を入力して検索..."
               class="w-full border border-slate-200 pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#163A8D] bg-slate-50 rounded-sm">
      </div>
    </div>

    <!-- 件数表示 -->
    <p class="text-sm text-slate-500 mb-6"><span id="count">${products.length}</span> 件表示中</p>

    <!-- 製品カードグリッド -->
    <div class="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6" id="product-grid">
      ${cards}
    </div>

    <!-- 0件メッセージ -->
    <div id="no-results" class="hidden text-center py-20 text-slate-400">
      <i class="fas fa-search text-4xl mb-4"></i>
      <p class="font-bold">該当する製品が見つかりませんでした。</p>
      <p class="text-sm mt-2">型番・メーカー名でお気軽にお問い合わせください。</p>
      <a href="${RFQ_URL}" class="inline-block mt-6 bg-red-700 text-white px-8 py-3 font-bold hover:bg-red-800 transition">
        見積依頼（RFQ）はこちら
      </a>
    </div>
  </div>

  <!-- CTA -->
  <div class="bg-slate-100 py-16">
    <div class="container mx-auto px-6 text-center">
      <p class="text-lg font-bold text-[#163A8D] mb-2">お探しの型番が見つからない場合も</p>
      <p class="text-slate-600 mb-8">掲載されていない型番もご相談ください。独自のグローバルネットワークで調査いたします。</p>
      <a href="${RFQ_URL}" class="inline-block bg-red-700 hover:bg-red-800 text-white px-12 py-4 font-bold transition shadow-lg">
        見積依頼（RFQ）はこちら <i class="fas fa-chevron-right ml-2"></i>
      </a>
    </div>
  </div>
</main>

${footer()}

<script>
// カテゴリフィルター + テキスト検索
const cards = document.querySelectorAll('.product-card');
const filterBtns = document.querySelectorAll('.filter-btn');
const searchInput = document.getElementById('search-input');
const countEl = document.getElementById('count');
const noResults = document.getElementById('no-results');
const grid = document.getElementById('product-grid');

let currentCat = '全て';
let currentQuery = '';

function filterCards() {
  let visible = 0;
  cards.forEach(card => {
    const cat = card.dataset.cat;
    const text = card.innerText.toLowerCase();
    const catMatch = currentCat === '全て' || cat === currentCat;
    const queryMatch = text.includes(currentQuery.toLowerCase());
    const show = catMatch && queryMatch;
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  countEl.textContent = visible;
  noResults.classList.toggle('hidden', visible > 0);
  grid.classList.toggle('hidden', visible === 0);
}

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCat = btn.dataset.cat;
    filterCards();
  });
});

searchInput.addEventListener('input', e => {
  currentQuery = e.target.value;
  filterCards();
});
</script>`;

  mkdirp(path.join(OUTPUT_DIR));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html, 'utf8');
  console.log('✅ dist/index.html');
}

// =========================================
// 2. 個別製品ページを生成
// =========================================
function buildProductPage(p) {
  // 関連製品（同カテゴリ・自分以外・最大3件）
  const related = products
    .filter(r => r.category === p.category && r.slug !== p.slug)
    .slice(0, 3);

  const relatedHtml = related.length === 0 ? '' : `
  <div class="bg-slate-50 py-12">
    <div class="container mx-auto px-6 max-w-5xl">
      <h2 class="text-xl font-bold text-[#163A8D] mb-6">関連製品（同カテゴリ）</h2>
      <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
        ${related.map(r => `
        <a href="${PRODUCTS_URL}/${r.slug}/"
           class="block bg-white border rounded-sm shadow-sm p-5 card-hover accent-border hover:no-underline">
          <p class="text-xs text-slate-400 font-bold uppercase mb-1">${r.category}</p>
          <p class="font-bold text-[#163A8D] font-mono break-all">${r.partNumber}</p>
          <p class="text-sm text-slate-500 mt-1">${r.maker}</p>
        </a>`).join('')}
      </div>
    </div>
  </div>`;

  // 構造化データ（schema.org）
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    "name": p.partNumber,
    "brand": { "@type": "Brand", "name": p.maker },
    "category": p.category,
    "description": p.description,
    "offers": {
      "@type": "Offer",
      "seller": { "@type": "Organization", "name": "株式会社ピボットコア" },
      "url": `${PRODUCTS_URL}/${p.slug}/`
    }
  });

  const html = `${header(
    `${p.partNumber} 調達・購入 | 株式会社ピボットコア`,
    `${p.maker} ${p.partNumber}（${p.category}）の調達はPivotCoreにご相談ください。長納期品・EOL品にも対応。原則24時間以内に一次回答いたします。`,
    `/${p.slug}/`
  )}
<script type="application/ld+json">${schema}</script>

<main>
  <!-- ページヘッダー -->
  <div class="bg-[#163A8D] py-16 text-white">
    <div class="container mx-auto px-6 max-w-5xl">
      <!-- パンくず -->
      <nav class="text-sm text-blue-200 mb-4">
        <a href="${SITE_URL}" class="hover:text-white transition">ホーム</a>
        <span class="mx-2">/</span>
        <a href="${PRODUCTS_URL}/" class="hover:text-white transition">調達対応型番一覧</a>
        <span class="mx-2">/</span>
        <span>${p.partNumber}</span>
      </nav>
      <div class="flex flex-wrap items-center gap-3 mb-2">
        <span class="text-xs font-bold bg-[#0d2260] px-3 py-1 rounded-sm uppercase tracking-wider">${p.category}</span>
        ${p.longLead ? '<span class="badge-longlead">長納期対応</span>' : ''}
      </div>
      <h1 class="text-4xl font-bold font-mono mb-2 break-all">${p.partNumber}</h1>
      <p class="text-blue-100 text-lg">${p.maker}</p>
    </div>
  </div>

  <!-- 製品詳細 -->
  <div class="container mx-auto px-6 py-16 max-w-5xl">
    <div class="grid md:grid-cols-3 gap-12">

      <!-- 左：製品情報 -->
      <div class="md:col-span-2">
        <h2 class="text-xl font-bold text-[#163A8D] mb-6 border-l-4 border-red-700 pl-4">製品情報</h2>
        <div class="border rounded-sm overflow-hidden shadow-sm mb-8">
          <div class="grid grid-cols-3 border-b bg-slate-50">
            <div class="p-4 font-bold text-sm text-slate-500">型番</div>
            <div class="p-4 text-sm md:col-span-2 bg-white font-mono font-bold">${p.partNumber}</div>
          </div>
          <div class="grid grid-cols-3 border-b bg-slate-50">
            <div class="p-4 font-bold text-sm text-slate-500">メーカー</div>
            <div class="p-4 text-sm md:col-span-2 bg-white">${p.maker}</div>
          </div>
          <div class="grid grid-cols-3 border-b bg-slate-50">
            <div class="p-4 font-bold text-sm text-slate-500">カテゴリ</div>
            <div class="p-4 text-sm md:col-span-2 bg-white">${p.category}</div>
          </div>
          <div class="grid grid-cols-3 bg-slate-50">
            <div class="p-4 font-bold text-sm text-slate-500">調達状況</div>
            <div class="p-4 text-sm md:col-span-2 bg-white">
              ${p.longLead
                ? '<span class="text-red-700 font-bold"><i class="fas fa-exclamation-triangle mr-1"></i>長納期品・要相談</span>'
                : '<span class="text-slate-700"><i class="fas fa-check text-green-600 mr-1"></i>調達対応可（お問い合わせください）</span>'}
            </div>
          </div>
        </div>

        <h2 class="text-xl font-bold text-[#163A8D] mb-4 border-l-4 border-red-700 pl-4">調達についてのご案内</h2>
        <div class="bg-slate-50 border-l-4 border-[#163A8D] p-6 rounded-sm mb-8">
          <p class="text-slate-700 leading-loose">${p.description}</p>
        </div>

        <div class="bg-slate-50 p-6 border rounded-sm space-y-2">
          <div class="text-xs font-bold text-[#163A8D] uppercase tracking-wider mb-3">当社の調達方針</div>
          <ul class="text-sm text-slate-600 list-disc list-inside space-y-1">
            <li>正規品ルートを優先し、模倣品の混入を防止します</li>
            <li>品質とトレーサビリティ（追跡可能性）を重視します</li>
            <li>原則24時間以内に一次回答いたします</li>
          </ul>
        </div>
      </div>

      <!-- 右：RFQボックス -->
      <div class="md:col-span-1">
        <div class="bg-white border-2 border-[#163A8D] rounded-sm shadow-lg p-6 sticky top-24">
          <h2 class="text-lg font-bold text-[#163A8D] mb-2">この型番について相談する</h2>
          <p class="text-sm text-slate-500 mb-6 leading-relaxed">型番・数量・希望納期をお知らせいただくだけで、原則24時間以内に一次回答いたします。</p>

          <a href="${RFQ_URL}?partNumber=${encodeURIComponent(p.partNumber)}"
             class="block w-full text-center bg-red-700 hover:bg-red-800 text-white py-4 px-4 font-bold transition shadow-md mb-4 text-base">
            <i class="fas fa-file-alt mr-2"></i>見積依頼（RFQ）はこちら
          </a>

          <a href="tel:050-6863-4302"
             class="block w-full text-center border-2 border-[#163A8D] text-[#163A8D] py-3 px-4 font-bold hover:bg-blue-50 transition text-sm">
            <i class="fas fa-phone-alt mr-2 text-red-700"></i>050-6863-4302
          </a>

          <p class="text-xs text-slate-400 mt-4 text-center leading-relaxed">
            営業時間：9:00〜17:30<br>（土日祝休）
          </p>
        </div>

        <!-- 一覧へ戻る -->
        <div class="mt-6 text-center">
          <a href="${PRODUCTS_URL}/" class="text-sm text-slate-500 hover:text-[#163A8D] transition">
            <i class="fas fa-arrow-left mr-1"></i> 型番一覧へ戻る
          </a>
        </div>
      </div>

    </div>
  </div>

  ${relatedHtml}
</main>

${footer()}`;

  const dir = path.join(OUTPUT_DIR, p.slug);
  mkdirp(dir);
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
  console.log(`✅ dist/${p.slug}/index.html`);
}

// =========================================
// 3. 実行
// =========================================
mkdirp(OUTPUT_DIR);
buildIndexPage();
products.forEach(buildProductPage);

console.log(`\n🎉 ビルド完了: ${products.length + 1} ページ生成`);

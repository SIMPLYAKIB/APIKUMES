// @ts-nocheck
var __defProp=Object.defineProperty;var __name=(target,value)=>__defProp(target,"name",{value,configurable:true});import*as cheerio from"cheerio";import{directProxyFetch}from"./Proxy.js";const DEFAULT_HEADERS={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36","Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8","Accept-Language":"en-US,en;q=0.9","Referer":"https://aniwaves.ru/"};async function searchAniwave(query,page=1){const cleanQuery=(query||"").trim();const safePage=Math.max(1,Math.floor(Number(page)||1));if(!cleanQuery){return{query:"",page:safePage,total_pages:0,total_results:0,has_next:false,results:[]}}const targetUrl=`https://aniwaves.ru/filter?keyword=${encodeURIComponent(cleanQuery)}${safePage>1?`&page=${safePage}`:""}`;const proxyRes=await directProxyFetch(targetUrl,{headers:DEFAULT_HEADERS,signal:AbortSignal.timeout(8e3)});if(!proxyRes.ok){throw new Error(`Aniwave fetch failed with status ${proxyRes.status}`)}const html=await proxyRes.text();const $=cheerio.load(html);const items=[];$("#list-items .item").each((_,el)=>{const posterDiv=$(el).find(".ani.poster");const dataTip=posterDiv.attr("data-tip")||"";const nameLink=$(el).find("a.name, a.d-title").first();const href=nameLink.attr("href")||posterDiv.find("a").attr("href")||"";const title=nameLink.text().trim();const jpTitle=nameLink.attr("data-jp")||"";const poster=posterDiv.find("img").attr("src")||"";const type=$(el).find(".ep-status.type, .type, .meta .right").first().text().trim();const subText=$(el).find(".ep-status.sub").text().trim();const dubText=$(el).find(".ep-status.dub").text().trim();const totalText=$(el).find(".ep-status.total").text().trim();const genres=$(el).find(".genre a").map((__,g)=>$(g).text().trim()).get();const sub=subText?parseInt(subText,10)||subText:null;const dub=dubText?parseInt(dubText,10)||dubText:null;const total=totalText?parseInt(totalText,10)||totalText:null;const slug=href?href.replace(/^\/watch\//,"").replace(/\/$/,""):"";if(title||slug){items.push({id:dataTip||slug,tip_id:dataTip,slug,title:title||slug,japanese_title:jpTitle||null,poster:poster||null,type:type||"TV",episodes:{sub,dub,total},genres})}});const pageItems=$("aside.main ul.pagination li, ul.pagination li");let maxPage=safePage;pageItems.find("a").each((_,a)=>{const p=parseInt($(a).text().trim(),10);if(!isNaN(p)&&p>maxPage)maxPage=p;const href=$(a).attr("href")||"";const m=href.match(/[?&]page=(\d+)/);if(m){const pNum=parseInt(m[1],10);if(pNum>maxPage)maxPage=pNum}});const hasNext=pageItems.find("a").filter((_,a)=>$(a).text().includes("\u203A")||$(a).text().includes("\xBB")).length>0||safePage<maxPage;return{query:cleanQuery,page:safePage,total_pages:Math.max(safePage,maxPage),total_results:items.length,has_next:hasNext,results:items}}__name(searchAniwave,"searchAniwave");function escapeHtml(str){return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}__name(escapeHtml,"escapeHtml");function generateAniwaveSearchHtml(query,searchResponse,error){const safeQ=escapeHtml(query||"");const currentPage=searchResponse?.page||1;const totalPages=searchResponse?.total_pages||1;const hasNext=searchResponse?.has_next||false;const results=searchResponse?.results||[];const cardsHtml=results.length>0?results.map(item=>{const itemTitle=escapeHtml(item.title);const itemJp=item.japanese_title?escapeHtml(item.japanese_title):"";const posterUrl=item.poster?escapeHtml(item.poster):"https://placehold.co/200x280/1a1a24/a0a0b0?text=No+Poster";const typeBadge=escapeHtml(item.type||"TV");const subBadge=item.episodes.sub!==null?`<span class="badge badge-sub">SUB ${escapeHtml(String(item.episodes.sub))}</span>`:"";const dubBadge=item.episodes.dub!==null?`<span class="badge badge-dub">DUB ${escapeHtml(String(item.episodes.dub))}</span>`:"";const genresHtml=item.genres.slice(0,3).map(g=>`<span class="genre-tag">${escapeHtml(g)}</span>`).join("");const watchUrl=item.slug?`https://aniwaves.ru/watch/${escapeHtml(item.slug)}`:"#";return`
        <article class="anime-card" id="anime-${escapeHtml(item.id||item.slug)}">
          <a href="${watchUrl}" target="_blank" rel="noopener noreferrer" class="poster-wrap">
            <img src="${posterUrl}" alt="${itemTitle}" loading="lazy" />
            <div class="poster-overlay">
              <span class="type-pill">${typeBadge}</span>
              <div class="ep-badges">
                ${subBadge}
                ${dubBadge}
              </div>
            </div>
          </a>
          <div class="card-info">
            <h3 class="anime-title" title="${itemTitle}">
              <a href="${watchUrl}" target="_blank" rel="noopener noreferrer">${itemTitle}</a>
            </h3>
            ${itemJp?`<p class="anime-jp" title="${itemJp}">${itemJp}</p>`:""}
            <div class="genres-row">
              ${genresHtml}
            </div>
            <div class="card-actions">
              <a href="${watchUrl}" target="_blank" rel="noopener noreferrer" class="btn-watch">Watch on Aniwave &rarr;</a>
            </div>
          </div>
        </article>
        `}).join("\n"):query?`<div class="empty-state">
           <div class="empty-icon">\u{1F50D}</div>
           <h3>No anime found for "${safeQ}"</h3>
           <p>Try searching for a different title or romanized Japanese name.</p>
         </div>`:`<div class="hero-suggestions">
           <h2>Instant Aniwave Search</h2>
           <p>Search thousands of anime series and movies directly from <a href="https://aniwaves.ru" target="_blank" rel="noopener noreferrer">Aniwave</a>.</p>
           <div class="quick-tags">
             <span>Popular searches:</span>
             <a href="/aniwave?q=One+Piece">One Piece</a>
             <a href="/aniwave?q=Solo+Leveling">Solo Leveling</a>
             <a href="/aniwave?q=Jujutsu+Kaisen">Jujutsu Kaisen</a>
             <a href="/aniwave?q=Bleach">Bleach</a>
             <a href="/aniwave?q=Attack+on+Titan">Attack on Titan</a>
           </div>
         </div>`;const prevPageUrl=currentPage>1?`/aniwave?q=${encodeURIComponent(query)}&page=${currentPage-1}`:"";const nextPageUrl=hasNext?`/aniwave?q=${encodeURIComponent(query)}&page=${currentPage+1}`:"";const paginationHtml=totalPages>1||hasNext||currentPage>1?`
    <nav class="pagination-bar" aria-label="Pagination">
      ${prevPageUrl?`<a href="${prevPageUrl}" class="page-btn">&larr; Previous</a>`:`<span class="page-btn disabled">&larr; Previous</span>`}
      <span class="page-info">Page ${currentPage} of ${Math.max(currentPage,totalPages)}</span>
      ${nextPageUrl?`<a href="${nextPageUrl}" class="page-btn">Next &rarr;</a>`:`<span class="page-btn disabled">Next &rarr;</span>`}
    </nav>
  `:"";const jsonApiUrl=query?`/api/aniwave?q=${encodeURIComponent(query)}${currentPage>1?`&page=${currentPage}`:""}`:"/api/aniwave?q=one+piece";return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${query?`${safeQ} - Aniwave Search`:"Aniwave Instant Anime Search"}</title>
  <meta name="description" content="Instant fast search engine for Aniwave anime stream database." />
  <style>
    :root {
      --bg: #0d0e15;
      --card-bg: #161824;
      --card-hover: #1c1f30;
      --border: #262a40;
      --primary: #7952eb;
      --primary-hover: #8f6cf0;
      --text: #f0f2ff;
      --text-muted: #8b92b2;
      --accent-sub: #10b981;
      --accent-dub: #f59e0b;
      --radius: 12px;
      --font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      line-height: 1.5;
    }
    header {
      background: #11131c;
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(12px);
    }
    .header-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    @media (min-width: 768px) {
      .header-inner {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }
    }
    .logo-row {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: inherit;
    }
    .brand-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: linear-gradient(135deg, #7952eb, #4f46e5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 18px;
      color: #fff;
      box-shadow: 0 4px 12px rgba(121, 82, 235, 0.4);
    }
    .brand-text h1 {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .brand-text span {
      font-size: 12px;
      color: var(--text-muted);
    }
    .search-form {
      display: flex;
      flex: 1;
      max-width: 600px;
      position: relative;
    }
    .search-input {
      width: 100%;
      background: #191c2b;
      border: 1px solid var(--border);
      border-radius: 9999px;
      padding: 12px 52px 12px 20px;
      color: var(--text);
      font-size: 15px;
      outline: none;
      transition: all 0.2s ease;
    }
    .search-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(121, 82, 235, 0.25);
      background: #1d2133;
    }
    .search-btn {
      position: absolute;
      right: 6px;
      top: 6px;
      bottom: 6px;
      width: 38px;
      border: none;
      border-radius: 50%;
      background: var(--primary);
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }
    .search-btn:hover {
      background: var(--primary-hover);
    }
    .api-badge {
      font-size: 13px;
      padding: 8px 14px;
      background: #1d2030;
      border: 1px solid var(--border);
      border-radius: 8px;
      text-decoration: none;
      color: var(--text-muted);
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .api-badge:hover {
      color: #fff;
      border-color: var(--primary);
    }
    main {
      flex: 1;
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
      padding: 24px 20px 48px;
    }
    .results-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
    }
    .results-header h2 {
      font-size: 18px;
      font-weight: 600;
    }
    .results-count {
      color: var(--text-muted);
      font-size: 14px;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 20px;
    }
    @media (min-width: 640px) {
      .cards-grid {
        grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      }
    }
    .anime-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .anime-card:hover {
      transform: translateY(-4px);
      border-color: rgba(121, 82, 235, 0.5);
      box-shadow: 0 12px 24px -10px rgba(0, 0, 0, 0.5);
    }
    .poster-wrap {
      position: relative;
      aspect-ratio: 200 / 280;
      background: #11131c;
      overflow: hidden;
      display: block;
    }
    .poster-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }
    .anime-card:hover .poster-wrap img {
      transform: scale(1.05);
    }
    .poster-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      padding: 10px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      pointer-events: none;
      background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 40%, transparent 60%, rgba(0,0,0,0.85) 100%);
    }
    .type-pill {
      align-self: flex-start;
      background: rgba(15, 17, 26, 0.85);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .ep-badges {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .badge {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .badge-sub {
      background: rgba(16, 185, 129, 0.9);
      color: #000;
    }
    .badge-dub {
      background: rgba(245, 158, 11, 0.9);
      color: #000;
    }
    .card-info {
      padding: 14px;
      display: flex;
      flex-direction: column;
      flex: 1;
      gap: 6px;
    }
    .anime-title {
      font-size: 14px;
      font-weight: 600;
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .anime-title a {
      color: var(--text);
      text-decoration: none;
    }
    .anime-title a:hover {
      color: var(--primary);
    }
    .anime-jp {
      font-size: 12px;
      color: var(--text-muted);
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .genres-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 4px;
    }
    .genre-tag {
      font-size: 10px;
      background: #212538;
      color: #a5adcf;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .card-actions {
      margin-top: auto;
      padding-top: 10px;
    }
    .btn-watch {
      display: block;
      text-align: center;
      font-size: 12px;
      font-weight: 600;
      background: rgba(121, 82, 235, 0.15);
      color: #b39bf8;
      padding: 6px 12px;
      border-radius: 6px;
      text-decoration: none;
      transition: all 0.2s;
      border: 1px solid rgba(121, 82, 235, 0.3);
    }
    .btn-watch:hover {
      background: var(--primary);
      color: #fff;
    }
    .hero-suggestions {
      text-align: center;
      padding: 64px 20px;
      max-width: 600px;
      margin: 0 auto;
    }
    .hero-suggestions h2 {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 12px;
    }
    .hero-suggestions p {
      color: var(--text-muted);
      font-size: 15px;
      margin-bottom: 24px;
    }
    .hero-suggestions p a {
      color: var(--primary);
      text-decoration: none;
    }
    .quick-tags {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: 8px;
    }
    .quick-tags span {
      color: var(--text-muted);
      font-size: 13px;
    }
    .quick-tags a {
      font-size: 13px;
      padding: 6px 12px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 9999px;
      color: var(--text);
      text-decoration: none;
      transition: all 0.2s;
    }
    .quick-tags a:hover {
      border-color: var(--primary);
      color: var(--primary);
    }
    .empty-state {
      text-align: center;
      padding: 64px 20px;
      max-width: 500px;
      margin: 0 auto;
    }
    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .empty-state h3 {
      font-size: 20px;
      margin-bottom: 8px;
    }
    .empty-state p {
      color: var(--text-muted);
      font-size: 14px;
    }
    .pagination-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      margin-top: 36px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
    }
    .page-btn {
      padding: 8px 16px;
      border-radius: 8px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
    }
    .page-btn:hover:not(.disabled) {
      border-color: var(--primary);
      color: #fff;
    }
    .page-btn.disabled {
      opacity: 0.4;
      pointer-events: none;
      cursor: not-allowed;
    }
    .page-info {
      font-size: 14px;
      color: var(--text-muted);
    }
    .error-banner {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #fca5a5;
      padding: 14px 18px;
      border-radius: 8px;
      margin-bottom: 24px;
      font-size: 14px;
    }
    footer {
      border-top: 1px solid var(--border);
      padding: 20px;
      text-align: center;
      color: var(--text-muted);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-inner">
      <a href="/aniwave" class="logo-row">
        <div class="brand-icon">A</div>
        <div class="brand-text">
          <h1>Aniwave Search</h1>
          <span>aniwaves.ru filter engine</span>
        </div>
      </a>
      <form action="/aniwave" method="GET" class="search-form">
        <input
          type="text"
          name="q"
          class="search-input"
          value="${safeQ}"
          placeholder="Search anime on Aniwave (e.g. One Piece, Solo Leveling)..."
          autocomplete="off"
          required
        />
        <button type="submit" class="search-btn" title="Search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </button>
      </form>
      <a href="${jsonApiUrl}" target="_blank" rel="noopener noreferrer" class="api-badge" title="Access raw structured JSON API endpoint">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
        JSON API
      </a>
    </div>
  </header>

  <main>
    ${error?`<div class="error-banner"><strong>Search Notice:</strong> ${escapeHtml(error)}</div>`:""}

    ${query?`
    <div class="results-header">
      <h2>Search Results for &ldquo;${safeQ}&rdquo;</h2>
      <span class="results-count">${results.length} results found</span>
    </div>
    `:""}

    ${results.length>0?`<div class="cards-grid">${cardsHtml}</div>`:cardsHtml}

    ${paginationHtml}
  </main>

  <footer>
    <p>Powered by Aniwave live scraper on <code>https://aniwaves.ru/filter?keyword=</code> &bull; Zero caching &bull; Instant search</p>
  </footer>
</body>
</html>`}__name(generateAniwaveSearchHtml,"generateAniwaveSearchHtml");export{generateAniwaveSearchHtml,searchAniwave};

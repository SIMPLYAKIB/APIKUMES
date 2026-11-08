// @ts-nocheck
var __defProp=Object.defineProperty;var __name=(target,value)=>__defProp(target,"name",{value,configurable:true});import*as cheerio from"cheerio";import{directProxyFetch}from"./Proxy.js";
const anikotoSearchCache = new Map<string, { data: any; expiresAt: number }>();
export function clearAnikotoCache() { anikotoSearchCache.clear(); }
async function searchAnikoto(query){const cleanQuery=(query||"").trim();if(!cleanQuery){return{query:"",total_results:0,results:[]}}const domains=["https://anikototv.to","https://anikoto.cz"];let html="";let usedDomain=domains[0];const fetchDomain=__name(async domain=>{const targetUrl=`${domain}/filter?keyword=${encodeURIComponent(cleanQuery)}`;const res=await directProxyFetch(targetUrl,{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36","Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8","Referer":`${domain}/`},signal:AbortSignal.timeout(4500)});if(!res.ok){throw new Error(`Failed to fetch from Anikoto domain ${domain} (Status: ${res.status})`)}const text=await res.text();if(!text||text.length<50){throw new Error(`Empty response from ${domain}`)}return{html:text,domain}},"fetchDomain");try{const fastest=await Promise.any(domains.map(d=>fetchDomain(d)));html=fastest.html;usedDomain=fastest.domain}catch{return{query:cleanQuery,total_results:0,results:[]}}const $=cheerio.load(html);const results=[];$(".ani.items .item").each((_,el)=>{const item=$(el);const posterTip=item.find(".ani.poster.tip");const tipId=posterTip.attr("data-tip")||"";const aLink=item.find(".name.d-title, .ani.poster a").first();const href=aLink.attr("href")||"";const title=item.find(".name.d-title").text().trim()||item.find("img").attr("alt")||"";const titleJp=item.find(".name.d-title").attr("data-jp")||"";const poster=item.find("img").attr("src")||"";let slug="";const slugMatch=href.match(/\/watch\/([^/?#]+)/);if(slugMatch){slug=slugMatch[1]}const resultId=slug||tipId;if(resultId||title){results.push({id:resultId,...tipId?{tip_id:String(tipId)}:{},...slug?{slug}:{},title,...titleJp&&titleJp!==title?{title_jp:titleJp}:{},poster,url:href.startsWith("http")?href:href?`${usedDomain}${href}`:""})}});const output={query:cleanQuery,total_results:results.length,results};return output}__name(searchAnikoto,"searchAnikoto");export{searchAnikoto};

export async function fetchAnikotoEpisodes(slug: string) {
  const watchUrl = slug.includes("/") ? `https://anikototv.to/watch/${slug}` : `https://anikototv.to/watch/${slug}/ep-1`;
  const res = await directProxyFetch(watchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://anikototv.to/"
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error("Failed to fetch Anikoto watch page");
  
  const html = await res.text();
  const $ = cheerio.load(html);
  const animeId = $("#watch-main").attr("data-id");
  if (!animeId) throw new Error("Anikoto anime_id not found");

  const epRes = await directProxyFetch(`https://anikototv.to/ajax/episode/list/${animeId}`, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": watchUrl
    }
  });
  
  if (!epRes.ok) throw new Error("Failed to fetch episode list");
  const epJson = await epRes.json();
  if (!epJson || !epJson.result) throw new Error("Bad episode list response");

  const $ep = cheerio.load(epJson.result);
  const episodes = [];
  $ep(".ep-range li a").each((_, el) => {
    const $a = $ep(el);
    episodes.push({
      num: $a.attr("data-num"),
      slug: $a.attr("data-slug"),
      ids: $a.attr("data-ids"),
      title: $a.find(".d-title").text().trim() || $a.text().trim()
    });
  });

  return episodes;
}

export async function getAnikotoCandidates(slug: string, epNum: string) {
  try {
    const episodes = await fetchAnikotoEpisodes(slug);
    const targetEp = episodes.find(e => e.num === String(epNum)) || episodes[0];
    if (!targetEp || !targetEp.ids) return { subCandidates: [], dubCandidates: [] };

    const serverRes = await directProxyFetch(`https://anikototv.to/ajax/server/list?servers=${encodeURIComponent(targetEp.ids)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": `https://anikototv.to/watch/${slug}/ep-${targetEp.num}`
      }
    });

    if (!serverRes.ok) return { subCandidates: [], dubCandidates: [] };
    const serverJson = await serverRes.json();
    if (!serverJson || !serverJson.result) return { subCandidates: [], dubCandidates: [] };

    const $sv = cheerio.load(serverJson.result);
    const subCandidates = [];
    const dubCandidates = [];
    let subDownloads = {};
    let dubDownloads = {};

    const fetchEmbed = async (linkId: string) => {
      const getRes = await directProxyFetch(`https://anikototv.to/ajax/server?get=${encodeURIComponent(linkId)}`, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "X-Requested-With": "XMLHttpRequest",
          "Referer": `https://anikototv.to/watch/${slug}/ep-${targetEp.num}`
        }
      });
      if (!getRes.ok) return null;
      const json = await getRes.json();
      return json?.result || null;
    };

    const processType = async (typeSelector: string, candidatesArray: any[], downloadsObj: any) => {
      const links = $sv(`.type[data-type="${typeSelector}"] li[data-link-id]`).map((_, el) => $sv(el).attr("data-link-id")).get();
      const promises = links.map(async (linkId) => {
        if (!linkId) return;
        const result = await fetchEmbed(linkId);
        if (result && result.url) {
          candidatesArray.push({
            embed: result.url
          });
        }
        if (result && result.download && typeof result.download === "object") {
           for (const [quality, dlUrl] of Object.entries(result.download)) {
             if (typeof dlUrl === "string") {
               if (!downloadsObj[quality]) downloadsObj[quality] = {};
               downloadsObj[quality]["Anikoto"] = dlUrl;
             }
           }
        }
      });
      await Promise.all(promises);
    };

    await Promise.all([
      processType("sub", subCandidates, subDownloads),
      processType("dub", dubCandidates, dubDownloads)
    ]);

    return { subCandidates, dubCandidates, subDownloads, dubDownloads };
  } catch (e) {
    return { subCandidates: [], dubCandidates: [], subDownloads: {}, dubDownloads: {} };
  }
}

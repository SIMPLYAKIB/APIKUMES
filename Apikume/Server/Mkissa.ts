// @ts-nocheck
var __defProp=Object.defineProperty;var __name=(target,value)=>__defProp(target,"name",{value,configurable:true});import{directProxyFetch}from"./Proxy.js";const MKISSA_API_ENDPOINT="https://api.mkissa.net/api";const MKISSA_SEARCH_QUERY=`
  query SearchShows($search: SearchInput, $page: Int, $limit: Int) {
    shows(search: $search, page: $page, limit: $limit) {
      edges {
        _id
        name
        englishName
        nativeName
        malId
        aniListId
        averageScore
        genres
        thumbnail
        banner
        status
        airedStart
        airedEnd
        availableEpisodes
      }
      pageInfo {
        total
        hasNextPage
        nextPage
        limit
      }
    }
  }
`;async function searchMkissa(rawQuery,options={}){const cleanQuery=(rawQuery||"").trim();const page=Math.max(1,Number(options.page)||1);const limit=Math.max(1,Math.min(100,Number(options.limit)||26));if(!cleanQuery){return{query:"",page,total_results:0,results:[]}}const searchInput={query:cleanQuery};if(options.sortBy&&["Top","Popular","New","Update"].includes(options.sortBy)){searchInput.sortBy=options.sortBy}const headers={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36","Referer":"https://mkissa.to/","Origin":"https://mkissa.to","Content-Type":"application/json"};try{const res=await directProxyFetch(MKISSA_API_ENDPOINT,{method:"POST",headers,body:JSON.stringify({query:MKISSA_SEARCH_QUERY,variables:{search:searchInput,page,limit}})});if(!res.ok){throw new Error(`Mkissa API returned status ${res.status}`)}const json=await res.json();const edges=json?.data?.shows?.edges||[];const total=json?.data?.shows?.pageInfo?.total||edges.length;const results=edges.map(item=>{const showId=String(item._id||"").trim();const year=item.airedStart?.year||void 0;return{id:showId,_id:showId,name:item.name||cleanQuery,english_name:item.englishName||void 0,native_name:item.nativeName||void 0,mal_id:item.malId?String(item.malId):null,anilist_id:item.aniListId?String(item.aniListId):null,thumbnail:item.thumbnail||void 0,banner:item.banner||void 0,type:"TV",season:year?{year}:void 0,score:typeof item.averageScore==="number"?item.averageScore:void 0,status:item.status||void 0,available_episodes:item.availableEpisodes?{sub:item.availableEpisodes.sub??void 0,dub:item.availableEpisodes.dub??void 0,raw:item.availableEpisodes.raw??void 0}:void 0,genres:Array.isArray(item.genres)?item.genres:[],url:`https://mkissa.to/anime/${encodeURIComponent(showId)}`}});return{query:cleanQuery,sort_by:options.sortBy,sort_direction:options.sortDirection,page,total_results:total,results}}catch(err){console.error("searchMkissa error:",err.message||err);return{query:cleanQuery,page,total_results:0,results:[]}}}__name(searchMkissa,"searchMkissa");async function proxyMkissaApi(method,queryString,body,forwardHeaders){const headers={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36","Referer":"https://mkissa.to/","Origin":"https://mkissa.to"};if(body){headers["Content-Type"]="application/json"}const targetUrl=queryString?`${MKISSA_API_ENDPOINT}?${queryString}`:MKISSA_API_ENDPOINT;const res=await directProxyFetch(targetUrl,{method:method.toUpperCase(),headers,body:body?JSON.stringify(body):void 0});const contentType=res.headers.get("content-type")||"application/json";const text=await res.text();let data=text;try{data=JSON.parse(text)}catch{}return{status:res.status,contentType,data}}__name(proxyMkissaApi,"proxyMkissaApi");export{proxyMkissaApi,searchMkissa};

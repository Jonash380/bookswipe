export function escapeHTML(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
export const TMDB_GENRE_MAP={28:'Action',12:'Abenteuer',16:'Animation',35:'Komödie',80:'Krimi',99:'Dokumentation',18:'Drama',10751:'Familie',14:'Fantasy',36:'Historie',27:'Horror',10402:'Musik',9648:'Mystery',10749:'Romance',878:'Science-Fiction',10770:'TV-Film',53:'Thriller',10752:'Krieg',37:'Western',10759:'Action & Abenteuer',10762:'Kids',10763:'Nachrichten',10764:'Reality',10765:'Sci-Fi & Fantasy',10766:'Seife',10767:'Talk',10768:'War & Politics'};
export function safeGetJSON(k,def){try{const v=localStorage.getItem(k);return v?JSON.parse(v):def}catch{return def}}
export function safeSetJSON(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){trimLocalStorage();try{localStorage.setItem(k,JSON.stringify(v))}catch{}}}
export function trimLocalStorage(){
  try{
    const caps={'bs-sessions':50,'bs-weekly-stats':12,'bs-history':500,'bs-watchlist':200,'bs-disliked':200};
    Object.entries(caps).forEach(([k,max])=>{
      const v=safeGetJSON(k,Array.isArray(safeGetJSON(k,[]))?[]:{});
      if(Array.isArray(v)&&v.length>max)safeSetJSON(k,v.slice(-max));
      else if(!Array.isArray(v)&&typeof v==='object'){
        const keys=Object.keys(v);
        if(keys.length>max)keys.sort().slice(0,keys.length-max).forEach(k2=>delete v[k2]);
        safeSetJSON(k,v);
      }
    });
  }catch{}
}
export const debounce=(fn,ms=300)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}};
export const shuffleArray=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
export const clamp=(v,mn,mx)=>Math.max(mn,Math.min(mx,v));

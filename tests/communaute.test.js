const fs=require('fs');
const noeuds=new Map();
const faire=(id)=>({id,innerHTML:'',dataset:{},onclick:null,addEventListener(){},classList:{add(){},remove(){},toggle(){}}});
global.trouve=(s)=>{const i=s.replace(/^#/,''); if(!s.startsWith('#'))return null;
  if(!noeuds.has(i))noeuds.set(i,faire(i)); return noeuds.get(i);};
global.$=global.trouve;
global.$$=(s,r)=>{const src=r&&r.innerHTML?r.innerHTML:''; const m=s.match(/\[data-([a-z-]+)\]/);
  if(!m)return[]; const js=m[1].replace(/-([a-z])/g,(x,c)=>c.toUpperCase());
  return [...src.matchAll(new RegExp('data-'+m[1]+'="([^"]*)"','g'))].map(x=>{const n=faire('a');n.dataset[js]=x[1];return n;});};
global.escapeHtml=(s)=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
global.currentView='communaute';
global.getProverbOfDay=()=>({kanji:'七転び八起き',lecture:'ななころびやおき',sens:'Sept chutes, huit relevements.'});
global.window={accountUser:{id:'moi'},sb:null,kvtProfils:{avatarHtml:()=>'<span></span>',chargerProfils:async()=>{}}};
const SRC=fs.readFileSync('communaute.js','utf8');
const cas=[];
global.essai=(n,f)=>{try{f();cas.push(['OK',n]);}catch(e){cas.push(['ECHEC',n+' -> '+e.message]);}};
eval(SRC+`
// Page d'accueil resserree le 23/09/2026 (demande de Paul) : plus de gros
// entete/chiffres, plus de « Derniers avis », « Derniers decks » ni
// « Les plus demandes ». Le classement (deplace du tableau de bord) et
// « Ce qui arrive » restent ; les videos aussi.

essai("tout vide : la page reste utilisable, sans entete ni gros message", ()=>{
  commData={arrive:[],videos:[]};
  renderCommunaute();
  const h=trouve('#view-communaute').innerHTML;
  if(h.includes('accueil-entete')) throw new Error('le gros entete aurait du disparaitre');
  if(h.includes('accueil-chiffre')) throw new Error('les chiffres en avant-page auraient du disparaitre');
  if(h.includes('Derniers avis')) throw new Error('"Derniers avis" aurait du disparaitre');
  if(h.includes('Derniers decks')) throw new Error('"Derniers decks" aurait du disparaitre');
  if(h.includes('Les plus demand')) throw new Error('"Les plus demandes" aurait du disparaitre');
  if(!h.includes('proverb-card')) throw new Error('proverbe du jour absent');
  if(!h.includes('七転び八起き')) throw new Error('texte du proverbe absent');
  if(!h.includes('id="accueilClassementWrap"')) throw new Error('emplacement du widget classement absent');
  if(!h.includes('Ce qui arrive')) throw new Error('"Ce qui arrive" absent');
  // Les deux sections restantes en etat vide (arrive, videos) -- le
  // classement gere son propre etat vide depuis leaderboard.js, pas ici.
  if((h.match(/comm-etat-vide/g)||[]).length!==2) throw new Error('etats vides = '+(h.match(/comm-etat-vide/g)||[]).length);
});

essai("avec des donnees : ce qui arrive et les videos s'affichent", ()=>{
  commData={
    arrive:[{titre:'Adresse partageable',statut:'prevu'}],
    videos:[{youtube_id:'dQw4w9WgXcQ',titre:'Les cles',pseudo:'Ken',score:9}]};
  renderCommunaute();
  const h=trouve('#view-communaute').innerHTML;
  if((h.match(/comm-etat-vide/g)||[]).length!==0) {
    const i=h.indexOf('comm-etat-vide');
    throw new Error('etat vide restant : ...'+h.slice(Math.max(0,i-160),i+90).replace(/\s+/g,' '));
  }
  if(!h.includes('Adresse partageable')) throw new Error('suggestion "a venir" absente');
  if(!h.includes('i.ytimg.com')) throw new Error('vignette absente');
});

essai("un pseudo de video contenant du HTML est echappe", ()=>{
  commData={arrive:[],videos:[{youtube_id:'x',titre:'t','pseudo':'<img src=x onerror=alert(1)>',score:1}]};
  renderCommunaute();
  if(trouve('#view-communaute').innerHTML.includes('<img src=x')) throw new Error('injection possible');
});

essai("une erreur de chargement partiel est affichee", ()=>{
  commData={arrive:[],videos:[]};
  commErreur='reseau coupe';
  renderCommunaute();
  if(!trouve('#view-communaute').innerHTML.includes('reseau coupe')) throw new Error('erreur avalee');
  commErreur=null;
});

essai("chargerClassementAccueil est appelee si disponible (widget classement)", ()=>{
  let appele=false;
  global.chargerClassementAccueil=()=>{appele=true;};
  commData={arrive:[],videos:[]};
  renderCommunaute();
  if(!appele) throw new Error('le widget classement ne se charge pas depuis la page d\\'accueil');
  delete global.chargerClassementAccueil;
});
`);
let e=0; cas.forEach(([v,n])=>{if(v==='ECHEC')e++; console.log('  '+v.padEnd(7)+n);});
console.log('\n  '+(cas.length-e)+'/'+cas.length+' passent');
process.exit(e?1:0);

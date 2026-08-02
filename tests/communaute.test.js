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
global.window={accountUser:{id:'moi'},sb:null,kvtProfils:{avatarHtml:()=>'<span></span>',chargerProfils:async()=>{}}};
const SRC=fs.readFileSync('communaute.js','utf8');
const cas=[];
global.essai=(n,f)=>{try{f();cas.push(['OK',n]);}catch(e){cas.push(['ECHEC',n+' -> '+e.message]);}};
eval(SRC+`
essai("tout vide : cinq etats vides, aucune erreur", ()=>{
  commData={avis:[],decks:[],arrive:[],demandes:[],videos:[]};
  renderCommunaute();
  const h=trouve('#view-communaute').innerHTML;
  const n=(h.match(/comm-etat-vide/g)||[]).length;
  if(n!==5) throw new Error('etats vides = '+n);
  if(!h.includes("Page d'accueil")) throw new Error('titre absent');
});
essai("avec des donnees : tout s'affiche", ()=>{
  commData={
    avis:[{note:4,avis:'Bien.',pseudo:'Hana',user_id:'u1',decks:{titre:'JLPT N3'}}],
    decks:[{id:'d1',titre:'JLPT N3',officiel:true,nb_kanji:367,note_moyenne:4.8,nb_notes:5,pseudo:'KVT'},
           {id:'d2',titre:'Mien',officiel:false,nb_kanji:76,nb_notes:0,pseudo:'Polus',auteur_id:'u9'}],
    arrive:[{titre:'Adresse partageable',statut:'prevu'}],
    demandes:[{id:'s1',titre:'Memos',score:12}],
    videos:[{youtube_id:'dQw4w9WgXcQ',titre:'Les cles',pseudo:'Ken',score:9}]};
  renderCommunaute();
  const h=trouve('#view-communaute').innerHTML;
  if((h.match(/comm-etat-vide/g)||[]).length!==0) {
    const i=h.indexOf('comm-vide');
    throw new Error('etat vide restant : ...'+h.slice(Math.max(0,i-160),i+90).replace(/\s+/g,' '));
  }
  if(!h.includes('data-comm-deck="d1"')) throw new Error('deck non cliquable');
  if(!h.includes('i.ytimg.com')) throw new Error('vignette absente');
  if(!h.includes('pas encore noté')) throw new Error('deck sans note mal rendu');
});
essai("un pseudo contenant du HTML est echappe", ()=>{
  commData={avis:[{note:5,avis:'x',pseudo:'<img src=x onerror=alert(1)>',user_id:'u1',decks:null}],
            decks:[],arrive:[],demandes:[],videos:[]};
  renderCommunaute();
  if(trouve('#view-communaute').innerHTML.includes('<img src=x')) throw new Error('injection possible');
});
essai("un avis sans deck rattache ne casse pas", ()=>{
  commData={avis:[{note:3,avis:'y',pseudo:'A',user_id:'u1',decks:null}],decks:[],arrive:[],demandes:[],videos:[]};
  renderCommunaute();
  if(!trouve('#view-communaute').innerHTML.includes('sur un deck')) throw new Error('repli absent');
});
`);
let e=0; cas.forEach(([v,n])=>{if(v==='ECHEC')e++; console.log('  '+v.padEnd(7)+n);});
console.log('\n  '+(cas.length-e)+'/'+cas.length+' passent');
process.exit(e?1:0);

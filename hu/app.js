(()=>{
'use strict';
const LANG=window.LANG||'es', T=window.I18N[LANG]||window.I18N.es;
const $=s=>document.querySelector(s), app=$('#app');
document.documentElement.lang=LANG;document.title=T.app+' · CreaTuSabor';$('#q').placeholder=T.buscar;
document.querySelectorAll('.tabs a').forEach(a=>{a.querySelector('span').textContent=T[{home:'inicio',libros:'libros',favoritas:'favoritas',lista:'lista'}[a.dataset.t]]});
const norm=s=>(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// ---- estado local (favoritas, lista) ----
const store={get(k,d){try{return JSON.parse(localStorage.getItem('rc_'+k))??d}catch(e){return d}},set(k,v){try{localStorage.setItem('rc_'+k,JSON.stringify(v))}catch(e){}}};
let favs=store.get('favs',[]), lista=store.get('lista',[]); // lista: [{r:id, t:titulo, items:[{x:texto,d:bool}]}]
const saveFavs=()=>store.set('favs',favs), saveLista=()=>store.set('lista',lista);
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('on'),1800)}
// ---- cripto: contenido cifrado (AES-GCM); la clave viaja en el enlace (#k=...) y se guarda en el dispositivo ----
const b64=x=>Uint8Array.from(atob(x.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
let KEY=null,IKEY=null;
const impKey=raw=>crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
const dec=async(buf,key)=>crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(buf.slice(0,12))},key,buf.slice(12));
async function initKey(){const m=location.hash.match(/^#k=([\w-]+)/);if(m){store.set('k_'+LANG,m[1]);history.replaceState(null,'',location.pathname+location.search+'#/')}const k=store.get('k_'+LANG,null);if(!k)return false;try{KEY=await impKey(b64(k));return true}catch(e){return false}}
// ---- datos ----
const cache={};
async function J(p){if(!cache[p]){const r=await fetch(p.replace(/\.json$/,'.bin'));if(!r.ok)throw new Error(p);cache[p]=JSON.parse(new TextDecoder().decode(await dec(await r.arrayBuffer(),KEY)))}return cache[p]}
const catalogo=async()=>{const c=await J('data/catalogo.json');if(!IKEY&&c.ik)IKEY=await impKey(b64(c.ik));return c}, indice=()=>J('data/indice.json'), libro=id=>J('data/'+id+'.json');
const blobs=new Map();
async function imgBlob(src){if(blobs.has(src))return blobs.get(src);await catalogo();const r=await fetch('../'+src.replace(/\.jpg$/,'.bin'));if(!r.ok)throw 0;const u=URL.createObjectURL(new Blob([await dec(await r.arrayBuffer(),IKEY)],{type:'image/jpeg'}));blobs.set(src,u);return u}
const io='IntersectionObserver' in window?new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){io.unobserve(e.target);imgBlob(e.target.dataset.src).then(u=>{e.target.src=u}).catch(()=>{})}}),{rootMargin:'400px'}):null;
function hydrate(){document.querySelectorAll('img[data-src]:not([src])').forEach(i=>io?io.observe(i):imgBlob(i.dataset.src).then(u=>{i.src=u}))}
async function receta(id){const b=id.replace(/-\d+$/,'');const d=await libro(b);const r=d.recetas.find(x=>x.id===id);return r?{r,b:d}:null}
// ---- vistas ----
const card=(r,bn)=>`<a class="card" href="#/receta/${r.id}"><div class="ph">${r.img?`<img decoding="async" data-src="${r.img}" alt="">`:''}</div><div class="tx"><div class="t">${esc(r.t)}</div>${bn?`<div class="m">${esc(bn)}</div>`:''}</div></a>`;
const cardIdx=(r,bn)=>card(r,bn);
let BN={}; // id libro -> nombre
async function home(){
  const [c,ix]=await Promise.all([catalogo(),indice()]);
  c.categorias.forEach(k=>k.libros.forEach(l=>BN[l.id]=l.nombre));
  const cats=c.categorias.filter(k=>!['importante','estaciones'].includes(k.id));
  const n=k=>k.libros.reduce((a,l)=>a+l.n,0);
  const est=['Primavera','Verano','Otoño','Invierno'];
  app.innerHTML=`<h1>${T.hola}</h1><p class="sub">${c.total.toLocaleString(LANG)} ${T.recetas}</p>
  <div class="acts"><a class="btn" href="#/azar">${T.alAzar}</a></div>
  <h2>${T.estaciones}</h2><div class="chips">${est.map(s=>`<a class="chip" href="#/estacion/${s}">${T.estacion[s]}</a>`).join('')}</div>
  <h2>${T.categorias}</h2><div class="grid">${cats.map(k=>`<a class="cat" href="#/cat/${k.id}"><b>${esc(k.nombre)}</b><small>${n(k)} ${T.recetas}</small></a>`).join('')}</div>`;
}
async function listaCat(id){
  const c=await catalogo(), k=c.categorias.find(x=>x.id===id); if(!k)return notFound();
  k.libros.forEach(l=>BN[l.id]=l.nombre);
  app.innerHTML=`<div class="crumb"><a href="#/">${T.inicio}</a></div><h1>${esc(k.nombre)}</h1><div class="list">${k.libros.map(l=>`<a class="row" href="#/libro/${l.id}"><span><b>${esc(l.nombre)}</b><br><small>${l.n} ${T.recetas}${l.guias?` · ${l.guias} ${T.guiasN}`:''}</small></span><span>›</span></a>`).join('')}</div>`;
}
async function verLibro(id){
  let d;try{d=await libro(id)}catch(e){return notFound(T.nolibro)}
  BN[id]=d.nombre;
  app.innerHTML=`<div class="crumb"><a href="#/">${T.inicio}</a> › <a href="#/cat/${d.catid}">${esc(d.cat)}</a></div><h1>${esc(d.nombre)}</h1><p class="sub">${d.recetas.length} ${T.recetas}</p>
  <div class="grid">${d.recetas.map(r=>card(r)).join('')}</div>
  ${d.guias.length?`<h2>${T.guias}</h2><div class="list">${d.guias.map(g=>`<a class="row" href="#/guia/${g.id}"><span>${esc(g.t||T.guia)}</span><span>›</span></a>`).join('')}</div>`:''}`;
}
const CAT={'Importante: leer primero':'importante','Desayunos':'desayunos','Comidas':'comidas','Cenas':'cenas','Snacks y Meriendas':'snacks','Bebidas':'bebidas','Sopas y Cremas':'sopas','Postres':'postres','Extras: Festividades':'festividades','Extras: Recetas de los Videos':'videos','Por Estaciones':'estaciones'};
const catId=n=>CAT[n]||'';
async function verGuia(id){
  const b=id.replace(/-\d+$/,''),d=await libro(b),g=d.guias.find(x=>x.id===id); if(!g)return notFound();
  app.innerHTML=`<div class="crumb"><a href="#/libro/${b}">${esc(d.nombre)}</a></div><h1>${esc(g.t||T.guia)}</h1><div class="guia">${g.texto.slice(1).map(t=>`<p>${esc(t)}</p>`).join('')}</div>`;
}
function bloques(bs){let o='',m='';const cl=()=>{if(m){o+=m==='li'?'</ul>':'</ol>';m=''}};for(const b of bs){const k=b.li!==undefined?'li':b.n!==undefined?'n':'';if(k){if(m!==k){cl();o+=k==='li'?'<ul class="ing">':'<ol class="steps">';m=k}o+=k==='li'?`<li><label><input type="checkbox"><span>${esc(b.li)}</span></label></li>`:`<li><span>${esc(b.n)}</span></li>`}else{cl();o+=b.h!==undefined?`<h2>${esc(b.h)}</h2>`:`<p>${esc(b.p)}</p>`}}cl();return o}
function itemsDe(r){return r.ing||r.bloques.filter(b=>b.li!==undefined).map(b=>b.li)}
async function verReceta(id){
  app.innerHTML=`<p class="empty">${T.cargando}</p>`;
  let x;try{x=await receta(id)}catch(e){app.innerHTML=`<p class="empty">${T.sinConexion}</p>`;return}
  if(!x)return notFound(T.norecetas);
  const {r,b}=x, isF=favs.includes(id), inL=lista.some(l=>l.r===id);
  document.title=r.t+' · CreaTuSabor';
  app.innerHTML=`<div class="crumb"><a href="#/libro/${b.id}">${esc(b.nombre)}</a></div>
  ${r.img?`<div class="hero"><img data-src="${r.img}" alt="${esc(r.t)}"></div>`:''}
  <h1>${esc(r.t)}</h1>${r.desc?`<p class="sub">${esc(r.desc)}</p>`:''}
  <div class="acts"><button class="btn ${isF?'':'sec'}" id="bfav">${isF?'♥ '+T.fav:'♡ '+T.fav}</button><button class="btn sec" id="blist">${inL?'✓ '+T.enLista:'+ '+T.añadirLista}</button><button class="btn sec" id="bshare">${T.compartir}</button></div>
  ${r.bloques?bloques(r.bloques):`<h2>${T.ingredientes}</h2><ul class="ing">${r.ing.map(i=>`<li><label><input type="checkbox"><span>${esc(i)}</span></label></li>`).join('')}</ul>
  <h2>${T.preparacion}</h2><ol class="steps">${r.pasos.map(p=>`<li><span>${esc(p)}</span></li>`).join('')}</ol>
  ${r.tip?`<div class="tip">${esc(r.tip)}</div>`:''}`}`;
  $('#bfav').onclick=()=>{favs=favs.includes(id)?favs.filter(f=>f!==id):[...favs,id];saveFavs();verReceta(id)};
  $('#blist').onclick=()=>{if(lista.some(l=>l.r===id)){lista=lista.filter(l=>l.r!==id);toast(T.quitada)}else{lista.push({r:id,t:r.t,items:itemsDe(r).map(x=>({x,d:false}))});toast(T.añadida)}saveLista();verReceta(id)};
  $('#bshare').onclick=async()=>{const txt=r.t+'\n\n'+(r.ing?T.ingredientes+':\n'+r.ing.map(i=>'• '+i).join('\n')+'\n\n'+T.preparacion+':\n'+r.pasos.map((p,i)=>(i+1)+'. '+p).join('\n'):r.bloques.map(b=>b.h||(b.li&&'• '+b.li)||b.n||b.p).join('\n'));try{if(navigator.share)await navigator.share({title:r.t,text:txt});else{await navigator.clipboard.writeText(txt);toast(T.copiado)}}catch(e){}};
}
async function favoritas(){
  const ix=await indice(), m=new Map(ix.map(r=>[r.id,r])), L=favs.map(id=>m.get(id)).filter(Boolean);
  const c=await catalogo();c.categorias.forEach(k=>k.libros.forEach(l=>BN[l.id]=l.nombre));
  app.innerHTML=`<h1>${T.favoritas}</h1>`+(L.length?`<div class="grid">${L.map(r=>cardIdx(r,BN[r.b])).join('')}</div>`:`<p class="empty">${T.sinFavs}</p>`);
}
function verLista(){
  if(!lista.length){app.innerHTML=`<h1>${T.lista}</h1><p class="empty">${T.listaVacia}</p>`;return}
  app.innerHTML=`<h1>${T.lista}</h1><div class="acts"><button class="btn sm sec" id="lq">${T.borrarMarcados}</button><button class="btn sm sec" id="lc">${T.copiarLista}</button><button class="btn sm sec" id="lv">${T.vaciar}</button></div>`+
  lista.map((l,i)=>`<h2><a href="#/receta/${l.r}">${esc(l.t)}</a></h2><ul class="ing">${l.items.map((it,j)=>`<li><label><input type="checkbox" data-i="${i}" data-j="${j}" ${it.d?'checked':''}><span class="${it.d?'done':''}">${esc(it.x)}</span></label></li>`).join('')}</ul>`).join('');
  app.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.onchange=()=>{lista[cb.dataset.i].items[cb.dataset.j].d=cb.checked;saveLista();cb.nextElementSibling.classList.toggle('done',cb.checked)});
  $('#lq').onclick=()=>{lista.forEach(l=>l.items=l.items.filter(i=>!i.d));lista=lista.filter(l=>l.items.length);saveLista();verLista()};
  $('#lv').onclick=()=>{if(confirm(T.confirmVaciar)){lista=[];saveLista();verLista()}};
  $('#lc').onclick=async()=>{const t=lista.map(l=>l.t+'\n'+l.items.filter(i=>!i.d).map(i=>'- '+i.x).join('\n')).join('\n\n');try{await navigator.clipboard.writeText(t);toast(T.copiado)}catch(e){}};
}
let FILT={};
async function buscar(q,f={}){
  const ix=await indice(), c=await catalogo();c.categorias.forEach(k=>k.libros.forEach(l=>BN[l.id]=l.nombre));
  const toks=norm(q).split(/\s+/).filter(Boolean);
  let res=ix.filter(r=>(!f.c||r.c===f.c)&&(!f.s||r.s===f.s));
  if(toks.length){res=res.map(r=>{const t=norm(r.t),i=norm(r.i);let s=0;for(const k of toks){if(t.includes(k))s+=3;else if(i.includes(k))s+=1;else return null}return [s,r]}).filter(Boolean).sort((a,b)=>b[0]-a[0]).map(x=>x[1])}
  const cats=c.categorias.filter(k=>!['importante','estaciones'].includes(k.id));
  app.innerHTML=`<h1>${f.s?T.estacion[f.s]:(q?esc(q):T.todas)}</h1><p class="sub">${res.length.toLocaleString(LANG)} ${T.resultados}</p>
  <div class="chips"><button class="chip ${!f.c?'on':''}" data-c="">${T.todas}</button>${cats.map(k=>`<button class="chip ${f.c===k.id?'on':''}" data-c="${k.id}">${esc(k.nombre)}</button>`).join('')}</div>
  <div style="height:12px"></div>${res.length?`<div class="grid">${res.slice(0,120).map(r=>cardIdx(r,BN[r.b])).join('')}</div>${res.length>120?`<p class="empty">${T.mostrando}</p>`:''}`:`<p class="empty">${T.sinResultados}</p>`}`;
  app.querySelectorAll('.chip[data-c]').forEach(b=>b.onclick=()=>buscar(q,{...f,c:b.dataset.c}));
}
async function azar(){const ix=await indice();location.replace('#/receta/'+ix[Math.floor(Math.random()*ix.length)].id)}
function notFound(m){app.innerHTML=`<p class="empty">${m||'No encontrado'}</p><p class="empty"><a class="btn" href="#/">${T.inicio}</a></p>`}
// ---- router ----
async function route(){
  const h=location.hash.replace(/^#\/?/,''), [a,b]=h.split('/'), arg=decodeURIComponent(b||'');
  document.title=T.app+' · CreaTuSabor';
  document.querySelectorAll('.tabs a').forEach(x=>x.classList.toggle('on',x.dataset.t===({'':'home',libros:'libros',cat:'libros',libro:'libros',favoritas:'favoritas',lista:'lista'}[a]??'')));
  try{
    if(!a)await home();
    else if(a==='cat')await listaCat(arg);
    else if(a==='libros'){const c=await catalogo();app.innerHTML=`<h1>${T.libros}</h1>`+c.categorias.map(k=>`<h2>${esc(k.nombre)}</h2><div class="list">${k.libros.map(l=>`<a class="row" href="#/libro/${l.id}"><span><b>${esc(l.nombre)}</b><br><small>${l.n} ${T.recetas}</small></span><span>›</span></a>`).join('')}</div>`).join('')}
    else if(a==='libro')await verLibro(arg);
    else if(a==='receta')await verReceta(arg);
    else if(a==='guia')await verGuia(arg);
    else if(a==='favoritas')await favoritas();
    else if(a==='lista')verLista();
    else if(a==='buscar')await buscar(arg,FILT);
    else if(a==='estacion')await buscar('',{s:arg});
    else if(a==='azar')await azar();
    else notFound();
  }catch(e){app.innerHTML=`<p class="empty">${T.sinConexion}</p>`}
  hydrate();if(a!=='azar')window.scrollTo(0,0);
}
$('#busq').addEventListener('submit',e=>{e.preventDefault();const q=$('#q').value.trim();location.hash=q?'#/buscar/'+encodeURIComponent(q):'#/';document.activeElement.blur()});
window.addEventListener('hashchange',route);
initKey().then(ok=>{if(!ok){app.innerHTML=`<h1>${T.app}</h1><p class="empty">${T.sinClave}</p>`;return}route()});
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
})();

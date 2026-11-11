// GK-MULTI-1 (11-nov-2026): Genkidama manda un código que abarca varios tours (evento_id '*').
// Mide contra el index del árbol; el sitio decide la lista (a la venta + donde aplica el código).
const fs=require('fs');const G=require(require('path').join(__dirname,'..','netlify/functions/_lib/genkidama.js'));
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
global.fetch=async()=>({ok:true,text:async()=>html});
(async()=>{const s=await G.leerSitio();const now=new Date();
let ok=0,bad=0;const a=(c,m)=>{c?ok++:bad++;console.log((c?'✓ ':'✗ ')+m)};
const v=G.validarCampana(s,{tipo:'codigo',evento_id:'*',codigo:'NOVIEMBRE',slogan:'$500 de descuento en noviembre'},now);
a(v.ok,'multi NOVIEMBRE valida '+(v.error||''));
if(v.ok){console.log('  aplica en:',v.eventos.map(e=>e.id).join(', '));
 a(v.eventos.length>1,'más de un tour');
 a(v.eventos.every(e=>s.PROMOS.NOVIEMBRE.onlyEvents?s.PROMOS.NOVIEMBRE.onlyEvents.map(x=>String(x).split('#')[0]).includes(e.id.split('#')[0]):true),'todos dentro del código');
 const h=G.renderGenkidama(v,'Ana');a(/Aplica en:/.test(h)&&/Payas|payas/i.test(h),'render lista tours');
 a(/href="https:\/\/conectareynosa\.mx\/?"/.test(h)||h.includes('conectareynosa.mx'),'link al sitio');
 console.log('  asunto:',G.asuntoDe(v));}
a(!G.validarCampana(s,{tipo:'promocion',evento_id:'*',slogan:'hola mundo'},now).ok,'sin código rebota');
a(!G.validarCampana(s,{tipo:'codigo',evento_id:'*',codigo:'NOEXISTE',slogan:'hola mundo'},now).ok,'código desconocido rebota');
const u=G.validarCampana(s,{tipo:'codigo',evento_id:'siddharta',codigo:'NOVIEMBRE',slogan:'$500 de descuento'},now);a(u.ok&&!u.eventos,'un solo tour sigue igual '+(u.error||''));
console.log(bad?'🔴 ROJO':'✅ VERDE',ok,'en verde ·',bad,'en rojo');process.exitCode=bad?1:0;})();

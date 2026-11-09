#!/usr/bin/env node
// =============================================================================
// mide-cc-busca-global-1.js — [CC-BUSCA-GLOBAL-1 · 9-nov-2026]
// Palabra de Memo: «cuando entro a capsule corps el buscador principal también
// debería dejarme buscar por cliente o número de contrato… entrar evento por
// evento a buscar un cliente, sobre todo en los multifechas, es cansado».
//   [A] viajero_buscar por el handler REAL, con una red falsa que modela el
//       `or=(…ilike…)` de PostgREST (comodines `*` y `_`, mayúsculas) y que
//       distingue ACENTOS como la base de verdad: nombre sin acento, palabras
//       en otro orden, correo, celular, folio R-XXXXX, menos de 3 letras.
//       Control positivo: SIN los comodines `_`, «sofia» no encuentra «Sofía».
//   [B] Permisos: milk/yajirobe/director pasan; coordinador rebota (403).
//   [C] Cero escrituras (la red falsa truena ante cualquier verbo no-GET).
//   [D] La pantalla: _ccTarjetaDe (llave exacta · base de una sola fecha ·
//       fuera del catálogo = null) y el render (folio, evento, no-clic fuera).
//   [E] Control positivo por commit: en BASE filtrarCapsule no busca clientes.
// SIN ANCLA a propósito (árbol de trabajo).
// =============================================================================
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.CORREOS_MODO = 'real';

let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {}
  const t = typeof m === 'function' ? (() => { try { return m(); } catch (e) { return '(msg) ' + e.message; } })() : m;
  if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); } };
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const DB = [
  { id: U(1), nombre: 'Sofía Garza López', evento_id: 'fuerzaregida#2', tipo_paquete: 'plus', tipo_viajero: 'cliente', zona_boleto: 'Oro', boletos: 1, correo: 'sofi.g@gmail.com', celular: '8991234567', notas: 'Requisición R-7KQ2M · aprobó Bulma' },
  { id: U(2), nombre: 'Andrés Robledo', evento_id: 'karolg#1', tipo_paquete: 'cheap', tipo_viajero: 'cliente', zona_boleto: 'Platino', boletos: 1, correo: 'gaelico009@gmail.com', celular: '8993413492', notas: '' },
  { id: U(3), nombre: 'Melany Escamilla', evento_id: 'palnorte2026', tipo_paquete: 'cheap', tipo_viajero: 'cliente', zona_boleto: null, boletos: 0, correo: 'melanyesc27@gmail.com', celular: null, notas: 'Migración' },
  { id: U(4), nombre: 'Victor Coordi', evento_id: 'calle24', tipo_paquete: 'plus', tipo_viajero: 'coordinador', zona_boleto: 'General', boletos: 1, correo: 'v@c.mx', celular: null, notas: '' },
];
const VERBOS = [];
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
const ilike = (val, pat) => {
  const rx = '^' + pat.split('').map((ch) => ch === '*' ? '.*' : ch === '_' ? '.' : ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('') + '$';
  return new RegExp(rx, 'i').test(String(val == null ? '' : val));   // 🔒 distingue acentos, como la base
};
let ROL = 'bulma';
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase();
  if (m !== 'GET') { VERBOS.push(m + ' ' + url); return resp(500, {}); }
  const u = new URL(String(url));
  if (u.pathname.endsWith('/usuarios')) return resp(200, [{ id: 'u', activo: true, rol: ROL }]);
  if (u.pathname.endsWith('/viajeros_evento')) {
    const or = u.searchParams.get('or');
    if (!or) return resp(200, DB);
    const conds = or.replace(/^\(|\)$/g, '').split(',').map((c) => { const [col, op, ...pat] = c.split('.'); return { col, op, pat: pat.join('.') }; });
    return resp(200, DB.filter((v) => conds.some((c) => c.op === 'ilike' && ilike(v[c.col], c.pat))));
  }
  return resp(200, []);
};
const llamar = async (b, rol) => {
  ROL = rol || 'bulma';
  for (const k of Object.keys(require.cache)) if (k.includes('/netlify/functions/')) delete require.cache[k];
  const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
  const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  const jw = jwtSign({ id: 'u-' + ROL, rol: ROL, correo: ROL + '@x.mx', nombre: ROL }, process.env.JWT_SECRET, 3600);
  const r = await H({ httpMethod: 'POST', path: '/.netlify/functions/admin-coordi-asignaciones', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jw }, body: JSON.stringify(Object.assign({ accion: 'viajero_buscar' }, b)) });
  return { s: r.statusCode, j: JSON.parse(r.body || '{}') };
};
const ids = (r) => (r.j.resultados || []).map((x) => x.id);

(async () => {
  console.log('[A] viajero_buscar (handler real)');
  const a1 = await llamar({ q: 'sofia' });
  af(a1.s === 200 && ids(a1).includes(U(1)), () => '«sofia» encuentra a «Sofía» (sin acento): ' + a1.s + ' ' + (a1.j.error || ids(a1)));
  const a2 = await llamar({ q: 'lopez garza' });
  af(ids(a2).length === 1 && ids(a2)[0] === U(1), () => 'palabras en otro orden y sin acento: ' + ids(a2));
  const a3 = await llamar({ q: 'R-7KQ2M' });
  af(ids(a3)[0] === U(1) && a3.j.resultados[0].folio === 'R-7KQ2M', 'el FOLIO de la requisición encuentra al viajero y viaja en la respuesta');
  const a3b = await llamar({ q: 'r7kq2m' });
  af(ids(a3b)[0] === U(1), 'el folio sin guion y en minúsculas también');
  DB.push({ id: U(5), nombre: 'Rafael Treviño', evento_id: 'arjona', tipo_paquete: 'plus', tipo_viajero: 'cliente', zona_boleto: 'Oro', boletos: 1, correo: 'rt@x.mx', celular: null, notas: '' });
  const a3c = await llamar({ q: 'rafael' });
  af(ids(a3c)[0] === U(5), () => '«rafael» se busca como NOMBRE, no como el folio R-AFAEL: ' + ids(a3c));
  const a4 = await llamar({ q: 'GAELICO009@gmail.com' });
  af(ids(a4)[0] === U(2), 'por correo (mayúsculas no importan)');
  const a5 = await llamar({ q: '899 341 3492' });
  af(ids(a5)[0] === U(2) && ids(a5).length === 1, () => 'por celular con espacios: ' + ids(a5));
  const a6 = await llamar({ q: 'melany' });
  af(ids(a6)[0] === U(3) && a6.j.resultados[0].baja === true && a6.j.resultados[0].evento_id === 'palnorte2026', 'un evento fuera del catálogo también sale (y dice su baja)');
  const a7 = await llamar({ q: 'victor' });
  af(a7.j.resultados[0].staff === true, 'el equipo sale rotulado como equipo');
  const a8 = await llamar({ q: 'so' });
  af(a8.s === 400 && /3 letras/.test(a8.j.error || ''), 'menos de 3 letras rebota diciendo por qué');
  const a9 = await llamar({ q: 'zzzzzz' });
  af(a9.s === 200 && a9.j.total === 0, 'nada encontrado = 0, sin error');
  af(!('notas' in (a1.j.resultados[0] || {})), 'la NOTA interna no viaja (solo el folio que se saca de ella)');
  // Control positivo del instrumento: el ilike falso SÍ distingue acentos.
  af(!ilike('Sofía Garza', '*sofia*') && ilike('Sofía Garza', '*s_f__*'), 'control: sin comodines «sofia» NO casa «Sofía» en la red falsa (por eso existen)');

  console.log('[B] permisos');
  for (const rol of ['milk', 'yajirobe', 'director', 'maestro_roshi']) {
    const r = await llamar({ q: 'sofia' }, rol);
    af(r.s === 200 && ids(r).includes(U(1)), () => rol + ' busca: ' + r.s + ' ' + (r.j.error || ''));
  }
  const co = await llamar({ q: 'sofia' }, 'coordinador');
  af(co.s === 403, () => 'coordinador NO busca en todos los eventos: ' + co.s);

  console.log('[C] cero escrituras');
  af(VERBOS.length === 0, () => 'ningún verbo de escritura: ' + VERBOS.join(' | '));

  console.log('[D] la pantalla');
  const cj = fs.readFileSync(path.join(RAIZ, 'kamehouse-capsule.js'), 'utf8');
  const i0 = cj.indexOf('// Tarjeta de la llave del viajero'), i1 = cj.indexOf('async function ccBuscaClienteAbrir');
  const ctx = { _esfEsc: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') };
  vm.createContext(ctx); vm.runInContext(cj.slice(i0, i1) + ';this.T=_ccTarjetaDe;this.H=_ccBuscaClientesHtml;', ctx);
  const cache = [{ id: 'fuerzaregida#2', nombre: 'Fuerza Regida · 15 Enero' }, { id: 'karolg#1', nombre: 'Karol G · 7 Nov' }, { id: 'arjona', nombre: 'Arjona' }];
  af(ctx.T('fuerzaregida#2', cache) === 'fuerzaregida#2', 'llave exacta del multifecha → su tarjeta de fecha');
  af(ctx.T('arjona#0', cache) === 'arjona', 'evento de una sola fecha guardado como #0 → la tarjeta base');
  af(ctx.T('palnorte2026', cache) === null, 'fuera del catálogo → null (no se abre a ciegas)');
  const html = ctx.H(a1.j, cache) + ctx.H(a6.j, cache);
  af(/Fuerza Regida · 15 Enero/.test(html) && /R-7KQ2M/.test(html) && /ccBuscaClienteAbrir\('fuerzaregida#2'/.test(html), 'el render nombra la fecha del evento, el folio y abre ESA tarjeta');
  af(/palnorte2026 · fuera del catálogo/.test(html) && !/ccBuscaClienteAbrir\('palnorte2026'/.test(html), 'fuera del catálogo: se dice y NO es clicable');
  af(/encontrado/.test(ctx.H({ resultados: [], total: 0 }, cache)) && /Ningún cliente/.test(ctx.H({ resultados: [], total: 0 }, cache)), 'vacío lo DICE');
  af(/ccBuscaClientes\(q\)/.test(cj.slice(cj.indexOf('function filtrarCapsule'), cj.indexOf('function filtrarCapsule') + 2500)), 'filtrarCapsule (el buscador principal) llama a la búsqueda de clientes');
  const html2 = fs.readFileSync(path.join(RAIZ, 'kamehouse.html'), 'utf8');
  af(/id="cc-busca-clientes"/.test(html2) && /folio R-XXXXX/.test(html2), 'el HTML trae la caja de resultados y el placeholder dice que busca clientes y folio');
  const va = fs.readFileSync(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'), 'utf8');
  af(/'viajero_buscar'/.test(va), 'la lectura está en LECTURAS_DIRECTOR');

  console.log('[E] control positivo por commit');
  let base = '';
  try { base = execSync('git show HEAD:kamehouse-capsule.js', { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (_) {}
  const ancla = base && !/ccBuscaClientes/.test(base) ? base : (() => { try { const sha = execSync('git log --format=%H -1 --grep="CC-BUSCA-GLOBAL-1"', { cwd: RAIZ, encoding: 'utf8' }).trim(); return sha ? execSync(`git show ${sha}~1:kamehouse-capsule.js`, { cwd: RAIZ, encoding: 'utf8' }) : ''; } catch (_) { return ''; } })();
  af(ancla && !/ccBuscaClientes/.test(ancla), 'BASE: el buscador principal NO buscaba clientes (solo eventos)');

  console.log(`\n${R ? '🔴 ROJO' : '🟢 VERDE'} · ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})();

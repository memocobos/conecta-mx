#!/usr/bin/env node
/* =============================================================================
 * mide-cancel-ui-1 — EL BOTÓN «CANCELAR EVENTO» (CANCEL-UI-1, 12-oct-2026).
 *
 * Mide el handler REAL (esferas-cancelar) con red falsa que RESPETA filtros,
 * guarda ESTADO y TRUENA ante DELETE o verbo no contemplado — más los hechos
 * de fuente del navegador (cancelarEvento orquesta cancelar→despublicar EN
 * ESE ORDEN y el confirm dice lo que Memo pidió).
 *
 * Trampas sembradas a propósito:
 *  - 'brunomars2' comparte PREFIJO con 'bruno': el like sobre-pesca y la
 *    autoridad (esDelEvento) tiene que soltarlo — un prefijo no es un ancla.
 *  - El código 'DUO' sirve a dos eventos: NO se archiva, se AVISA con nombre.
 *
 * ⚠️ SIN ANCLA a propósito (árbol de trabajo, como mide:cuadre-aplicar).
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = 'secreto-del-arnes';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'service-falsa';

let V = 0, R = 0;
function af(ok, msg) {
  try { ok = (typeof ok === 'function') ? ok() : ok; } catch (e) { ok = false; msg += ' · EXC: ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); }
}
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const q = (url, k) => { const m = String(url).match(new RegExp(k + '=([^&]+)')); return m ? decodeURIComponent(m[1]) : null; };

function mundo() {
  const st = {
    escrituras: 0,
    esferas: [
      { slug: 'bruno', archivado: false, publicado: true },
      { slug: 'brunomars2', archivado: false, publicado: true }, // la trampa del prefijo
    ],
    pestanas: [
      { id: 'p1', evento_id: 'bruno', activa: true, notas: 'nota original de migración' },
      { id: 'p2', evento_id: 'bruno#1', activa: true, notas: null },
      { id: 'p3', evento_id: 'brunomars2', activa: true, notas: 'ajena' }, // NO se toca
      { id: 'p4', evento_id: 'otro', activa: true, notas: 'ajena' },
    ],
    recordatorios: [
      { id: 'aaaa1111-0000-0000-0000-000000000001', evento_id: 'bruno', active: true },
      { id: 'aaaa1111-0000-0000-0000-000000000002', evento_id: 'bruno#0', active: true },
      { id: 'aaaa1111-0000-0000-0000-000000000003', evento_id: 'brunomars2', active: true }, // NO se toca
      { id: 'aaaa1111-0000-0000-0000-000000000004', evento_id: 'bruno', active: false },      // ya apagado
    ],
    promos: [
      { codigo: 'BRU', only_events: ['bruno'], archivado: false },          // exclusiva → se archiva
      { codigo: 'DUO', only_events: ['bruno', 'otro'], archivado: false },  // multi → AVISO
      { codigo: 'AJENO', only_events: ['otro'], archivado: false },
    ],
  };
  const resp = (code, x) => ({ ok: code < 300, status: code, json: async () => x, text: async () => JSON.stringify(x) });
  global.fetch = async (url, init) => {
    const met = ((init && init.method) || 'GET').toUpperCase();
    const u = String(url);
    if (met === 'DELETE') throw new Error('DELETE PROHIBIDO: el handler intentó borrar — ' + u);
    if (u.includes('/rest/v1/usuarios') || u.includes('sesion')) throw new Error('sesion-viva apagada (fail-open medido)');

    if (u.includes('/rest/v1/esferas_eventos')) {
      const slug = q(u, 'slug');
      let rows = st.esferas.filter((e) => !slug || ('eq.' + e.slug) === slug);
      if (met === 'GET') return resp(200, rows.map((r) => ({ ...r })));
      if (met === 'PATCH') {
        const fArch = q(u, 'archivado');
        if (fArch) rows = rows.filter((e) => String(e.archivado) === fArch.replace('eq.', ''));
        const cambios = JSON.parse(init.body);
        rows.forEach((r) => { Object.assign(r, cambios); st.escrituras++; });
        return resp(200, rows.map((r) => ({ ...r })));
      }
    }
    if (u.includes('/rest/v1/excel_pestanas')) {
      if (met === 'GET') {
        const like = q(u, 'evento_id'); const pref = like ? like.replace(/^like\./, '').replace(/\*$/, '') : '';
        return resp(200, st.pestanas.filter((p) => p.activa === true && p.evento_id.startsWith(pref)).map((r) => ({ ...r })));
      }
      if (met === 'PATCH') {
        const id = (q(u, 'id') || '').replace('eq.', '');
        const rows = st.pestanas.filter((p) => p.id === id && p.activa === true);
        const cambios = JSON.parse(init.body);
        rows.forEach((r) => { Object.assign(r, cambios); st.escrituras++; });
        return resp(200, rows.map((r) => ({ ...r })));
      }
    }
    if (u.includes('/rest/v1/rol_recordatorios')) {
      if (met === 'GET') {
        const like = q(u, 'evento_id'); const pref = like ? like.replace(/^like\./, '').replace(/\*$/, '') : '';
        return resp(200, st.recordatorios.filter((r) => r.active === true && r.evento_id.startsWith(pref)).map((r) => ({ ...r })));
      }
      if (met === 'PATCH') {
        const dentro = (q(u, 'id') || '').replace(/^in\.\(/, '').replace(/\)$/, '').split(',');
        const rows = st.recordatorios.filter((r) => dentro.includes(r.id) && r.active === true);
        const cambios = JSON.parse(init.body);
        rows.forEach((r) => { Object.assign(r, cambios); st.escrituras++; });
        return resp(200, rows.map((r) => ({ ...r })));
      }
    }
    if (u.includes('/rest/v1/promos_codigos')) {
      if (met === 'GET') {
        const cs = q(u, 'only_events'); const slug = cs ? cs.replace(/^cs\.\{/, '').replace(/\}$/, '') : '';
        return resp(200, st.promos.filter((c) => c.archivado === false && (c.only_events || []).includes(slug)).map((r) => ({ ...r, only_events: [...r.only_events] })));
      }
      if (met === 'PATCH') {
        const cod = (q(u, 'codigo') || '').replace('eq.', '');
        const rows = st.promos.filter((c) => c.codigo === cod && c.archivado === false);
        const cambios = JSON.parse(init.body);
        rows.forEach((r) => { Object.assign(r, cambios); st.escrituras++; });
        return resp(200, rows.map((r) => ({ ...r })));
      }
    }
    throw new Error('URL no contemplada por la red falsa: ' + met + ' ' + u);
  };
  return st;
}

function fresco() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions') || k.includes('netlify\\functions')) delete require.cache[k]; });
  return {
    handler: require(path.join(RAIZ, 'netlify/functions/esferas-cancelar.js')).handler,
    jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign,
  };
}
const evento = (body, token) => ({
  httpMethod: 'POST',
  headers: { origin: 'https://conectareynosa.mx', ...(token ? { authorization: 'Bearer ' + token } : {}) },
  body: JSON.stringify(body),
});

(async () => {
  console.log('══ mide:cancel-ui-1 ══');
  const H = fresco();
  const tokenMemo = H.jwtSign({ id: 'u-memo', rol: 'maestro_roshi', nombre: 'Memo' }, process.env.JWT_SECRET, 3600);
  const tokenBulma = H.jwtSign({ id: 'u-bulma', rol: 'bulma', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);

  console.log('\n[A] los candados de la puerta (cero escrituras en cada rechazo)');
  let st = mundo();
  let r = await H.handler(evento({ slug: 'bruno' }, tokenMemo));
  af(r.statusCode === 400 && JSON.parse(r.body).error.includes('confirmar'), '[A1] 🔒 sin confirmar:true → 400 nombrando el candado');
  af(st.escrituras === 0, '[A2] …y CERO escrituras');
  r = await H.handler(evento({ slug: 'nadie', confirmar: true }, tokenMemo));
  af(r.statusCode === 403 && st.escrituras === 0, '[A3] slug fuera de Esferas → 403, cero escrituras (la salvaguarda de despublicar)');
  r = await H.handler(evento({ slug: 'bruno', confirmar: true }, tokenBulma));
  af(r.statusCode === 403 && st.escrituras === 0, '[A4] rol bulma → 403: cancelar es de maestro_roshi, como despublicar');

  console.log('\n[B] el camino feliz, con las dos trampas sembradas');
  st = mundo();
  r = await H.handler(evento({ slug: 'bruno', confirmar: true }, tokenMemo));
  const d = JSON.parse(r.body);
  af(r.statusCode === 200 && d.ok === true, '[B1] 200 ok');
  af(d.archivado === 1, '[B2] la ficha se archivó (1 fila)');
  const fe = st.esferas.find((e) => e.slug === 'bruno');
  af(fe.archivado === true && fe.publicado === false, '[B3] …y en la base quedó archivado=true + publicado=false (el publish ya no lo re-inserta)');
  af(st.esferas.find((e) => e.slug === 'brunomars2').archivado === false, '[B4] 🔒 brunomars2 INTACTO: un prefijo no es un ancla — el like sobre-pesca y la autoridad lo suelta');
  af(JSON.stringify(d.pestanas.sort()) === JSON.stringify(['bruno', 'bruno#1']), `[B5] pestañas apagadas EXACTAS (bruno y su hija multifecha): ${d.pestanas.join(', ')}`);
  const p1 = st.pestanas.find((p) => p.id === 'p1');
  af(p1.activa === false && p1.notas.includes('nota original de migración') && p1.notas.includes('CANCELADO'), '[B6] 🔒 la nota se ANEXA, jamás se pisa (procedencia + sello de cancelación)');
  af(st.pestanas.find((p) => p.id === 'p3').activa === true && st.pestanas.find((p) => p.id === 'p4').activa === true, '[B7] las pestañas ajenas (brunomars2, otro) siguen vivas');
  af(d.recordatorios === 2, '[B8] 2 recordatorios de /rol apagados (el del padre y el de la hija; el ya-apagado no se recuenta)');
  af(st.recordatorios[2].active === true, '[B9] el recordatorio de brunomars2 sigue vivo');
  af(JSON.stringify(d.promos_archivadas) === JSON.stringify(['BRU']) && st.promos[0].archivado === true, '[B10] el código EXCLUSIVO del evento se archivó');
  af(st.promos[1].archivado === false && d.promos_aviso.length === 1 && d.promos_aviso[0].includes('DUO') && d.promos_aviso[0].includes('otro'), '[B11] 🔒 el código multi-evento NO se tocó y el aviso lo NOMBRA con sus otros eventos');
  af(d.avisos.some((a) => a.includes('publish de códigos')), '[B12] el reporte dice que la copia del index se limpia en el próximo publish de códigos');
  af(st.escrituras > 0, '[B13] 🔒 control positivo del contador: la corrida buena SÍ escribió (su cero de [A] no era ceguera)');
  af(d.siguiente === 'despublicar', '[B14] el handler declara el paso que sigue (el navegador llama a despublicar DESPUÉS)');

  console.log('\n[C] idempotencia: el segundo clic no escribe nada');
  const antes = st.escrituras;
  r = await H.handler(evento({ slug: 'bruno', confirmar: true }, tokenMemo));
  const d2 = JSON.parse(r.body);
  af(r.statusCode === 200 && d2.ok === true, '[C1] el segundo clic contesta 200 (es el camino de REINTENTO si despublicar falló)');
  af(st.escrituras === antes, '[C2] 🔒 …con CERO escrituras nuevas (cada PATCH lleva su valor esperado en el filtro)');
  af(d2.archivado === 0 && d2.pestanas.length === 0 && d2.recordatorios === 0 && d2.promos_archivadas.length === 0, '[C3] …y el reporte dice la verdad: nada quedaba por apagar');

  console.log('\n[D] los hechos de fuente del navegador (sin comentarios)');
  const js = sinComentarios(fs.readFileSync(path.join(RAIZ, 'kamehouse-esferas.js'), 'utf8'));
  const i0 = js.indexOf('async function cancelarEvento');
  af(i0 > 0, '[D1] cancelarEvento existe');
  let depth = 0, fin = -1;
  for (let i = js.indexOf('{', i0); i < js.length; i++) { if (js[i] === '{') depth++; else if (js[i] === '}') { depth--; if (!depth) { fin = i; break; } } }
  const cuerpo = js.slice(i0, fin + 1);
  af(/window\.confirm\([^)]*Realmente deseas CANCELAR/.test(cuerpo), '[D2] el confirm dice «Realmente deseas CANCELAR» — la palabra de Memo, literal');
  const iCan = cuerpo.indexOf('esferas-cancelar'), iDes = cuerpo.indexOf('esferas-despublicar');
  af(iCan > 0 && iDes > iCan, '[D3] 🔒 el ORDEN es cancelar → despublicar (archivar primero cierra la re-inserción)');
  af(cuerpo.includes('confirmar: true'), '[D4] el navegador manda el candado del servidor (confirmar:true)');
  af(js.includes("cancelarEvento('${s}')"), '[D5] el botón de la fila llama a cancelarEvento');
  af(/async function despublicarEsfera[\s\S]{0,400}window\.confirm/.test(js), '[D6] despublicarEsfera conserva su PROPIO confirm (los dos botones siguen siendo dos)');

  console.log(`\n${R === 0 ? '✅ VERDE' : '🔴 ROJO'} · ${V} en verde · ${R} en rojo`);
  if (V === 0) { console.log('NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  process.exit(R ? 1 : 0);
})().catch((e) => { console.error('EL ARNÉS SE CAYÓ (eso no es un reporte):', e); process.exit(1); });

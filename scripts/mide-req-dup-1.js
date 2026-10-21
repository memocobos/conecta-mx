#!/usr/bin/env node
/* =============================================================================
 * mide-req-dup-1 — EL CANDADO DEL DUPLICADO EN LA BANDEJA (20-oct-2026).
 *
 * Nació del caso real: Virginia Moguel mandó la MISMA solicitud dos veces
 * (R-RJ4JP y R-9HGTE, mismo comprobante byte a byte: 118,081 bytes) y la
 * bandeja aprobó las dos — 4 lugares y $1,200 donde eran 2 y $600.
 *
 * Entra por el handler REAL (admin-requisiciones) con una red falsa que
 * respeta filtros eq. y guarda estado (la ley de la base de mentira).
 * ⚠️ SIN ANCLA a propósito (árbol de trabajo, como mide:req-b1): sus controles
 * son por construcción — sembrar el gemelo y ver caer la aprobación.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let V = 0, R = 0;
function af(ok, msg) {
  try { ok = (typeof ok === 'function') ? ok() : ok; } catch (e) { ok = false; msg += ' · EXCEPCIÓN: ' + e.message; }
  if (ok) { V++; console.log('  ✓ ' + msg); } else { R++; console.log('  ✗ ' + msg); }
}

process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'service-falsa';
process.env.JWT_SECRET = 'secreto-del-arnes';

// ── Red falsa: filtros eq. respetados, estado guardado ───────────────────────
function redNueva(opts) {
  opts = opts || {};
  const st = { requisiciones: (opts.requisiciones || []).map((r) => Object.assign({}, r)), viajeros: [], abonos: [], escrituras: 0, dupCaido: !!opts.dupCaido };
  let seq = 1;
  const uuid = () => '00000000-0000-4000-8000-' + String(seq++).padStart(12, '0');
  const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const filtros = (url) => {
    const u = new URL(url); const f = {};
    for (const [k, v] of u.searchParams) if (String(v).startsWith('eq.')) f[k] = decodeURIComponent(String(v).slice(3));
    return f;
  };
  st.fetch = async (url, init) => {
    init = init || {};
    const met = (init.method || 'GET').toUpperCase();
    const U = String(url);
    if (U.includes('/rest/v1/requisiciones')) {
      const f = filtros(url);
      if (met === 'GET') {
        // El brazo del instrumento caído: la CONSULTA DEL CANDADO (estado=eq.aprobada).
        if (st.dupCaido && f.estado === 'aprobada') return resp(500, 'tabla enojada (sembrado)');
        return resp(200, st.requisiciones.filter((r) => Object.keys(f).every((k) => String(r[k]) === String(f[k]))));
      }
      if (met === 'PATCH') {
        st.escrituras++;
        const rows = st.requisiciones.filter((r) => Object.keys(f).every((k) => String(r[k]) === String(f[k])));
        rows.forEach((r) => Object.assign(r, JSON.parse(init.body)));
        return resp(200, rows.map((r) => Object.assign({}, r)));
      }
    }
    if (U.includes('/rest/v1/viajeros_evento') && met === 'POST') {
      st.escrituras++;
      const cuerpo = JSON.parse(init.body);
      const filas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map((x) => Object.assign({ id: uuid() }, x));
      filas.forEach((x) => st.viajeros.push(x));
      return resp(201, filas);
    }
    if (U.includes('/rest/v1/abonos_viajero') && met === 'POST') {
      st.escrituras++;
      const cuerpo = JSON.parse(init.body);
      const filas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map((x) => Object.assign({ id: uuid() }, x));
      filas.forEach((x) => st.abonos.push(x));
      return resp(201, filas);
    }
    if (U.includes('/rest/v1/usuarios') || U.includes('sesion')) throw new Error('sesion-viva apagada (fail-open documentado)');
    // Satélites del aprobar (grupo WA, correo único fuera de EVENTOS_CORREO…):
    // contestan vacío — no son el sujeto de este careo.
    if (met === 'GET') return resp(200, []);
    throw new Error('URL no contemplada: ' + met + ' ' + U);
  };
  return st;
}

function handlersFrescos() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions') || k.includes('netlify\\functions')) delete require.cache[k]; });
  return {
    admin: require(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js')).handler,
    jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign,
  };
}
const evento = (body, token) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + token }, body: JSON.stringify(body) });

// Dos solicitudes GEMELAS (mismo evento + mismo celular) — la forma de Virginia.
// `ride` a propósito: no pasa por la puerta de zonas, que no es el sujeto aquí.
const GEMELAS = [
  { id: '11111111-1111-4111-8111-111111111111', folio: 'R-UNO', evento_id: 'eventoprueba', evento_nombre: 'Evento de prueba', paquete: 'ride', zona: null, num_personas: 1, nombre: 'Virginia Prueba', celular: '8990000001', correo: 'v@x.test', forma_pago: 'transferencia', total_sistema: 2700, separo_sistema: 300, estado: 'aprobada', acompanantes: null, desglose: null },
  { id: '22222222-2222-4222-8222-222222222222', folio: 'R-DOS', evento_id: 'eventoprueba', evento_nombre: 'Evento de prueba', paquete: 'ride', zona: null, num_personas: 1, nombre: 'Virginia Prueba', celular: '899-000-0001', correo: 'otro@x.test', forma_pago: 'transferencia', total_sistema: 2700, separo_sistema: 300, estado: 'pendiente', acompanantes: null, desglose: null },
  { id: '33333333-3333-4333-8333-333333333333', folio: 'R-AJENA', evento_id: 'eventoprueba', evento_nombre: 'Evento de prueba', paquete: 'ride', zona: null, num_personas: 1, nombre: 'Otra Persona', celular: '8990000009', correo: 'ajena@x.test', forma_pago: 'oxxo', total_sistema: 2700, separo_sistema: 300, estado: 'pendiente', acompanantes: null, desglose: null },
];

(async function main() {
  console.log('══ mide:req-dup-1 · el candado del duplicado en la bandeja ══\n');

  console.log('[A] listar: la fila nombra a su gemela (y la ajena queda limpia)');
  let red = redNueva({ requisiciones: GEMELAS });
  global.fetch = red.fetch;
  let H = handlersFrescos();
  // jwtSign EXIGE ttl (ses-1: sin exp no hay token) — la lección de mide:req-b1.
  const tok = H.jwtSign({ id: 'u-arnes', correo: 'arnes@conecta.test', rol: 'maestro_roshi', nombre: 'Arnés' }, process.env.JWT_SECRET, 3600);
  let r = await H.admin(evento({ accion: 'listar', estado: 'todas' }, tok));
  let b = JSON.parse(r.body);
  af(r.statusCode === 200 && Array.isArray(b.requisiciones), 'listar contesta 200 con filas');
  const dos = (b.requisiciones || []).find((x) => x.folio === 'R-DOS');
  const ajena = (b.requisiciones || []).find((x) => x.folio === 'R-AJENA');
  af(dos && Array.isArray(dos.dup_de) && dos.dup_de.some((d) => d.folio === 'R-UNO' && d.estado === 'aprobada'), 'R-DOS trae dup_de nombrando a R-UNO (aprobada) — el celular casa aunque venga con guiones');
  af(ajena && !ajena.dup_de, 'la solicitud ajena NO trae dup_de (el detector distingue)');

  console.log('\n[B] aprobar un duplicado SIN la palabra → 409, cero escrituras');
  red = redNueva({ requisiciones: GEMELAS });
  global.fetch = red.fetch;
  H = handlersFrescos();
  r = await H.admin(evento({ accion: 'aprobar', id: '22222222-2222-4222-8222-222222222222', monto: 300, total_contrato: 2700 }, tok));
  b = JSON.parse(r.body);
  af(r.statusCode === 409, 'contesta 409 (no 200): el candado vive en el SERVIDOR');
  af(Array.isArray(b.duplicado) && b.duplicado.includes('R-UNO'), 'y NOMBRA a la gemela aprobada (R-UNO) para ir a compararla');
  af(red.escrituras === 0, 'CERO escrituras: nada se reclamó, nadie nació');
  af(red.requisiciones.find((x) => x.folio === 'R-DOS').estado === 'pendiente', 'R-DOS sigue pendiente');

  console.log('\n[C] con duplicado_ok:true (la palabra de quien comparó comprobantes) SÍ pasa');
  red = redNueva({ requisiciones: GEMELAS });
  global.fetch = red.fetch;
  H = handlersFrescos();
  r = await H.admin(evento({ accion: 'aprobar', id: '22222222-2222-4222-8222-222222222222', monto: 300, total_contrato: 2700, duplicado_ok: true }, tok));
  b = JSON.parse(r.body);
  af(r.statusCode === 200 && b.ok, 'aprueba (200 ok): una compra nueva de verdad no se bloquea');
  af(red.viajeros.length >= 1 && red.abonos.length >= 1, 'nació el viajero con su abono');

  console.log('\n[D] la solicitud SIN gemela aprobada no pide la palabra (control del detector)');
  red = redNueva({ requisiciones: GEMELAS });
  global.fetch = red.fetch;
  H = handlersFrescos();
  r = await H.admin(evento({ accion: 'aprobar', id: '33333333-3333-4333-8333-333333333333', monto: 300, total_contrato: 2700 }, tok));
  b = JSON.parse(r.body);
  af(r.statusCode === 200 && b.ok, 'la ajena aprueba a la primera, sin duplicado_ok');

  console.log('\n[E] si el candado NO PUEDE MIRAR, no aprueba a ciegas (un cero es una afirmación)');
  red = redNueva({ requisiciones: GEMELAS, dupCaido: true });
  global.fetch = red.fetch;
  H = handlersFrescos();
  r = await H.admin(evento({ accion: 'aprobar', id: '33333333-3333-4333-8333-333333333333', monto: 300, total_contrato: 2700 }, tok));
  b = JSON.parse(r.body);
  af(r.statusCode === 502 && /duplicados/.test(b.error || ''), 'consulta de duplicados caída → 502 que lo dice, no una aprobación muda');
  af(red.escrituras === 0, 'y cero escrituras con el instrumento caído');

  console.log('\n[F] la pantalla (estática): el aviso y el confirm-reintento');
  const ui = fs.readFileSync(path.join(RAIZ, 'kamehouse-requisiciones.js'), 'utf8');
  af(/r\.dup_de/.test(ui) && /Posible duplicado/.test(ui), 'la tarjeta pinta el aviso de dup_de');
  af(/j\.duplicado/.test(ui) && /duplicado_ok = true/.test(ui), 'el 409 del servidor abre un confirm y reintenta con duplicado_ok');
  af(/compra NUEVA/i.test(ui), 'y el confirm pregunta lo que importa: ¿es otro pago?');

  console.log('\n' + (R ? '🔴 ROJO' : (V ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('🔴 el arnés se cayó: ' + (e && e.stack || e)); process.exit(1); });

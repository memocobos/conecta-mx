#!/usr/bin/env node
// =============================================================================
// mide-crea-2 — CREA-2 (13-oct-2026): la cortesía de una creadora con su
// ACOMPAÑANTE. Entra por el handler REAL (admin-coordi-asignaciones, acción
// cortesia_asignar) con una base falsa que respeta filtros, guarda estado y
// RECHAZA columnas que la tabla no tiene (la base de mentira no inventa nombres).
// Mide:
//   [A] con 2 boletos + acompañante del contrato → DOS viajeros (ella y él),
//       cada uno con SU talla, mismo grupo_viaje, $0, sin correo el acompañante;
//   [B] con 1 boleto → solo ella; el acompañante queda en la nota, sin fila;
//   [C] lo tecleado en el panel MANDA sobre el contrato (nombre corregido);
//   [D] acompañante sin talla → 409 y NADA se escribe;
//   [E] `acompanante: null` explícito con 2 boletos → va sola (no cae al contrato);
//   [F] segundo clic → no duplica a nadie ni suma stock;
//   [G] la lista de contratos proyecta talla/acompañante sin el jsonb entero;
//   [H] la ficha del contrato queda sellada con la talla del acompañante.
// Sin ancla de commit a propósito (carga del árbol de trabajo, como
// mide:prueba-archivo-1): no sufre la trampa del commit y no trae control por commit.
// =============================================================================
const path = require('path');
const RAIZ = path.join(__dirname, '..');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';

let V = 0, R = 0;
const af = (c, m) => { let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {} if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); } };

const CID = 'cccccccc-0000-4000-8000-000000000001';
const COLS_VE = ['id', 'evento_id', 'nombre', 'correo', 'celular', 'zona_boleto', 'talla_playera', 'tipo_paquete', 'tipo_viajero', 'total_contrato', 'abonado_previo', 'notas', 'grupo_viaje', 'boletos', 'num_emergencia', 'emergencia_nombre', 'usuario_id', 'creado_en'];
function base(o) {
  o = o || {};
  return {
    contratos_creadores: [{ id: CID, creador_nombre: 'Ximena Lozano', creador_email: 'xime@x.mx', plantilla: 'creadora', estado: 'firmado',
      datos: Object.assign({ talla: 'M', talla_origen: 'contrato' }, o.sinAcomp ? {} : { acompanante: o.acompCtr || { nombre: 'Antonio Esparza', talla: 'L', talla_origen: 'contrato' } }) }],
    viajeros_evento: o.viajeros || [], stock_ajustes: [], escrituras: 0,
  };
}
let DB, SEQ = 0;
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
const casa = (row, sp) => { for (const [k, v] of sp) {
  if (['select', 'order', 'limit'].includes(k)) continue;
  const val = String(row[k] == null ? '' : row[k]);
  if (v.startsWith('eq.')) { if (val !== decodeURIComponent(v.slice(3))) return false; continue; }
  throw new Error('filtro no modelado ' + k + '=' + v);
} return true; };
global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase();
  const u = new URL(url);
  if (u.pathname.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u', activo: true, rol: 'maestro_roshi' }]);
  const t = u.pathname.replace('/rest/v1/', '');
  const T = DB[t]; if (!T) throw new Error('tabla no modelada ' + t);
  const sp = [...u.searchParams.entries()];
  if (m === 'GET') return resp(200, T.filter((r) => casa(r, sp)).map((r) => JSON.parse(JSON.stringify(r))));
  DB.escrituras++;
  const b = JSON.parse(init.body);
  if (t === 'viajeros_evento') {
    const malas = Object.keys(b).filter((k) => !COLS_VE.includes(k));
    if (malas.length) return resp(400, { message: 'columna inexistente ' + malas.join(',') });
  }
  if (m === 'POST') { const f = Object.assign({ id: 'id-' + (++SEQ) }, b); T.push(f); return resp(201, [f]); }
  if (m === 'PATCH') { const fs = T.filter((r) => casa(r, sp)); fs.forEach((r) => Object.assign(r, b)); return resp(200, fs); }
  throw new Error('método ' + m);
};
// El catálogo no se toca en esta acción; si lo pidiera, el arnés lo diría.
const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
const tok = jwtSign({ id: 'u-roshi', rol: 'maestro_roshi', correo: 'memo@x.mx', nombre: 'Memo' }, process.env.JWT_SECRET, 3600);
const pedir = (extra) => H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok },
  body: JSON.stringify(Object.assign({ accion: 'cortesia_asignar', contrato_id: CID, evento_id: 'enjambre', zona: 'General' }, extra)) });

(async () => {
  console.log('══ mide:crea-2 · cortesía con acompañante ══');

  DB = base();
  let r = await pedir({ boletos: 2 });
  let j = JSON.parse(r.body);
  const ve = DB.viajeros_evento;
  const ella = ve.find((v) => v.nombre === 'Ximena Lozano'), el = ve.find((v) => v.nombre === 'Antonio Esparza');
  af(r.statusCode === 200 && ve.length === 2, `[A1] 2 boletos + acompañante del contrato → 2 viajeros (${r.statusCode} · ${ve.length}) ${r.statusCode !== 200 ? r.body : ''}`);
  af(ella && ella.talla_playera === 'M' && el && el.talla_playera === 'L', '[A2] cada quien con SU talla (M ella · L él)');
  af(ella && el && ella.grupo_viaje && ella.grupo_viaje === el.grupo_viaje, '[A3] los dos en el MISMO grupo_viaje («viaja con»)');
  af(el && el.total_contrato === 0 && el.abonado_previo === 0 && el.correo == null && el.tipo_viajero === 'creadora' && el.tipo_paquete === 'CHEAP', '[A4] el acompañante: $0, sin correo, mismo paquete y tipo que ella');
  af(DB.stock_ajustes.length === 1 && DB.stock_ajustes[0].vendidos_fuera === 2, '[A5] el stock aparta los 2 boletos (una sola vez)');
  af(j.acompanante && j.acompanante.nombre === 'Antonio Esparza', '[A6] la respuesta trae al acompañante para que la pantalla lo diga');
  const sello = DB.contratos_creadores[0].datos.cortesia;
  af(sello && sello.acompanante_talla === 'L' && sello.acompanante_viaja === true, '[H] el contrato queda sellado con la talla del acompañante');

  const escAntes = DB.escrituras;
  r = await pedir({ boletos: 2 });
  af(JSON.parse(r.body).ya === true && DB.viajeros_evento.length === 2 && DB.stock_ajustes[0].vendidos_fuera === 2 && DB.escrituras === escAntes, '[F] segundo clic → no duplica ni suma (0 escrituras)');

  DB = base();
  r = await pedir({ boletos: 1 });
  af(r.statusCode === 200 && DB.viajeros_evento.length === 1 && /Antonio Esparza/.test(DB.viajeros_evento[0].notas) && !DB.viajeros_evento[0].grupo_viaje, '[B] 1 boleto → solo ella; el acompañante en la nota y sin grupo');

  DB = base({ acompCtr: { nombre: 'Alan Echeverría talla L Marietta y Alanna talla niño M', talla: 'L' } });
  r = await pedir({ boletos: 2, acompanante: { nombre: 'Alan Echeverría', talla: 'L' } });
  af(r.statusCode === 200 && DB.viajeros_evento.some((v) => v.nombre === 'Alan Echeverría') && !DB.viajeros_evento.some((v) => /Alanna/.test(v.nombre)), '[C] lo tecleado en el panel MANDA sobre lo que escribió en el contrato');

  DB = base({ acompCtr: { nombre: 'Daniela', talla: '' } });
  r = await pedir({ boletos: 2 });
  af(r.statusCode === 409 && JSON.parse(r.body).falta_talla_acomp === true && DB.escrituras === 0, `[D] acompañante sin talla → 409 y NADA se escribe (${r.statusCode} · ${DB.escrituras})`);

  DB = base();
  r = await pedir({ boletos: 2, acompanante: null });
  af(r.statusCode === 200 && DB.viajeros_evento.length === 1 && DB.stock_ajustes[0].vendidos_fuera === 2, '[E] acompanante:null con 2 boletos → va sola (no cae al contrato), igual aparta 2');

  // [CREA-3] el duplicado por NOMBRE (la migración del Excel la dio de alta sin correo)
  const XID = 'dddddddd-0000-4000-8000-000000000001';
  const yaEstaba = () => [{ id: XID, evento_id: 'enjambre', nombre: 'Ximena Lozano', correo: null, tipo_paquete: 'CHEAP', tipo_viajero: null, zona_boleto: 'General', boletos: 1, total_contrato: 2500, abonado_previo: 2500 }];
  DB = base({ viajeros: yaEstaba() });
  r = await pedir({ boletos: 2 });
  j = JSON.parse(r.body);
  af(r.statusCode === 409 && j.posible_duplicado === true && j.creadora.length === 1 && j.creadora[0].id === XID && DB.escrituras === 0,
    `[I] ya estaba en la lista SIN correo → 409 con su fila y NADA escrito (${r.statusCode} · ${DB.escrituras})`);
  af(/Ximena Lozano/.test(r.body) && /2500/.test(r.body), '[I2] la respuesta dice quién es y cuánto trae, para decidir con el dato enfrente');

  // [N] CREA-3b · la fila es una COMPRA (caso Marietta: 2 VIP pagados) → «es ella» se rehúsa
  DB = base({ viajeros: yaEstaba() });
  r = await pedir({ boletos: 2, viajero_existente_id: XID });
  af(r.statusCode === 409 && JSON.parse(r.body).es_compra === true && DB.escrituras === 0,
    `[N] «es ella» sobre una COMPRA pagada → 409 y nada escrito (sus boletos comprados no se vuelven cortesía) (${r.statusCode} · ${DB.escrituras})`);
  const kh2 = require('fs').readFileSync(require('path').join(RAIZ, 'kamehouse-contratos.js'), 'utf8');
  af(/const esCompra = /.test(kh2) && /fila\(v, !esCompra\(v\)\)/.test(kh2), '[N2] la pantalla no ofrece «Es ella» sobre una compra');

  // [J] «es ella» sobre una fila SIN dinero (el caso Victor: la registraron antes, sin compra)
  const yaSinDinero = () => [Object.assign(yaEstaba()[0], { total_contrato: 0, abonado_previo: 0 })];
  DB = base({ viajeros: yaSinDinero() });
  r = await pedir({ boletos: 2, viajero_existente_id: XID });
  const ximes = DB.viajeros_evento.filter((v) => /Ximena/.test(v.nombre));
  const anto = DB.viajeros_evento.find((v) => v.nombre === 'Antonio Esparza');
  af(r.statusCode === 200 && ximes.length === 1 && ximes[0].id === XID && ximes[0].tipo_viajero === 'creadora' && ximes[0].talla_playera === 'M',
    '[J] «es ella» → se COMPLETA su fila (sigue habiendo UNA Ximena, sellada como creadora)');
  af(ximes[0].total_contrato === 0 && ximes[0].abonado_previo === 0, '[J2] su contrato no se toca');
  af(anto && anto.grupo_viaje && anto.grupo_viaje === ximes[0].grupo_viaje, '[J3] su acompañante nace y viaja con ella');

  DB = base({ viajeros: yaEstaba() });
  r = await pedir({ boletos: 2, es_otra_persona: true });
  af(r.statusCode === 200 && DB.viajeros_evento.filter((v) => /Ximena/.test(v.nombre)).length === 2, '[K] «son otras personas» → se crea aparte, porque lo dijo quien asigna');

  DB = base({ viajeros: [{ id: XID, evento_id: 'enjambre', nombre: 'Ximena Gómez Treviño', correo: null, tipo_paquete: 'PLUS', tipo_viajero: 'cliente', zona_boleto: 'General', boletos: 1, total_contrato: 0, abonado_previo: 0 }] });
  r = await pedir({ boletos: 1 });
  af(r.statusCode === 200, '[L] mismo primer nombre pero otro apellido → no frena (no es la misma persona)');

  DB = base({ viajeros: [{ id: XID, evento_id: 'otroevento', nombre: 'Ximena Lozano Rangel', correo: null, tipo_paquete: 'CHEAP', tipo_viajero: null, zona_boleto: 'General', boletos: 1, total_contrato: 0, abonado_previo: 0 }] });
  r = await pedir({ boletos: 1 });
  af(r.statusCode === 200, '[M] estar en OTRO evento no frena (puede viajar a varios)');

  // [G] la proyección de la lista, leída del archivo (no recordada)
  const fs = require('fs');
  const ac = fs.readFileSync(path.join(RAIZ, 'netlify/functions/admin-contratos.js'), 'utf8').replace(/\/\/.*$/gm, '');
  af(/'acomp_nombre:datos->acompanante->>nombre'/.test(ac) && /'acomp_talla:datos->acompanante->>talla'/.test(ac), '[G1] la lista proyecta nombre y talla del acompañante');
  af(!/COLS = \[[\s\S]*?'datos',[\s\S]*?\]\.join/.test(ac), '[G2] y NO el jsonb entero (el Anexo C sigue sin viajar en el listado)');
  const kh = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  af(/\$\{_ctrKitChip\(c\)\}/.test(kh) && /function _ctrKitChip\(/.test(kh), '[G3] la fila del contrato pinta el chip de talla/acompañante (y la función existe)');

  console.log(`\n${R === 0 ? (V ? '✅ VERDE' : '⚠️ NADA MEDIDO · esto NO es un verde') : '🔴 ROJO'} · ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('✗ EL ARNÉS SE CAYÓ: ' + e.stack); process.exit(1); });

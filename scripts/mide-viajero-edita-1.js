#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// mide:viajero-edita-1 · [VIAJERO-EDITA-1 + VIAJERO-MUDAR-1] · 28-oct-2026
//
// Qué vigila:
//   [E] ✏️ Corregir — que por fin se pueda editar total/paquete/zona/lugares
//       de CUALQUIER viajero, con la puerta de zonas, valor esperado y rastro.
//   [A] El aviso al cliente — NACE APAGADO (palabra de Memo) y se REHÚSA sobre
//       un viaje sin publicar (lo mandaría a «estamos revisando»).
//   [M] 📅 Mover fecha — mismo evento, fecha que existe, zona de ESA fecha, y
//       EL DINERO INTACTO.
//
// 🔒 ENTRA POR EL HANDLER REAL y simula un salto más adentro (el `fetch` a
//    PostgREST y a Resend). Un mock de ruta saltaría al portero — esa lección
//    ya costó tres tuercas rotas en producción con el careo en verde.
//
// ⚠️ SIN ANCLA a propósito (como mide:req-b1 y mide:rechazo-1): carga del
//    ÁRBOL DE TRABAJO. No sufre la trampa del commit y en cambio no puede
//    traer control positivo POR COMMIT: sus controles son positivos por
//    CONSTRUCCIÓN — se siembra el caso y se ve caer.
// ════════════════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.PORTAL_SUPABASE_URL = 'https://portal.falso.test';
process.env.PORTAL_SUPABASE_SERVICE = 'svc2';
process.env.RESEND_API_KEY = 're_falsa';
// 🔒 'real' a propósito: así está producción.
process.env.CORREOS_MODO = 'real';

let V = 0, R = 0;
const af = (c, m) => {
  let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {}
  const t = typeof m === 'function' ? m() : m;
  if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); }
};
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

// El catálogo REAL de un multifecha: Corona, el caso de Frida. Las zonas por
// fecha son DISTINTAS a propósito — es lo que hace que la puerta importe.
const INDEX = `<script>var EV=[{id:'coronacapital',a:'Corona Capital',f:'20-22 de noviembre',ds:'2026-11-20',v:'Curva 4',st:'',sep:500,
 multifecha:[
  {f:'Viernes 20',ds:'2026-11-20',zonas:[{n:'General',p:3900}]},
  {f:'Sábado 21',ds:'2026-11-21',zonas:[{n:'General',p:3900}]},
  {f:'Vie + Sáb',ds:'2026-11-20',zonas:[{n:'General',p:6300},{n:'Comfort',p:9000}]}
 ],hotel:[]},
 {id:'otroevento',a:'Otro',f:'1 de enero',ds:'2027-01-01',v:'X',st:'',sep:500,zonas:[{n:'Pista',p:1000}],hotel:[]}];</script>`;

let DB, RESEND, CATALOGO_CAIDO = false;
// ⚠️ El contador de escrituras de TODA la corrida vive FUERA de la semilla.
// La primera versión lo leía de `DB.escrituras`, que `semilla()` reinicia: al
// medirlo al final daba 0 y el candado de cardinalidad se puso rojo
// (correctamente) diciendo que los candados de «no escribió» pasaban en vacío.
// Un contador que el propio arnés resetea mide el último escenario, no la corrida.
const TODAS = [];
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => (typeof b === 'string' ? JSON.parse(b) : b), text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });
const eq = (q, campo) => { const m = q.match(new RegExp('[?&]' + campo + '=eq\\.([^&]*)')); return m ? decodeURIComponent(m[1]) : null; };
const esNull = (q, campo) => new RegExp('[?&]' + campo + '=is\\.null').test(q);

global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = decodeURIComponent(String(url));
  if (u.includes('api.resend.com')) { RESEND.push(JSON.parse(init.body)); return resp(200, { id: 'em_' + RESEND.length }); }
  if (u.includes('/index.html') || /conectareynosa\.mx\/?($|\?)/.test(u)) return CATALOGO_CAIDO ? resp(500, 'caído') : resp(200, INDEX);
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u', activo: true, rol: 'bulma' }]);
  if (u.includes('/rest/v1/abonos_viajero')) {
    const vid = eq(u, 'viajero_id');
    return resp(200, DB.abonos.filter((a) => !vid || a.viajero_id === vid));
  }
  if (u.includes('/rest/v1/viajeros_evento')) {
    if (m === 'DELETE') { TODAS.push({ tabla: 'viajeros_evento', op: 'DELETE' }); throw new Error('DELETE prohibido en viajeros_evento'); }
    let f = DB.v.slice();
    // 🔒 LA RED FALSA RESPETA LOS FILTROS COMO PostgREST. Sin esto, el valor
    // esperado del PATCH pasaría en vacío y «el 2º clic da 409» sería un verde
    // que no prueba nada — la base de mentira que miente hacia el lado cómodo.
    const id = eq(u, 'id'); if (id) f = f.filter((x) => x.id === id);
    for (const campo of ['evento_id', 'tipo_paquete', 'zona_boleto', 'total_contrato', 'abonado_previo', 'boletos', 'nombre']) {
      const val = eq(u, campo);
      if (val !== null) f = f.filter((x) => String(x[campo] == null ? '' : x[campo]) === val);
      else if (esNull(u, campo)) f = f.filter((x) => x[campo] == null);
    }
    if (m === 'PATCH') {
      const b = JSON.parse(init.body);
      const reg = { tabla: 'viajeros_evento', op: 'PATCH', parche: b, filas: f.length };
      DB.escrituras.push(reg); TODAS.push(reg);
      f.forEach((x) => Object.assign(x, b));
      return resp(200, f);
    }
    return resp(200, f);
  }
  // Kamisama: sin pedido cargado (el caso de los 60 ciegos). Así el aviso de
  // inventario sale como «no se pudo medir», que es la verdad.
  if (u.includes('/rest/v1/compras') || u.includes('/rest/v1/stock_ajustes')) return resp(200, []);
  return resp(200, []);
};

const vFila = (n, extra) => Object.assign({
  id: U(n), evento_id: 'coronacapital#0', nombre: 'Frida Ruiz', correo: 'frida@x.mx', celular: '8112345678',
  tipo_paquete: 'cheap', zona_boleto: 'General', boletos: 1,
  total_contrato: 3900, abonado_previo: 1528, notas: 'migrada 28-ago',
  habitacion_id: null, grupo_viaje: null, portal_revisado_at: '2026-10-28T00:00:00Z', tipo_viajero: 'cliente',
}, extra || {});

const semilla = () => {
  DB = {
    escrituras: [],
    v: [
      vFila(1),                                                        // publicada, con correo
      vFila(2, { portal_revisado_at: null, nombre: 'Sin Publicar' }),  // SIN sello
      vFila(3, { habitacion_id: U(90), grupo_viaje: U(91), nombre: 'Con Cuarto' }),
      vFila(4, { evento_id: 'otroevento', nombre: 'De Otro Tour' }),
    ],
    abonos: [{ viajero_id: U(1), monto: 336 }, { viajero_id: U(1), monto: 337 },
             { viajero_id: U(3), monto: 500 }],
  };
  RESEND = [];
  CATALOGO_CAIDO = false;
};

const llamar = async (b) => {
  for (const k of Object.keys(require.cache)) if (k.includes('/netlify/functions/')) delete require.cache[k];
  const H = require(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js')).handler;
  const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  const jw = jwtSign({ id: 'u-bulma', rol: 'bulma', correo: 'bulma@x.mx', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
  const r = await H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jw }, body: JSON.stringify(b) });
  return { s: r.statusCode, j: JSON.parse(r.body || '{}') };
};
const de = (n) => DB.v.find((x) => x.id === U(n));

(async () => {
  console.log('\nCAREO VIAJERO-EDITA-1 + VIAJERO-MUDAR-1 · por el handler REAL\n');

  // ── [P] LAS ACCIONES EXISTEN PARA EL DESPACHO ──────────────────────────────
  // La ley de RAD-FIX-CAMINO: una acción que no está en `ACCIONES` la rechaza
  // el portero ANTES de llegar al código, y el careo que la llamara a mano
  // mediría una función que nadie puede alcanzar.
  console.log('[P] el portero conoce las tres acciones');
  {
    const src = require('fs').readFileSync(path.join(RAIZ, 'netlify/functions/admin-coordi-asignaciones.js'), 'utf8');
    const decl = src.slice(src.indexOf('const ACCIONES'), src.indexOf('const BUCKET_ABONOS'));
    for (const a of ['viajero_editar_full', 'viajero_mudar_fecha', 'fechas_de_evento']) {
      af(decl.includes(a + ':'), `«${a}» está declarada en ACCIONES`);
    }
  }

  // ── [E] ✏️ CORREGIR ────────────────────────────────────────────────────────
  console.log('\n[E] el editor que faltaba');
  semilla();
  {
    const r = await llamar({ accion: 'viajero_editar_full', id: U(1), campos: { total_contrato: 5985, zona_boleto: 'General', boletos: 1 } });
    af(r.s === 200 && r.j.ok, 'corrige el total de una fila PUBLICADA (el hueco que no existía)' + (r.s !== 200 ? ' → ' + JSON.stringify(r.j) : ''));
    af(de(1).total_contrato === 5985, 'el total quedó en 5985, no ' + de(1).total_contrato);
    af(/\[EDITA /.test(de(1).notas) && /total \$3900 → \$5985/.test(de(1).notas), 'la nota ANEXA el cambio con su fecha: ' + String(de(1).notas).slice(-70));
    af(/migrada 28-ago/.test(de(1).notas), 'la nota original NO se pisó (es la procedencia)');
    af((r.j.cambios || []).length === 1, 'solo reporta el campo que DE VERDAD cambió (zona y lugares iguales no cuentan): ' + JSON.stringify(r.j.cambios));
  }
  {
    // 🔒 El 2º clic con el valor VIEJO en el filtro → 409 y cero escrituras.
    const antes = DB.escrituras.length;
    const r = await llamar({ accion: 'viajero_editar_full', id: U(1), campos: { total_contrato: 5985 } });
    af(r.s === 400 && /no cambiaste nada/i.test(r.j.error || ''), 'el 2º clic idéntico se rehúsa («no cambiaste nada»), no re-escribe: ' + r.s);
    af(DB.escrituras.length === antes, 'y escribió ' + (DB.escrituras.length - antes) + ' veces (debe ser 0)');
  }
  {
    const r = await llamar({ accion: 'viajero_editar_full', id: U(1), campos: { zona_boleto: 'Zona Inventada' } });
    af(r.s === 400 && /no es zona de/i.test(r.j.error || ''), 'LA PUERTA rechaza una zona que la ficha no tiene: ' + (r.j.error || '').slice(0, 60));
    af(/General/.test(r.j.error || ''), 'y NOMBRA las de la ficha en el error (si no, manda a adivinar)');
  }
  {
    // ⚠️ El caso se siembra en #2 —la fecha que SÍ tiene «Comfort»— y sobre una
    // zona DISTINTA de la actual. Mi primera versión tecleaba «  general  »
    // sobre quien ya estaba en «General»: canonizaba bien, pero no producía un
    // cambio, así que el handler contestaba «no cambiaste nada» (correcto) y el
    // careo lo leyó como defecto. Un caso donde el resultado coincide con el
    // estado inicial no distingue «canonizó» de «no hizo nada».
    DB.v.push(vFila(6, { evento_id: 'coronacapital#2', nombre: 'Para Canonizar', zona_boleto: 'General' }));
    const r = await llamar({ accion: 'viajero_editar_full', id: U(6), campos: { zona_boleto: '  comfort  ' } });
    af(r.s === 200 && de(6).zona_boleto === 'Comfort', 'una zona mal escrita se guarda CANÓNICA («  comfort  » → «Comfort»): ' + de(6).zona_boleto);
    af(/como la ficha/i.test(r.j.zona_aviso || ''), 'y LO DICE en vez de corregir en silencio: ' + (r.j.zona_aviso || '—'));
  }
  {
    const r = await llamar({ accion: 'viajero_editar_full', id: U(1), campos: { correo: 'otro@x.mx' } });
    af(r.s === 400 && /no editable/i.test(r.j.error || ''), 'un campo de CONTACTO se rehúsa aquí (ésa es `viajero_editar`): ' + (r.j.error || '').slice(0, 50));
  }
  {
    const r = await llamar({ accion: 'viajero_editar_full', id: U(1), campos: { evento_id: 'coronacapital#2' } });
    af(r.s === 400 && /no editable/i.test(r.j.error || ''), '🔒 y NO se puede mover de evento por aquí (eso es la mudanza, que re-valida la zona)');
  }
  {
    const r = await llamar({ accion: 'viajero_editar_full', id: U(1), campos: { total_contrato: null } });
    af(r.s === 400 && /no puede quedar vac/i.test(r.j.error || ''), 'el total NO puede quedar vacío: ' + (r.j.error || '').slice(0, 50));
  }
  {
    // «Sin capturar» y «$0» son cosas distintas: el pagado-antes SÍ puede ir a 0.
    const r = await llamar({ accion: 'viajero_editar_full', id: U(1), campos: { abonado_previo: 0 } });
    af(r.s === 200 && Number(de(1).abonado_previo) === 0, 'el «pagado antes» SÍ puede ir a $0 (no es lo mismo que vacío): ' + de(1).abonado_previo);
  }
  {
    const r = await llamar({ accion: 'viajero_editar_full', id: U(1), campos: { boletos: 0 } });
    af(r.s === 400 && /lugares inv/i.test(r.j.error || ''), 'cero lugares se rehúsa (una fila sin lugares no es nadie)');
  }
  {
    // 🔒 EL DINERO YA PAGADO NO SE TOCA NUNCA: el editor no escribe abonos.
    const antes = JSON.stringify(DB.abonos);
    await llamar({ accion: 'viajero_editar_full', id: U(1), campos: { total_contrato: 4000 } });
    af(JSON.stringify(DB.abonos) === antes, '🔒 los ABONOS quedan intactos: un pago nuevo es ➕ Abono, no un número tecleado');
    const escrituras = DB.escrituras.filter((e) => e.tabla !== 'viajeros_evento');
    af(escrituras.length === 0, 'y no escribió en ninguna otra tabla: ' + JSON.stringify(escrituras.map((e) => e.tabla)));
  }

  // ── [A] EL AVISO · nace APAGADO y se rehúsa sin publicar ───────────────────
  console.log('\n[A] el aviso al cliente');
  semilla();
  {
    await llamar({ accion: 'viajero_editar_full', id: U(1), campos: { total_contrato: 5985 } });
    af(RESEND.length === 0, '🔒 SIN pedirlo no sale NINGÚN correo (la casilla nace apagada): salieron ' + RESEND.length);
  }
  {
    // 🔒 CONTROL POSITIVO del contador: si pidiéndolo tampoco saliera, el cero
    // de arriba no probaría nada — sería un contador ciego.
    const r = await llamar({ accion: 'viajero_editar_full', id: U(1), campos: { total_contrato: 6000 }, avisar: true });
    af(RESEND.length === 1, '🔒 CONTROL POSITIVO: pidiéndolo SÍ sale uno (el contador no está ciego): ' + RESEND.length);
    af(r.j.aviso && r.j.aviso.ok === true, 'y el handler reporta que salió: ' + JSON.stringify(r.j.aviso));
    const c = RESEND[0] || {};
    af(/Actualizamos tu viaje/.test(c.subject || ''), 'el asunto dice que se actualizó su viaje: ' + c.subject);
    af(/Corona Capital/.test(c.html || ''), 'el nombre del evento se DERIVA del catálogo, no se teclea');
    af(/total \$5985 → \$6000/.test(c.html || ''), 'el correo dice EXACTAMENTE lo que el PATCH escribió (la misma frase de la nota)');
    // El dinero por `saldoMigrado`: total 6000 − previo 1528 − abonos 673.
    af(/\$6,000/.test(c.html || '') && /\$2,201/.test(c.html || '') && /\$3,799/.test(c.html || ''),
      'y trae total · pagado · falta contados por saldoMigrado (6,000 · 2,201 · 3,799)');
  }
  {
    // 🔒 Y SE REHÚSA SOBRE UN VIAJE SIN PUBLICAR: el correo lleva botón «Ver mi
    // plan» y sin sello el Portal contesta «estamos revisando». Es la lección
    // de PRV-EDITA-1a cerrada por delante.
    const antes = RESEND.length;
    const r = await llamar({ accion: 'viajero_editar_full', id: U(2), campos: { total_contrato: 4100 }, avisar: true });
    af(r.s === 200 && r.j.ok, 'la corrección de un viaje SIN publicar sí se guarda');
    af(RESEND.length === antes, '🔒 pero NO se le manda correo: ' + (RESEND.length - antes) + ' correos');
    af(r.j.aviso && r.j.aviso.ok === false && /no está publicado/i.test(r.j.aviso.aviso || ''), 'y la pantalla DICE por qué: ' + ((r.j.aviso || {}).aviso || '—'));
    af(r.j.publicado === false, 'el payload rotula que no está publicado (para que el botón ni se ofrezca)');
  }
  {
    // Sin correo no hay a quién: se DICE para que la pantalla ofrezca WhatsApp.
    DB.v.push(vFila(5, { correo: null, nombre: 'Sin Correo' }));
    const antes = RESEND.length;
    const r = await llamar({ accion: 'viajero_editar_full', id: U(5), campos: { total_contrato: 4200 }, avisar: true });
    af(RESEND.length === antes && r.j.aviso && /no tiene correo/i.test(r.j.aviso.aviso || ''), 'sin correo lo DICE y manda a WhatsApp: ' + ((r.j.aviso || {}).aviso || '—'));
  }

  // ── [M] 📅 MOVER DE FECHA ──────────────────────────────────────────────────
  console.log('\n[M] mover de fecha (el caso de Frida, hecho botón)');
  semilla();
  {
    const r = await llamar({ accion: 'fechas_de_evento', evento_id: 'coronacapital#0' });
    af(r.s === 200 && (r.j.fechas || []).length === 3, 'las fechas se DERIVAN de la ficha: ' + (r.j.fechas || []).length + ' (se esperaban 3)');
    const f2 = (r.j.fechas || [])[2] || {};
    af(f2.evento_id === 'coronacapital#2' && /Vie \+ S/.test(f2.etiqueta || ''), 'con su etiqueta de la ficha: ' + f2.etiqueta);
    af(JSON.stringify(f2.zonas || []) === JSON.stringify(['General', 'Comfort']),
      '🔒 y las zonas son LAS DE ESA FECHA, no el universo del evento: ' + JSON.stringify(f2.zonas));
  }
  {
    const antesAbonos = JSON.stringify(DB.abonos);
    const r = await llamar({ accion: 'viajero_mudar_fecha', id: U(1), destino: 'coronacapital#2', zona_boleto: 'General', total_contrato: 5985, motivo: 'son 2 días' });
    af(r.s === 200 && r.j.ok, 'mueve de #0 a #2' + (r.s !== 200 ? ' → ' + JSON.stringify(r.j) : ''));
    af(de(1).evento_id === 'coronacapital#2', 'la fila quedó en coronacapital#2: ' + de(1).evento_id);
    af(Number(de(1).total_contrato) === 5985, 'el total se movió a 5985 porque Bulma lo tecleó: ' + de(1).total_contrato);
    // 🔒 EL CANDADO CENTRAL DE ESTA TUERCA.
    af(Number(de(1).abonado_previo) === 1528, '🔒 EL DINERO NO SE TOCÓ: abonado_previo sigue en 1528 (' + de(1).abonado_previo + ')');
    af(JSON.stringify(DB.abonos) === antesAbonos, '🔒 y sus abonos viajaron solos, sin una escritura (llavean por viajero_id)');
    af(/\[MUDANZA /.test(de(1).notas) && /coronacapital#0 → coronacapital#2/.test(de(1).notas), 'la nota anexa de dónde a dónde: ' + String(de(1).notas).slice(-120));
    af(/son 2 días/.test(de(1).notas), 'y el motivo que escribió Bulma');
    af(/dinero INTACTO/.test(de(1).notas), 'y deja dicho en la fila que el dinero no se movió');
  }
  {
    // 🔒 Valor esperado: SIGUE en el origen. El 2º clic no mueve a nadie dos veces.
    const r = await llamar({ accion: 'viajero_mudar_fecha', id: U(1), destino: 'coronacapital#2', zona_boleto: 'General' });
    af(r.s === 400 && /ya está en esa fecha/i.test(r.j.error || ''), 'el 2º clic al mismo destino se rehúsa: ' + (r.j.error || '').slice(0, 50));
  }
  semilla();
  {
    const r = await llamar({ accion: 'viajero_mudar_fecha', id: U(1), destino: 'otroevento', zona_boleto: 'Pista' });
    af(r.s === 400 && /MISMO evento/i.test(r.j.error || ''), '🔒 a OTRO evento se rehúsa (eso es el traspaso de Yamcha): ' + (r.j.error || '').slice(0, 60));
    af(de(1).evento_id === 'coronacapital#0', 'y nadie se movió: ' + de(1).evento_id);
  }
  {
    const r = await llamar({ accion: 'viajero_mudar_fecha', id: U(1), destino: 'coronacapital#9', zona_boleto: 'General' });
    af(r.s === 400 && /no es una fecha/i.test(r.j.error || ''), 'una fecha que la ficha NO tiene se rehúsa: ' + (r.j.error || '').slice(0, 60));
  }
  {
    // 🔒 La zona se valida contra la ficha de LA FECHA DESTINO. «Comfort» solo
    // existe en #2: pedirla en #1 tiene que rebotar. Sin esto nacería un
    // huérfano de zona, el defecto que CHATARRA-REGLA-1 acabó de pagar.
    const r = await llamar({ accion: 'viajero_mudar_fecha', id: U(1), destino: 'coronacapital#1', zona_boleto: 'Comfort' });
    af(r.s === 400 && /no es zona del/i.test(r.j.error || ''), '🔒 una zona que NO existe en la fecha destino rebota: ' + (r.j.error || '').slice(0, 70));
    af(/General/.test(r.j.error || ''), 'y nombra las de ESA fecha: ' + (r.j.error || '').slice(-40));
    af(de(1).evento_id === 'coronacapital#0', 'y nadie se movió');
  }
  {
    // 🔒 CONTROL POSITIVO de la aserción anterior: la MISMA zona en la fecha
    // donde SÍ existe tiene que pasar. Sin esta mitad, «rebota» no distingue
    // «la puerta funciona» de «la puerta rechaza todo».
    const r = await llamar({ accion: 'viajero_mudar_fecha', id: U(1), destino: 'coronacapital#2', zona_boleto: 'Comfort' });
    af(r.s === 200 && de(1).zona_boleto === 'Comfort', '🔒 CONTROL POSITIVO: «Comfort» SÍ pasa en #2, donde la ficha la tiene');
  }
  semilla();
  {
    // Los satélites de la fecha vieja se sueltan Y SE DICEN.
    const r = await llamar({ accion: 'viajero_mudar_fecha', id: U(3), destino: 'coronacapital#2', zona_boleto: 'General' });
    af(r.s === 200 && de(3).habitacion_id === null, 'suelta la habitación (era de la fecha vieja): ' + de(3).habitacion_id);
    af(de(3).grupo_viaje === null, 'suelta el grupo «viaja con»');
    af((r.j.sueltos || []).length === 2, 'y los NOMBRA los dos en la respuesta: ' + JSON.stringify(r.j.sueltos));
    af(/se soltó/.test(de(3).notas), 'y queda escrito en su fila');
  }
  semilla();
  {
    // Sin teclear total, el total se queda Y SE AVISA de que el precio del día
    // puede ser otro. Un total que se moviera solo se comería un descuento.
    const r = await llamar({ accion: 'viajero_mudar_fecha', id: U(1), destino: 'coronacapital#2', zona_boleto: 'General' });
    af(r.s === 200 && Number(de(1).total_contrato) === 3900, '🔒 sin teclear total, el total NO se mueve solo: ' + de(1).total_contrato);
    af(/puede ser otro/.test(r.j.total_aviso || ''), 'y la pantalla AVISA de que el precio del día nuevo puede diferir: ' + (r.j.total_aviso || '—'));
  }
  semilla();
  {
    CATALOGO_CAIDO = true;
    const r = await llamar({ accion: 'viajero_mudar_fecha', id: U(1), destino: 'coronacapital#2', zona_boleto: 'General' });
    af(r.s === 502 && /no muevo a nadie a ciegas/i.test(r.j.error || ''), '🔒 catálogo ilegible → NO mueve a nadie: ' + (r.j.error || '').slice(0, 55));
    af(de(1).evento_id === 'coronacapital#0', 'y la fila quedó donde estaba');
    const r2 = await llamar({ accion: 'fechas_de_evento', evento_id: 'coronacapital#0' });
    af(r2.j.fechas === null && /catálogo/i.test(r2.j.motivo || ''), 'y la lista de fechas devuelve NULL con su motivo, no una lista vacía: ' + (r2.j.motivo || '—'));
    CATALOGO_CAIDO = false;
  }

  // ── [C] CARDINALIDAD DEL PROPIO ARNÉS ─────────────────────────────────────
  console.log('\n[C] control del instrumento');
  af(TODAS.length > 0, 'la red falsa VIO escrituras en la corrida (' + TODAS.length + '): si fueran 0, los candados de «no escribió» pasarían en vacío');
  af(TODAS.every((e) => e.op !== 'DELETE'), 'cero DELETEs en toda la corrida');

  console.log('\n' + '─'.repeat(46));
  console.log(R === 0 ? `✅ VERDE · ${V} aserciones en verde, 0 en rojo`
                      : `❌ ROJO · ${V} en verde, ${R} en rojo`);
  if (V === 0) console.log('⚠️ NADA MEDIDO · esto NO es un verde');
  process.exit(R === 0 && V > 0 ? 0 : 1);
})().catch((e) => { console.error('\n❌ EL ARNÉS SE CAYÓ:', e); process.exit(1); });

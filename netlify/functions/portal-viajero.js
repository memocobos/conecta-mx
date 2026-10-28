// =============================================================================
// portal-viajero  (PORTAL-EDIT-1 — lo que el cliente PUEDE hacer con su viaje)
// =============================================================================
// Dos acciones, las dos sobre filas de `viajeros_evento` (KameHouse) que son
// SUYAS — y «suyas» se decide igual que en portal-mi-plan-migrado: por el correo
// VERIFICADO del propio JWT, en minúsculas de los dos lados. Nunca por un id que
// el navegador diga que es suyo sin comprobarlo.
//
//   · `editar`          → nombre, celular, talla, número, nombre y parentesco de emergencia.
//                         DIRECTO a la lista del evento (no mueven dinero).
//   · `solicitar_cambio`→ hotel / zona / fecha / otro: NO se cambia nada; nace una
//                         fila en `cambios_viajero` que cae a la bandeja de
//                         Bulma/Milk. Mueve precio y contrato: lo decide un humano
//                         (el rumbo: «nada automático decide dinero»).
//   · `repartir`        → [ACOMP-2] el titular de una fila con VARIOS lugares
//                         les da ficha propia a sus acompañantes (nombre +
//                         correo). Cada uno nace como viajero de 1 lugar, con
//                         su parte del contrato y de lo ya pagado AL PESO, en
//                         el mismo grupo de viaje, y con su correo propio
//                         recibe su invitación al Portal. El TOTAL del dinero
//                         no se mueve: solo se reparte entre las filas.
//
// 🔒 Lo que JAMÁS se toca desde aquí: correo (es la llave de la cuenta), evento,
// paquete, zona, boletos, contrato, abonos. Cualquier otro campo del cuerpo se
// IGNORA, no se rechaza: una página vieja que mande de más no tumba el guardado.
//
// POST (Authorization: Bearer <jwt del Portal>) { accion, viajero_id, ... }
// Env: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_ANON_KEY, SUPABASE_URL_KAMEHOUSE,
//      SUPABASE_SERVICE_KEY_KAMEHOUSE.
// =============================================================================
const { tallaNormalizada } = require('./_lib/correo-forma');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS = ['hotel', 'zona', 'fecha', 'otro'];
const MAX_PENDIENTES = 3; // por viajero: un buzón, no un chat

function json(status, headers, body) { return { statusCode: status, headers, body: JSON.stringify(body) }; }

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, headers, { ok: false, error: 'Solo POST' });

  const PT_URL = process.env.PORTAL_SUPABASE_URL;
  const PT_ANON = process.env.PORTAL_SUPABASE_ANON_KEY;
  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!PT_URL || !PT_ANON || !KH_URL || !KH_KEY) return json(500, headers, { ok: false, error: 'Faltan env vars' });

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return json(401, headers, { ok: false, error: 'Inicia sesión otra vez' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return json(400, headers, { ok: false, error: 'Cuerpo inválido' }); }
  const accion = String(body.accion || '');
  if (!['editar', 'solicitar_cambio', 'repartir', 'opciones_paquete', 'pedir_paquete'].includes(accion)) return json(400, headers, { ok: false, error: 'Acción desconocida' });
  const viajero_id = String(body.viajero_id || '');
  if (!UUID_RE.test(viajero_id)) return json(400, headers, { ok: false, error: 'Viajero inválido' });

  // ── 1 · Quién es (JWT del Portal, correo VERIFICADO) ─────────────────────
  let user;
  try {
    const r = await fetch(`${PT_URL}/auth/v1/user`, { headers: { apikey: PT_ANON, Authorization: 'Bearer ' + jwt } });
    if (!r.ok) return json(401, headers, { ok: false, error: 'Tu sesión venció: entra otra vez' });
    user = await r.json();
  } catch (e) { return json(502, headers, { ok: false, error: 'No pude validar tu sesión' }); }
  const correo = (user && typeof user.email === 'string') ? user.email.trim().toLowerCase() : '';
  if (!correo || !user.email_confirmed_at) return json(403, headers, { ok: false, error: 'Confirma tu correo para poder editar' });

  // ── 2 · La fila, y que sea SUYA ──────────────────────────────────────────
  const hKH = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
  let v;
  try {
    const r = await fetch(`${KH_URL}/rest/v1/viajeros_evento?id=eq.${viajero_id}&select=id,evento_id,nombre,correo,celular,tipo_paquete,zona_boleto,portal_revisado_at&limit=1`, { headers: hKH });
    if (!r.ok) return json(502, headers, { ok: false, error: 'No pude leer tu viaje' });
    v = (await r.json())[0];
  } catch (e) { return json(502, headers, { ok: false, error: 'No pude leer tu viaje' }); }
  // 🔒 Inexistente y ajena contestan LO MISMO: no se le confirma a nadie que un
  // id existe si no es suyo.
  if (!v || String(v.correo == null ? '' : v.correo).trim().toLowerCase() !== correo) {
    return json(404, headers, { ok: false, error: 'No encontramos ese viajero en tu cuenta' });
  }
  // 🔒 [PORTAL-SOLO-1] Una fila SIN revisar no se toca desde el Portal (ni se
  // edita, ni se reparte, ni elige paquete): el cliente ni siquiera la ve hasta
  // que Bulma/Milk/Memo la revisan. Contesta IGUAL que ajena/inexistente.
  if (!v.portal_revisado_at) {
    return json(404, headers, { ok: false, error: 'No encontramos ese viajero en tu cuenta' });
  }

  // ── 3p · [PREVENTA-PORTAL-1] ELEGIR MI PAQUETE (los de la preventa) ──────
  // Palabra de Memo (27-oct): «que ahí mismo en un wizard puedan solicitar su
  // zona y llegue a KameHouse y así acepten». NO cambia nada: nace una fila
  // `cambios_viajero` tipo 'paquete' con la elección ESTRUCTURADA y su precio de
  // lista; Bulma/Milk la aplican desde la bandeja (ahí nace el contrato).
  // Opción firmada: «solo eligen» — sus $300 ya cuentan como pago.
  if (accion === 'opciones_paquete' || accion === 'pedir_paquete') {
    const op = require('./_lib/opciones-paquete');
    if (!op.enPreventa(v)) return json(409, headers, { ok: false, error: 'Tu lugar ya tiene paquete. Si quieres cambiarlo, usa «Pedir un cambio».', ya: true });
    // ¿Ya eligió? Una elección pendiente a la vez (también lo cuida un índice único).
    let pend = null;
    try {
      const p = await fetch(`${KH_URL}/rest/v1/cambios_viajero?viajero_id=eq.${viajero_id}&tipo=eq.paquete&estado=eq.pendiente&select=id,paquete_pedido,zona_pedida,hotel_pedido,precio_lista,creado_en&limit=1`, { headers: hKH });
      if (!p.ok) return json(502, headers, { ok: false, error: 'No pude revisar tu elección' });
      pend = (await p.json())[0] || null;
    } catch (_) { return json(502, headers, { ok: false, error: 'No pude revisar tu elección' }); }

    if (accion === 'opciones_paquete') {
      if (pend) return json(200, headers, { ok: true, pendiente: pend });
      const o = await op.opcionesPaquete(v.evento_id);
      if (!o.ok) return json(200, headers, { ok: false, error: o.motivo });
      // [PREVENTA-PORTAL-2] Si su elección anterior no procedió, el Portal lo DICE
      // con el motivo del equipo (el mismo que le llegó por correo).
      let rechazada = null;
      try {
        const rr = await fetch(`${KH_URL}/rest/v1/cambios_viajero?viajero_id=eq.${viajero_id}&tipo=eq.paquete&estado=eq.rechazada&order=atendida_at.desc&limit=1&select=paquete_pedido,zona_pedida,respuesta,atendida_at`, { headers: hKH });
        if (rr.ok) rechazada = (await rr.json())[0] || null;
      } catch (_) { /* sin el aviso: las opciones siguen */ }
      return json(200, headers, { ok: true, evento: o.evento, paquetes: o.paquetes, rechazada });
    }

    if (pend) return json(409, headers, { ok: false, error: 'Ya enviaste tu elección: el equipo la está revisando.', pendiente: pend });
    const e = await op.validarEleccion(v.evento_id, { paquete: body.paquete, zona: body.zona, hotel: body.hotel });
    if (!e.ok) return json(400, headers, { ok: false, error: e.motivo });
    const detalle = `Elige ${e.nombre}${e.zona ? ' · zona ' + e.zona : ''}${e.hotel ? ' · ' + e.hotel : ''} · precio de lista $${e.precio.toLocaleString('es-MX')} por persona (sus $300 de preventa ya están abonados)`;
    const fila = { viajero_id, evento_id: v.evento_id, correo, nombre: v.nombre || null, tipo: 'paquete', detalle,
      paquete_pedido: e.paquete, zona_pedida: e.zona, hotel_pedido: e.hotel, precio_lista: e.precio };
    const r = await fetch(`${KH_URL}/rest/v1/cambios_viajero`, {
      method: 'POST',
      headers: Object.assign({}, hKH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(fila),
    });
    if (r.status === 409) return json(409, headers, { ok: false, error: 'Ya enviaste tu elección: el equipo la está revisando.' });
    if (!r.ok) return json(502, headers, { ok: false, error: 'No pude enviar tu elección. Inténtalo otra vez.' });
    return json(200, headers, { ok: true, solicitud: 'pendiente', eleccion: { paquete: e.paquete, zona: e.zona, hotel: e.hotel, precio: e.precio } });
  }

  // ── 3r · [ACOMP-2] REPARTIR LUGARES A LOS ACOMPAÑANTES ─────────────────
  if (accion === 'repartir') {
    const r = await repartir({ body, viajero_id, correo, KH_URL, KH_KEY, hKH });
    return json(r.status, headers, r.body);
  }

  // ── 3a · EDITAR ──────────────────────────────────────────────────────────
  if (accion === 'editar') {
    const c = body.campos || {};
    const cambios = {};
    if (c.nombre !== undefined) {
      const n = String(c.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      if (n.length < 2) return json(400, headers, { ok: false, error: 'Escribe el nombre completo' });
      cambios.nombre = n;
    }
    if (c.celular !== undefined) {
      const d = String(c.celular || '').replace(/\D/g, '');
      if (d.length !== 10) return json(400, headers, { ok: false, error: 'El WhatsApp va a 10 dígitos' });
      cambios.celular = d;
    }
    if (c.talla_playera !== undefined) {
      const t = tallaNormalizada(c.talla_playera);
      if (!t) return json(400, headers, { ok: false, error: 'Elige una talla de XS a XXL' });
      cambios.talla_playera = t;
    }
    if (c.num_emergencia !== undefined) {
      const d = String(c.num_emergencia || '').replace(/\D/g, '');
      if (d.length !== 10) return json(400, headers, { ok: false, error: 'El número de emergencia va a 10 dígitos' });
      const cel = cambios.celular || String(v.celular || '').replace(/\D/g, '');
      if (cel && d === cel) return json(400, headers, { ok: false, error: 'El número de emergencia tiene que ser de otra persona' });
      cambios.num_emergencia = d;
    }
    if (c.emergencia_nombre !== undefined) {
      const n = String(c.emergencia_nombre || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      if (n && n.length < 2) return json(400, headers, { ok: false, error: 'Escribe el nombre de tu contacto de emergencia' });
      cambios.emergencia_nombre = n || null;
    }
    // [PARENTESCO-1] «mamá, pareja, hermano…» — llega a la lista del coordi.
    if (c.emergencia_parentesco !== undefined) {
      const n = String(c.emergencia_parentesco || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      if (n && n.length < 2) return json(400, headers, { ok: false, error: 'Escribe el parentesco (mamá, pareja, hermano…)' });
      cambios.emergencia_parentesco = n || null;
    }
    if (!Object.keys(cambios).length) return json(400, headers, { ok: false, error: 'No hay nada que guardar' });
    cambios.editado_portal_at = new Date().toISOString();
    // 🔒 El PATCH vuelve a exigir el correo (ilike solo estrecha; la fila ya se
    // comprobó arriba por igualdad exacta). Así una carrera no escribe en otra.
    const r = await fetch(`${KH_URL}/rest/v1/viajeros_evento?id=eq.${viajero_id}&correo=ilike.${encodeURIComponent(correo)}`, {
      method: 'PATCH',
      headers: Object.assign({}, hKH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(cambios),
    });
    if (!r.ok) return json(502, headers, { ok: false, error: 'No se pudo guardar. Inténtalo otra vez.' });
    const filas = await r.json().catch(() => []);
    if (!Array.isArray(filas) || filas.length !== 1) return json(409, headers, { ok: false, error: 'No se pudo guardar. Recarga e inténtalo otra vez.' });
    return json(200, headers, { ok: true, guardado: Object.keys(cambios).filter((k) => k !== 'editado_portal_at') });
  }

  // ── 3b · SOLICITAR UN CAMBIO (hotel / zona / fecha / otro) ───────────────
  const tipo = String(body.tipo || '');
  if (!TIPOS.includes(tipo)) return json(400, headers, { ok: false, error: 'Elige qué quieres cambiar' });
  const detalle = String(body.detalle || '').trim().replace(/\s+/g, ' ').slice(0, 600);
  if (detalle.length < 3) return json(400, headers, { ok: false, error: 'Cuéntanos qué cambio necesitas' });
  try {
    const p = await fetch(`${KH_URL}/rest/v1/cambios_viajero?viajero_id=eq.${viajero_id}&estado=eq.pendiente&select=id&limit=${MAX_PENDIENTES + 1}`, { headers: hKH });
    if (!p.ok) return json(502, headers, { ok: false, error: 'No pude registrar tu solicitud' });
    if ((await p.json()).length >= MAX_PENDIENTES) {
      return json(429, headers, { ok: false, error: 'Ya tienes solicitudes pendientes: el equipo te contacta por WhatsApp' });
    }
  } catch (e) { return json(502, headers, { ok: false, error: 'No pude registrar tu solicitud' }); }
  const fila = { viajero_id, evento_id: v.evento_id, correo, nombre: v.nombre || null, tipo, detalle };
  const r = await fetch(`${KH_URL}/rest/v1/cambios_viajero`, {
    method: 'POST',
    headers: Object.assign({}, hKH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(fila),
  });
  if (!r.ok) return json(502, headers, { ok: false, error: 'No pude registrar tu solicitud' });
  return json(200, headers, { ok: true, solicitud: 'pendiente' });
};

// =============================================================================
// [ACOMP-2] repartir — el titular le da su ficha a cada acompañante.
// =============================================================================
// Palabra de Memo (13-oct): «que ella anote los datos y correo de las amigas y
// con los correos reciban su propia invitación al portal y llenar datos y tener
// su propia ficha». Nace para las requisiciones de ANTES de ACOMP-1 (Karina:
// un viajero con 3 lugares) y para cualquier fila de varios lugares.
//
// EL DINERO SE REPARTE, NO SE CREA NI SE PIERDE (la forma de ACOMP-1):
//   · contrato: cada acompañante recibe floor(total / lugares); el titular se
//     queda con el resto — la suma cuadra AL PESO con el contrato original.
//   · pagado: cada acompañante recibe floor(cobrado / lugares) como un abono
//     NUEVO con la nota «pagado por {titular}»; esa misma cantidad se le QUITA
//     al titular — primero de su `abonado_previo`, luego de sus abonos (de
//     mayor a menor), cada PATCH con su VALOR ESPERADO en el filtro y la razón
//     ANEXADA a la nota. Cero DELETEs; una fila de abono puede quedar en $0
//     (el CHECK es monto >= 0) y su nota dice a dónde se fue.
//
// EL ORDEN ES PARTE DEL CANDADO:
//   1. reclamar al titular (boletos/contrato con su valor esperado: un doble
//      clic o una carrera escribe CERO filas y contesta 409);
//   2. nacen los acompañantes (un solo POST: o nacen todos o ninguno — si
//      fallan, el reclamo se REVIERTE);
//   3. el dinero: se quita primero y se pone después; si poner falla, se
//      intenta devolver lo quitado y la respuesta lo DICE (jamás dinero inflado);
//   4. el correo único con su invitación, SOLO a los correos distintos del
//      titular (el titular ya tiene su Portal y ve las filas que van a su
//      correo). El correo jamás tumba el reparto.
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
async function repartir({ body, viajero_id, correo, KH_URL, KH_KEY, hKH }) {
  const bad = (m, st) => ({ status: st || 400, body: { ok: false, error: m } });
  const H = (extra) => Object.assign({}, hKH, { 'Content-Type': 'application/json' }, extra || {});
  const VE = `${KH_URL}/rest/v1/viajeros_evento`;
  const AB = `${KH_URL}/rest/v1/abonos_viajero`;

  let t;
  try {
    const r = await fetch(`${VE}?id=eq.${viajero_id}&select=id,evento_id,nombre,correo,boletos,total_contrato,abonado_previo,tipo_paquete,zona_boleto,tipo_viajero,grupo_viaje,notas&limit=1`, { headers: hKH });
    if (!r.ok) return bad('No pude leer tu viaje', 502);
    t = (await r.json())[0];
  } catch (_) { return bad('No pude leer tu viaje', 502); }
  if (!t) return bad('No encontramos ese viajero en tu cuenta', 404);
  const B = Number(t.boletos) || 1;
  if (B < 2) return bad('Este registro es de un solo lugar: no hay acompañantes que agregar');

  // Los acompañantes que mandó (renglones vacíos se ignoran: puede repartir
  // solo algunos lugares hoy y los demás después).
  const crudos = Array.isArray(body.acompanantes) ? body.acompanantes : [];
  const acomp = [];
  for (const a of crudos) {
    const nombre = String((a && a.nombre) || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const c = String((a && a.correo) || '').trim().toLowerCase();
    const cel = String((a && a.celular) || '').replace(/\D/g, '');
    if (!nombre && !c && !cel) continue;
    if (nombre.length < 2) return bad('Escribe el nombre completo de cada acompañante');
    if (c && !CORREO_RE.test(c)) return bad(`El correo de ${nombre} no parece válido`);
    if (cel && cel.length !== 10) return bad(`El WhatsApp de ${nombre} va a 10 dígitos`);
    acomp.push({ nombre, correo: c || correo, celular: cel || null });
  }
  const k = acomp.length;
  if (!k) return bad('Escribe al menos un acompañante');
  if (k > B - 1) return bad(`Tu registro tiene ${B} lugares: puedes agregar hasta ${B - 1} acompañante${B - 1 === 1 ? '' : 's'}`);

  // El dinero de la fila, contado por el MISMO dueño que el Portal.
  let abonos = [];
  try {
    const r = await fetch(`${AB}?viajero_id=eq.${viajero_id}&select=id,monto,fecha,nota,foto_path&order=monto.desc&limit=500`, { headers: hKH });
    if (!r.ok) return bad('No pude leer tus pagos', 502);
    abonos = await r.json();
  } catch (_) { return bad('No pude leer tus pagos', 502); }
  const T = t.total_contrato == null ? null : Math.round(Number(t.total_contrato));
  const P = Math.round(Number(t.abonado_previo) || 0);
  const C = P + abonos.reduce((x, a) => x + (Number(a.monto) || 0), 0);
  const parteT = T == null ? null : Math.floor(T / B);
  const parteC = Math.floor(C / B);
  const mover = parteC * k;

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
  const grupo = t.grupo_viaje || require('crypto').randomUUID();
  const titular = t.nombre || 'el titular';

  // 1 · Reclamar al titular con sus valores esperados.
  const filtroT = `id=eq.${viajero_id}&boletos=eq.${B}` + (T == null ? '&total_contrato=is.null' : `&total_contrato=eq.${t.total_contrato}`);
  const cambiosT = {
    boletos: B - k,
    grupo_viaje: grupo,
    notas: ((t.notas ? t.notas + ' · ' : '') + `ACOMP-2 ${hoy}: repartió ${k} lugar${k === 1 ? '' : 'es'} a ${acomp.map((a) => a.nombre).join(', ')} desde el Portal`).slice(0, 4000),
  };
  if (T != null) cambiosT.total_contrato = T - parteT * k;
  const rC = await fetch(`${VE}?${filtroT}`, { method: 'PATCH', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify(cambiosT) });
  if (!rC.ok) return bad('No se pudo guardar. Inténtalo otra vez.', 502);
  if ((await rC.json()).length !== 1) return bad('Tu registro cambió mientras lo editabas: recarga la página e inténtalo otra vez', 409);
  const revertirT = () => fetch(`${VE}?id=eq.${viajero_id}&boletos=eq.${B - k}`, {
    method: 'PATCH', headers: H(),
    body: JSON.stringify({ boletos: B, total_contrato: T, grupo_viaje: t.grupo_viaje || null, notas: t.notas || null }),
  }).catch(() => {});

  // 2 · Nacen los acompañantes.
  const filas = acomp.map((a) => ({
    evento_id: t.evento_id, nombre: a.nombre, correo: a.correo, celular: a.celular,
    tipo_paquete: t.tipo_paquete, zona_boleto: t.zona_boleto, tipo_viajero: t.tipo_viajero || null,
    boletos: 1, total_contrato: parteT, abonado_previo: 0, grupo_viaje: grupo,
    // [PORTAL-SOLO-1] Nace sellado: su dinero es la parte AL PESO del titular,
    // que ya estaba revisado (sin sello, `repartir` ni siquiera corre).
    portal_revisado_at: new Date().toISOString(), portal_revisado_por: 'heredado del titular (ACOMP-2)',
    notas: `Acompañante de ${titular} · su lugar se lo dio ${titular} desde el Portal ${hoy} (ACOMP-2)`,
  }));
  const rV = await fetch(VE, { method: 'POST', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify(filas) });
  if (!rV.ok) { await revertirT(); return bad('No se pudieron crear los lugares de tus acompañantes. Nada cambió: inténtalo otra vez.', 502); }
  const nacidos = await rV.json();

  // 3 · El dinero: quitar al titular (con valor esperado) y luego poner.
  let dineroOk = true, avisoDinero = null;
  const quitados = []; // para devolver si poner falla
  let fotoFuente = null, fechaFuente = null;
  if (mover > 0) {
    let falta = mover;
    if (P > 0) {
      const d = Math.min(P, falta);
      const r = await fetch(`${VE}?id=eq.${viajero_id}&abonado_previo=eq.${t.abonado_previo}`, {
        method: 'PATCH', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify({ abonado_previo: P - d }),
      });
      if (r.ok && (await r.json()).length === 1) { falta -= d; quitados.push({ previo: true, de: P - d, a: P }); }
      else dineroOk = false;
    }
    for (const a of abonos) {
      if (!dineroOk || falta <= 0) break;
      const m = Number(a.monto) || 0;
      if (m <= 0) continue;
      const d = Math.min(m, falta);
      const nota = ((a.nota ? a.nota + ' · ' : '') + `ACOMP-2 ${hoy}: $${d} de este pago pasó a los lugares de sus acompañantes (antes $${m})`).slice(0, 2000);
      const r = await fetch(`${AB}?id=eq.${a.id}&monto=eq.${a.monto}`, {
        method: 'PATCH', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify({ monto: m - d, nota }),
      });
      if (r.ok && (await r.json()).length === 1) {
        falta -= d; quitados.push({ id: a.id, de: m - d, a: m, nota: a.nota || null });
        if (!fotoFuente) { fotoFuente = a.foto_path || null; fechaFuente = a.fecha || null; }
      } else dineroOk = false;
    }
    if (dineroOk && falta > 0) dineroOk = false;
    if (dineroOk) {
      const filasA = nacidos.map((v) => Object.assign({
        viajero_id: v.id, monto: parteC,
        nota: `Pagado por ${titular} — su parte del pago del grupo (ACOMP-2, ${hoy})`,
        foto_path: fotoFuente, capturado_por: `portal:${correo}`,
      }, fechaFuente ? { fecha: fechaFuente } : {}));
      const rA = await fetch(AB, { method: 'POST', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify(filasA) });
      if (!rA.ok) dineroOk = false;
    }
    if (!dineroOk) {
      // Devolver lo quitado (cada PATCH con el valor que dejamos puesto).
      for (const q of quitados) {
        if (q.previo) {
          await fetch(`${VE}?id=eq.${viajero_id}&abonado_previo=eq.${q.de}`, { method: 'PATCH', headers: H(), body: JSON.stringify({ abonado_previo: q.a }) }).catch(() => {});
        } else {
          await fetch(`${AB}?id=eq.${q.id}&monto=eq.${q.de}`, { method: 'PATCH', headers: H(), body: JSON.stringify({ monto: q.a, nota: q.nota }) }).catch(() => {});
        }
      }
      avisoDinero = 'Tus acompañantes ya tienen su lugar, pero su parte del pago no se pudo acomodar: el equipo lo hace a mano y te avisa.';
      console.error('[ACOMP-2] reparto de dinero falló', viajero_id, JSON.stringify(quitados));
    }
  }

  // 4 · El correo único con la invitación, a los correos distintos del titular.
  let correoRes = null;
  const paraCorreo = nacidos.filter((v) => String(v.correo || '').toLowerCase() !== correo);
  if (paraCorreo.length) {
    try {
      const { enviarCorreoPago } = require('./_lib/correo-confirmacion');
      const recibidoPorViajero = {};
      paraCorreo.forEach((v) => { recibidoPorViajero[v.id] = dineroOk ? parteC : 0; });
      correoRes = await enviarCorreoPago({
        tipo: 'reserva', evento_id: t.evento_id, viajeroIds: paraCorreo.map((v) => v.id), recibidoPorViajero,
        enviado_por: `portal:${correo}`, KH_URL, KH_KEY,
      });
    } catch (e) { correoRes = { error: e.message }; }
  }

  return {
    status: dineroOk ? 200 : 207,
    body: {
      ok: true,
      acompanantes: nacidos.map((v) => ({ id: v.id, nombre: v.nombre, correo: v.correo, contrato: parteT, pagado: dineroOk ? parteC : 0 })),
      titular: { boletos: B - k, contrato: T == null ? null : T - parteT * k },
      invitados: paraCorreo.map((v) => v.correo),
      correo: correoRes,
      aviso: avisoDinero,
    },
  };
}

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
//   · `subir_pago`      → [PAGOS-PORTAL-2] el comprobante, a la bandeja. Con
//                         [PORTAL-PAGO-2] admite `desglose` (a quién va cada
//                         parte, solo gente de su grupo) como TEXTO estructurado.
//   · `pago_link`       → [PORTAL-PAGO-2] un link de Mercado Pago por la cuota
//                         que le toca (o un monto dentro de lo que debe). Nace
//                         una fila de pago SIN foto y CON el link; el webhook la
//                         marca al pagar. Aquí no se escribe dinero.
//
// 🔒 Lo que JAMÁS se toca desde aquí: correo (es la llave de la cuenta), evento,
// paquete, zona, boletos, contrato, abonos. Cualquier otro campo del cuerpo se
// IGNORA, no se rechaza: una página vieja que mande de más no tumba el guardado.
//
// POST (Authorization: Bearer <jwt del Portal>) { accion, viajero_id, ... }
// Env: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_ANON_KEY, SUPABASE_URL_KAMEHOUSE,
//      SUPABASE_SERVICE_KEY_KAMEHOUSE.
// =============================================================================
const { tallaNormalizada, generoNormalizado } = require('./_lib/correo-forma');

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
  if (!['editar', 'solicitar_cambio', 'repartir', 'opciones_paquete', 'pedir_paquete', 'subir_pago', 'abono_foto', 'pago_link'].includes(accion)) return json(400, headers, { ok: false, error: 'Acción desconocida' });
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
    const r = await fetch(`${KH_URL}/rest/v1/viajeros_evento?id=eq.${viajero_id}&select=id,evento_id,nombre,correo,celular,tipo_paquete,zona_boleto,boletos,portal_revisado_at,usuario_id,tipo_viajero,grupo_viaje,total_contrato,abonado_previo,plan_pagos&limit=1`, { headers: hKH });
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
  if (!v.portal_revisado_at || require('./_lib/portal-revision').esDelEquipo(v)) {
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
      // [PN-MULTI-1] En un multifecha el Portal pregunta primero la fecha
      // (`fecha_idx`); sin ella vienen las fechas y `paquetes: []`.
      const o = await op.opcionesPaquete(v.evento_id, body.fecha_idx);
      if (!o.ok) return json(200, headers, { ok: false, error: o.motivo });
      // [PREVENTA-PORTAL-2] Si su elección anterior no procedió, el Portal lo DICE
      // con el motivo del equipo (el mismo que le llegó por correo).
      let rechazada = null;
      try {
        const rr = await fetch(`${KH_URL}/rest/v1/cambios_viajero?viajero_id=eq.${viajero_id}&tipo=eq.paquete&estado=eq.rechazada&order=atendida_at.desc&limit=1&select=paquete_pedido,zona_pedida,respuesta,atendida_at`, { headers: hKH });
        if (rr.ok) rechazada = (await rr.json())[0] || null;
      } catch (_) { /* sin el aviso: las opciones siguen */ }
      // [PREVENTA-AUTO-1] El Portal pinta SU precio: lista − $300 por lugar, y
      // cuánto le faltaría con lo que ya pagó. El número lo da el dueño
      // (`totalPreventa`), la pantalla solo lo pinta.
      let pagado = null;
      try {
        const ar = await fetch(`${KH_URL}/rest/v1/abonos_viajero?viajero_id=eq.${viajero_id}&select=monto&limit=1000`, { headers: hKH });
        if (ar.ok) pagado = require('./_lib/cuenta-evento').saldoMigrado(v, await ar.json()).abonado;
      } catch (_) { pagado = null; }
      const boletos = Math.max(1, Number(v.boletos) || 1);
      const paquetes = o.paquetes.map((pq) => Object.assign({}, pq, {
        precio_preventa: pq.precio != null ? op.totalPreventa(pq.precio, 1) : undefined,
        zonas: pq.zonas ? pq.zonas.map((z) => Object.assign({}, z, { precio_preventa: op.totalPreventa(z.precio, 1) })) : pq.zonas,
      }));
      const fechas = o.multifecha ? o.fechas.map((f) => Object.assign({}, f, { desde_preventa: f.desde != null ? op.totalPreventa(f.desde, 1) : null })) : null;
      return json(200, headers, { ok: true, evento: o.evento, paquetes, rechazada, descuento: op.PREVENTA_DESCUENTO, boletos, pagado, automatico: true, multifecha: !!o.multifecha, fechas, fecha_idx: o.fecha_idx != null ? o.fecha_idx : null });
    }

    if (pend) return json(409, headers, { ok: false, error: 'Ya enviaste tu elección: el equipo la está revisando.', pendiente: pend });
    const e = await op.validarEleccion(v.evento_id, { paquete: body.paquete, zona: body.zona, hotel: body.hotel, fecha_idx: body.fecha_idx });
    if (!e.ok) return json(400, headers, { ok: false, error: e.motivo });
    // [PREVENTA-AUTO-1] Palabra de Memo (10-nov): «ella haga todo automático y ya
    // le llegue su confirmación». El precio lo pone el MOTOR (no el cliente: el
    // cuerpo no trae precio) y el descuento su dueño; el dinero abonado no se
    // toca. Aplica por el MISMO dueño que el botón 🎟 de Capsule.
    const boletos = Math.max(1, Number(v.boletos) || 1);
    const total = op.totalPreventa(e.precio, boletos);
    if (total == null) return json(400, headers, { ok: false, error: 'Esa opción no tiene precio válido: elige otra o escríbenos por WhatsApp.' });
    const detalle = `Elige ${e.fecha_lbl ? e.fecha_lbl + ' · ' : ''}${e.nombre}${e.zona ? ' · zona ' + e.zona : ''}${e.hotel ? ' · ' + e.hotel : ''} · lista $${e.precio.toLocaleString('es-MX')} − $${op.PREVENTA_DESCUENTO} de preventa${boletos > 1 ? ' × ' + boletos + ' lugares' : ''} = total $${total.toLocaleString('es-MX')} (sus $300 de separo ya están abonados)`;
    const fila = { viajero_id, evento_id: e.evento_destino || v.evento_id, correo, nombre: v.nombre || null, tipo: 'paquete', detalle,
      paquete_pedido: e.paquete, zona_pedida: e.zona, hotel_pedido: e.hotel, precio_lista: e.precio };
    const { aplicarPaquetePreventa } = require('./_lib/preventa-aplicar');
    let ap;
    try {
      ap = await aplicarPaquetePreventa({ id: viajero_id, paquete: e.paquete, zona: e.zona || '', total, hotel: e.hotel, evento_destino: e.evento_destino, quien: `el cliente desde su Portal (${correo})`,
        contratoSinCorreo: true, creado_por: correo, KH_URL, KH_KEY, PORTAL_URL: PT_URL, PORTAL_KEY: process.env.PORTAL_SUPABASE_SERVICE_KEY });
    } catch (err) { ap = { status: 502, body: { error: String((err && err.message) || err) } }; }
    if (ap.status === 200) {
      const avisos = [ap.body.zona_aviso, ap.body.stock_aviso].filter(Boolean);
      const k = ap.body.contrato || {};
      if (k.aviso) avisos.push('contrato: ' + k.aviso);
      (k.errores || []).forEach((x) => avisos.push('contrato: ' + x.aviso));
      const cerrada = Object.assign({}, fila, { estado: 'atendida', atendida_por: 'automático (Portal)', atendida_at: new Date().toISOString(),
        respuesta: `Aplicado automático desde el Portal · total $${total}` + (avisos.length ? ' · ⚠️ ' + avisos.join(' · ') : '') });
      let row = null;
      try {
        const rr = await fetch(`${KH_URL}/rest/v1/cambios_viajero`, { method: 'POST', headers: Object.assign({}, hKH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify(cerrada) });
        if (rr.ok) row = (await rr.json())[0] || null;
      } catch (_) { row = null; }
      // El correo «Tu paquete quedó confirmado» (total · pagado · te falta + firma
      // tu contrato en el Portal). Jamás tumba la aplicación: si falla, se dice.
      let correoR = null;
      try { correoR = await require('./_lib/correo-paquete').avisarPaquete({ cambio: row || Object.assign({}, cerrada, { viajero_id }), KH_URL, KH_KEY }); } catch (_) { correoR = null; }
      return json(200, headers, { ok: true, aplicado: true, eleccion: { paquete: e.paquete, zona: e.zona, hotel: e.hotel, precio: e.precio, total }, correo_enviado: !!(correoR && correoR.ok) });
    }
    // Rebotes con razón (zona agotada, ya no está en preventa, zona inválida): se le DICEN.
    if (ap.status === 400 || ap.status === 409) return json(ap.status, headers, { ok: false, error: ap.body.error || 'No se pudo aplicar tu elección' });
    // Cualquier otra falla (base caída): la elección NO se pierde — cae a la bandeja
    // como antes y el equipo la aplica a mano.
    const r = await fetch(`${KH_URL}/rest/v1/cambios_viajero`, {
      method: 'POST',
      headers: Object.assign({}, hKH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(Object.assign({}, fila, { detalle: detalle + ' · ⚠️ no se pudo aplicar solo: ' + String(ap.body.error || '').slice(0, 120) })),
    });
    if (r.status === 409) return json(409, headers, { ok: false, error: 'Ya enviaste tu elección: el equipo la está revisando.' });
    if (!r.ok) return json(502, headers, { ok: false, error: 'No pude enviar tu elección. Inténtalo otra vez.' });
    return json(200, headers, { ok: true, solicitud: 'pendiente', eleccion: { paquete: e.paquete, zona: e.zona, hotel: e.hotel, precio: e.precio, total } });
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
    // [GENERO-2] El cliente dice su género (y el de sus acompañantes que van a
    // su correo): lista cerrada H/M — es el insumo de las Compartidas del rooming.
    if (c.genero !== undefined) {
      const g = generoNormalizado(c.genero);
      if (!g) return json(400, headers, { ok: false, error: 'Elige mujer u hombre' });
      cambios.genero = g;
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

  // ── 3$ · [PAGOS-PORTAL-2] SUBIR UN COMPROBANTE DE PAGO ──────────────────
  // Palabra de Memo (29-oct, «Sí, constrúyela»): el cliente sube la foto de su
  // transferencia/depósito desde la card de su viaje; cae a la bandeja de
  // KameHouse (cambios_viajero tipo 'pago') y Bulma/Milk CAPTURAN el abono
  // tecleando el monto con el comprobante enfrente (cambio_pago_capturar).
  // 🔒 ESTO NO ESCRIBE DINERO: ni abonos_viajero ni viajeros_evento se tocan —
  // es un AVISO con foto, exactamente como la requisición (el rumbo del
  // 12-oct: nada automático decide dinero). El monto que el cliente DECLARA
  // viaja como TEXTO en el detalle, jamás como número que alguien sume.
  // ── 3t · [PORTAL-TICKET-1] VER MI COMPROBANTE ────────────────────────────
  // Palabra de Memo (30-oct): «la idea es que ellos en portal, como nosotros en
  // kamehouse, puedan ver sus tickets para que tengan su propio control». El
  // cliente pide la foto de UN abono SUYO y se le firma una URL corta.
  // 🔒 El abono se lee con DOBLE filtro (id + viajero_id ya validado como suyo
  //    por el portero de arriba): un abono ajeno contesta 404, igual que una
  //    fila ajena. Y se firma el path DE LA FILA, jamás uno tecleado — un path
  //    del cuerpo podría firmar cualquier objeto del bucket (ley de
  //    PAGOS-PORTAL-2, cara del cliente).
  // 🔒 «Sin comprobante» se DICE, no se confunde con un error: los abonos
  //    migrados del Excel no traen foto y eso es la verdad, no una falla.
  if (accion === 'abono_foto') {
    const abono_id = String(body.abono_id || '');
    if (!UUID_RE.test(abono_id)) return json(400, headers, { ok: false, error: 'Abono inválido' });
    let ab;
    try {
      const r = await fetch(`${KH_URL}/rest/v1/abonos_viajero?id=eq.${abono_id}&viajero_id=eq.${viajero_id}&select=id,foto_path&limit=1`, { headers: hKH });
      if (!r.ok) return json(502, headers, { ok: false, error: 'No pude leer tu pago' });
      ab = (await r.json())[0];
    } catch (_) { return json(502, headers, { ok: false, error: 'No pude leer tu pago' }); }
    if (!ab) return json(404, headers, { ok: false, error: 'No encontramos ese pago en tu cuenta' });
    if (!ab.foto_path) return json(404, headers, { ok: false, error: 'Este pago no tiene comprobante digital (se registró directo con el equipo)' });
    try {
      const r = await fetch(`${KH_URL}/storage/v1/object/sign/abonos-viajeros/${String(ab.foto_path).split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        headers: { ...hKH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 600 }),   // 10 min: se pide al clic, no se guarda
      });
      if (!r.ok) return json(502, headers, { ok: false, error: 'No pude abrir tu comprobante, inténtalo otra vez' });
      const j = await r.json();
      if (!j || !j.signedURL) return json(502, headers, { ok: false, error: 'No pude abrir tu comprobante, inténtalo otra vez' });
      return json(200, headers, { ok: true, url: `${KH_URL}/storage/v1${j.signedURL}` });
    } catch (_) { return json(502, headers, { ok: false, error: 'No pude abrir tu comprobante, inténtalo otra vez' }); }
  }

  // ── 3l · [PORTAL-PAGO-2] LINK DE MERCADO PAGO PARA UNA CUOTA ─────────────
  // Palabra de Memo (9-nov): «da opción de pagar desde el portal con mercado
  // pago». Nace una fila `cambios_viajero` tipo 'pago' SIN foto y CON el link
  // (el CHECK de la base lo admite desde PORTAL-PAGO-2). El webhook la MARCA al
  // caer el pago; Bulma/Milk capturan el abono desde la bandeja. 🔒 El NETO lo
  // decide el servidor: lo que le toca pagar (atrasado + próxima cuota) o un
  // monto que el cliente eligió DENTRO de lo que debe. La comisión se le carga
  // al cliente (calcularLink), como en el index. Aquí no se escribe dinero.
  if (accion === 'pago_link') {
    const mpLink = require('./_lib/mp-link');
    const disp = mpLink.disponible();
    if (!disp.ok) return json(409, headers, { ok: false, error: 'El pago en línea no está disponible ahora. Puedes pagar por transferencia y subir tu comprobante.' });
    const saldo = await _saldoPortal(KH_URL, hKH, v);
    if (!saldo || !saldo.ok) return json(502, headers, { ok: false, error: 'No pude leer tu saldo. Inténtalo otra vez.' });
    if (!(saldo.resta > 0)) return json(409, headers, { ok: false, error: 'Tu viaje ya está liquidado: no hay nada que pagar.' });
    let neto = saldo.sugerido;
    if (body.monto != null && body.monto !== '') {
      const m = Number(body.monto);
      if (!Number.isFinite(m) || m <= 0 || Math.round(m) !== m) return json(400, headers, { ok: false, error: 'El monto tiene que ser un número entero de pesos' });
      if (m > saldo.resta) return json(400, headers, { ok: false, error: `Te faltan $${saldo.resta.toLocaleString('es-MX')}: no puedes pagar más que eso` });
      neto = m;
    }
    if (!(neto > 0)) return json(409, headers, { ok: false, error: 'No hay una cuota pendiente que pagar' });

    // ¿Ya hay un link vivo por ESTE mismo monto, sin pagar? Se REUSA: dos links
    // por la misma cuota son dos cobros esperando a que alguien pague los dos.
    let vivos = [];
    try {
      const p = await fetch(`${KH_URL}/rest/v1/cambios_viajero?viajero_id=eq.${viajero_id}&tipo=eq.pago&estado=eq.pendiente&select=id,foto_path,mp_preference_id,mp_init_point,mp_neto,mp_monto_cobrar,mp_pago_id&limit=20`, { headers: hKH });
      if (!p.ok) return json(502, headers, { ok: false, error: 'No pude revisar tus pagos. Inténtalo otra vez.' });
      vivos = await p.json();
    } catch (_) { return json(502, headers, { ok: false, error: 'No pude revisar tus pagos. Inténtalo otra vez.' }); }
    const reusable = vivos.find((c) => c.mp_preference_id && !c.mp_pago_id && Number(c.mp_neto) === neto && c.mp_init_point);
    if (reusable) {
      return json(200, headers, { ok: true, url: reusable.mp_init_point, total: Number(reusable.mp_monto_cobrar), neto, comision: Math.round((Number(reusable.mp_monto_cobrar) - neto) * 100) / 100, reusado: true });
    }
    // Los pendientes CON evidencia (foto o pago en MP) sí cuentan para el tope;
    // un link sin pagar no es un pendiente del equipo.
    if (vivos.filter((c) => c.foto_path || c.mp_pago_id).length >= MAX_PENDIENTES) {
      return json(429, headers, { ok: false, error: 'Ya tienes pagos en revisión: el equipo los está capturando. Si urge, escríbenos por WhatsApp.' });
    }

    const cambio_id = require('crypto').randomUUID();
    const etiqueta = saldo.etiqueta || 'Abono a tu viaje';
    const link = await mpLink.crearLinkCuota({ cuota: { cambio_id, viajero: { id: v.id, nombre: v.nombre, correo, evento_id: v.evento_id }, evento_nombre: saldo.evento_nombre, neto_pesos: neto, etiqueta } });
    if (!link.ok) {
      console.error('[portal-viajero] link de cuota falló', viajero_id, link.motivo);
      return json(502, headers, { ok: false, error: 'No se pudo generar tu link de pago. Puedes pagar por transferencia y subir tu comprobante.' });
    }
    const fLink = {
      id: cambio_id, viajero_id, evento_id: v.evento_id, correo, nombre: v.nombre || null, tipo: 'pago',
      detalle: `Link de Mercado Pago desde el Portal · ${etiqueta} · abono $${neto.toLocaleString('es-MX')} (cobra $${link.total_pesos.toLocaleString('es-MX')}, comisión al cliente $${link.comision_pesos.toLocaleString('es-MX')})`.slice(0, 600),
      mp_preference_id: link.preference_id, mp_init_point: link.url, mp_monto_cobrar: link.total_pesos, mp_neto: neto,
    };
    const rI = await fetch(`${KH_URL}/rest/v1/cambios_viajero`, {
      method: 'POST',
      headers: Object.assign({}, hKH, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(fLink),
    });
    if (!rI.ok) {
      console.error('[portal-viajero] no se guardó el link de cuota', viajero_id, rI.status, await rI.text().catch(() => ''));
      return json(502, headers, { ok: false, error: 'No pude registrar tu pago. Inténtalo otra vez.' });
    }
    return json(200, headers, { ok: true, url: link.url, total: link.total_pesos, neto, comision: link.comision_pesos });
  }

  if (accion === 'subir_pago') {
    // El comprobante — la MISMA forma que requisicion-crear: base64 → bytes →
    // magia (jpg/png/webp + PDF: los bancos dan PDF) → bucket PRIVADO
    // `abonos-viajeros`, prefijo portal/<viajero_id>/. Mismo bucket que los
    // abonos a propósito: al capturar, el abono HEREDA este path (la forma del
    // aprobar de REQ-B1) y el 📎 de la lista de viajeros lo abre sin copiar.
    const MAX_B64_PAGO = 4.8 * 1024 * 1024; // ~3.6 MB reales, como requisicion-crear
    const b64 = String(body.comprobante_base64 || '').replace(/^data:[^;]+;base64,/, '');
    if (!b64) return json(400, headers, { ok: false, error: 'Sube la foto de tu comprobante' });
    if (b64.length > MAX_B64_PAGO) return json(413, headers, { ok: false, error: 'Tu comprobante pesa demasiado. Súbelo como foto e inténtalo otra vez.' });
    let buf; try { buf = Buffer.from(b64, 'base64'); } catch (_) { buf = null; }
    const { tipoImagen } = require('./_lib/imagen-magia');
    const tipoImg = tipoImagen(buf, { pdf: true });
    if (!tipoImg) return json(400, headers, { ok: false, error: 'El comprobante tiene que ser foto (JPG/PNG) o PDF' });

    // Monto DECLARADO, opcional. Solo viaja en el texto del detalle: la cifra
    // que vale es la que Bulma teclee viendo el comprobante.
    let montoDec = Number(body.monto);
    const notaCliente = String(body.nota || '').trim().replace(/\s+/g, ' ').slice(0, 200);

    // [PORTAL-PAGO-2] EL DESGLOSE: «de este comprobante, $X son de Fulano y $Y
    // de Mengano». Palabra de Memo (9-nov): «construye lo del desglose». Es
    // TEXTO ESTRUCTURADO que la bandeja PRELLENA — el humano lo corrige y
    // captura; aquí no nace un abono. Solo puede nombrar a quien viaja CON esta
    // persona: ella misma y su `grupo_viaje` del mismo evento (los acompañantes
    // de ACOMP-1/2). Un id de otra persona se rechaza, no se tolera.
    let desglose = null;
    if (body.desglose != null) {
      if (!Array.isArray(body.desglose) || !body.desglose.length) return json(400, headers, { ok: false, error: 'El desglose tiene que decir a quién va cada parte' });
      if (body.desglose.length > 10) return json(400, headers, { ok: false, error: 'Máximo 10 personas en un desglose' });
      const permitidos = new Map([[v.id, v.nombre || null]]);
      if (v.grupo_viaje) {
        try {
          const g = await fetch(`${KH_URL}/rest/v1/viajeros_evento?grupo_viaje=eq.${encodeURIComponent(v.grupo_viaje)}&evento_id=eq.${encodeURIComponent(v.evento_id)}&select=id,nombre&limit=20`, { headers: hKH });
          if (!g.ok) return json(502, headers, { ok: false, error: 'No pude leer tu grupo. Inténtalo otra vez.' });
          for (const m of await g.json()) permitidos.set(m.id, m.nombre || null);
        } catch (_) { return json(502, headers, { ok: false, error: 'No pude leer tu grupo. Inténtalo otra vez.' }); }
      }
      const vistos = new Set();
      desglose = [];
      for (const d of body.desglose) {
        const id = String(d && d.viajero_id || '');
        const m = Number(d && d.monto);
        if (!UUID_RE.test(id) || !permitidos.has(id)) return json(400, headers, { ok: false, error: 'El desglose nombra a alguien que no viaja contigo' });
        if (vistos.has(id)) return json(400, headers, { ok: false, error: 'Una persona aparece dos veces en el desglose' });
        if (!Number.isFinite(m) || m <= 0 || m > 1000000) return json(400, headers, { ok: false, error: 'Cada parte del desglose tiene que ser un monto mayor a cero' });
        vistos.add(id);
        desglose.push({ viajero_id: id, nombre: permitidos.get(id), monto: Math.round(m) });
      }
      // El total declarado ES la suma del desglose: una suma que no cuadra con
      // el «declara» sería dos verdades sobre el mismo comprobante.
      montoDec = desglose.reduce((s, d) => s + d.monto, 0);
    }
    const montoTxt = (Number.isFinite(montoDec) && montoDec > 0 && montoDec <= 1000000)
      ? ` · el cliente declara $${Math.round(montoDec).toLocaleString('es-MX')}` : '';
    const desgloseTxt = desglose && desglose.length > 1
      ? ' · reparto: ' + desglose.map((d) => `${d.nombre || d.viajero_id.slice(0, 8)} $${d.monto.toLocaleString('es-MX')}`).join(', ')
      : '';

    // Tope de pendientes tipo pago (el MISMO número que las solicitudes de
    // cambio: un buzón, no un chat). Dos comprobantes legítimos seguidos caben;
    // el cuarto espera a que el equipo capture. [PORTAL-PAGO-2] Un link de MP
    // sin pagar NO cuenta: no es un pendiente del equipo.
    try {
      const p = await fetch(`${KH_URL}/rest/v1/cambios_viajero?viajero_id=eq.${viajero_id}&tipo=eq.pago&estado=eq.pendiente&or=(foto_path.not.is.null,mp_pago_id.not.is.null)&select=id&limit=${MAX_PENDIENTES + 1}`, { headers: hKH });
      if (!p.ok) return json(502, headers, { ok: false, error: 'No pude registrar tu pago. Inténtalo otra vez.' });
      if ((await p.json()).length >= MAX_PENDIENTES) {
        return json(429, headers, { ok: false, error: 'Ya tienes comprobantes en revisión: el equipo los está capturando. Si urge, escríbenos por WhatsApp.' });
      }
    } catch (_) { return json(502, headers, { ok: false, error: 'No pude registrar tu pago. Inténtalo otra vez.' }); }

    // [COMPROBANTE-DUP-1] Un comprobante YA registrado no vuelve a entrar (caso
    // Erik: re-subió el de su separo). ANTES de subir nada: cero objetos huérfanos.
    const CH = require('./_lib/comprobante-huella');
    const foto_md5 = CH.huella(buf);
    const dup = await CH.buscarDuplicado({ url: KH_URL, headers: hKH, md5: foto_md5 });
    if (!dup.ok) console.warn('[portal-viajero] huella sin verificar (entra igual):', dup.error);
    if (dup.duplicado) {
      console.warn('[portal-viajero] comprobante repetido', viajero_id, JSON.stringify(dup.duplicado));
      return json(409, headers, { ok: false, duplicado: true, error: CH.MSG_PORTAL });
    }

    // La foto PRIMERO (sin comprobante no nace la solicitud — el CHECK
    // cambios_viajero_pago_foto lo exige también desde la base).
    const foto_path = `portal/${viajero_id}/${require('crypto').randomUUID()}.${tipoImg.ext}`;
    let up;
    try {
      up = await fetch(`${KH_URL}/storage/v1/object/abonos-viajeros/${encodeURI(foto_path)}`, {
        method: 'POST',
        headers: Object.assign({}, hKH, { 'Content-Type': tipoImg.mime }),
        body: buf,
      });
    } catch (e) { return json(502, headers, { ok: false, error: 'No se pudo subir tu comprobante. Revisa tu señal e inténtalo otra vez.' }); }
    if (!up.ok) return json(502, headers, { ok: false, error: 'No se pudo guardar tu comprobante. Inténtalo otra vez.' });

    const detallePago = ('Comprobante subido desde el Portal' + montoTxt + desgloseTxt + (notaCliente ? ' · «' + notaCliente + '»' : '')).slice(0, 600);
    const fPago = { viajero_id, evento_id: v.evento_id, correo, nombre: v.nombre || null, tipo: 'pago', detalle: detallePago, foto_path, foto_md5 };
    if (desglose) fPago.desglose = desglose;
    const rI = await fetch(`${KH_URL}/rest/v1/cambios_viajero`, {
      method: 'POST',
      headers: Object.assign({}, hKH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(fPago),
    });
    if (!rI.ok) return json(502, headers, { ok: false, error: 'No pude registrar tu pago. Inténtalo otra vez.' });
    return json(200, headers, { ok: true, solicitud: 'pendiente', mensaje: 'Recibimos tu comprobante: el equipo lo captura y tu saldo se actualiza aquí mismo.' });
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
// [PORTAL-PAGO-2] _saldoPortal — cuánto debe ESTE viajero y qué le toca pagar.
// =============================================================================
// 🔒 CERO aritmética propia: el saldo es `saldoMigrado` (el dueño del Palacio)
// y «qué le toca» es `estadoPlan` del rol fijo (PLAN-FIJO-1): lo atrasado + la
// próxima cuota, topado a lo que resta. Sin plan fijo (migrados del Excel) el
// sugerido es lo que resta entero — el cliente puede teclear menos. El nombre
// del evento sale del catálogo servido y es solo para el TÍTULO del link.
async function _saldoPortal(KH_URL, hKH, v) {
  try {
    const { saldoMigrado } = require('./_lib/cuenta-evento');
    const PF = require('./_lib/plan-fijo');
    const r = await fetch(`${KH_URL}/rest/v1/abonos_viajero?viajero_id=eq.${encodeURIComponent(v.id)}&select=monto&limit=2000`, { headers: hKH });
    if (!r.ok) return { ok: false };
    const abonos = await r.json();
    const s = saldoMigrado(v, Array.isArray(abonos) ? abonos : []);
    if (!s) return { ok: true, total: null, abonado: null, resta: 0, sugerido: 0, etiqueta: null, evento_nombre: null };
    const resta = Math.max(0, Math.round(s.resta));
    let sugerido = resta, etiqueta = 'Abono a tu viaje';
    if (v.plan_pagos && resta > 0) {
      const plan = PF.estadoPlan(v.plan_pagos, { total: s.total, abonado: s.abonado, ahora: new Date() });
      if (plan && plan.estado === 'calendario') {
        // [COB-WA-1] «qué le toca hoy» tiene UN dueño: tocaHoy de plan-fijo.
        const t = PF.tocaHoy(plan, resta);
        if (t) { sugerido = t.monto; if (t.etiqueta) etiqueta = t.etiqueta; }
      } else if (plan && plan.estado === 'liquidado') {
        return { ok: true, total: s.total, abonado: s.abonado, resta: 0, sugerido: 0, etiqueta: null, evento_nombre: null };
      }
    }
    let evento_nombre = null;
    try {
      const evRaw = await require('./_lib/catalogo-index').fetchEventosRaw();
      const base = String(v.evento_id || '').split('#')[0];
      const ev = (Array.isArray(evRaw) ? evRaw : []).find((e) => e && String(e.id) === base);
      if (ev) evento_nombre = ev.a || ev.n || null;
    } catch (_) { /* el nombre es cosmético: sin él, el link dice el slug */ }
    return { ok: true, total: s.total, abonado: s.abonado, resta, sugerido, etiqueta, evento_nombre };
  } catch (e) {
    console.error('[portal-viajero] _saldoPortal', e && e.message);
    return { ok: false };
  }
}

// =============================================================================
// [ACOMP-2] repartir — el titular le da su ficha a cada acompañante.
// [ACOMP-3] El cuerpo se MUDÓ a _lib/repartir-lugares (dos lectores: este y el
// botón «👥 Repartir» de Capsule). Aquí solo se dice quién lo pide.
async function repartir({ body, viajero_id, correo, KH_URL, KH_KEY }) {
  const { repartirLugares } = require('./_lib/repartir-lugares');
  return repartirLugares({ viajero_id, acompanantes: body.acompanantes, origen: 'portal', quien: correo, capturado_por: `portal:${correo}`, KH_URL, KH_KEY });
}

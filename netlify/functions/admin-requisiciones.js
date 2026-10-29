// =============================================================================
// admin-requisiciones — FASE B del rumbo (12-oct-2026): la BANDEJA.
//
// Bulma y Milk (y Memo) revisan las requisiciones que levanta el index:
// ven el comprobante, aprueban (y ahí NACE el viajero por la puerta de zonas,
// con su abono), rechazan con motivo, o le escriben al cliente por WhatsApp
// (eso es del navegador — aquí no se manda nada).
//
// 🔒 LA CAPTURA ES MANUAL: el MONTO del abono lo teclea el humano que VIO el
//    comprobante. Viene en el body, pre-llenado por la pantalla con el separo
//    del sistema, pero la autoridad es la persona. Nada automático decide
//    dinero (EL RUMBO, 12-oct).
// 🔒 EL VIAJERO NACE POR LA PUERTA DE ZONAS (_lib/zona-ficha, DISPO-NORM-1):
//    zona desconocida se RECHAZA nombrando las de la ficha; mal escrita se
//    guarda con la ortografía canónica. RIDE va sin zona.
// 🔒 LA CARRERA DEL DOBLE CLIC se cierra RECLAMANDO primero: el PATCH a
//    'aprobada' lleva &estado=eq.pendiente y pide representación — 0 filas =
//    alguien más la revisó primero (409, sin viajero duplicado). Si el insert
//    del viajero falla DESPUÉS del reclamo, el reclamo se REVIERTE a
//    pendiente y se dice. Si lo que falla es el ABONO (el viajero ya nació),
//    NO se borra nada: se contesta con la instrucción exacta — capturar el
//    abono a mano con ➕Abono — porque un viajero sin abono se corrige en un
//    clic y un borrado automático de datos de gente no se hace jamás.
// 🔒 El abono hereda el comprobante: foto_path = comprobante_path (mismo
//    bucket abonos-viajeros, por eso el crear sube ahí).
// 🔒 total_contrato default = total_sistema (el precio del index cuando el
//    cliente cotizó — «los costos son los del index siempre»). El staff puede
//    ajustarlo (CDMX sin transporte en el total del sistema, p. ej.), y eso
//    también es captura manual.
//
// Env: SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { puertaZona } = require('./_lib/zona-ficha');

const ROLES_BANDEJA = ['maestro_roshi', 'bulma', 'milk'];
const ACCIONES = {
  listar: ROLES_BANDEJA,
  detalle: ROLES_BANDEJA,
  aprobar: ROLES_BANDEJA,
  rechazar: ROLES_BANDEJA,
  rechazo_preview: ROLES_BANDEJA,   // [RECHAZO-AVISO-1] enseña el correo; CERO escrituras
  // [PORTAL-EDIT-1] las solicitudes de cambio que el cliente manda desde el Portal.
  cambios_listar: ROLES_BANDEJA,
  cambio_cerrar: ROLES_BANDEJA,
  // [PAGOS-PORTAL-2] El comprobante que el cliente subió desde el Portal:
  // verlo (URL firmada) y CAPTURAR el abono con el monto TECLEADO por quien lo
  // vio — el humano decide el dinero, la solicitud solo lo avisa.
  cambio_foto: ROLES_BANDEJA,
  cambio_pago_capturar: ROLES_BANDEJA,
  // [PRUEBA-ARCHIVO-1] Quitar una solicitud de PRUEBA (y lo que nació de ella).
  // Solo Memo: es la única acción que saca filas de dinero de la vista.
  archivar_prueba: ['maestro_roshi'],
};
// [CONFIRMA-1] Al aprobar sale UN correo: confirmación + invitación al Portal
// (palabra de Memo: «correo único»). El dueño es _lib/correo-confirmacion; sus
// eventos viven ahí (EVENTOS_CORREO), no aquí, para que la captura manual de
// pagos y la bandeja no puedan divergir. Lo que había aquí (portalAlAprobar,
// ACOMP-1) se reemplazó por esa lib: mandaba la invitación SOLA.
const { enviarCorreoPago } = require('./_lib/correo-confirmacion');
const SIGN_EXPIRA = 60 * 60; // 1 hora, como admin-solicitud-comprobante
const BUCKET = 'abonos-viajeros';

function j(status, headers, body) { return { statusCode: status, headers, body: JSON.stringify(body) }; }

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return j(405, headers, { error: 'Solo POST' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return j(400, headers, { error: 'Cuerpo inválido' }); }
  const accion = String(body.accion || '');
  if (!ACCIONES[accion]) return j(400, headers, { error: 'Acción desconocida: ' + accion });

  const auth = await verifyAdminAuthLive(event, ACCIONES[accion]);
  if (!auth.valid) return j(auth.status, headers, { error: auth.error });
  const quien = (auth.user && (auth.user.nombre || auth.user.username || auth.user.correo)) || (auth.user && (auth.user.id || auth.user.sub)) || 'panel';

  const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!SB_URL || !SB_KEY) return j(500, headers, { error: 'Faltan credenciales de KameHouse en el entorno' });
  const sbH = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
  const base = `${SB_URL}/rest/v1/requisiciones`;

  // ── listar ────────────────────────────────────────────────────────────────
  if (accion === 'listar') {
    const estado = String(body.estado || 'pendiente');
    let q = `${base}?select=*&order=creado_en.desc&limit=200`;
    if (estado !== 'todas') q += `&estado=eq.${encodeURIComponent(estado)}`;
    if (body.evento_id) q += `&evento_id=eq.${encodeURIComponent(String(body.evento_id))}`;
    const [r, rc] = await Promise.all([
      fetch(q, { headers: sbH }),
      // El conteo de pendientes viaja SIEMPRE (badge de la bandeja y del inicio).
      fetch(`${base}?select=id&estado=eq.pendiente&limit=500`, { headers: sbH }),
    ]);
    if (!r.ok) return j(502, headers, { error: 'No se pudo leer la bandeja', detail: (await r.text()).slice(0, 300) });
    const rows = await r.json();
    const pend = rc.ok ? (await rc.json()).length : null; // null = no se pudo contar (no es 0)
    // [REQ-DUP-1 · 20-oct-2026] El aviso de duplicados, nacido del caso real:
    // Virginia Moguel mandó la MISMA solicitud dos veces (mismo comprobante) y
    // la bandeja aprobó las dos — 4 lugares y $1,200 donde eran 2 y $600. Cada
    // fila lista a sus GEMELAS (mismo evento + mismo celular O correo, otra
    // solicitud, pendiente o aprobada). Este aviso es cortesía de pantalla; el
    // candado de verdad vive en `aprobar` (esconder un botón no es la regla).
    let dups = {};
    try {
      const rd = await fetch(`${base}?select=id,folio,evento_id,celular,correo,estado&estado=in.(pendiente,aprobada)&limit=1000`, { headers: sbH });
      if (rd.ok) {
        const todas = await rd.json();
        const nCel = (s) => String(s || '').replace(/\D/g, '');
        const nMail = (s) => String(s || '').trim().toLowerCase();
        for (const row of rows) {
          const c = nCel(row.celular), m = nMail(row.correo);
          const gem = todas.filter((o) => o.id !== row.id && o.evento_id === row.evento_id &&
            ((c && nCel(o.celular) === c) || (m && nMail(o.correo) === m)));
          if (gem.length) dups[row.id] = gem.map((o) => ({ folio: o.folio, estado: o.estado }));
        }
      }
    } catch (_) { /* el aviso no tumba la bandeja; la autoridad es el candado de aprobar */ }
    return j(200, headers, { ok: true, requisiciones: rows.map((x) => dups[x.id] ? Object.assign({}, x, { dup_de: dups[x.id] }) : x), pendientes: pend });
  }

  // ── [PORTAL-EDIT-1] solicitudes de cambio del Portal ─────────────────────
  // NO cambian nada solas: el staff las ATIENDE (hace el cambio a mano en
  // KameHouse y le confirma al cliente por WhatsApp) o las RECHAZA con motivo.
  if (accion === 'cambios_listar') {
    const cb = `${SB_URL}/rest/v1/cambios_viajero`;
    const estado = String(body.estado || 'pendiente');
    let q = `${cb}?select=*&order=creado_en.desc&limit=200`;
    if (estado !== 'todas') q += `&estado=eq.${encodeURIComponent(estado)}`;
    const r = await fetch(q, { headers: sbH });
    if (!r.ok) return j(502, headers, { error: 'No se pudieron leer las solicitudes de cambio', detail: (await r.text()).slice(0, 300) });
    const rows = await r.json();
    // El WhatsApp y el paquete ACTUALES del viajero (para contestarle con su dato de hoy).
    const ids = [...new Set(rows.map((x) => x.viajero_id))];
    let vmap = {};
    if (ids.length) {
      const rv = await fetch(`${SB_URL}/rest/v1/viajeros_evento?id=in.(${encodeURIComponent(ids.map((x) => '"' + x + '"').join(','))})&select=id,nombre,celular,tipo_paquete,zona_boleto`, { headers: sbH });
      if (rv.ok) (await rv.json()).forEach((v) => { vmap[v.id] = v; });
    }
    const pc = await fetch(`${cb}?select=id&estado=eq.pendiente&limit=500`, { headers: sbH });
    const pendientes = pc.ok ? (await pc.json()).length : null;
    return j(200, headers, { ok: true, cambios: rows.map((x) => Object.assign({}, x, { viajero: vmap[x.viajero_id] || null })), pendientes });
  }
  if (accion === 'cambio_cerrar') {
    const cid = String(body.id || '');
    if (!/^[0-9a-f-]{36}$/.test(cid)) return j(400, headers, { error: 'id inválido' });
    const nuevo = String(body.estado || '');
    if (nuevo !== 'atendida' && nuevo !== 'rechazada') return j(400, headers, { error: 'Estado inválido' });
    const respuesta = String(body.respuesta || '').trim().slice(0, 500);
    if (nuevo === 'rechazada' && respuesta.length < 3) return j(400, headers, { error: 'Di por qué no procede (el cliente lo va a preguntar)' });
    const r = await fetch(`${SB_URL}/rest/v1/cambios_viajero?id=eq.${cid}&estado=eq.pendiente`, {
      method: 'PATCH',
      headers: Object.assign({}, sbH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify({ estado: nuevo, respuesta: respuesta || null, atendida_por: quien, atendida_at: new Date().toISOString() }),
    });
    if (!r.ok) return j(502, headers, { error: 'No se pudo cerrar la solicitud', detail: (await r.text()).slice(0, 300) });
    const rows = await r.json();
    if (!rows.length) return j(409, headers, { error: 'Esa solicitud ya no está pendiente — alguien más la cerró' });
    // [PREVENTA-PORTAL-2] La respuesta a «Elegir mi paquete» va por CORREO (palabra
    // de Memo). Sale DESPUÉS de cerrar y jamás tumba el cierre: si falla, se DICE.
    let correo = null;
    if (rows[0].tipo === 'paquete') {
      const { avisarPaquete } = require('./_lib/correo-paquete');
      correo = await avisarPaquete({ cambio: rows[0], KH_URL: SB_URL, KH_KEY: SB_KEY });
    }
    return j(200, headers, { ok: true, cambio: rows[0], correo });
  }

  // ── [PAGOS-PORTAL-2] el comprobante del cliente, por URL firmada ──────────
  // La MISMA forma que `detalle` (el comprobante de la requisición): firmar el
  // path del bucket privado, 1 h. Solo paths de cambios_viajero — el id manda,
  // el path se LEE de la fila, jamás del cuerpo (un path tecleado podría firmar
  // cualquier objeto del bucket).
  if (accion === 'cambio_foto') {
    const cid = String(body.id || '');
    if (!/^[0-9a-f-]{36}$/.test(cid)) return j(400, headers, { error: 'id inválido' });
    const r = await fetch(`${SB_URL}/rest/v1/cambios_viajero?id=eq.${cid}&select=id,foto_path`, { headers: sbH });
    if (!r.ok) return j(502, headers, { error: 'No se pudo leer la solicitud' });
    const c = (await r.json())[0];
    if (!c) return j(404, headers, { error: 'Esa solicitud no existe' });
    if (!c.foto_path) return j(404, headers, { error: 'Esta solicitud no trae comprobante' });
    let signed_url = null;
    try {
      const rs = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${encodeURI(c.foto_path)}`, {
        method: 'POST',
        headers: Object.assign({}, sbH, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ expiresIn: SIGN_EXPIRA }),
      });
      if (rs.ok) {
        const js = await rs.json().catch(() => null);
        if (js && js.signedURL) signed_url = `${SB_URL}/storage/v1${js.signedURL}`;
      }
    } catch (_) { /* sin firma: se dice abajo */ }
    if (!signed_url) return j(502, headers, { error: 'No se pudo firmar el comprobante' });
    return j(200, headers, { ok: true, signed_url });
  }

  // ── [PAGOS-PORTAL-2] capturar el abono de un comprobante del Portal ──────
  // El clic que convierte el AVISO en dinero, con un humano enfrente:
  //   1) el abono nace con el monto TECLEADO por quien vio el comprobante
  //      (jamás el «declarado» del cliente — ese es texto, no cifra) y HEREDA
  //      el foto_path de la solicitud (la forma del aprobar de REQ-B1: mismo
  //      bucket, el 📎 de la lista de viajeros lo abre sin copiar);
  //   2) la solicitud se cierra con VALOR ESPERADO (estado=eq.pendiente): el
  //      2º clic contesta 409 y no nace un segundo abono.
  // ⚠️ El ORDEN es cerrar PRIMERO y abonar DESPUÉS, y es deliberado: si el
  // abono falla, la solicitud quedó 'atendida' sin abono (se reabre a mano o
  // se captura por ➕ Abono — la respuesta 207 lo dice con el monto); al revés,
  // una carrera de dos clics podría crear DOS abonos del mismo comprobante,
  // que es dinero inventado y no se deshace solo. Equivocarse hacia «falta
  // capturar» se ve y se corrige; hacia «capturado dos veces» es lo invisible.
  if (accion === 'cambio_pago_capturar') {
    const cid = String(body.id || '');
    if (!/^[0-9a-f-]{36}$/.test(cid)) return j(400, headers, { error: 'id inválido' });
    // Las MISMAS validaciones de monto que abono_crear (admin-coordi-
    // asignaciones) — copiadas, no inventadas; si divergen, el careo las carea.
    const monto = Number(body.monto);
    if (!Number.isFinite(monto) || monto <= 0) return j(400, headers, { error: 'El monto tiene que ser mayor que cero' });
    if (monto > 1000000) return j(400, headers, { error: 'Monto fuera de rango' });

    const rc = await fetch(`${SB_URL}/rest/v1/cambios_viajero?id=eq.${cid}&select=id,viajero_id,evento_id,tipo,estado,foto_path,detalle,nombre`, { headers: sbH });
    if (!rc.ok) return j(502, headers, { error: 'No se pudo leer la solicitud' });
    const c = (await rc.json())[0];
    if (!c) return j(404, headers, { error: 'Esa solicitud no existe' });
    if (c.tipo !== 'pago') return j(409, headers, { error: 'Esa solicitud no es un pago — se atiende con los botones de siempre' });

    // 1 · Cerrar con valor esperado: el reclamo. 0 filas = alguien ganó el clic.
    const respuesta = `Abono capturado: $${Math.round(monto).toLocaleString('es-MX')} · ${quien}`;
    const rz = await fetch(`${SB_URL}/rest/v1/cambios_viajero?id=eq.${cid}&estado=eq.pendiente`, {
      method: 'PATCH',
      headers: Object.assign({}, sbH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify({ estado: 'atendida', respuesta, atendida_por: quien, atendida_at: new Date().toISOString() }),
    });
    if (!rz.ok) return j(502, headers, { error: 'No se pudo reclamar la solicitud', detail: (await rz.text()).slice(0, 300) });
    if (!(await rz.json()).length) return j(409, headers, { error: 'Esa solicitud ya no está pendiente — alguien más la atendió' });

    // 2 · El abono — capturado_por del JWT (anti-spoofing, como abono_crear),
    // foto_path heredado del comprobante.
    const filaAbono = { viajero_id: c.viajero_id, monto, foto_path: c.foto_path || null,
      nota: ('Pago subido desde el Portal · ' + String(c.detalle || '').slice(0, 300)).slice(0, 500),
      capturado_por: quien };
    const ra = await fetch(`${SB_URL}/rest/v1/abonos_viajero`, {
      method: 'POST',
      headers: Object.assign({}, sbH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(filaAbono),
    });
    if (!ra.ok) {
      // La solicitud YA quedó atendida; el dinero NO entró. Se DICE con el
      // monto para capturarlo por ➕ Abono — nada se borra ni se reintenta solo.
      return j(207, headers, { error: 'La solicitud se cerró pero el ABONO NO SE GUARDÓ: captúralo por ➕ Abono con $' + monto, detail: (await ra.text()).slice(0, 300) });
    }
    const abono = (await ra.json())[0] || null;

    // 3 · «Recibimos tu pago» — el MISMO correo de la captura manual, con la
    // FIRMA del dueño (leída de abono_crear, no adivinada). EVENTOS_CORREO
    // decide; fuera de la lista no sale nada. Jamás tumba el abono.
    let correo = null;
    try {
      correo = await enviarCorreoPago({
        tipo: 'abono', evento_id: c.evento_id, viajeroIds: [c.viajero_id],
        recibidoPorViajero: { [c.viajero_id]: monto },
        enviado_por: (auth.user && auth.user.correo) || null,
        KH_URL: SB_URL, KH_KEY: SB_KEY,
      });
    } catch (e) { correo = { error: e.message }; }
    return j(200, headers, { ok: true, abono, correo });
  }

  // Las tres restantes piden el id.
  const id = String(body.id || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return j(400, headers, { error: 'id inválido' });

  // ── detalle: la fila + URL firmada del comprobante (1 h) ─────────────────
  if (accion === 'detalle') {
    const r = await fetch(`${base}?id=eq.${id}&select=*`, { headers: sbH });
    if (!r.ok) return j(502, headers, { error: 'No se pudo leer la requisición' });
    const rows = await r.json();
    if (!rows.length) return j(404, headers, { error: 'Esa requisición no existe' });
    const req = rows[0];
    let signed_url = null;
    if (req.comprobante_path) {
      try {
        const rs = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${encodeURI(req.comprobante_path)}`, {
          method: 'POST',
          headers: Object.assign({}, sbH, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ expiresIn: SIGN_EXPIRA }),
        });
        if (rs.ok) {
          const js = await rs.json().catch(() => null);
          if (js && js.signedURL) signed_url = `${SB_URL}/storage/v1${js.signedURL}`;
        }
      } catch (_) { /* sin firma: la pantalla lo dice, no lo inventa */ }
    }
    return j(200, headers, { ok: true, requisicion: req, signed_url });
  }

  // ── [RECHAZO-AVISO-1] LA VISTA PREVIA ────────────────────────────────────
  // Enseña el correo EXACTO que va a recibir el cliente, antes de rechazar.
  // 🔒 CERO escrituras: ni un PATCH, ni un correo. Enseñar no es mandar.
  if (accion === 'rechazo_preview') {
    const CR = require('./_lib/correo-rechazo');
    const rq = await fetch(`${base}?id=eq.${id}&select=*`, { headers: sbH });
    if (!rq.ok) return j(502, headers, { error: 'No se pudo leer la solicitud' });
    const req = (await rq.json())[0];
    if (!req) return j(404, headers, { error: 'Esa solicitud ya no existe' });
    const prev = await CR.armarRechazo({
      req, motivo_clave: body.motivo_clave,
      motivo_texto: String(body.motivo || '').trim().slice(0, 500),
    });
    // [RECHAZO-AVISO-1b] Se lo DICE antes del clic, no después del correo.
    const ya = await CR.yaViajaEnEvento({ req, KH_URL: SB_URL, KH_KEY: SB_KEY });
    return j(200, headers, {
      ok: true, motivos: CR.MOTIVOS, pago: !!req.comprobante_path,
      wa: CR.waDe(req), tiene_correo: !!req.correo, preview: prev, ya_viaja: ya,
    });
  }

  // ── rechazar: motivo OBLIGATORIO — un rechazo sin palabra no le sirve a
  // nadie: ni al cliente que pregunta ni al que lo revisa en un mes. ────────
  //
  // [RECHAZO-AVISO-1] Y DESDE HOY LE AVISA AL CLIENTE. Medido antes: esta
  // acción solo hacía el PATCH, así que cuatro personas que YA habían
  // transferido quedaron rechazadas sin enterarse. El correo sale SOLO (palabra
  // de Memo) y la bandeja ya enseñó el texto exacto antes del clic.
  // 🔒 El aviso JAMÁS tumba el rechazo: si el correo falla, la solicitud queda
  //    rechazada igual y la respuesta DICE que no salió, con el link de
  //    WhatsApp para avisarle a mano. Es la misma ley del correo único.
  if (accion === 'rechazar') {
    const CR = require('./_lib/correo-rechazo');
    const motivo = String(body.motivo || '').trim().slice(0, 500);
    if (motivo.length < 3) return j(400, headers, { error: 'Di por qué se rechaza (el cliente lo va a preguntar)' });
    const clave = body.motivo_clave == null ? null : String(body.motivo_clave);
    if (clave !== null && !CR.CLAVES.includes(clave)) return j(400, headers, { error: 'Ese motivo no existe en la lista' });
    const r = await fetch(`${base}?id=eq.${id}&estado=eq.pendiente`, {
      method: 'PATCH',
      headers: Object.assign({}, sbH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify({ estado: 'rechazada', motivo_rechazo: motivo, motivo_clave: clave, revisada_por: quien, revisada_at: new Date().toISOString() }),
    });
    if (!r.ok) return j(502, headers, { error: 'No se pudo rechazar', detail: (await r.text()).slice(0, 300) });
    const rows = await r.json();
    if (!rows.length) return j(409, headers, { error: 'Esa requisición ya no está pendiente — alguien más la revisó' });
    let aviso = { avisado: false, razon: 'no se intentó' };
    try {
      aviso = await CR.avisarRechazo({ req: rows[0], motivo_clave: clave, motivo_texto: motivo, KH_URL: SB_URL, KH_KEY: SB_KEY });
    } catch (e) { aviso = { avisado: false, razon: 'El aviso falló', detail: String(e.message).slice(0, 200), wa: CR.waDe(rows[0]) }; }
    return j(200, headers, { ok: true, requisicion: rows[0], aviso });
  }

  // ── [PRUEBA-ARCHIVO-1] archivar_prueba: «quítala, fue de prueba» ─────────
  // Palabra de Memo (13-oct): «dame opción de eliminar manualmente las
  // solicitudes de prueba». No se borra a ciegas: TODO lo que se quita se COPIA
  // antes a `pruebas_archivo_*` (con quién, cuándo y por qué) y solo entonces se
  // saca de las tablas vivas. Si la requisición estaba APROBADA, se van también
  // los viajeros que nacieron de ELLA (nota «Requisición FOLIO») y SUS abonos.
  // 🔒 Candado: si alguno de esos viajeros tiene un pago que NO vino de la
  // requisición (capturado a mano después), se REHÚSA — eso ya es dinero real y
  // no se archiva como prueba.
  if (accion === 'archivar_prueba') {
    if (body.confirmar !== true) return j(400, headers, { error: 'Archivar pide confirmar:true' });
    const motivo = String(body.motivo || 'prueba').trim().slice(0, 300) || 'prueba';
    const H = Object.assign({}, sbH, { 'Content-Type': 'application/json' });
    const leer = async (u) => { const r = await fetch(u, { headers: sbH }); if (!r.ok) throw new Error((await r.text()).slice(0, 200)); return r.json(); };
    let req, viajeros = [], abonos = [];
    try {
      req = (await leer(`${base}?id=eq.${id}&select=*`))[0];
      if (!req) return j(404, headers, { error: 'Esa solicitud ya no existe' });
      if (req.estado === 'aprobada') {
        const porNota = await leer(`${SB_URL}/rest/v1/viajeros_evento?evento_id=eq.${encodeURIComponent(req.evento_id)}&notas=like.${encodeURIComponent('Requisición ' + req.folio + '*')}&select=*`);
        const ids = new Set(porNota.map((v) => v.id));
        if (req.viajero_id && !ids.has(req.viajero_id)) {
          const t = await leer(`${SB_URL}/rest/v1/viajeros_evento?id=eq.${req.viajero_id}&select=*`);
          t.forEach((v) => { ids.add(v.id); porNota.push(v); });
        }
        viajeros = porNota;
        if (ids.size) {
          abonos = await leer(`${SB_URL}/rest/v1/abonos_viajero?viajero_id=in.(${Array.from(ids).join(',')})&select=*`);
          const ajenos = abonos.filter((a) => !String(a.nota || '').includes(req.folio));
          if (ajenos.length) {
            return j(409, headers, { error: `No se archiva: ${ajenos.length} pago(s) de esa persona se capturaron aparte de la solicitud (dinero real). Revísalo a mano.` });
          }
        }
      }
    } catch (e) { return j(502, headers, { error: 'No pude leer lo que hay que archivar', detail: e.message }); }
    const sello = { archivado_por: quien, motivo_archivo: motivo };
    // 1 · COPIAR al archivo (si falla, no se borra nada).
    const copiar = async (tabla, filas) => {
      if (!filas.length) return true;
      const r = await fetch(`${SB_URL}/rest/v1/${tabla}`, { method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify(filas.map((f) => Object.assign({}, f, sello))) });
      if (!r.ok) throw new Error(tabla + ': ' + (await r.text()).slice(0, 200));
      return true;
    };
    try {
      await copiar('pruebas_archivo_requisiciones', [req]);
      await copiar('pruebas_archivo_viajeros', viajeros);
      await copiar('pruebas_archivo_abonos', abonos);
    } catch (e) { return j(502, headers, { error: 'No se pudo copiar al archivo — no se quitó nada', detail: e.message }); }
    // 2 · QUITAR de las tablas vivas, en orden de llaves (abonos → requisición → viajeros).
    const quitar = async (u) => { const r = await fetch(u, { method: 'DELETE', headers: Object.assign({}, sbH, { Prefer: 'return=representation' }) }); if (!r.ok) throw new Error((await r.text()).slice(0, 200)); return (await r.json()).length; };
    try {
      if (abonos.length) await quitar(`${SB_URL}/rest/v1/abonos_viajero?id=in.(${abonos.map((a) => a.id).join(',')})`);
      await quitar(`${base}?id=eq.${id}&folio=eq.${encodeURIComponent(req.folio)}`);
      if (viajeros.length) await quitar(`${SB_URL}/rest/v1/viajeros_evento?id=in.(${viajeros.map((v) => v.id).join(',')})`);
    } catch (e) {
      return j(207, headers, { ok: false, error: 'Se copió al archivo pero no se terminó de quitar — avísale a Jane', detail: e.message });
    }
    return j(200, headers, { ok: true, folio: req.folio, viajeros: viajeros.length, abonos: abonos.length });
  }

  // ── aprobar: NACE el viajero ──────────────────────────────────────────────
  if (accion === 'aprobar') {
    // 1 · Leer la fila (para armar el viajero con sus datos).
    const r0 = await fetch(`${base}?id=eq.${id}&select=*`, { headers: sbH });
    if (!r0.ok) return j(502, headers, { error: 'No se pudo leer la requisición' });
    const rows0 = await r0.json();
    if (!rows0.length) return j(404, headers, { error: 'Esa requisición no existe' });
    const req = rows0[0];
    if (req.estado !== 'pendiente') return j(409, headers, { error: `Ya está ${req.estado}` });

    // [REQ-DUP-1] EL CANDADO DEL DUPLICADO, en el servidor (la regla, no la UI).
    // Si este celular/correo YA tiene una requisición APROBADA en este evento,
    // aprobar otra duplica lugares y dinero (caso Virginia Moguel, 19-oct: el
    // mismo comprobante se aprobó dos veces). Solo pasa con `duplicado_ok:true`
    // — la palabra de quien COMPARÓ los comprobantes y vio dos pagos distintos.
    // La verificación es parte de la aprobación: si no se puede leer, no se
    // aprueba a ciegas (un candado que falla en silencio no es un candado).
    {
      const cN = String(req.celular || '').replace(/\D/g, '');
      const mN = String(req.correo || '').trim().toLowerCase();
      const rd = await fetch(`${base}?select=id,folio,celular,correo&evento_id=eq.${encodeURIComponent(req.evento_id)}&estado=eq.aprobada&limit=500`, { headers: sbH });
      if (!rd.ok) return j(502, headers, { error: 'No se pudo verificar si hay duplicados — reintenta en un momento' });
      const gem = (await rd.json()).filter((o) => o.id !== id &&
        ((cN && String(o.celular || '').replace(/\D/g, '') === cN) || (mN && String(o.correo || '').trim().toLowerCase() === mN)));
      if (gem.length && body.duplicado_ok !== true) {
        return j(409, headers, {
          error: `Este celular/correo ya tiene aprobada ${gem.map((g) => g.folio).join(', ')} en este mismo evento. Compara los comprobantes: si es la MISMA transferencia, recházala como duplicada; si es una compra nueva de verdad (otro pago), confírmalo.`,
          duplicado: gem.map((g) => g.folio),
        });
      }
    }

    // 2 · El dinero, tecleado por el humano que vio el comprobante.
    const monto = Math.round(Number(body.monto));
    if (!(monto > 0)) return j(400, headers, { error: 'El monto del abono va en pesos y mayor a cero — es lo que dice el comprobante que verificaste' });
    const total_contrato = (body.total_contrato != null && body.total_contrato !== '')
      ? Math.round(Number(body.total_contrato))
      : (req.total_sistema != null ? Math.round(Number(req.total_sistema)) : null);
    if (!(total_contrato > 0)) return j(400, headers, { error: 'Falta el total del contrato (el sistema no lo tiene para este caso — por ejemplo CDMX con transporte): captúralo' });
    // [DESGLOSE-1] Pagar DE MÁS se permite solo si quien aprueba lo dice
    // (`saldo_favor:true`): el excedente queda como saldo a favor del cliente.
    // Sin esa palabra sigue siendo el candado de siempre contra un dedazo.
    if (monto > total_contrato && body.saldo_favor !== true) return j(400, headers, { error: `El abono ($${monto}) es mayor que el total del contrato ($${total_contrato}). Si el cliente sí pagó de más, confírmalo para dejar $${monto - total_contrato} como saldo a favor; si no, revisa el comprobante.` });
    const notaStaff = String(body.nota || '').trim().slice(0, 500);

    // 3 · La zona, por la PUERTA. El staff puede corregirla al aprobar.
    let zonaFinal = null;
    if (req.paquete !== 'ride') {
      const capturada = String(body.zona != null && String(body.zona).trim() !== '' ? body.zona : (req.zona || '')).trim();
      if (!capturada) return j(400, headers, { error: 'Falta la zona del boleto' });
      let p;
      try { p = await puertaZona(req.evento_id, capturada); } catch (e) { p = { estado: 'sin-catalogo', zona: capturada }; }
      if (p.estado === 'desconocida') {
        return j(409, headers, { error: `La zona «${capturada}» no existe en la ficha de ${req.evento_id}. Las de la ficha: ${(p.canonicas || []).join(' · ') || '(no se pudieron leer)'}` });
      }
      if (p.estado === 'sin-evento') return j(409, headers, { error: `El evento ${req.evento_id} ya no está en el catálogo` });
      // 'sin-catalogo' pasa tal cual Y SE CONFIESA en la nota (regla DISPO-NORM-1).
      zonaFinal = p.zona;
      var zonaConfesion = (p.estado === 'canonizada') ? ` · zona escrita «${p.capturada}», guardada como la ficha la escribe` :
                          (p.estado === 'sin-catalogo') ? ' · ⚠️ catálogo ilegible al aprobar: la zona pasó sin validar' : '';
    }

    // 3b · [DESGLOSE-1] El desglose se valida ANTES de reclamar: un 400 después
    // del reclamo dejaría la requisición «aprobada» sin viajeros.
    let desglosePre = null;
    {
      const nPre = (Array.isArray(req.acompanantes) && req.acompanantes.length === Math.max(0, (req.num_personas || 1) - 1) && req.acompanantes.length)
        ? req.acompanantes.length + 1 : 1;
      if (nPre > 1 && body.desglose != null) {
        const d = Array.isArray(body.desglose) ? body.desglose.map((x) => Math.round(Number(x))) : null;
        if (!d || d.length !== nPre || d.some((x) => !Number.isFinite(x) || x < 0)) {
          return j(400, headers, { error: `El desglose tiene que traer ${nPre} montos (uno por persona), en pesos y sin negativos` });
        }
        const suma = d.reduce((a, b) => a + b, 0);
        if (suma !== monto) return j(400, headers, { error: `El desglose suma $${suma} y el abono verificado es $${monto}: tienen que ser iguales` });
        desglosePre = d;
      }
    }

    // 4 · RECLAMAR la requisición (cierra la carrera del doble clic).
    const rClaim = await fetch(`${base}?id=eq.${id}&estado=eq.pendiente`, {
      method: 'PATCH',
      headers: Object.assign({}, sbH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify({ estado: 'aprobada', revisada_por: quien, revisada_at: new Date().toISOString(), nota_staff: notaStaff || null }),
    });
    if (!rClaim.ok) return j(502, headers, { error: 'No se pudo reclamar la requisición', detail: (await rClaim.text()).slice(0, 300) });
    const claimed = await rClaim.json();
    if (!claimed.length) return j(409, headers, { error: 'Alguien más la revisó primero — refresca la bandeja' });

    const hoyMX = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
    const notaViajero = [
      `Requisición ${req.folio} · ${req.forma_pago}${req.transporte ? ' · ' + req.transporte : ''}${req.hotel ? ' · hotel: ' + req.hotel : ''}`,
      `aprobada por ${quien} ${hoyMX}${zonaConfesion || ''}`,
      notaStaff ? `nota: ${notaStaff}` : '',
    ].filter(Boolean).join(' · ');

    // 5 · NACEN LOS VIAJEROS. INSERT directo (un solo POST con todas las filas:
    // PostgREST lo hace en una transacción — o nacen todos o ninguno).
    // [ACOMP-1] Con acompañantes: UN viajero por persona, boletos=1 cada uno,
    // y el contrato se REPARTE (palabra de Memo, 13-oct: «repartido — cada
    // viajero queda con su lugar pagado»). El residuo de la división va al
    // titular, para que la suma cuadre AL PESO con lo que se tecleó.
    // Sin acompañantes (requisición de antes de ACOMP-1, o de 1 persona): UN
    // viajero con N boletos, exactamente como siempre.
    const acomp = (Array.isArray(req.acompanantes) && req.acompanantes.length === Math.max(0, (req.num_personas || 1) - 1))
      ? req.acompanantes : null;
    // [ACOMP-1b] talla y emergencia viajan a cada viajero (el Portal las hereda en el puente).
    const personas = acomp && acomp.length ? [{ nombre: req.nombre, correo: req.correo, celular: req.celular,
        talla_playera: req.talla_playera || null, num_emergencia: req.num_emergencia || null, titular: true }]
      .concat(acomp.map((a) => ({ nombre: a.nombre, correo: a.correo || req.correo, celular: a.celular || null,
        talla_playera: a.talla_playera || null, num_emergencia: a.num_emergencia || null, titular: false }))) : null;
    const N = personas ? personas.length : 1;
    const repartir = (x) => { const base = Math.floor(x / N); return Array.from({ length: N }, (_, i) => base + (i === 0 ? x - base * N : 0)); };
    const contratos = repartir(total_contrato);
    // [DESGLOSE-1] Cuánto pagó cada quien: lo CONFIRMA quien aprueba (viene
    // prellenado con lo que declaró el cliente y lo puede corregir). Tiene que
    // sumar EXACTO el abono verificado. Sin desglose: repartido al peso.
    let montos = repartir(monto);
    const desgloseUsado = !!(personas && desglosePre);
    if (desgloseUsado) montos = desglosePre;
    // [GRUPO-VIAJE-1] Los que nacen de UNA requisición viajan juntos: misma
    // llave de grupo para que Bulma/Milk los vean como un solo grupo.
    const grupoViaje = personas ? require('crypto').randomUUID() : null;
    // [PORTAL-SOLO-1] Aprobar ES revisar: alguien vio el comprobante y tecleó
    // el monto. Las filas nacen SELLADAS para el Portal (sin doble trabajo).
    const sello = { portal_revisado_at: new Date().toISOString(), portal_revisado_por: 'requisición ' + req.folio + ' · aprobó ' + quien };
    const filasV = (personas
      ? personas.map((p, i) => ({
          grupo_viaje: grupoViaje,
          evento_id: req.evento_id, nombre: p.nombre, celular: p.celular, correo: p.correo,
          talla_playera: p.talla_playera, num_emergencia: p.num_emergencia,
          tipo_paquete: req.paquete, zona_boleto: zonaFinal, boletos: 1,
          total_contrato: contratos[i], abonado_previo: 0,
          notas: notaViajero + (p.titular ? ` · titular de ${N} lugares` : ` · acompañante de ${req.nombre}`),
        }))
      : [{
          evento_id: req.evento_id, nombre: req.nombre, celular: req.celular, correo: req.correo,
          talla_playera: req.talla_playera || null, num_emergencia: req.num_emergencia || null,
          tipo_paquete: req.paquete, zona_boleto: zonaFinal, boletos: req.num_personas,
          total_contrato, abonado_previo: 0, notas: notaViajero,
        }]).map((f) => Object.assign(f, sello));
    const rV = await fetch(`${SB_URL}/rest/v1/viajeros_evento`, {
      method: 'POST',
      headers: Object.assign({}, sbH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(filasV),
    });
    if (!rV.ok) {
      const det = (await rV.text().catch(() => '')).slice(0, 300);
      // Revertir el reclamo: la requisición vuelve a pendiente y se dice.
      await fetch(`${base}?id=eq.${id}&estado=eq.aprobada`, {
        method: 'PATCH',
        headers: Object.assign({}, sbH, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ estado: 'pendiente', revisada_por: null, revisada_at: null }),
      }).catch(() => {});
      return j(502, headers, { error: 'No se pudo crear el viajero — la requisición sigue PENDIENTE, inténtalo otra vez', detail: det });
    }
    const nacidos = await rV.json();
    const vNuevo = nacidos[0];

    // 6 · LOS ABONOS, con el comprobante heredado. capturado_por del JWT.
    // Repartidos igual que el contrato: cada viajero ve su lugar cubierto, y
    // la nota dice QUIÉN pagó (un abono de $300 a nombre del acompañante sin
    // esa nota se leería como dinero que él puso).
    const filasA = nacidos.map((v, i) => ({
      viajero_id: v.id,
      monto: montos[i],
      nota: `Requisición ${req.folio} · comprobante verificado al aprobar`
        + (N > 1 ? (desgloseUsado
          ? ` · su parte del pago del grupo según el desglose confirmado por ${quien} (${i + 1} de ${N}, total $${monto}, comprobante enviado por ${req.nombre})`
          : ` · pagado por ${req.nombre} (${i + 1} de ${N}, total $${monto})`) : ''),
      foto_path: req.comprobante_path || null,
      capturado_por: quien,
    })).filter((a) => a.monto > 0);
    const rA = await fetch(`${SB_URL}/rest/v1/abonos_viajero`, {
      method: 'POST',
      headers: Object.assign({}, sbH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(filasA),
    });
    if (!rA.ok) {
      const det = (await rA.text().catch(() => '')).slice(0, 300);
      // Los viajeros YA nacieron — no se borran (datos de gente). Instrucción exacta:
      return j(207, headers, {
        ok: false, viajero_id: vNuevo.id, viajeros: nacidos.map((v) => v.id),
        error: `Los viajeros quedaron creados pero LOS ABONOS NO SE REGISTRARON. Captúralos a mano con ➕ Abono (${nacidos.map((v, i) => `«${v.nombre}» $${montos[i]}`).join(' · ')} — requisición ${req.folio}).`,
        detail: det,
      });
    }

    // 7 · Colgarle el viajero TITULAR a la requisición (informativo; si falla, se dice).
    let enlaceOk = true;
    try {
      const rE = await fetch(`${base}?id=eq.${id}`, {
        method: 'PATCH',
        headers: Object.assign({}, sbH, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ viajero_id: vNuevo.id }),
      });
      enlaceOk = rE.ok;
    } catch (_) { enlaceOk = false; }

    // 8 · [CONFIRMA-1] EL CORREO ÚNICO: «¡Tu lugar está confirmado!» con la
    // invitación al Portal adentro. Solo en los eventos de EVENTOS_CORREO
    // (la lib decide y devuelve null fuera de ellos). Nunca deshace la
    // aprobación: si falla, la respuesta lo DICE.
    const recibidoPorViajero = {};
    nacidos.forEach((v, i) => { recibidoPorViajero[v.id] = N > 1 ? montos[i] : monto; });
    const portal = await enviarCorreoPago({
      tipo: 'reserva', evento_id: req.evento_id, viajeroIds: nacidos.map((v) => v.id), recibidoPorViajero,
      enviado_por: auth.user && auth.user.correo, KH_URL: SB_URL, KH_KEY: SB_KEY,
    });

    // 9 · [CONTRATO-CLIENTE-1] El contrato de cada viajero nacido, con su link
    // de firma por correo (uno por dirección). La lib se salta la preventa a
    // ciegas (su contrato nace al elegir paquete) y jamás lanza: nunca deshace
    // la aprobación — si falla, la respuesta lo DICE.
    const { emitirContratos } = require('./_lib/contrato-cliente');
    const contrato = await emitirContratos({
      viajeroIds: nacidos.map((v) => v.id), creado_por: auth.user && auth.user.correo,
      KH_URL: SB_URL, KH_KEY: SB_KEY,
    });

    return j(200, headers, {
      contrato,
      ok: true,
      viajero_id: vNuevo.id,
      viajeros: nacidos.map((v, i) => ({ id: v.id, nombre: v.nombre, correo: v.correo, contrato: contratos[i] != null && N > 1 ? contratos[i] : total_contrato, abono: N > 1 ? montos[i] : monto })),
      folio: req.folio,
      zona: zonaFinal,
      total_contrato,
      monto,
      enlace_registrado: enlaceOk,
      portal,
    });
  }

  return j(400, headers, { error: 'Acción no implementada' });
};

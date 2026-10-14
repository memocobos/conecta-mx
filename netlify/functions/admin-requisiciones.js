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
  // [PORTAL-EDIT-1] las solicitudes de cambio que el cliente manda desde el Portal.
  cambios_listar: ROLES_BANDEJA,
  cambio_cerrar: ROLES_BANDEJA,
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
    return j(200, headers, { ok: true, requisiciones: rows, pendientes: pend });
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
    return j(200, headers, { ok: true, cambio: rows[0] });
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

  // ── rechazar: motivo OBLIGATORIO — un rechazo sin palabra no le sirve a
  // nadie: ni al cliente que pregunta ni al que lo revisa en un mes. ────────
  if (accion === 'rechazar') {
    const motivo = String(body.motivo || '').trim().slice(0, 500);
    if (motivo.length < 3) return j(400, headers, { error: 'Di por qué se rechaza (el cliente lo va a preguntar)' });
    const r = await fetch(`${base}?id=eq.${id}&estado=eq.pendiente`, {
      method: 'PATCH',
      headers: Object.assign({}, sbH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify({ estado: 'rechazada', motivo_rechazo: motivo, revisada_por: quien, revisada_at: new Date().toISOString() }),
    });
    if (!r.ok) return j(502, headers, { error: 'No se pudo rechazar', detail: (await r.text()).slice(0, 300) });
    const rows = await r.json();
    if (!rows.length) return j(409, headers, { error: 'Esa requisición ya no está pendiente — alguien más la revisó' });
    return j(200, headers, { ok: true, requisicion: rows[0] });
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
    const filasV = personas
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
        }];
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

    return j(200, headers, {
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

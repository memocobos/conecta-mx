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
};
// [ACOMP-1] Eventos donde aprobar = dar acceso al Portal (puente + invitación).
// Palabra de Memo (13-oct): «para los de Pa'l Norte, solo esos por el momento».
const PORTAL_AL_APROBAR = ['palnorte'];
const SIGN_EXPIRA = 60 * 60; // 1 hora, como admin-solicitud-comprobante
const BUCKET = 'abonos-viajeros';

// ── [ACOMP-1] El Portal al aprobar. Usa las MISMAS libs que los botones del
// puente y de invitar (una sola fuente de «cómo entra alguien al Portal»).
// Jamás lanza: devuelve un resumen que la bandeja pinta.
async function portalAlAprobar({ req, nacidos, quien, SB_URL, SB_KEY }) {
  const PT_URL = process.env.PORTAL_SUPABASE_URL;
  const PT_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
  if (!PT_URL || !PT_KEY) return { ok: false, aviso: 'Faltan las llaves del Portal: no se invitó a nadie. Usa «Invitar al Portal» del evento cuando estén.' };
  if (!RESEND_KEY) return { ok: false, aviso: 'Falta RESEND_API_KEY: no se mandó ninguna invitación.' };
  const sbH = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
  const evento_id = String(req.evento_id).split('#')[0];
  try {
    const { puentearViajeros } = require('./_lib/puente-portal');
    const { aQuienInvitar, enviarInvitaciones } = require('./_lib/invitacion-portal');
    const { llaveCorreo } = require('./_lib/correo-forma');
    const ids = nacidos.map((v) => '"' + v.id + '"').join(',');
    const sel = 'id,nombre,correo,celular,talla_playera,emergencia_nombre,num_emergencia,portal_cliente_id';
    const leer = async () => {
      const r = await fetch(`${SB_URL}/rest/v1/viajeros_evento?id=in.(${encodeURIComponent(ids)})&select=${sel}`, { headers: sbH });
      if (!r.ok) throw new Error('no pude releer los viajeros recién creados');
      return r.json();
    };
    // 1 · Puente (alta en `clientes` del Portal + enlace portal_cliente_id).
    const pu = await puentearViajeros({ evento_id, viajeros: await leer(), KH_URL: SB_URL, KH_KEY: SB_KEY, PT_URL, PT_KEY, ejecutar: true });
    if (pu.error) return { ok: false, aviso: 'El puente al Portal falló: ' + pu.error + ' — usa «Invitar al Portal» del evento después.' };
    // 2 · Bitácora: a quién ya se invitó a ESTE evento (sin bitácora no se invita).
    const bR = await fetch(`${SB_URL}/rest/v1/invitaciones_portal?evento_id=eq.${encodeURIComponent(evento_id)}&select=correo&limit=5000`, { headers: sbH });
    if (!bR.ok) return { ok: false, aviso: 'No pude leer la bitácora de invitaciones: no se mandó nada (sin bitácora no se invita a nadie).' };
    const ya = new Set((await bR.json()).map((x) => llaveCorreo(x.correo)).filter(Boolean));
    const quienes = aQuienInvitar(await leer(), ya);
    if (quienes.error) return { ok: false, aviso: quienes.error };
    // 3 · El catálogo: la invitación no sale sin decir a QUÉ viaje (PROMO-DERIVA).
    const { fetchEventosRaw } = require('./_lib/catalogo-index');
    const EV = await fetchEventosRaw();
    const ev = (Array.isArray(EV) ? EV : []).find((e) => e && e.id === evento_id) || null;
    if (!ev) return { ok: false, aviso: 'No pude leer el evento en el catálogo: no se mandó ninguna invitación.' };
    // 4 · Envío + bitácora DESPUÉS de cada envío (la lib).
    const env = await enviarInvitaciones({ lista: quienes.invitar, ev, evento_id, KH_URL: SB_URL, KH_KEY: SB_KEY, RESEND_KEY, enviado_por: quien || null });
    return {
      ok: env.errores.length === 0,
      cuentas_creadas: (pu.creados || []).length,
      invitados: env.enviados.map((x) => x.correo),
      ya_invitados: quienes.ya_invitados.map((x) => x.correo),
      saltados: quienes.saltados,
      errores: env.errores,
    };
  } catch (e) {
    return { ok: false, aviso: 'El acceso al Portal falló: ' + e.message + ' — la aprobación SÍ quedó; usa «Invitar al Portal» del evento.' };
  }
}

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
    if (monto > total_contrato) return j(400, headers, { error: `El abono ($${monto}) no puede ser mayor que el total del contrato ($${total_contrato}). Si el cliente pagó de más, ajusta el total o revisa el comprobante.` });
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
    const personas = acomp && acomp.length ? [{ nombre: req.nombre, correo: req.correo, celular: req.celular, titular: true }]
      .concat(acomp.map((a) => ({ nombre: a.nombre, correo: a.correo || req.correo, celular: null, titular: false }))) : null;
    const N = personas ? personas.length : 1;
    const repartir = (x) => { const base = Math.floor(x / N); return Array.from({ length: N }, (_, i) => base + (i === 0 ? x - base * N : 0)); };
    const contratos = repartir(total_contrato);
    const montos = repartir(monto);
    const filasV = personas
      ? personas.map((p, i) => ({
          evento_id: req.evento_id, nombre: p.nombre, celular: p.celular, correo: p.correo,
          tipo_paquete: req.paquete, zona_boleto: zonaFinal, boletos: 1,
          total_contrato: contratos[i], abonado_previo: 0,
          notas: notaViajero + (p.titular ? ` · titular de ${N} lugares` : ` · acompañante de ${req.nombre}`),
        }))
      : [{
          evento_id: req.evento_id, nombre: req.nombre, celular: req.celular, correo: req.correo,
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
        + (N > 1 ? ` · pagado por ${req.nombre} (${i + 1} de ${N}, total $${monto})` : ''),
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

    // 8 · [ACOMP-1] EL PORTAL: puente + invitación a cada correo, al aprobar.
    // Solo en los eventos de PORTAL_AL_APROBAR (palabra de Memo: «para los de
    // Pa'l Norte, solo esos por el momento»). Nada de esto deshace la
    // aprobación: si falla, la respuesta lo DICE y el botón «Invitar al
    // Portal» del evento lo completa después (misma lib, misma bitácora).
    let portal = null;
    if (PORTAL_AL_APROBAR.includes(String(req.evento_id).split('#')[0])) {
      portal = await portalAlAprobar({ req, nacidos, quien: auth.user && auth.user.correo, SB_URL, SB_KEY });
    }

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

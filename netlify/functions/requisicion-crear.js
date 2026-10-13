// =============================================================================
// requisicion-crear — FASE B del rumbo (12-oct-2026): la ENTRADA del index.
//
// El cliente cotiza en el index, elige cómo pagó (transferencia / depósito /
// OXXO) o pide un link de pago, sube su comprobante y esto levanta una
// REQUISICIÓN que cae a la bandeja de KameHouse. AQUÍ NO NACE NINGÚN VIAJERO
// y NO SE REGISTRA UN PESO: eso lo hace un humano (Bulma/Milk) al aprobar en
// admin-requisiciones. Nada automático decide dinero.
//
// 🔒 EL PRECIO NO VIENE DEL CLIENTE. El payload trae su cotización como TEXTO
//    (snapshot informativo de lo que vio); el total y el separo que se guardan
//    los calcula resolverPrecioVenta contra el catálogo SERVIDO — la misma
//    autoridad de todas las ventas (AUD-2). Si el catálogo dice que no se
//    vende (agotado, pasado, zona prox), la requisición NO nace: 409 con la
//    razón, para que el cliente no pague por un lugar que no existe.
//    ⚠️ En CDMX con paquete de transporte, el total del dueño va SIN el
//    transporte (requiere_transporte: true viaja en el desglose) — igual que
//    CUADRE-5/6. El staff lo ve rotulado en la bandeja.
// 🔒 EL COMPROBANTE va al bucket PRIVADO `abonos-viajeros` (prefijo `req/`),
//    subido aquí con la service key — jamás llaves en el navegador. Va a ESE
//    bucket a propósito: al aprobar, el abono hereda este mismo path en su
//    `foto_path` y el visor de abonos que ya existe (firma contra
//    abonos-viajeros) lo abre sin copiar nada. El tipo se detecta por MAGIA
//    (bytes), no por la extensión que diga el cliente. Obligatorio para
//    transferencia/depósito/OXXO; para link_pago no hay nada que comprobar
//    todavía (el cliente está PIDIENDO el link).
// 🔒 El path del archivo se construye AQUÍ (folio + uuid): nada del cliente
//    viaja en la ruta (la lección de giveaway-foto).
// 🔒 Honeypot `web`: si viene lleno es un bot — se contesta ok con folio falso
//    y no se escribe nada.
// 🔒 Tope por celular: 3 pendientes por evento. La cuarta se rechaza con 429
//    diciendo que ya hay una en revisión.
//
// Env (ya existen en Netlify): SUPABASE_URL_KAMEHOUSE,
// SUPABASE_SERVICE_KEY_KAMEHOUSE. Cero variables nuevas.
// =============================================================================

const { corsCheck } = require('./_lib/verify-admin');
const { resolverPrecioVenta } = require('./_lib/precio-zona');

const BUCKET = 'abonos-viajeros'; // el de los abonos, a propósito — ver encabezado
const FORMAS_PAGO = ['transferencia', 'deposito', 'oxxo', 'link_pago'];
const PAQUETES = ['plus', 'stay', 'ride', 'cheap'];
const MAX_B64 = 4.8 * 1024 * 1024;      // ~3.6 MB de archivo real
const MAX_PENDIENTES_POR_CEL = 3;

// Folio corto legible, sin caracteres ambiguos (0/O, 1/I/L).
const FOLIO_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function folioNuevo() {
  const b = require('crypto').randomBytes(5);
  let s = '';
  for (let i = 0; i < 5; i++) s += FOLIO_ABC[b[i] % FOLIO_ABC.length];
  return 'R-' + s;
}

// El tipo se lee de los BYTES. La extensión del cliente es una opinión.
function tipoPorMagia(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (buf.slice(0, 5).toString('ascii') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

function json(status, headers, body) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, headers, { ok: false, error: 'Solo POST' });

  const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!SB_URL || !SB_KEY) return json(502, headers, { ok: false, error: 'Configuración incompleta del servidor' });
  const sbH = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };

  // Guarda de tamaño ANTES de parsear: un body gigante no merece un JSON.parse.
  if ((event.body || '').length > 6.2 * 1024 * 1024) {
    return json(413, headers, { ok: false, error: 'Tu comprobante pesa demasiado. Mándalo como foto (no PDF escaneado grande) e inténtalo otra vez.' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) {
    return json(400, headers, { ok: false, error: 'Cuerpo inválido' });
  }

  // Honeypot: los humanos no ven este campo. Un bot que lo llena recibe un
  // "éxito" de utilería y cero escrituras.
  if (String(body.web || '').trim() !== '') {
    return json(200, headers, { ok: true, folio: folioNuevo() });
  }

  // ── Validación de forma ───────────────────────────────────────────────────
  const nombre = String(body.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (nombre.length < 2) return json(400, headers, { ok: false, error: 'Escribe tu nombre completo' });

  const celular = String(body.celular || '').replace(/\D/g, '');
  if (celular.length !== 10) return json(400, headers, { ok: false, error: 'Tu WhatsApp va a 10 dígitos, sin lada de país' });

  // [ACOMP-1] El correo del titular pasa a OBLIGATORIO: ahí le llega su
  // acceso al Portal al aprobarse la requisición (palabra de Memo, 13-oct).
  const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const correo = String(body.correo || '').trim().toLowerCase().slice(0, 120);
  if (!correo) return json(400, headers, { ok: false, error: 'Escribe tu correo: ahí te llega tu acceso para ver tu plan' });
  if (!RE_CORREO.test(correo)) {
    return json(400, headers, { ok: false, error: 'Ese correo no se ve bien — revísalo' });
  }

  const forma_pago = String(body.forma_pago || '').trim();
  if (!FORMAS_PAGO.includes(forma_pago)) return json(400, headers, { ok: false, error: 'Elige cómo vas a pagar' });

  const paquete = String(body.paquete || '').trim().toLowerCase();
  if (!PAQUETES.includes(paquete)) return json(400, headers, { ok: false, error: 'Paquete inválido' });

  const evento_id = String(body.evento_id || '').trim();
  if (!/^[a-z0-9-]+(#\d+)?$/.test(evento_id)) return json(400, headers, { ok: false, error: 'Evento inválido' });

  const num_personas = Math.floor(Number(body.num_personas || 1));
  if (!(num_personas >= 1 && num_personas <= 20)) return json(400, headers, { ok: false, error: 'Número de viajeros inválido' });

  // ── [ACOMP-1] Los acompañantes: uno por persona ADEMÁS del titular. Cada
  // uno con nombre y correo; el correo vacío cae al del titular (así «toda la
  // info le llega a ella», palabra de Memo). El largo tiene que cuadrar con
  // num_personas — si no, la requisición no nace: repartir boletos sobre una
  // lista que no cuadra inventaría personas.
  // 🔒 OPCIONAL EN EL SERVIDOR, OBLIGATORIO EN EL FORMULARIO: un celular con
  // la página VIEJA en caché no manda acompañantes (pasó el 13-oct con la
  // foto) y no puede quedarse sin poder reservar. Sin la lista, la requisición
  // nace como siempre (UN viajero con N boletos al aprobar).
  let acompanantes = null;
  if (num_personas > 1 && Array.isArray(body.acompanantes)) {
    const lista = body.acompanantes;
    if (lista.length !== num_personas - 1) {
      return json(400, headers, { ok: false, error: `Faltan los datos de tus acompañantes: son ${num_personas - 1} además de ti` });
    }
    acompanantes = [];
    for (let i = 0; i < lista.length; i++) {
      const a = lista[i] || {};
      const n = String(a.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      if (n.length < 2) return json(400, headers, { ok: false, error: `Escribe el nombre completo del acompañante ${i + 1}` });
      let c = String(a.correo || '').trim().toLowerCase().slice(0, 120);
      if (!c) c = correo;
      if (!RE_CORREO.test(c)) return json(400, headers, { ok: false, error: `El correo del acompañante ${i + 1} no se ve bien — revísalo` });
      acompanantes.push({ nombre: n, correo: c });
    }
  }

  const zona = body.zona == null ? null : String(body.zona).trim().slice(0, 80) || null;
  const hotel = body.hotel == null ? null : String(body.hotel).trim().slice(0, 60) || null;
  const transporte = body.transporte == null ? null : String(body.transporte).trim().slice(0, 120) || null;
  const cotizacion_texto = String(body.cotizacion_texto || '').slice(0, 4000) || null;

  // ── La AUTORIDAD del precio. Rehúsa lo no vendible — y esa negativa es la
  // puerta: una requisición de algo que no se vende no debe nacer. ──────────
  let precio;
  try {
    precio = await resolverPrecioVenta({
      evento_id, paquete,
      zona: paquete === 'ride' ? null : zona,
      num_personas,
      hotel_nombre: hotel,
      // ⚠️ transporte_cost NO se le cree al cliente: va 0 y el total sale SIN
      // transporte en CDMX (requiere_transporte viaja en el desglose). El
      // staff ve la cotización completa en el texto que el cliente vio.
      transporte_cost: 0,
    });
  } catch (e) {
    console.error('[requisicion-crear] resolverPrecioVenta:', e.message);
    precio = null;
  }
  if (!precio || precio.indeterminado) {
    return json(502, headers, { ok: false, error: 'No pudimos verificar tu cotización en este momento. Inténtalo en unos minutos o escríbenos por WhatsApp.' });
  }
  if (!precio.ok) {
    return json(409, headers, { ok: false, error: 'Tu cotización ya no está disponible: ' + (precio.motivo || 'el evento cambió') + '. Vuelve a cotizar o escríbenos por WhatsApp.' });
  }

  // ── Tope por celular: 3 pendientes del mismo evento ───────────────────────
  try {
    const r = await fetch(`${SB_URL}/rest/v1/requisiciones?select=id&celular=eq.${celular}&evento_id=eq.${encodeURIComponent(evento_id)}&estado=eq.pendiente&limit=${MAX_PENDIENTES_POR_CEL + 1}`, { headers: sbH });
    const rows = r.ok ? await r.json() : [];
    if (Array.isArray(rows) && rows.length >= MAX_PENDIENTES_POR_CEL) {
      return json(429, headers, { ok: false, error: 'Ya tienes una reservación en revisión para este evento. Bulma o Milk te confirman por WhatsApp — no hace falta mandarla otra vez.' });
    }
  } catch (_) { /* best-effort: el tope caído no frena una venta */ }

  const folio = folioNuevo();

  // ── Comprobante: obligatorio salvo link_pago ──────────────────────────────
  let comprobante_path = null;
  let comprobante_tipo = null;
  const b64 = String(body.comprobante_base64 || '').replace(/^data:[^;]+;base64,/, '');
  if (forma_pago !== 'link_pago' && !b64) {
    return json(400, headers, { ok: false, error: 'Sube la foto de tu comprobante para apartar tu lugar' });
  }
  if (b64) {
    if (b64.length > MAX_B64) {
      return json(413, headers, { ok: false, error: 'Tu comprobante pesa demasiado. Súbelo como foto e inténtalo otra vez.' });
    }
    let buf;
    try { buf = Buffer.from(b64, 'base64'); } catch (_) { buf = null; }
    const tipo = tipoPorMagia(buf);
    if (!tipo) return json(400, headers, { ok: false, error: 'El comprobante tiene que ser foto (JPG/PNG) o PDF' });
    const path = `req/${folio}/${require('crypto').randomUUID()}.${tipo.ext}`;
    let up;
    try {
      up = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
        method: 'POST',
        headers: Object.assign({}, sbH, { 'Content-Type': tipo.mime }),
        body: buf,
      });
    } catch (e) {
      console.error('[requisicion-crear] subida:', e.message);
      return json(502, headers, { ok: false, error: 'No se pudo subir tu comprobante. Revisa tu señal e inténtalo otra vez.' });
    }
    if (!up.ok) {
      const det = await up.text().catch(() => '');
      console.error('[requisicion-crear] bucket:', up.status, det.slice(0, 300));
      return json(502, headers, { ok: false, error: 'No se pudo guardar tu comprobante. Inténtalo otra vez.' });
    }
    comprobante_path = path;
    comprobante_tipo = tipo.mime;
  }

  // ── La fila. INSERT directo (jamás on_conflict); si el folio chocara
  // (23505, improbable), se reintenta UNA vez con folio nuevo. ──────────────
  const fila = {
    folio, evento_id,
    evento_nombre: null, // se deriva abajo, best-effort
    paquete,
    zona: precio.zona || null,            // la CANÓNICA que contestó el dueño
    num_personas,
    hotel, transporte,
    nombre, celular, correo, forma_pago,
    acompanantes,
    total_sistema: precio.total,
    separo_sistema: precio.separo,
    cotizacion_texto,
    comprobante_path, comprobante_tipo,
    estado: 'pendiente',
  };
  // Nombre del evento, derivado del catálogo (informativo, best-effort).
  // fetchEventosRaw devuelve el array EV del index servido (cada evento trae
  // `.id` y `.a`) — fetchCatalogo devuelve OTRA forma (mapa por slug).
  try {
    const { fetchEventosRaw } = require('./_lib/catalogo-index');
    const EV = await fetchEventosRaw();
    const slug = evento_id.split('#')[0];
    const ev = Array.isArray(EV) ? EV.find(x => x && x.id === slug) : null;
    if (ev && ev.a) fila.evento_nombre = String(ev.a).slice(0, 120);
  } catch (_) { /* informativo */ }

  async function insertar(f) {
    return fetch(`${SB_URL}/rest/v1/requisiciones`, {
      method: 'POST',
      headers: Object.assign({}, sbH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(f),
    });
  }
  let ins = await insertar(fila).catch(() => null);
  if (ins && ins.status === 409) {
    // 23505 del folio único: UNA segunda oportunidad con folio nuevo.
    fila.folio = folioNuevo();
    ins = await insertar(fila).catch(() => null);
  }
  if (!ins || !ins.ok) {
    const det = ins ? await ins.text().catch(() => '') : 'sin respuesta';
    console.error('[requisicion-crear] insert:', ins && ins.status, String(det).slice(0, 300));
    return json(502, headers, { ok: false, error: 'No se pudo registrar tu reservación. Inténtalo otra vez o escríbenos por WhatsApp.' });
  }

  return json(200, headers, { ok: true, folio: fila.folio });
};

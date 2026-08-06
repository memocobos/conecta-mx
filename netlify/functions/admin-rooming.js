// =============================================================================
// admin-rooming.js — Acceso server-side a `rooming_habitaciones` (KH)
//
// Cierra la exposición anon: kamehouse.html ya NO lee/escribe rooming_habitaciones
// con la anon key. Todo pasa por aquí con service_role + verifyAdminAuth.
// Pantalla: Capsule Corp (rol maestro_roshi + bulma). Sin backend/cron que la toque.
//
// Body JSON: { accion, ... }   (Roles: maestro_roshi + bulma)
//   - 'listar' { evento_id } → habitaciones del evento (order orden.asc).
//     `evento_id` en el BODY es el SLUG del evento ('melanie'); se guarda y se
//     consulta en la columna `evento_slug` (ver el bloque de COLS).
//   - 'crear'  { evento_id, tipo, orden, numero_hab, ocupantes, hotel_nombre,
//                hotel_direccion, incluye_desayuno } → { ok, hab }.
//   - 'actualizar' { id, patch:{...whitelist} } → ok.
//   - 'eliminar' { id } → ok.
//
// Seguridad: verifyAdminAuth + corsCheck. service_role para la query. Whitelist de
// columnas. NUNCA se expone la service key.
//
// Env vars (KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SLUG_RE = /^[a-zA-Z0-9_-]{1,80}$/;
const ROLES = ['maestro_roshi', 'bulma', 'milk'];

const ACCIONES = { listar: ROLES, crear: ROLES, actualizar: ROLES, eliminar: ROLES };

// [CAP-FIX-1] LA COLUMNA POR LA QUE SE LLAVEA ES `evento_slug`, NO `evento_id`.
//
// `evento_id` es un uuid con FK a la tabla LEGACY `eventos` (17 filas), y el
// mundo de hoy vive en `eventos_meta` por slug (103). Melanie no existe en la
// legacy: ni con el uuid correcto se podría insertar. Esta función recibía el
// slug y lo mandaba a una columna uuid, así que Postgres tumbaba TODA consulta
// con 22P02 (`invalid input syntax for type uuid: "melanie"`) — listar y crear,
// en cualquier evento, desde siempre. Nadie lo notó porque el botón que llega
// aquí estaba deshabilitado.
//
// Las 58 filas viejas conservan su uuid y su FK; se siguen alcanzando POR ID,
// que es como las lee el mundo de transporte (`cargarMundoKH`). Lo nuevo se
// llavea por slug y ya no toca la tabla muerta.
const COLS = 'id,evento_id,evento_slug,tipo,orden,numero_hab,ocupantes,hotel_nombre,hotel_direccion,incluye_desayuno';
// Campos que el cliente puede setear (el evento solo en crear, y va aparte).
const FIELDS = ['tipo', 'orden', 'numero_hab', 'ocupantes', 'hotel_nombre', 'hotel_direccion', 'incluye_desayuno'];
// Capacidad por tipo de habitación (igual que el front, kamehouse.html:10111).
const CAPACIDAD_HAB = { individual: 1, doble: 2, triple: 3, cuadruple: 4 };

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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const accion = body.accion;
  if (!(accion in ACCIONES)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  }

  const auth = await verifyAdminAuthLive(event, ACCIONES[accion]);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const base = `${env.KH_SB_URL}/rest/v1/rooming_habitaciones`;

  try {
    if (accion === 'listar') {
      const eventoId = String(body.evento_id || '').trim();
      if (!SLUG_RE.test(eventoId)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_id inválido' }) };
      }
      const r = await fetch(`${base}?evento_slug=eq.${encodeURIComponent(eventoId)}&select=${COLS}&order=orden.asc`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, habitaciones: await r.json() }) };
    }

    if (accion === 'crear') {
      const eventoId = String(body.evento_id || '').trim();
      if (!SLUG_RE.test(eventoId)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'evento_id inválido' }) };
      }
      const ocupCrear = parseOcupantes(body.ocupantes);
      if (ocupCrear === null) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'ocupantes debe ser una lista de nombres' }) };
      }
      const errCrear = await validarRooming(base, sbHeaders, eventoId, body.tipo, ocupCrear, null);
      if (errCrear) return { statusCode: 400, headers, body: JSON.stringify({ error: errCrear }) };
      const fila = buildFila(body);
      fila.evento_slug = eventoId;
      const r = await fetch(base, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(fila),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el insert', detail }) };
      }
      const rows = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, hab: rows[0] || null }) };
    }

    if (accion === 'actualizar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      }
      const patch = (body.patch && typeof body.patch === 'object') ? body.patch : {};

      // Validar capacidad/duplicados si el patch toca ocupantes o tipo. El patch
      // es parcial: se lee la fila actual para los valores que no vengan.
      if (('ocupantes' in patch) || (patch.tipo != null)) {
        const aR = await fetch(`${base}?id=eq.${id}&select=evento_slug,tipo,ocupantes&limit=1`, { headers: sbHeaders });
        if (!aR.ok) {
          const detail = await aR.text();
          return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta de la habitación', detail }) };
        }
        const aArr = await aR.json();
        const filaActual = Array.isArray(aArr) ? aArr[0] : null;
        if (!filaActual) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Habitación no encontrada' }) };
        const tipoEf = (patch.tipo != null) ? patch.tipo : filaActual.tipo;
        const ocupEf = ('ocupantes' in patch) ? parseOcupantes(patch.ocupantes) : (parseOcupantes(filaActual.ocupantes) || []);
        if (ocupEf === null) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'ocupantes debe ser una lista de nombres' }) };
        }
        // [CAP-FIX-1] El dedup se hace entre cuartos del MISMO evento, y el evento
        // de una fila ahora es su slug. Con el uuid de antes esta consulta
        // tronaba igual que las demás.
        const errAct = await validarRooming(base, sbHeaders, filaActual.evento_slug, tipoEf, ocupEf, id);
        if (errAct) return { statusCode: 400, headers, body: JSON.stringify({ error: errAct }) };
      }

      const fila = buildFila(patch);
      if (!Object.keys(fila).length) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nada que actualizar' }) };
      }
      const r = await fetch(`${base}?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(fila),
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el update', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (accion === 'eliminar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      }
      const r = await fetch(`${base}?id=eq.${id}`, {
        method: 'DELETE',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó el delete', detail }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-rooming', detail: e.message }) };
  }
};

// ----- helpers -----

// Normaliza `ocupantes` (jsonb; el front manda JSON.stringify de un array de
// nombres). Devuelve array de strings limpios, o null si es inválido.
function parseOcupantes(oc) {
  if (oc == null) return [];
  let arr = oc;
  if (typeof oc === 'string') { try { arr = JSON.parse(oc); } catch { return null; } }
  if (!Array.isArray(arr)) return null;
  return arr.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim());
}

// Validación server-side (defensa en profundidad): capacidad por tipo, sin
// viajeros duplicados dentro del cuarto NI entre cuartos del mismo evento, con
// "Chofer" exento. Devuelve un string de error en español, o null si todo OK.
async function validarRooming(base, sbHeaders, eventoSlug, tipo, ocupantes, idActual) {
  const cap = CAPACIDAD_HAB[tipo] || 1;
  if (ocupantes.length > cap) return `Máximo ${cap} persona(s) en habitación ${tipo}`;
  const sinChofer = ocupantes.filter(n => n !== 'Chofer');
  if (new Set(sinChofer).size !== sinChofer.length) return 'Hay un viajero repetido dentro del mismo cuarto';
  // Dedup ENTRE cuartos del mismo evento (excluye la habitación actual en 'actualizar').
  // [CAP-FIX-1] Sin slug (las 58 filas legacy) no hay con qué comparar: se
  // devuelve sin error en vez de inventar un universo vacío que apruebe todo.
  if (!eventoSlug) return null;
  let url = `${base}?evento_slug=eq.${encodeURIComponent(eventoSlug)}&select=id,ocupantes`;
  if (idActual) url += `&id=neq.${idActual}`;
  const r = await fetch(url, { headers: sbHeaders });
  if (r.ok) {
    const otras = await r.json();
    const ocupadosOtros = new Set();
    for (const h of (Array.isArray(otras) ? otras : [])) {
      for (const n of (parseOcupantes(h.ocupantes) || [])) if (n !== 'Chofer') ocupadosOtros.add(n);
    }
    for (const n of sinChofer) if (ocupadosOtros.has(n)) return `${n} ya está asignado en otro cuarto de este evento`;
  }
  return null;
}

// Whitelist de campos seteable (tipo/orden/numero_hab/ocupantes/hotel_*/incluye_desayuno).
function buildFila(src) {
  const out = {};
  for (const k of FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
    let v = src[k];
    if (k === 'orden') {
      const n = Number(v);
      out.orden = Number.isFinite(n) ? n : 0;
    } else if (k === 'incluye_desayuno') {
      out.incluye_desayuno = !!v;
    } else {
      out[k] = (v == null) ? null : (typeof v === 'string' ? v.slice(0, 4000) : v);
    }
  }
  return out;
}

function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}

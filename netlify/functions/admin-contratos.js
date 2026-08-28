// =============================================================================
// admin-contratos.js — Acceso server-side a la tabla `contratos_creadores` (KH)
//
// Cierra la exposición a anon: kamehouse.html ya NO lee `contratos_creadores`
// directo con la anon key. Todo pasa por aquí con service_role + verifyAdminAuth.
// Mismo patrón que admin-usuarios.js / notificaciones.js / reset-password.js.
//
// Body JSON: { accion, ... }
//   - accion='listar'  : SOLO maestro_roshi/bulma.
//        params opcionales: { estado?, evento_fecha?, creador?, evento?, limit? }
//        → { ok, contratos:[...] }  (SIEMPRE con whitelist de columnas)
//   - accion='obtener' : SOLO maestro_roshi/bulma. { id } → { ok, contrato|null }
//
// Seguridad:
//   - Authorization: Bearer <JWT> (verifyAdminAuth) + corsCheck.
//   - SELECT con whitelist explícita COLS. EXCLUIDOS SIEMPRE del output:
//     firma_data, ine, ip_firma (lo más sensible; el panel NO los usa).
//   - El flujo público de firma (contrato-firmar.js) usa service_role aparte;
//     este endpoint NO lo toca. Crear/editar/eliminar/reenviar viven en sus
//     propias functions (contrato-*.js), todas con service_role.
//
// Env vars (reusa las existentes de KH):
//   - SUPABASE_URL_KAMEHOUSE
//   - SUPABASE_SERVICE_KEY_KAMEHOUSE
//   - JWT_SECRET (lo lee verifyAdminAuthLive)
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Contratos son sensibles: solo los dos roles admin del panel alcanzan estas
// lecturas (Herramientas → Contratos y Capsule). mister_popo/coordi/cc NO.
const ROLES_ADMIN = ['maestro_roshi', 'bulma', 'milk'];
const ESTADOS_VALIDOS = ['pendiente', 'firmado'];

// Whitelist de columnas que SÍ pueden viajar al navegador.
// EXCLUIDOS A PROPÓSITO: firma_data, ine, ip_firma (firma digital, identificación
// y huella de IP — lo más sensible; el panel nunca los consume).
// [sec-contratos] `token` queda incluido porque el panel lo usa hoy (link de
// firma) y ya solo llega a admins autenticados.
// [sec-contratos] TODO: evaluar mover el token a una acción de "reenviar link"
// en backend para no exponerlo ni a admins. NO implementar ahora.
const COLS = [
  'id', 'token', 'creador_nombre', 'creador_email', 'evento_nombre',
  'evento_fecha', 'contrato_fecha', 'ofrecimiento', 'expectativas',
  'estado', 'enviado_at', 'firmado_at', 'created_at',
  // VÍA B (F5): plantilla + vigencia (coordinadores/team) para el chip y el
  // aviso "vence en N días" del listado. `datos` (jsonb) NO se incluye aquí (el
  // listado no lo usa y mantiene la whitelist mínima) — SOLO viaja en 'obtener'
  // (detalle admin: ahí vive el Anexo C confidencial de creadora_team).
  'plantilla', 'vigencia_inicio', 'vigencia_fin', 'vigencia_meses',
  // 🗼 SOLO el sub-campo booleano del anexo de custodia (para el chip
  // "cuidador"). PostgREST proyecta datos->cuidador_bodega SIN exponer el resto
  // del jsonb — el Anexo C confidencial del team NO viaja en el listado.
  'cuidador_bodega:datos->cuidador_bodega',
  // [CREA-1b] Dos sub-campos más, MISMO patrón de proyección puntual: el
  // botón de cortesía necesita saber si ya se asignó una (para no ofrecerla
  // dos veces) y si el contrato trae talla (para pedirla a mano si no). Sigue
  // sin viajar el jsonb entero.
  'cortesia_evento:datos->cortesia->>evento_id',
  'talla_contrato:datos->>talla',
].join(',');
// Detalle (accion 'obtener'): whitelist + datos jsonb. Solo admins llegan aquí.
const COLS_DETALLE = COLS + ',datos';

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

  // Auth: ambas acciones exigen rol admin (maestro_roshi/bulma).
  const auth = await verifyAdminAuthLive(event, ROLES_ADMIN);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const accion = body.accion;

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const base = `${env.KH_SB_URL}/rest/v1/contratos_creadores`;

  try {
    // ── listar ────────────────────────────────────────────────────────────
    if (accion === 'listar') {
      const sp = new URLSearchParams();
      sp.set('select', COLS);

      if (typeof body.estado === 'string' && ESTADOS_VALIDOS.includes(body.estado)) {
        sp.append('estado', `eq.${body.estado}`);
      }
      if (typeof body.evento_fecha === 'string' && ISO_DATE_RE.test(body.evento_fecha.trim())) {
        sp.append('evento_fecha', `eq.${body.evento_fecha.trim()}`);
      }
      // creador: busca por nombre o email (ilike, case-insensitive).
      if (typeof body.creador === 'string' && body.creador.trim()) {
        const q = sanitizeLike(body.creador);
        if (q) sp.append('or', `(creador_nombre.ilike.*${q}*,creador_email.ilike.*${q}*)`);
      }
      // evento: busca por nombre del evento (ilike).
      if (typeof body.evento === 'string' && body.evento.trim()) {
        const q = sanitizeLike(body.evento);
        if (q) sp.append('evento_nombre', `ilike.*${q}*`);
      }

      sp.set('order', 'enviado_at.desc');

      let limit = parseInt(body.limit, 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) limit = 200;
      sp.set('limit', String(limit));

      const r = await fetch(`${base}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      const contratos = await r.json();

      // STRIKES (solo lectura, best-effort): a las filas 'creadora_team'
      // FIRMADAS se les cuelga el contador del sistema de strikes existente
      // (usuarios.strikes, casado por correo). Si la consulta falla, el listado
      // sale igual que siempre — jamás bloquea. El sistema de strikes NO se toca.
      try {
        const lista = Array.isArray(contratos) ? contratos : [];
        const correos = [...new Set(lista
          .filter(c => c && c.plantilla === 'creadora_team' && c.estado === 'firmado' && c.creador_email)
          .map(c => String(c.creador_email).toLowerCase()))];
        if (correos.length) {
          const inList = correos.map(c => `"${c.replace(/"/g, '')}"`).join(',');
          const uR = await fetch(
            `${env.KH_SB_URL}/rest/v1/usuarios?correo=in.(${encodeURIComponent(inList)})&select=correo,strikes`,
            { headers: sbHeaders }
          );
          if (uR.ok) {
            const usuarios = await uR.json().catch(() => []);
            const strikesPor = {};
            (Array.isArray(usuarios) ? usuarios : []).forEach(u => {
              if (u && u.correo) strikesPor[String(u.correo).toLowerCase()] = Number(u.strikes) || 0;
            });
            lista.forEach(c => {
              if (c && c.plantilla === 'creadora_team' && c.estado === 'firmado') {
                const s = strikesPor[String(c.creador_email || '').toLowerCase()];
                if (s !== undefined) c.strikes = s;
              }
            });
          }
        }
      } catch (e) { /* best-effort: listado sin strikes */ }

      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, contratos }) };
    }

    // ── obtener ───────────────────────────────────────────────────────────
    if (accion === 'obtener') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id inválido' }) };
      }
      const sp = new URLSearchParams();
      sp.set('select', COLS_DETALLE);
      sp.append('id', `eq.${id}`);
      sp.set('limit', '1');
      const r = await fetch(`${base}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) {
        const detail = await r.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'KH rechazó la consulta', detail }) };
      }
      const rows = await r.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, contrato: rows[0] || null }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-contratos', detail: e.message }) };
  }
};

// ----- helpers -----

// Limpia un término para usarlo dentro de un patrón ilike de PostgREST.
// Quita comas/paréntesis/asteriscos (rompen el or=(...) y el wildcard) y trunca.
function sanitizeLike(s) {
  return String(s || '').trim().replace(/[(),*]/g, '').slice(0, 80);
}

function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}

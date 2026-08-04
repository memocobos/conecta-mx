// _lib/giveaway.js — lo compartido por las tres functions del giveaway.
// Vive aparte para que el CIERRE y el slug tengan UNA sola definición: si la
// fecha viviera copiada en tres archivos, un cambio de última hora dejaría una
// puerta abierta mientras las otras dos ya cerraron.

// Regla de la casa: nunca on_conflict/upsert de PostgREST — con índices únicos
// revienta con 42P10. Insert directo y el 23505 se trata como caso ESPERADO.

const SB_URL = process.env.PORTAL_SUPABASE_URL;
const SB_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY || process.env.PORTAL_SUPABASE_SERVICE;

// El único giveaway de esta versión. Se valida contra la entrada para que la
// function no sea un buzón abierto a cualquier slug inventado.
const SLUG = 'melanie-hades-2026';

// ⚠️ REYNOSA NO ES MONTERREY. Reynosa vive en America/Matamoros, que SÍ trae
// horario de verano (es zona fronteriza, se alinea con Texas); Monterrey vive
// en America/Monterrey, que dejó el horario de verano en 2022. En agosto de
// 2026 eso son -05:00 y -06:00: UNA HORA de diferencia entre dos ciudades a
// dos horas de camino. Escribir '-06:00' aquí habría corrido todo 60 minutos.
//
// Los offsets van EXPLÍCITOS y no se calculan: así el instante es el mismo
// aunque el servidor de Netlify viva en otro continente.
//
// Y son DOS momentos distintos, no uno:
//   CIERRE — deja de aceptarse el registro. 11:00 AM de Reynosa.
//   SORTEO — se gira en vivo, una hora después. 12:00 PM de Reynosa.
const CIERRE = '2026-08-05T11:00:00-05:00';   // 10:00 AM en Monterrey
const SORTEO = '2026-08-05T12:00:00-05:00';   // 11:00 AM en Monterrey

const ALLOWED_ORIGINS = ['https://conectareynosa.mx', 'https://www.conectareynosa.mx'];
const ALLOWED_ORIGINS_DEV = ['http://localhost:8888', 'http://localhost:3999', 'http://127.0.0.1:8888'];
// Mismo regex que _lib/verify-admin: anclado a inicio y fin para que un
// sufijo malicioso (evil--conectareynosa.netlify.app.attacker.com) no pase.
const NETLIFY_PREVIEW_RE = /^https:\/\/[a-z0-9-]+--conectareynosa\.netlify\.app$/;

// ═══════════════════════════════════════════════════════════════════════════
// ORIGIN AUSENTE ≠ ORIGIN AJENO.
//
// El navegador manda `Origin` en los POST del mismo sitio, pero LO OMITE en
// los GET del mismo sitio. Tratar la ausencia como prohibición dejaba a
// giveaway-lista (la única GET de las tres) contestando 403 "origen no
// permitido" a una petición legítima de /sorteo — y el síntoma engañaba,
// porque /giveaway (POST) funcionaba desde el mismo dominio.
//
// Para una petición del mismo sitio, AUSENTE no es AJENO. Y lo que se afloja
// es poco: sin `Origin` no hay página cruzada que esté leyendo la respuesta —
// ese header lo pone el navegador y no se puede falsificar desde JS. Lo que
// esta comprobación frena —otro sitio llamando a la function— SIGUE frenado,
// porque ahí el navegador SÍ manda su Origin y cae en el rechazo de abajo.
//
// El valor de retorno cambia de forma a propósito: '' significa "permitido,
// sin origen que reflejar" y null sigue significando "rechazado". Por eso
// `cabeceras()` ya escribía `origin || 'null'` — el caso vacío estaba previsto.
function corsCheck(event) {
  const h = (event && event.headers) || {};
  const crudo = h.origin || h.Origin;
  // Sin header: misma-origen (o un curl, que no es lo que esto protege).
  if (crudo == null || crudo === '') return '';
  const origin = crudo;
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (NETLIFY_PREVIEW_RE.test(origin)) return origin;
  if (process.env.NETLIFY_DEV === 'true' && ALLOWED_ORIGINS_DEV.includes(origin)) return origin;
  return null;
}

function cabeceras(origin, metodos) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
    'Access-Control-Allow-Methods': metodos,
    'Vary': 'Origin',
  };
}

function json(status, headers, cuerpo) {
  return { statusCode: status, headers, body: JSON.stringify(cuerpo) };
}

function faltaEnv() {
  if (!SB_URL || !SB_KEY) return 'Faltan env vars del Portal (PORTAL_SUPABASE_URL / _SERVICE_KEY)';
  return null;
}

const sbHeaders = () => ({
  apikey: SB_KEY,
  Authorization: 'Bearer ' + SB_KEY,
  'Content-Type': 'application/json',
});

// El registro cerró? Se compara en milisegundos absolutos: `CIERRE` trae su
// offset, así que no hay ambigüedad de zona horaria.
function registroCerrado(ahoraMs) {
  const t = Date.parse(CIERRE);
  if (!Number.isFinite(t)) return false;   // fecha mal escrita: mejor abierto que cerrado por error
  return (ahoraMs != null ? ahoraMs : Date.now()) >= t;
}

// El token de admin, comparado en tiempo constante para no filtrar su largo
// ni sus primeros caracteres a base de medir respuestas.
function tokenAdminValido(event) {
  const esperado = process.env.GIVEAWAY_ADMIN_TOKEN || '';
  if (!esperado) return false;             // sin token configurado NADA es válido
  const h = (event.headers && (event.headers['x-admin-token'] || event.headers['X-Admin-Token'])) || '';
  if (h.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= h.charCodeAt(i) ^ esperado.charCodeAt(i);
  return dif === 0;
}

// La IP real detrás de los proxies de Netlify.
function ipDe(event) {
  const h = event.headers || {};
  const xff = h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || '';
  return String(xff).split(',')[0].trim() || 'desconocida';
}

module.exports = {
  SB_URL, SB_KEY, SLUG, CIERRE, SORTEO,
  corsCheck, cabeceras, json, faltaEnv, sbHeaders,
  registroCerrado, tokenAdminValido, ipDe,
};

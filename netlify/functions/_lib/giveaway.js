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
// [GIVEAWAY-NATA-1, 6-sep-2026] El módulo despertó para NATANAEL CANO.
// [GIVEAWAY-KG-1, 21-sep-2026] Ahora es KAROL G — 7 de noviembre de 2026,
// Estadio BBVA, Monterrey. Natanael queda como pasado, igual que melanie antes.
//
// 🔒 EL SLUG NUEVO NO BORRA NADA: los registros y los sorteos se filtran por
// `slug` en las seis functions, así que las filas de Natanael siguen ahí,
// enteras, y simplemente dejan de ser las del giveaway activo.
const SLUG = 'karolg-bbva-2026';

// ═══════════════════════════════════════════════════════════════════════════
// [SORTEO-RONDAS-1] EL SLUG DE ENSAYO — para ensayar el show sin tocar lo real
//
// 🔒 EN MINÚSCULAS, Y NO ES ESTÉTICA: el regex de `foto_url` en
// giveaway-sortear es `^[a-z0-9-]+\/[a-f0-9]{12}\/…`. Un slug con mayúsculas no
// pasaría y las fotos del ensayo saldrían EN BLANCO sin un solo mensaje de
// error — el peor modo de falla que hay: el que se ve como «ya quedó».
//
// 🔒 Y LA MITAD DEL BLINDAJE YA EXISTÍA: las SEIS functions del módulo filtran
// duro por el slug (ver el comentario de SLUG, arriba), así que
// giveaway-registro, giveaway-recordatorio, giveaway-consuelo y giveaway-foto
// NO PUEDEN VER una fila de ensayo. O sea que un slug de ensayo es
// ESTRUCTURALMENTE INCAPAZ de mandar un correo. Eso no lo agrega esta tuerca:
// es el candado que ya estaba, y el careo lo AFIRMA — porque un candado que
// nadie carea es una nota.
const SLUG_ENSAYO = 'karolg-bbva-2026-ensayo';

// 🔒 DOS VALORES, NUNCA UN SLUG DEL CUERPO. Aceptar `body.slug` convertiría
// estas functions en el «buzón abierto a cualquier slug inventado» contra el
// que advierte el comentario de SLUG veinte líneas más arriba.
//
// Devuelve null para lo desconocido: el llamador contesta 400, no adivina. Y
// ausente/vacío/null cuentan como REAL, porque un `body.modo` que no vino es
// el caso normal —el sorteo de verdad— y no un error que haya que rechazar.
function slugDe(modo) {
  if (modo == null || modo === '' || modo === 'real') return SLUG;
  if (modo === 'ensayo') return SLUG_ENSAYO;
  return null;
}
function esEnsayo(modo) { return slugDe(modo) === SLUG_ENSAYO; }

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
//   CIERRE — deja de aceptarse el registro.
//   SORTEO — se gira EN VIVO, una hora después.
//
// [GIVEAWAY-NATA-1] Firmado por Memo el 6-sep-2026: domingo 13-sep, cierre a
// las 7:00 PM y sorteo a las 8:00 PM de Reynosa. En SEPTIEMBRE Reynosa sigue en
// -05:00 (el horario de verano corre hasta el 1-nov), así que ése es el offset.
// ⚠️ Las horas concretas NO se repiten en este comentario: las dicen las dos
// constantes de abajo, y un letrero que las repita es el que se queda viejo —
// éste ya decía «11:00 AM / 12:00 PM» de la época de melanie.
// [GIVEAWAY-KG-1] Firmado por Memo el 21-sep-2026: jueves 1-oct, cierre a las
// 8:00 PM y sorteo a las 9:00 PM de Reynosa. El 1-oct Reynosa SIGUE en horario
// de verano (corre hasta el 1-nov), así que el offset es -05:00 — en Monterrey
// esas mismas horas son 7:00 PM y 8:00 PM, que es como lo dice la pantalla.
const CIERRE = '2026-10-01T20:00:00-05:00';   // jueves 1-oct, 8:00 PM Reynosa
const SORTEO = '2026-10-01T21:00:00-05:00';   // jueves 1-oct, 9:00 PM, en vivo

// ⏰ EL CRON DEL RECORDATORIO SE MUEVE CON `SORTEO`, Y NO SOLO.
//
// La FECHA sí deriva de aquí: `giveaway-recordatorio` se rehúsa si el día en
// Reynosa no es el del sorteo. Pero LA HORA del disparo vive en `netlify.toml`,
// en UTC, y ésa es una SEGUNDA FUENTE que nadie sincroniza sola.
//
// ⚠️ Y el cambio de día muerde: las 9 PM de Reynosa son las 02:00 UTC del DÍA
// SIGUIENTE, así que el cron del «1 de octubre» se escribe con la hora del 2.
// Lo que salva la comparación es que la función pregunta por el día EN REYNOSA,
// no en UTC — pero eso se PRUEBA, no se supone (el careo lo corre contra el
// 30-sep, 1-oct, 2-oct y 3-oct).
//
// Hoy: ventana de 40 minutos y `schedule = "30 1 * * *"` (01:30 UTC = 8:30 PM
// de Reynosa), o sea 30 minutos dentro de la ventana por cada lado. Si estas
// fechas cambian, EL SCHEDULE CAMBIA CON ELLAS — y el careo truena si dejan de
// caer uno dentro del otro.
const RECORDATORIO_VENTANA_MIN = 40;

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

// ═══════════════════════════════════════════════════════════════════════════
// [GIVEAWAY-NATA-1] EL PREMIO ES DUAL, Y LO DECIDE LA CIUDAD
//
// Firmado por Memo (6-sep-2026):
//   · ganador DE REYNOSA  → paquete PLUS con boleto en Zona Tumbada
//     (transporte + hospedaje + boleto + kit)
//   · ganador de FUERA    → paquete CHEAP: boleto Zona Tumbada + Kit Conecta
//
// 🔒 Vive AQUÍ y no en la pantalla: es la regla que adjudica un premio, y la
// van a leer el registro, el sorteo y las dos páginas. Una copia en el HTML
// sería la segunda definición de quién gana qué.
//
// ⚠️ La ciudad la teclea una persona, así que se normaliza antes de decidir:
// sin acentos, sin mayúsculas y sin espacios de sobra. «Reynosa, Tamps.» y
// «REYNOSA» son el mismo lugar; «Río Bravo» —a 30 minutos— NO lo es, y ése es
// justo el caso que la regla tiene que distinguir bien.
function normalizarCiudad(c) {
  return String(c == null ? '' : c)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
function esDeReynosa(ciudad) {
  return /(^|[^a-z])reynosa([^a-z]|$)/.test(normalizarCiudad(ciudad));
}
function premioPorCiudad(ciudad) {
  return esDeReynosa(ciudad) ? 'PLUS' : 'CHEAP';
}
// [GIVEAWAY-KG-1] El premio es para la fecha del 7 DE NOVIEMBRE (`karolg#1`).
// Va explícito porque Karol G tiene TRES fechas en el Estadio BBVA —6, 7 y 8—
// y sin decirlo el ganador puede creer que elige.
// La ZONA concreta (Club Seat Oriente o Poniente) la asigna Conecta según
// disponibilidad: en el catálogo son dos zonas distintas y el copy dice «Club
// Seat» a secas.
const PREMIOS = {
  PLUS:  'Paquete PLUS · boleto Club Seat para el 7 de noviembre + transporte + hospedaje + Kit Conecta',
  CHEAP: 'Boleto Club Seat para el 7 de noviembre + Kit Conecta',
};

module.exports = {
  SB_URL, SB_KEY, SLUG, SLUG_ENSAYO, slugDe, esEnsayo, CIERRE, SORTEO, RECORDATORIO_VENTANA_MIN,
  normalizarCiudad, esDeReynosa, premioPorCiudad, PREMIOS,
  corsCheck, cabeceras, json, faltaEnv, sbHeaders,
  registroCerrado, tokenAdminValido, ipDe,
};

// =============================================================================
// admin-radio-stats  (Kaio-sama — estadísticas y reportes de Radio Conecta)
//
// GET-only, solo maestro_roshi. Dos fuentes:
//   · Supabase PORTAL (service_role): radio_likes / radio_peticiones.
//   · AzuraCast (X-API-Key, https://radio.conectareynosa.mx): reportes.
//
// Acciones (todas GET ?accion=):
//   top20              → top 20 semanal de likes (agregado en la function; el RPC
//                        público radio_top_semana() NO se toca — solo da 10).
//   oyentes            → /api/station/1/listeners (LIVE): conectados con lugar
//                        (city/country/description) + tiempo conectado + resumen
//                        por lugar. Shape verificado: ListenersAction (live mode).
//   unicos             → mismo endpoint CON ?start&end (report mode = únicos por
//                        listener_hash, connected_time total; verificado): hoy y
//                        últimos 7 días.
//   horas              → /reports/overview/charts → hourly.all {labels,
//                        metrics[0].data} (verificado ChartsAction; hourly trae
//                        all + day0..day6).
//   mas_tocadas        → /reports/overview/best-and-worst → mostPlayed[{song,
//                        num_plays}] máx 10 (verificado BestAndWorstAction).
//   likes_dias         → radio_likes de 7 días agrupados POR DÍA (hora MX) en la
//                        function (no en RPC).
//   peticiones_resumen → radio_peticiones: pendientes vs atendidas (histórico) +
//                        pendientes con 3+ días.
//
// start/end de AzuraCast: AcceptsDateRange parsea con CarbonImmutable::parse en
// la tz de la estación (verificado) → se mandan 'YYYY-MM-DD HH:mm:ss' locales MX.
// Todo defensivo/fail-soft: cada acción responde su forma limpia o su error
// propio (la UI pinta "sin datos" por tarjeta sin romper el resto).
//
// Columnas radio_likes (verificadas contra la base): id, song_id, titulo,
// artista, art, creado (timestamptz). radio_peticiones: atendida, creado.
//
// Seguridad: mismo guard de origin crudo que admin-radio-peticiones (#253) +
// verifyAdminAuth (solo maestro_roshi).
// Env: PORTAL_SUPABASE_URL/SERVICE_KEY (likes/peticiones), AZURACAST_API_KEY
// (reportes AzuraCast), JWT_SECRET.
// =============================================================================

const { verifyAdminAuth, corsCheck } = require('./_lib/verify-admin');

const AZ_BASE = 'https://radio.conectareynosa.mx';
const STATION = '1';
const TIMEOUT_MS = 8000;
const TZ = 'America/Monterrey';
const DIAS = 7;
const TOP_N = 20;
const PET_VIEJA_DIAS = 3;

const ACCIONES_PORTAL = ['top20', 'likes_dias', 'peticiones_resumen', 'likes_hoy'];
const ACCIONES_AZ = ['oyentes', 'unicos', 'horas', 'mas_tocadas', 'repetidas'];
const REPETIDA_MIN = 3;   // aviso: sonó 3+ veces en 24h
const RACHA_MIN = 5;      // aviso: 5+ likes hoy

exports.handler = async (event) => {
  // Origin CRUDO: un GET same-origin no manda Origin → no se bloquea; el JWT es
  // el candado real. Cross-origin no permitido (Origin presente sin match) → 403.
  const __rawOrigin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  const json = (s, b) => ({ statusCode: s, headers, body: JSON.stringify(b) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  if (__rawOrigin && !__origin) return json(403, { error: 'Origen no permitido' });

  const auth = verifyAdminAuth(event, ['maestro_roshi']);
  if (!auth.valid) return json(auth.status, { error: auth.error });

  const accion = (event.queryStringParameters && event.queryStringParameters.accion) || '';
  if (!ACCIONES_PORTAL.includes(accion) && !ACCIONES_AZ.includes(accion)) {
    return json(400, { error: 'accion inválida' });
  }

  try {
    // ═══ Acciones AzuraCast (X-API-Key) ═══════════════════════════════════════
    if (ACCIONES_AZ.includes(accion)) {
      const API_KEY = process.env.AZURACAST_API_KEY;
      if (!API_KEY) return json(500, { error: 'Falta env var AZURACAST_API_KEY' });
      const az = { 'X-API-Key': API_KEY, Accept: 'application/json' };

      // ── oyentes: conectados AHORA con lugar y tiempo ──────────────────────
      if (accion === 'oyentes') {
        const r = await azFetch(`${AZ_BASE}/api/station/${STATION}/listeners`, { headers: az });
        if (!r.ok) return json(502, { error: 'AzuraCast rechazó listeners', detail: await r.text() });
        const rows = await r.json();
        const oyentes = (Array.isArray(rows) ? rows : []).map((l) => {
          const loc = (l && l.location) || {};
          const lugar = [loc.city, loc.country].filter(Boolean).join(', ')
            || loc.description || 'Lugar desconocido';
          return { lugar, tiempo_seg: Number(l && l.connected_time) || 0 };
        });
        const porLugarMap = {};
        oyentes.forEach((o) => { porLugarMap[o.lugar] = (porLugarMap[o.lugar] || 0) + 1; });
        const por_lugar = Object.keys(porLugarMap)
          .map((lugar) => ({ lugar, n: porLugarMap[lugar] }))
          .sort((a, b) => b.n - a.n);
        return json(200, { ok: true, total: oyentes.length, por_lugar, oyentes });
      }

      // ── unicos: report mode (start/end) = únicos por hash. Hoy + 7 días ───
      if (accion === 'unicos') {
        const hoy = fechaMx(0);
        const urlHoy = `${AZ_BASE}/api/station/${STATION}/listeners?start=${enc(hoy + ' 00:00:00')}&end=${enc(hoy + ' 23:59:59')}`;
        const urlSem = `${AZ_BASE}/api/station/${STATION}/listeners?start=${enc(fechaMx(-6) + ' 00:00:00')}&end=${enc(hoy + ' 23:59:59')}`;
        const [rH, rS] = await Promise.all([
          azFetch(urlHoy, { headers: az }),
          azFetch(urlSem, { headers: az }),
        ]);
        if (!rH.ok || !rS.ok) return json(502, { error: 'AzuraCast rechazó el reporte de únicos' });
        const [aH, aS] = await Promise.all([rH.json(), rS.json()]);
        return json(200, {
          ok: true,
          hoy: Array.isArray(aH) ? aH.length : 0,
          semana: Array.isArray(aS) ? aS.length : 0,
        });
      }

      // ── horas: oyentes por hora del día (últimos 7 días) ──────────────────
      if (accion === 'horas') {
        const url = `${AZ_BASE}/api/station/${STATION}/reports/overview/charts?start=${enc(fechaMx(-6) + ' 00:00:00')}&end=${enc(fechaMx(0) + ' 23:59:59')}`;
        const r = await azFetch(url, { headers: az });
        if (!r.ok) return json(502, { error: 'AzuraCast rechazó charts', detail: await r.text() });
        const d = await r.json();
        // Shape verificado: { hourly: { all:{labels,metrics:[{data}]}, day0..day6 } }.
        // Defensivo: acepta hourly.all o hourly plano; datos numéricos o {x,y}.
        const hourly = d && d.hourly;
        const all = (hourly && (hourly.all || hourly)) || {};
        const labels = Array.isArray(all.labels) ? all.labels.map((x) => String(x)) : [];
        const met = (Array.isArray(all.metrics) && all.metrics[0]) ? all.metrics[0] : {};
        const data = (Array.isArray(met.data) ? met.data : []).map((v) =>
          (v && typeof v === 'object') ? (Number(v.y) || 0) : (Number(v) || 0));
        return json(200, { ok: true, labels, data });
      }

      // ── mas_tocadas: top 10 de reproducciones del AutoDJ (últimos 7 días) ─
      if (accion === 'mas_tocadas') {
        const url = `${AZ_BASE}/api/station/${STATION}/reports/overview/best-and-worst?start=${enc(fechaMx(-6) + ' 00:00:00')}&end=${enc(fechaMx(0) + ' 23:59:59')}`;
        const r = await azFetch(url, { headers: az });
        if (!r.ok) return json(502, { error: 'AzuraCast rechazó best-and-worst', detail: await r.text() });
        const d = await r.json();
        // Shape verificado: { bestAndWorst:{...}, mostPlayed:[{song, num_plays}] } máx 10.
        const mp = (d && Array.isArray(d.mostPlayed)) ? d.mostPlayed : [];
        const canciones = mp.slice(0, 10).map((x) => {
          const s = (x && x.song) || {};
          return {
            titulo: s.title || s.text || 'sin título',
            artista: s.artist || '',
            veces: Number(x && x.num_plays) || 0,
          };
        });
        return json(200, { ok: true, canciones });
      }

      // ── repetidas: canciones que sonaron 3+ veces en las últimas 24h ──────
      // /api/station/1/history con start/end (AcceptsDateRange). El history usa
      // Paginator (misma lección que files/list): la respuesta puede venir plana
      // o envuelta en {rows:[...]} → se aceptan ambas. Filas DetailedSongHistory
      // con song{title,artist,text}.
      if (accion === 'repetidas') {
        const url = `${AZ_BASE}/api/station/${STATION}/history?start=${enc(fechaHoraMx(-24 * 60 * 60 * 1000))}&end=${enc(fechaHoraMx(0))}&rowCount=1000`;
        const r = await azFetch(url, { headers: az });
        if (!r.ok) return json(502, { error: 'AzuraCast rechazó history', detail: await r.text() });
        const d = await r.json();
        const filas = Array.isArray(d) ? d : ((d && Array.isArray(d.rows)) ? d.rows : []);
        const porCancion = {};
        for (const f of filas) {
          const s = (f && f.song) || {};
          const titulo = s.title || s.text || '';
          if (!titulo) continue;
          const key = (titulo + '|' + (s.artist || '')).toLowerCase();
          if (!porCancion[key]) porCancion[key] = { titulo, artista: s.artist || '', veces: 0 };
          porCancion[key].veces += 1;
        }
        const repetidas = Object.values(porCancion)
          .filter((c) => c.veces >= REPETIDA_MIN)
          .sort((a, b) => b.veces - a.veces)
          .slice(0, 10);
        return json(200, { ok: true, repetidas });
      }
    }

    // ═══ Acciones Portal (service_role) ═══════════════════════════════════════
    const env = readEnv();
    if (env.error) return json(500, { error: env.error });
    const sb = { apikey: env.PORTAL_SB_SERVICE, Authorization: `Bearer ${env.PORTAL_SB_SERVICE}` };

    // ── top20: likes semanales agregados por song_id (metadata más reciente) ──
    if (accion === 'top20') {
      const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000).toISOString();
      const url = `${env.PORTAL_SB_URL}/rest/v1/radio_likes?select=song_id,titulo,artista,art&creado=gte.${enc(desde)}&order=creado.desc&limit=10000`;
      const r = await fetch(url, { headers: sb });
      if (!r.ok) return json(502, { error: 'Supabase rechazó la consulta', detail: await r.text() });
      const rows = await r.json();
      const porSong = {};
      for (const row of (Array.isArray(rows) ? rows : [])) {
        const sid = row && row.song_id ? String(row.song_id) : '';
        if (!sid) continue;
        if (!porSong[sid]) {
          porSong[sid] = { song_id: sid, titulo: row.titulo || '', artista: row.artista || '', art: row.art || '', likes: 0 };
        }
        porSong[sid].likes += 1;
      }
      const top = Object.values(porSong).sort((a, b) => b.likes - a.likes).slice(0, TOP_N);
      return json(200, { ok: true, top });
    }

    // ── likes_dias: likes por día (hora MX), últimos 7 días con ceros ────────
    if (accion === 'likes_dias') {
      const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000).toISOString();
      const url = `${env.PORTAL_SB_URL}/rest/v1/radio_likes?select=creado&creado=gte.${enc(desde)}&limit=10000`;
      const r = await fetch(url, { headers: sb });
      if (!r.ok) return json(502, { error: 'Supabase rechazó la consulta', detail: await r.text() });
      const rows = await r.json();
      const porDia = {};
      for (const row of (Array.isArray(rows) ? rows : [])) {
        if (!row || !row.creado) continue;
        const dia = diaMxDe(row.creado);
        if (dia) porDia[dia] = (porDia[dia] || 0) + 1;
      }
      // Siempre 7 entradas (hoy-6 … hoy), con ceros donde no hubo likes.
      const dias = [];
      for (let i = 6; i >= 0; i--) {
        const dia = fechaMx(-i);
        dias.push({ dia, likes: porDia[dia] || 0 });
      }
      return json(200, { ok: true, dias });
    }

    // ── likes_hoy: canciones con 5+ likes HOY (día MX, filtrado en la function) ─
    if (accion === 'likes_hoy') {
      // Trae las últimas 24h y filtra al día MX real aquí (Reynosa sigue DST
      // fronterizo — no se hace aritmética de tz a mano).
      const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const url = `${env.PORTAL_SB_URL}/rest/v1/radio_likes?select=song_id,titulo,artista,creado&creado=gte.${enc(desde)}&order=creado.desc&limit=10000`;
      const r = await fetch(url, { headers: sb });
      if (!r.ok) return json(502, { error: 'Supabase rechazó la consulta', detail: await r.text() });
      const rows = await r.json();
      const hoy = fechaMx(0);
      const porSong = {};
      for (const row of (Array.isArray(rows) ? rows : [])) {
        if (!row || !row.song_id || diaMxDe(row.creado) !== hoy) continue;
        const sid = String(row.song_id);
        if (!porSong[sid]) porSong[sid] = { titulo: row.titulo || '', artista: row.artista || '', likes: 0 };
        porSong[sid].likes += 1;
      }
      const rachas = Object.values(porSong)
        .filter((c) => c.likes >= RACHA_MIN)
        .sort((a, b) => b.likes - a.likes)
        .slice(0, 5);
      return json(200, { ok: true, rachas });
    }

    // ── peticiones_resumen: pendientes vs atendidas + pendientes 3+ días ─────
    if (accion === 'peticiones_resumen') {
      const url = `${env.PORTAL_SB_URL}/rest/v1/radio_peticiones?select=atendida,creado&limit=10000`;
      const r = await fetch(url, { headers: sb });
      if (!r.ok) return json(502, { error: 'Supabase rechazó la consulta', detail: await r.text() });
      const rows = await r.json();
      const corte = Date.now() - PET_VIEJA_DIAS * 24 * 60 * 60 * 1000;
      let pendientes = 0, atendidas = 0, viejas = 0;
      for (const row of (Array.isArray(rows) ? rows : [])) {
        if (!row) continue;
        if (row.atendida) { atendidas += 1; continue; }
        pendientes += 1;
        const t = row.creado ? Date.parse(row.creado) : NaN;
        if (Number.isFinite(t) && t < corte) viejas += 1;
      }
      return json(200, { ok: true, pendientes, atendidas, viejas_3d: viejas });
    }

    return json(400, { error: 'accion inválida' });
  } catch (e) {
    return json(502, { error: 'Error en admin-radio-stats', detail: e.message });
  }
};

// ----- helpers -----

function enc(s) { return encodeURIComponent(s); }

// 'YYYY-MM-DD' en hora MX, con offset de días (0 = hoy, -6 = hace 6 días).
function fechaMx(offsetDias) {
  const d = new Date(Date.now() + offsetDias * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

// 'YYYY-MM-DD HH:mm:ss' en hora MX, con offset en ms (0 = ahora, negativo = atrás).
// hourCycle h23 evita el "24:xx" de algunos engines con hour12:false.
function fechaHoraMx(offsetMs) {
  const d = new Date(Date.now() + offsetMs);
  return d.toLocaleString('en-CA', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).replace(',', '');
}

// Día MX ('YYYY-MM-DD') de un timestamp ISO; '' si no parsea.
function diaMxDe(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('en-CA', { timeZone: TZ });
}

// fetch con timeout (mismo patrón que admin-radio-control).
async function azFetch(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function readEnv() {
  const PORTAL_SB_URL = process.env.PORTAL_SUPABASE_URL;
  const PORTAL_SB_SERVICE = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!PORTAL_SB_URL || !PORTAL_SB_SERVICE) return { error: 'Faltan env vars (PORTAL_SUPABASE_URL/SERVICE_KEY)' };
  return { PORTAL_SB_URL, PORTAL_SB_SERVICE };
}

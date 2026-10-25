// =============================================================================
// radio-vigilante  (Scheduled Function — cada 10 minutos, ver netlify.toml)
//
// Vigila que la radio responda (nowplaying público) y avisa a Memo POR CORREO
// cuando se cae — con anti-spam — y cuando se recupera.
//
// Chequeo: fetch al nowplaying con timeout de 8s; si falla, UN reintento que
// arranca a los 15s del primer intento (las scheduled functions tienen límite de
// ~30s: 8s + espera + 8s + escrituras cabe). "Responde" = HTTP ok Y JSON válido
// (una página de error con 200 no cuenta).
//
// Estado persistente: tabla `radio_vigilante` (Portal, service_role) de UNA fila
// { id:1, caida_desde, ultimo_aviso }. READ-THEN-WRITE, jamás on_conflict (si la
// fila no existe: INSERT directo; 409 = carrera → re-lee).
//
// Máquina de estados (núcleo puro _decidir, exportado para el arnés):
//   · responde + sin caída          → silencio.
//   · responde + caída AVISADA      → correo "se recuperó" (duración) + limpia.
//   · responde + caída sin avisar   → blip corto: limpia en silencio.
//   · falla + sin caída previa      → marca caida_desde (1ª corrida, SIN correo).
//   · falla + caída ya marcada      → 2ª+ corrida seguida (~20 min): correo de
//       ALERTA si nunca se avisó o el último aviso fue hace 6+ horas. El sello
//       de ultimo_aviso SOLO se escribe si el correo salió (si Resend falla, se
//       reintenta a la corrida siguiente).
//
// Correo: Resend (RESEND_API_KEY existente) con el remitente del dominio.
// ⚠️ EXCEPCIÓN AL MODO PRUEBA (decisión de Memo): estas son alertas de
// EMERGENCIA de infraestructura, no correo a clientes. CORREOS_MODO vive en
// 'prueba' en producción y así se queda — si el vigilante pasara por
// aplicarModoPrueba, la alerta de radio caída se desviaría al buzón de
// calibración y Memo NUNCA se enteraría. Por eso este emisor NO usa
// correo-guard: alerta y recuperación van SIEMPRE directo a hcgcobos@gmail.com.
//
// Env: PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY, RESEND_API_KEY (o
// RESEND_KEY).
//
// [KAIO-CABINA-8] SEGUNDA VIGILANCIA: PROGRAMA SIN LOCUTOR. Con la radio VIVA,
// se pregunta a la parrilla (el dueño: _lib/radio-cartelera, programas leídos
// de KH) si DEBERÍA haber un programa al aire, y al nowplaying si ALGUIEN está
// transmitiendo (live.is_live — la parrilla dice qué debería sonar, is_live qué
// suena). Programa en horario + nadie al aire + ≥12 min de gracia (el cron
// corre cada 10: el aviso cae entre el minuto 12 y ~22) → correo a Memo, UNA
// vez por instancia (sello `programa_avisado` = «id|fecha», columna del acta
// migraciones/KAIO-CABINA-8.sql; el sello SOLO se escribe si el correo salió).
// 🔒 Este chequeo JAMÁS tumba al vigilante de caída: corre en su propio try y
// un KH ilegible se dice por consola y se salta — la emergencia grande sigue.
// =============================================================================

const { alAireYSiguiente, paredReynosa } = require('./_lib/radio-cartelera');

const NOWPLAYING = 'https://radio.conectareynosa.mx/api/nowplaying/radioconecta';
const ADMIN_TO = 'hcgcobos@gmail.com';
const FROM_ADMIN = 'Radio Conecta <admin@conectareynosa.mx>';
const TIMEOUT_MS = 8000;
const REINTENTO_MS = 15000;                 // el reintento arranca a los 15s del 1er intento
const AVISO_CADA_MS = 6 * 60 * 60 * 1000;   // máx 1 correo de alerta cada 6 horas
const GRACIA_MIN = 12;                      // [KAIO-CABINA-8] minutos de gracia para conectarse
const TZ = 'America/Matamoros';

const SB_URL = process.env.PORTAL_SUPABASE_URL;
const SB_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;

// ── Núcleo PURO de la máquina de estados (exportado para el arnés) ───────────
// row = { caida_desde, ultimo_aviso } (ISO o null). Devuelve { patch, correo }.
function _decidir(viva, row, nowMs) {
  const caida = row && row.caida_desde ? Date.parse(row.caida_desde) : null;
  const aviso = row && row.ultimo_aviso ? Date.parse(row.ultimo_aviso) : null;
  if (viva) {
    if (!caida) return { patch: null, correo: null };
    // Volvió: correo SOLO si la caída se llegó a avisar; siempre limpia el estado.
    return { patch: { caida_desde: null, ultimo_aviso: null }, correo: aviso ? 'recuperada' : null };
  }
  // No responde:
  if (!caida) return { patch: { caida_desde: new Date(nowMs).toISOString() }, correo: null };
  const debeAvisar = !aviso || (nowMs - aviso) >= AVISO_CADA_MS;
  if (debeAvisar) return { patch: { ultimo_aviso: new Date(nowMs).toISOString() }, correo: 'alerta' };
  return { patch: null, correo: null };
}

// ── [KAIO-CABINA-8] Núcleo PURO del programa sin locutor (exportado al arnés) ─
// alAire = lo que contesta la parrilla (o null) · isLive = live.is_live del
// nowplaying · selloPrevio = radio_vigilante.programa_avisado · minutosDesdeInicio
// en pared de Reynosa. Devuelve { avisar, llave }. Un aviso POR INSTANCIA:
// la llave es «id|fecha», así la misma falta no se repite cada 10 min y la
// instancia de mañana se vigila sola.
function _decidirPrograma(alAire, isLive, selloPrevio, minutosDesdeInicio) {
  if (!alAire) return { avisar: false, llave: null };
  const llave = String(alAire.id) + '|' + String(alAire.fecha);
  if (isLive) return { avisar: false, llave };                       // alguien transmite: todo bien
  if (minutosDesdeInicio < GRACIA_MIN) return { avisar: false, llave }; // gracia para conectarse
  if (selloPrevio === llave) return { avisar: false, llave };        // esta instancia ya se avisó
  return { avisar: true, llave };
}

exports.handler = async function () {
  console.log('[radio-vigilante] Corrida:', new Date().toISOString());
  if (!SB_URL || !SB_KEY) {
    console.error('[radio-vigilante] Faltan PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY');
    return { statusCode: 500, body: 'Config faltante' };
  }

  // [KAIO-CABINA-8] checarRadio devuelve también el JSON del nowplaying: el
  // chequeo de programa necesita live.is_live y pedirlo otra vez sería pagar
  // (y poder fallar) dos veces por el mismo hecho.
  const { viva, np } = await checarRadio();
  console.log('[radio-vigilante] Radio', viva ? 'responde' : 'NO RESPONDE');

  let row = null;
  try {
    row = await leerEstado();
    const d = _decidir(viva, row, Date.now());

    if (d.correo === 'alerta') {
      const enviado = await enviarAlerta(row.caida_desde);
      // El sello anti-spam SOLO si el correo salió; si no, se reintenta en 10 min.
      if (enviado && d.patch) await patchEstado(d.patch);
      console.log('[radio-vigilante] Alerta', enviado ? 'enviada' : 'FALLÓ (se reintenta)');
    } else if (d.correo === 'recuperada') {
      await enviarRecuperada(row.caida_desde, Date.now());   // best-effort
      if (d.patch) await patchEstado(d.patch);               // limpia siempre: ya volvió
      console.log('[radio-vigilante] Recuperación avisada y estado limpio');
    } else if (d.patch) {
      await patchEstado(d.patch);
    }
  } catch (e) {
    console.error('[radio-vigilante] Error de estado:', e.message);
    return { statusCode: 502, body: 'Error: ' + e.message };
  }

  // [KAIO-CABINA-8] Programa sin locutor — SOLO con la radio viva (caída, el
  // aviso que importa es el de arriba) y en su propio try: un KH ilegible o un
  // Resend caído aquí JAMÁS tumban al vigilante de caída.
  if (viva && row) {
    try { await vigilarPrograma(np, row, Date.now()); }
    catch (e) { console.error('[radio-vigilante] Chequeo de programa:', e.message); }
  }

  return { statusCode: 200, body: viva ? 'ok' : 'radio caida' };
};

// ── Chequeo con timeout 8s + 1 reintento a los 15s del primer intento ────────
// [KAIO-CABINA-8] Devuelve { viva, np }: np es el JSON del nowplaying del
// intento que respondió (null si la radio no contesta).
async function checarRadio() {
  const inicio = Date.now();
  try { return { viva: true, np: await intentoRadio() }; }
  catch (e) {
    const espera = Math.max(0, REINTENTO_MS - (Date.now() - inicio));
    await new Promise((res) => setTimeout(res, espera));
    try { return { viva: true, np: await intentoRadio() }; }
    catch (e2) { return { viva: false, np: null }; }
  }
}

async function intentoRadio() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(NOWPLAYING, { signal: ctrl.signal });
    if (!r.ok) throw new Error('http ' + r.status);
    return await r.json();   // debe ser JSON válido — y es el dato del chequeo de programa
  } finally {
    clearTimeout(t);
  }
}

// ── [KAIO-CABINA-8] El chequeo de programa sin locutor ───────────────────────
// La parrilla se lee de KH con el MISMO camino que el endpoint público
// radio-cartelera (archivado=is.false; _vivo filtra activo en la lib) y se le
// pregunta al DUEÑO (_lib/radio-cartelera) quién debería estar al aire — aquí
// no se re-implementa ni un minuto de pared.
async function vigilarPrograma(np, row, nowMs) {
  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_URL || !KH_KEY) { console.error('[radio-vigilante] Sin llaves de KH: el chequeo de programa no corre'); return; }
  const r = await fetch(`${KH_URL}/rest/v1/radio_programas?archivado=is.false&select=id,nombre,conductor,dia_semana,fecha,hora_inicio,hora_fin,activo,archivado&limit=500`,
    { headers: { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY } });
  if (!r.ok) throw new Error('KH contestó ' + r.status);
  const programas = await r.json();
  const { al_aire } = alAireYSiguiente(programas, nowMs);
  const isLive = !!(np && np.live && np.live.is_live);
  let mins = 0;
  if (al_aire) {
    const [h, m] = String(al_aire.hora_inicio).split(':').map(Number);
    mins = paredReynosa(nowMs).min - ((h || 0) * 60 + (m || 0));
  }
  const d = _decidirPrograma(al_aire, isLive, row.programa_avisado || null, mins);
  if (!d.avisar) return;
  const enviado = await enviarProgramaSolo(al_aire, mins);
  // El sello SOLO si el correo salió (como el anti-spam de la alerta): si
  // Resend falla, la corrida siguiente lo reintenta.
  if (enviado) await patchEstado({ programa_avisado: d.llave });
  console.log('[radio-vigilante] Programa sin locutor:', al_aire.nombre, enviado ? '— avisado' : '— correo FALLÓ (se reintenta)');
}

// ── Estado (Portal, READ-THEN-WRITE, jamás on_conflict) ──────────────────────
const sbHeaders = () => ({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' });
const baseVig = () => `${SB_URL}/rest/v1/radio_vigilante`;

async function leerEstado() {
  const r = await fetch(`${baseVig()}?id=eq.1&select=caida_desde,ultimo_aviso,programa_avisado&limit=1`, { headers: sbHeaders() });
  if (!r.ok) throw new Error('Supabase rechazó la lectura: ' + (await r.text()));
  const fila = ((await r.json().catch(() => [])) || [])[0];
  if (fila) return fila;
  // Fila semilla ausente → INSERT directo; un 409 (carrera) = ya existe → re-lee.
  const ins = await fetch(baseVig(), {
    method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ id: 1 }),
  });
  if (!ins.ok && ins.status !== 409) throw new Error('No se pudo sembrar el estado: ' + (await ins.text()));
  return { caida_desde: null, ultimo_aviso: null, programa_avisado: null };
}

async function patchEstado(patch) {
  const r = await fetch(`${baseVig()}?id=eq.1`, {
    method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error('Supabase rechazó el PATCH: ' + (await r.text()));
}

// [KAIO-CABINA-8] El programa anunciado sin nadie al aire — misma excepción de
// emergencia que la alerta de caída: es infraestructura del aire, no correo a
// clientes, así que va DIRECTO (sin correo-guard).
async function enviarProgramaSolo(alAire, mins) {
  const cond = alAire.conductor ? ` (con ${alAire.conductor})` : '';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <div style="background:#ff8c00;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0;font-weight:bold;font-size:18px">Programa anunciado y NADIE al aire</div>
      <div style="border:1px solid #eee;border-top:0;padding:18px;border-radius:0 0 8px 8px;line-height:1.6;font-size:14px">
        <p style="margin:0 0 12px">La cartelera dice que <strong>${alAire.nombre}</strong>${cond} debía empezar a las <strong>${alAire.hora_inicio}</strong> (hora de Reynosa) — van <strong>~${mins} min</strong> y en la estación no hay ningún locutor conectado: está sonando el AutoDJ.</p>
        <p style="margin:0 0 6px"><strong>Qué hacer:</strong></p>
        <ul style="margin:0 0 12px;padding-left:20px">
          <li>Salir al aire desde la <strong>Cabina de Kaio-sama</strong> (o el Web DJ, plan B).</li>
          <li>Si el programa se canceló, archívalo o elimínalo en la pestaña <strong>Cartelera</strong> para que /radio no lo anuncie.</li>
        </ul>
        <p style="margin:0;color:#666;font-size:12px">Este aviso sale UNA vez por programa — si mañana vuelve a faltar, te vuelve a llegar.</p>
      </div>
    </div>`;
  return enviar(ADMIN_TO, `Radio: «${alAire.nombre}» debía estar al aire y no hay locutor`, html);
}

// ── Correos (Resend + aplicarModoPrueba, como todos los emisores) ────────────
async function enviarAlerta(caidaDesdeISO) {
  const inicio = fmtMx(caidaDesdeISO);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <div style="background:#ff283b;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0;font-weight:bold;font-size:18px">ALERTA — Radio Conecta no responde</div>
      <div style="border:1px solid #eee;border-top:0;padding:18px;border-radius:0 0 8px 8px;line-height:1.6;font-size:14px">
        <p style="margin:0 0 12px">El nowplaying de la radio lleva <strong>al menos ~20 minutos</strong> sin responder (2 chequeos seguidos, con reintento cada uno).</p>
        <p style="margin:0 0 12px"><strong>Caída desde:</strong> ${inicio} (hora MX)</p>
        <p style="margin:0 0 6px"><strong>Qué revisar (Docker del NAS):</strong></p>
        <ul style="margin:0 0 12px;padding-left:20px">
          <li>Proyecto <strong>radio</strong> (AzuraCast) — que el contenedor esté corriendo.</li>
          <li>Proyecto <strong>tunnel</strong> (Cloudflare) — que el túnel esté conectado.</li>
        </ul>
        <p style="margin:0;color:#666;font-size:12px">Este aviso se repite máximo cada 6 horas mientras siga caída. Te llega otro correo cuando se recupere.</p>
      </div>
    </div>`;
  return enviar(ADMIN_TO, 'ALERTA: Radio Conecta no responde', html);
}

async function enviarRecuperada(caidaDesdeISO, nowMs) {
  const dur = fmtDuracion(nowMs - (Date.parse(caidaDesdeISO) || nowMs));
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <div style="background:#1d9e3a;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0;font-weight:bold;font-size:18px">Radio Conecta se recuperó</div>
      <div style="border:1px solid #eee;border-top:0;padding:18px;border-radius:0 0 8px 8px;line-height:1.6;font-size:14px">
        <p style="margin:0 0 12px">La radio volvió a responder.</p>
        <p style="margin:0 0 12px"><strong>Duración de la caída:</strong> ${dur} (desde ${fmtMx(caidaDesdeISO)}, hora MX).</p>
        <p style="margin:0;color:#666;font-size:12px">El vigilante sigue chequeando cada 10 minutos.</p>
      </div>
    </div>`;
  return enviar(ADMIN_TO, 'Radio Conecta se recuperó', html);
}

// Envío DIRECTO — SIN aplicarModoPrueba, a propósito (ver cabecera): alerta de
// emergencia; con CORREOS_MODO='prueba' permanente en prod, desviarla al buzón
// de calibración dejaría a Memo ciego ante una caída real. Fail-soft: false si
// no hay key o Resend rechaza.
async function enviar(to, subject, html) {
  const KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
  if (!KEY || !to) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_ADMIN, to: Array.isArray(to) ? to : [to], subject, html }),
  }).catch((e) => { console.error('[radio-vigilante] Email:', e.message); return null; });
  return !!(r && r.ok);
}

// ── Helpers de formato ───────────────────────────────────────────────────────
function fmtMx(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'desconocida';
  return new Date(t).toLocaleString('es-MX', {
    timeZone: TZ, hourCycle: 'h23',
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function fmtDuracion(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return min + ' min';
  return Math.floor(min / 60) + ' h ' + (min % 60) + ' min';
}

exports._decidir = _decidir;                   // arnés
exports._decidirPrograma = _decidirPrograma;   // arnés [KAIO-CABINA-8]

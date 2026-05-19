// =============================================================================
// radar-alertas
//
// Cron que corre 2x/día (8 AM y 8 PM hora MX) y detecta anomalías en el uso
// del ecosistema digital de Conecta Reynosa. Cuando encuentra una, hace
// INSERT en `radar_alertas` y manda email al admin si la severidad es alta.
//
// Tipos detectados (severidad entre paréntesis):
//   - trafico_pico        (alta)   +50% visitas vs día anterior
//   - trafico_caida       (media)  -30% visitas vs día anterior
//   - waitlist_hito       (info)   evento llega a 50/100/250 registros
//   - cotizacion_caida    (alta)   semana con -30% cotizaciones vs anterior
//   - codigo_intentos_falla (media) código intentado 20+ veces sin éxito
//
// Deduplicación: cada tipo+contexto solo se inserta una vez por día.
//
// Env vars: SUPABASE_URL_KAMEHOUSE / SUPABASE_SERVICE_KEY_KAMEHOUSE
//           RESEND_KEY (o variantes) para envío de email
// =============================================================================

const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE
            || process.env.SUPABASE_SERVICE_KEY
            || process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
const ADMIN_EMAIL = 'admin@conectareynosa.mx';
const ADMIN_TO = 'hcgcobos@gmail.com';

async function sb(path, init = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`SB ${r.status}: ${t.slice(0, 200)}`);
  }
  if (r.status === 204) return null;
  return r.json();
}

async function countSessions(tabla, sinceISO, untilISO) {
  // Devuelve sesiones únicas (distinct session_id). PostgREST no soporta
  // distinct directo, así que pedimos rows y deduplicamos.
  const rows = await sb(
    `${tabla}?created_at=gte.${encodeURIComponent(sinceISO)}` +
    `&created_at=lt.${encodeURIComponent(untilISO)}` +
    `&select=session_id&limit=10000`
  );
  return new Set((rows || []).map(r => r.session_id)).size;
}

async function countByAccion(tabla, accion, sinceISO, untilISO) {
  const rows = await sb(
    `${tabla}?accion=eq.${encodeURIComponent(accion)}` +
    `&created_at=gte.${encodeURIComponent(sinceISO)}` +
    `&created_at=lt.${encodeURIComponent(untilISO)}` +
    `&select=id&limit=10000`
  );
  return (rows || []).length;
}

async function yaInsertada(tipo, contextoKey, sinceISO) {
  // Evita duplicar la misma alerta el mismo día.
  const rows = await sb(
    `radar_alertas?tipo=eq.${encodeURIComponent(tipo)}` +
    `&created_at=gte.${encodeURIComponent(sinceISO)}` +
    `&select=id,datos&limit=50`
  );
  return (rows || []).some(a => {
    try { return (a.datos && a.datos.contextoKey) === contextoKey; } catch (e) { return false; }
  });
}

async function insertarAlerta({ tipo, severidad, titulo, mensaje, datos }) {
  await sb('radar_alertas', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{ tipo, severidad, titulo, mensaje, datos }]),
  });
}

async function mandarEmailAdmin(alerta) {
  if (!RESEND_KEY) return false;
  const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;background:#0a0a0a;color:#fff;padding:0">
  <div style="background:#e8ff4c;color:#000;padding:18px;border-bottom:4px solid #ff283b">
    <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Radar del Dragón · Alerta ${escapeHtml(alerta.severidad)}</div>
    <div style="font-size:20px;font-weight:900;margin-top:4px">${escapeHtml(alerta.titulo)}</div>
  </div>
  <div style="padding:22px">
    <p style="font-size:14px;line-height:1.55;color:#fff">${escapeHtml(alerta.mensaje)}</p>
    <p style="margin-top:18px;font-size:11px;color:rgba(255,255,255,.5);letter-spacing:.08em;text-transform:uppercase">
      Tipo: ${escapeHtml(alerta.tipo)} · ${new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey' })}
    </p>
    <p style="margin-top:14px;font-size:12px;color:rgba(255,255,255,.7)">
      Revisa el Radar en <a href="https://conectareynosa.mx/kamehouse" style="color:#e8ff4c;text-decoration:none;font-weight:700">Kamehouse → Radar del Dragón</a>.
    </p>
  </div>
</div>`;
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Radar del Dragón <${ADMIN_EMAIL}>`,
      to: [ADMIN_TO],
      subject: `[Radar ${alerta.severidad}] ${alerta.titulo}`,
      html,
    }),
  });
  return resp.ok;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// =============================================================================
// Detectores
// =============================================================================

async function detectarTrafico(resumen) {
  const dayMs = 24 * 3600 * 1000;
  const hoy = new Date();
  const ayer  = new Date(hoy.getTime() - dayMs);
  const ayer0 = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate());
  const hoy0  = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const ayer1 = new Date(ayer0.getTime() - dayMs); // antier 00:00

  // Sesiones únicas en main_eventos_uso (todas las acciones cuentan; visita es la principal)
  const ayer_count   = await countSessions('main_eventos_uso', ayer0.toISOString(), hoy0.toISOString());
  const antier_count = await countSessions('main_eventos_uso', ayer1.toISOString(), ayer0.toISOString());

  resumen.trafico = { ayer_count, antier_count };

  if (antier_count >= 10) { // umbral mínimo para no spamear con muestras pequeñas
    const ratio = ayer_count / antier_count;
    const fecha = ayer0.toISOString().slice(0, 10);
    if (ratio >= 1.5) {
      const tipo = 'trafico_pico';
      const ctx = `${tipo}-${fecha}`;
      if (!(await yaInsertada(tipo, ctx, ayer0.toISOString()))) {
        const a = {
          tipo, severidad: 'alta',
          titulo: 'Pico de tráfico anormal',
          mensaje: `Ayer hubo ${ayer_count} sesiones, ${Math.round((ratio - 1) * 100)}% más que antier (${antier_count}).`,
          datos: { contextoKey: ctx, fecha, ayer_count, antier_count, ratio: +ratio.toFixed(2) },
        };
        await insertarAlerta(a);
        await mandarEmailAdmin(a);
        resumen.creadas.push(a.tipo);
      }
    } else if (ratio <= 0.7) {
      const tipo = 'trafico_caida';
      const ctx = `${tipo}-${fecha}`;
      if (!(await yaInsertada(tipo, ctx, ayer0.toISOString()))) {
        const a = {
          tipo, severidad: 'media',
          titulo: 'Caída de tráfico',
          mensaje: `Ayer hubo ${ayer_count} sesiones, ${Math.round((1 - ratio) * 100)}% menos que antier (${antier_count}).`,
          datos: { contextoKey: ctx, fecha, ayer_count, antier_count, ratio: +ratio.toFixed(2) },
        };
        await insertarAlerta(a);
        resumen.creadas.push(a.tipo);
      }
    }
  }
}

async function detectarWaitlist(resumen) {
  // Hitos: 50, 100, 250 personas registradas en un evento de waitlist.
  let rows = [];
  try {
    rows = await sb('eventos_waitlist?select=evento_id,evento_nombre&limit=10000');
  } catch (e) {
    resumen.errores.push('waitlist: ' + e.message);
    return;
  }
  const conteoPorEvento = {};
  const nombre = {};
  for (const r of rows || []) {
    if (!r.evento_id) continue;
    conteoPorEvento[r.evento_id] = (conteoPorEvento[r.evento_id] || 0) + 1;
    if (r.evento_nombre) nombre[r.evento_id] = r.evento_nombre;
  }
  resumen.waitlist_eventos = Object.keys(conteoPorEvento).length;
  const HITOS = [50, 100, 250];
  for (const [evId, total] of Object.entries(conteoPorEvento)) {
    for (const hito of HITOS) {
      if (total >= hito) {
        const tipo = 'waitlist_hito';
        const ctx = `${tipo}-${evId}-${hito}`;
        // Solo notificamos UNA vez por hito por evento (sin importar el día)
        const yaHay = await sb(
          `radar_alertas?tipo=eq.${tipo}&select=datos&limit=200`
        ).catch(() => []);
        const yaDisparado = (yaHay || []).some(a => a.datos && a.datos.contextoKey === ctx);
        if (!yaDisparado) {
          const nm = nombre[evId] || evId;
          const a = {
            tipo, severidad: 'info',
            titulo: `Waitlist: ${nm} llegó a ${hito}`,
            mensaje: `El evento "${nm}" alcanzó ${hito} personas en lista de espera (${total} total).`,
            datos: { contextoKey: ctx, evento_id: evId, total, hito },
          };
          await insertarAlerta(a);
          if (hito >= 100) await mandarEmailAdmin(a);
          resumen.creadas.push(a.tipo);
        }
      }
    }
  }
}

async function detectarCotizacionesCaida(resumen) {
  // Compara cotizaciones de la semana corriente (lun-dom hasta hoy) vs la
  // semana anterior. Si caen 30%+ con base mínima de 5, alerta.
  const dayMs = 24 * 3600 * 1000;
  const hoy = new Date();
  const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  lunes.setHours(0, 0, 0, 0);
  const lunesPrev = new Date(lunes.getTime() - 7 * dayMs);

  const semActual = await countByAccion('main_eventos_uso', 'main_cotizacion_generada', lunes.toISOString(), hoy.toISOString());
  const semPrev   = await countByAccion('main_eventos_uso', 'main_cotizacion_generada', lunesPrev.toISOString(), lunes.toISOString());
  resumen.cotizaciones = { sem_actual: semActual, sem_prev: semPrev };

  if (semPrev >= 5) {
    const ratio = semActual / semPrev;
    if (ratio <= 0.7) {
      const ctx = `cotizacion_caida-${lunes.toISOString().slice(0, 10)}`;
      if (!(await yaInsertada('cotizacion_caida', ctx, lunes.toISOString()))) {
        const a = {
          tipo: 'cotizacion_caida', severidad: 'alta',
          titulo: 'Caída de cotizaciones esta semana',
          mensaje: `Llevamos ${semActual} cotizaciones esta semana vs ${semPrev} la anterior (-${Math.round((1 - ratio) * 100)}%).`,
          datos: { contextoKey: ctx, sem_actual: semActual, sem_prev: semPrev, ratio: +ratio.toFixed(2) },
        };
        await insertarAlerta(a);
        await mandarEmailAdmin(a);
        resumen.creadas.push(a.tipo);
      }
    }
  }
}

async function detectarCodigoFalla(resumen) {
  // Códigos intentados 20+ veces en los últimos 7 días con tasa de éxito < 20%.
  const hace7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  let rows = [];
  try {
    rows = await sb(
      `main_eventos_uso?accion=eq.main_codigo_intentado` +
      `&created_at=gte.${encodeURIComponent(hace7)}` +
      `&select=codigo_aplicado,codigo_valido&limit=10000`
    );
  } catch (e) { resumen.errores.push('codigos: ' + e.message); return; }
  const stats = {};
  for (const r of rows || []) {
    const cod = (r.codigo_aplicado || '').trim().toUpperCase();
    if (!cod) continue;
    stats[cod] = stats[cod] || { total: 0, validos: 0 };
    stats[cod].total++;
    if (r.codigo_valido) stats[cod].validos++;
  }
  for (const [cod, s] of Object.entries(stats)) {
    if (s.total < 20) continue;
    const tasaExito = s.validos / s.total;
    if (tasaExito >= 0.2) continue;
    const ctx = `codigo_intentos_falla-${cod}-${new Date().toISOString().slice(0, 10)}`;
    if (await yaInsertada('codigo_intentos_falla', ctx, hace7)) continue;
    const a = {
      tipo: 'codigo_intentos_falla', severidad: 'media',
      titulo: `Código "${cod}" falla mucho`,
      mensaje: `El código "${cod}" se intentó ${s.total} veces en 7 días pero solo ${s.validos} fueron válidos (${Math.round(tasaExito * 100)}% éxito). Revisa si hay un error en su configuración.`,
      datos: { contextoKey: ctx, codigo: cod, total: s.total, validos: s.validos, tasa_exito: +tasaExito.toFixed(2) },
    };
    await insertarAlerta(a);
    resumen.creadas.push(a.tipo);
  }
}

// =============================================================================
// Handler
// =============================================================================
exports.handler = async (event) => {
  if (!SB_URL || !SB_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'env vars no configuradas' }) };
  }
  const resumen = { ran_at: new Date().toISOString(), creadas: [], errores: [] };
  try { await detectarTrafico(resumen); }            catch (e) { resumen.errores.push('trafico: ' + e.message); }
  try { await detectarWaitlist(resumen); }           catch (e) { resumen.errores.push('waitlist: ' + e.message); }
  try { await detectarCotizacionesCaida(resumen); }  catch (e) { resumen.errores.push('cot: ' + e.message); }
  try { await detectarCodigoFalla(resumen); }        catch (e) { resumen.errores.push('cod: ' + e.message); }
  return { statusCode: 200, body: JSON.stringify(resumen) };
};

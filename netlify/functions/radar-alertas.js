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
// Sección extra SOLO por correo (sin INSERT en radar_alertas):
//   - ⏰ Reembolsos por vencer: pendientes con +10 días naturales desde la
//     cancelación (el contrato promete 15-20). Ver detectarReembolsosPorVencer.
//
// Deduplicación: cada tipo+contexto solo se inserta una vez por día.
//
// Env vars: SUPABASE_URL_KAMEHOUSE / SUPABASE_SERVICE_KEY_KAMEHOUSE
//           RESEND_KEY (o variantes) para envío de email
// =============================================================================

const { aplicarModoPrueba } = require('./_lib/correo-guard');

const SB_URL = process.env.SUPABASE_URL_KAMEHOUSE || process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE
            || process.env.SUPABASE_SERVICE_KEY
            || process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
const ADMIN_EMAIL = 'admin@conectareynosa.mx';
const ADMIN_TO = 'admin@conectareynosa.mx';

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
  const __mp = aplicarModoPrueba({ to: [ADMIN_TO], subject: `[Radar ${alerta.severidad}] ${alerta.titulo}` });
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Radar del Dragón <${ADMIN_EMAIL}>`,
      to: __mp.to,
      subject: __mp.subject,
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

// Extrae los códigos que existen actualmente en el objeto PROMOS del index.html
// en producción. Devuelve un Set de códigos en MAYÚSCULAS, o null si no se pudo
// leer (en ese caso no filtramos, para no suprimir alertas legítimas).
async function fetchPromoCodes() {
  try {
    const SITE = process.env.URL || 'https://conectareynosa.mx';
    const r = await fetch(`${SITE}/index.html`, { headers: { 'Cache-Control': 'no-cache' } });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/var\s+PROMOS\s*=\s*\{/);
    if (!m) return null;
    const start = m.index + m[0].length - 1; // posición del '{'
    let depth = 0, end = -1, inStr = false, strCh = '';
    for (let i = start; i < html.length; i++) {
      const c = html[i], prev = html[i - 1];
      if (inStr) { if (c === strCh && prev !== '\\') inStr = false; continue; }
      if (c === "'" || c === '"') { inStr = true; strCh = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;
    const block = html.slice(start, end + 1);
    const codes = new Set();
    const re = /['"]([A-Z0-9_]{2,})['"]\s*:/g; // claves de código: 'XXX': {...}
    let k;
    while ((k = re.exec(block))) codes.add(k[1].toUpperCase());
    return codes.size ? codes : null;
  } catch (e) { return null; }
}

async function detectarCodigoFalla(resumen) {
  // Códigos intentados 20+ veces en los últimos 7 días con tasa de éxito < 20%.
  const hace7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  // Solo alertamos sobre códigos que SIGUEN existiendo en PROMOS. Un código
  // eliminado (p.ej. CONECTAREY) ya no debe generar alertas aunque queden
  // intentos fallidos en la ventana de 7 días.
  const promoCodes = await fetchPromoCodes();
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
    // Si pudimos leer PROMOS y el código ya no existe ahí, no alertar.
    if (promoCodes && !promoCodes.has(cod)) continue;
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

// ⏰ Reembolsos por vencer — chismoso para Memo. El contrato v3.1 promete el
// reembolso en 15-20 días naturales desde la confirmación de la cancelación;
// este detector avisa cuando un reembolso PENDIENTE (tabla `reembolsos`, KH)
// lleva MÁS de 10 días naturales desde su creación (la cancelación), para que
// nunca se venza el plazo. Los que NO tienen datos bancarios capturados son
// DOBLE URGENTE (ni siquiera se puede transferir). Ordenados por días desc.
//
// SOLO NOTIFICA: cero escrituras (no inserta en radar_alertas ni toca nada).
// Sin dedup persistente: mientras haya añejos, el correo sale en cada corrida
// del cron (2x/día) — chismoso a propósito. Sin añejos → ni correo ni rastro
// en el resumen (cero ruido).
async function detectarReembolsosPorVencer(resumen) {
  const dayMs = 24 * 3600 * 1000;
  const ahora = Date.now();
  const corte = new Date(ahora - 10 * dayMs).toISOString(); // creado hace MÁS de 10 días
  const rows = await sb(
    `reembolsos?estado=eq.pendiente` +
    `&creado_en=lt.${encodeURIComponent(corte)}` +
    `&select=cliente_nombre,evento_nombre,evento_slug,monto,creado_en,datos_bancarios` +
    `&order=creado_en.asc&limit=1000` // creado más viejo primero = días desc
  );
  const lista = (rows || []).map(r => ({
    cliente: r.cliente_nombre || 'cliente',
    evento: r.evento_nombre || r.evento_slug || '?',
    monto: Number(r.monto) || 0,
    dias: Math.floor((ahora - new Date(r.creado_en).getTime()) / dayMs),
    sin_datos: !(r.datos_bancarios && String(r.datos_bancarios).trim()),
  }));
  if (!lista.length) return; // sin añejos → sección ausente, radar intacto

  resumen.reembolsos_por_vencer = lista.length;
  if (!RESEND_KEY) return;

  const fmtMXN = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(Number(n) || 0);
  const filas = lista.map(x => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.12);font-size:13px;color:#fff">${escapeHtml(x.cliente)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.12);font-size:13px;color:rgba(255,255,255,.85)">${escapeHtml(x.evento)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.12);font-size:13px;color:#fff;white-space:nowrap">${escapeHtml(fmtMXN(x.monto))}</td>
      <td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.12);font-size:13px;font-weight:700;color:${x.dias >= 15 ? '#ff283b' : '#e8ff4c'}">${x.dias} días</td>
      <td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.12);font-size:12px;${x.sin_datos ? 'color:#ff283b;font-weight:900' : 'color:#88ea4e'}">${x.sin_datos ? '🚨 SIN DATOS BANCARIOS' : 'con datos'}</td>
    </tr>`).join('');
  const html = `
<div style="font-family:Arial,sans-serif;max-width:640px;background:#0a0a0a;color:#fff;padding:0">
  <div style="background:#e8ff4c;color:#000;padding:18px;border-bottom:4px solid #ff283b">
    <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Radar del Dragón · Reembolsos</div>
    <div style="font-size:20px;font-weight:900;margin-top:4px">⏰ Reembolsos por vencer (${lista.length})</div>
  </div>
  <div style="padding:22px">
    <p style="font-size:14px;line-height:1.55;color:#fff;margin:0 0 14px 0">
      Estos reembolsos siguen <b>pendientes</b> con más de 10 días naturales desde la cancelación.
      El contrato promete transferir en <b>15 a 20 días naturales</b> — los marcados en rojo ya están en zona de riesgo,
      y los <b style="color:#ff283b">SIN DATOS BANCARIOS</b> son doble urgente: ni siquiera se pueden transferir.
    </p>
    <table style="border-collapse:collapse;width:100%">
      <tr>
        <th style="text-align:left;padding:8px 10px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5);border-bottom:2px solid rgba(255,255,255,.25)">Cliente</th>
        <th style="text-align:left;padding:8px 10px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5);border-bottom:2px solid rgba(255,255,255,.25)">Evento</th>
        <th style="text-align:left;padding:8px 10px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5);border-bottom:2px solid rgba(255,255,255,.25)">Monto</th>
        <th style="text-align:left;padding:8px 10px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5);border-bottom:2px solid rgba(255,255,255,.25)">Días</th>
        <th style="text-align:left;padding:8px 10px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5);border-bottom:2px solid rgba(255,255,255,.25)">Datos</th>
      </tr>
      ${filas}
    </table>
    <p style="margin-top:18px;font-size:12px;color:rgba(255,255,255,.7)">
      Márcalos en <a href="https://conectareynosa.mx/kamehouse" style="color:#e8ff4c;text-decoration:none;font-weight:700">Kamehouse → Palacio → Reembolsos</a> en cuanto transfieras.
    </p>
  </div>
</div>`;
  const __mp = aplicarModoPrueba({ to: [ADMIN_TO], subject: `[Radar] ⏰ ${lista.length} reembolso${lista.length === 1 ? '' : 's'} por vencer` });
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `Radar del Dragón <${ADMIN_EMAIL}>`, to: __mp.to, subject: __mp.subject, html }),
  });
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
  try { await detectarReembolsosPorVencer(resumen); } catch (e) { resumen.errores.push('reembolsos: ' + e.message); }
  return { statusCode: 200, body: JSON.stringify(resumen) };
};

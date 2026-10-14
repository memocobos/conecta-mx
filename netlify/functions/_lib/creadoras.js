// =============================================================================
// _lib/creadoras.js — [CREA-SEG] el seguimiento de las creadoras de contenido.
// Dueño de: (1) los correos que reciben (bienvenida, calendario, recibido,
// recordatorio, vencido), (2) los puntos del ranking, (3) lectura/escritura
// mínima contra KH. Lo usan admin-creadoras, contrato-firmar, contrato-obtener
// y el cron creadoras-entregables-diario. Un correo = un dueño.
// =============================================================================
const SITE = process.env.URL || 'https://conectareynosa.mx';
const TZ = 'America/Matamoros';

const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const FASE_TXT = { previo: 'Antes del evento', evento: 'Durante el evento', posterior: 'Después del evento' };

// «Hoy» en Reynosa como YYYY-MM-DD (jamás toISOString: la ley de la casa).
function hoyMx(d) { return (d || new Date()).toLocaleDateString('en-CA', { timeZone: TZ }); }
// Días de `desde` a `hasta` (fechas YYYY-MM-DD, sin horas).
function diasEntre(desde, hasta) {
  if (!desde || !hasta) return null;
  const a = Date.parse(desde + 'T12:00:00Z'), b = Date.parse(hasta + 'T12:00:00Z');
  if (!isFinite(a) || !isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}
function fechaLarga(ymd) {
  if (!ymd) return '';
  return new Date(String(ymd).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}
function linkColab(token) { return `${SITE}/contrato?t=${encodeURIComponent(token)}`; }

// La fase sugerida a partir del texto del entregable (solo para PRELLENAR; la
// decide Memo al guardar).
function faseSugerida(txt) {
  const t = String(txt || '').toLowerCase();
  if (/previo|antes|invitando|promoci|conocer nuestros|p[aá]gina web/.test(t)) return 'previo';
  if (/durante|en vivo|en el evento/.test(t)) return 'evento';
  if (/posterior|despu[eé]s|agradeciendo|experiencia/.test(t)) return 'posterior';
  return 'previo';
}

// ── el marco de todos los correos ─────────────────────────────────────────
function marco(titulo, cuerpo, token) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;font-size:14px;line-height:1.55">
<div style="background:#000;color:#e8ff4c;padding:16px 20px;font-weight:900;letter-spacing:.04em">CONECTA REYNOSA · ${esc(titulo)}</div>
<div style="padding:20px">${cuerpo}
${token ? `<p style="margin:18px 0 0;text-align:center"><a href="${esc(linkColab(token))}" style="display:inline-block;background:#000;color:#e8ff4c;padding:12px 20px;border-radius:8px;font-weight:700;text-decoration:none">Ver mi colaboración y mis fechas</a></p>` : ''}
<p style="margin:18px 0 0;color:#666;font-size:12px">Si tienes dudas, responde a este correo.</p>
</div></div>`;
}
function tablaEntregables(items, hoy) {
  const vivos = (items || []).filter((e) => e.estado !== 'descartado');
  if (!vivos.length) return '';
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0 4px;font-size:13px">${vivos.map((e) => {
    const d = e.fecha_limite ? diasEntre(hoy, e.fecha_limite) : null;
    const est = e.estado === 'entregado' ? '<span style="color:#1a8a3a;font-weight:700">✓ Recibido</span>'
      : d == null ? '<span style="color:#666">Fecha por confirmar</span>'
      : d < 0 ? `<span style="color:#d0182f;font-weight:700">Venció ${esc(fechaLarga(e.fecha_limite))}</span>`
      : `<span style="color:#111">Entrega a más tardar el <b>${esc(fechaLarga(e.fecha_limite))}</b>${d === 0 ? ' (hoy)' : d === 1 ? ' (mañana)' : ` (en ${d} días)`}</span>`;
    return `<tr><td style="padding:8px 6px;border-bottom:1px solid #eee;color:#111;vertical-align:top"><div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em">${esc(FASE_TXT[e.fase] || '')}</div>${esc(e.descripcion)}</td><td style="padding:8px 6px;border-bottom:1px solid #eee;color:#111;text-align:right;vertical-align:top;width:42%">${est}</td></tr>`;
  }).join('')}</table>`;
}

// tipo: 'bienvenida' | 'calendario' | 'recibido' | 'recordatorio' | 'vencido'
function correoCreadora(tipo, c, items, extra) {
  const hoy = (extra && extra.hoy) || hoyMx();
  const n1 = esc(String(c.creador_nombre || '').trim().split(/\s+/)[0] || '');
  const ev = esc(c.evento_nombre || 'tu evento');
  const dEv = c.evento_fecha ? diasEntre(hoy, c.evento_fecha) : null;
  const cuenta = dEv != null && dEv >= 0 ? `<p style="margin:0 0 12px;font-size:15px">⏳ Faltan <b>${dEv} día${dEv === 1 ? '' : 's'}</b> para ${ev}.</p>` : '';
  if (tipo === 'bienvenida') {
    const lista = Array.isArray(c.expectativas) && c.expectativas.length
      ? `<ul style="margin:0 0 12px;padding-left:18px">${c.expectativas.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    return { asunto: `¡Bienvenida a la colaboración de ${c.evento_nombre || 'Conecta'}!`, html: marco('Colaboración', `
<p style="margin:0 0 12px">¡Hola ${n1}! Gracias por firmar tu colaboración para <b>${ev}</b>.</p>
${cuenta}<p style="margin:0 0 6px">Esto es lo que acordamos que vas a crear:</p>${lista}
${items && items.length ? tablaEntregables(items, hoy) : '<p style="margin:0 0 12px">En los próximos días te mandamos las <b>fechas límite</b> de cada entrega.</p>'}
<p style="margin:12px 0 0">En tu página de colaboración ves la cuenta regresiva y lo que te falta entregar, siempre actualizado.</p>`, c.token) };
  }
  if (tipo === 'calendario') {
    // [CREA-SEG-6] Para una creadora que todavía no firma, el mismo correo le
    // pide firmar primero; a una firmada sin redes, que las complete en su página.
    const pend = c.estado === 'pendiente';
    const d = (c.datos && typeof c.datos === 'object') ? c.datos : {};
    const faltaRedes = !pend && (!d.instagram || !d.celular);
    return { asunto: pend ? `Firma tu contrato y conoce tus fechas — ${c.evento_nombre || 'tu colaboración'}` : `Tus fechas de entrega para ${c.evento_nombre || 'tu colaboración'}`, html: marco('Calendario de entregas', `
<p style="margin:0 0 12px">¡Hola ${n1}! Estrenamos tu página de colaboración: ahí ves la <b>cuenta regresiva</b> a tu evento, lo que te toca entregar y <b>cuándo</b>. Estas son tus fechas para <b>${ev}</b>:</p>${cuenta}${tablaEntregables(items, hoy)}
${pend ? '<p style="margin:12px 0 0;padding:10px 12px;background:#fff7d6;border-radius:8px"><b>Tu contrato todavía está pendiente de firma.</b> Fírmalo en el mismo link de abajo para confirmar tu colaboración.</p>' : ''}
${faltaRedes ? '<p style="margin:12px 0 0;padding:10px 12px;background:#eef6ff;border-radius:8px"><b>Completa tu Instagram, TikTok y WhatsApp</b> en tu página de colaboración: así encontramos tu contenido y coordinamos las entregas.</p>' : ''}
<p style="margin:12px 0 0">Recuerda que el contenido previo es parte de tu contrato: si no llega a tiempo, la colaboración se puede cancelar (cláusula 5).</p>`, c.token) };
  }
  if (tipo === 'recibido') {
    const e = (extra && extra.entregable) || {};
    const faltan = (items || []).filter((x) => x.estado === 'pendiente');
    return { asunto: `Recibimos tu contenido ✓ — ${c.evento_nombre || ''}`.trim(), html: marco('Contenido recibido', `
<p style="margin:0 0 12px">¡Hola ${n1}! Recibimos: <b>${esc(e.descripcion || '')}</b> ✓ ¡Gracias!</p>${cuenta}
${faltan.length ? `<p style="margin:0 0 6px">Te falta:</p>${tablaEntregables(faltan, hoy)}` : '<p style="margin:0 0 12px"><b>¡Ya entregaste todo!</b> Gracias por tu compromiso.</p>'}`, c.token) };
  }
  if (tipo === 'recordatorio') {
    const dias = extra && extra.dias;
    const lst = (extra && extra.pendientes) || [];
    return { asunto: `${dias === 1 ? 'Mañana' : `En ${dias} días`} vence tu entrega para ${c.evento_nombre || 'tu colaboración'}`, html: marco('Recordatorio', `
<p style="margin:0 0 12px">¡Hola ${n1}! Te recordamos que ${dias === 1 ? '<b>mañana</b>' : `en <b>${dias} días</b>`} vence:</p>${tablaEntregables(lst, hoy)}${cuenta}
<p style="margin:12px 0 0">Si ya lo tienes, mándanoslo por WhatsApp o Instagram. Si necesitas ayuda con la idea, escríbenos.</p>`, c.token) };
  }
  if (tipo === 'vencido') {
    const lst = (extra && extra.pendientes) || [];
    return { asunto: `Venció tu entrega para ${c.evento_nombre || 'tu colaboración'}`, html: marco('Entrega vencida', `
<p style="margin:0 0 12px">Hola ${n1}. No hemos recibido lo siguiente y su fecha límite ya pasó:</p>${tablaEntregables(lst, hoy)}
<p style="margin:12px 0 0">Mándalo lo antes posible. Te recordamos que la cláusula 5 de tu contrato permite cancelar la colaboración cuando el contenido no se entrega en tiempo y forma.</p>`, c.token) };
  }
  throw new Error('tipo de correo desconocido: ' + tipo);
}

// ── el ranking: puntos automáticos (palabra de Memo) ──────────────────────
//   +10 colaboración cumplida (evento pasado y TODO lo vivo entregado)
//   +3  entregable a tiempo · −3 entregado tarde · −5 vencido sin entregar
//   −20 colaboración cancelada (dada de baja)
const PUNTOS = { cumplida: 10, a_tiempo: 3, tarde: -3, vencido: -5, baja: -20 };
function evaluarContrato(c, items, hoy) {
  hoy = hoy || hoyMx();
  const r = { a_tiempo: 0, tarde: 0, vencido: 0, pendiente: 0, cumplida: false, baja: c.estado === 'cancelado', puntos: 0 };
  const vivos = (items || []).filter((e) => e.estado !== 'descartado');
  vivos.forEach((e) => {
    if (e.estado === 'entregado') {
      const dEnt = e.entregado_at ? new Date(e.entregado_at).toLocaleDateString('en-CA', { timeZone: TZ }) : null;
      if (e.fecha_limite && dEnt && dEnt > e.fecha_limite) r.tarde++; else r.a_tiempo++;
    } else if (e.fecha_limite && e.fecha_limite < hoy) r.vencido++;
    else r.pendiente++;
  });
  const pasado = c.evento_fecha && c.evento_fecha < hoy;
  r.cumplida = !r.baja && c.estado === 'firmado' && pasado && vivos.length > 0 && vivos.every((e) => e.estado === 'entregado');
  r.puntos = r.a_tiempo * PUNTOS.a_tiempo + r.tarde * PUNTOS.tarde + r.vencido * PUNTOS.vencido
    + (r.cumplida ? PUNTOS.cumplida : 0) + (r.baja ? PUNTOS.baja : 0);
  return r;
}

// Manda un correo por Resend respetando el modo prueba de la casa. Devuelve
// { enviado, email_id?, error? } — jamás lanza: el correo no tumba lo demás.
async function enviarCorreo(to, asunto, html) {
  const KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
  const FROM = process.env.RESEND_FROM_CONTRATOS || process.env.RESEND_FROM_ROL || 'Conecta Reynosa <admin@conectareynosa.mx>';
  if (!KEY) return { enviado: false, error: 'Falta RESEND_API_KEY' };
  if (!to) return { enviado: false, error: 'Sin correo' };
  try {
    const { aplicarModoPrueba } = require('./correo-guard');
    const mp = aplicarModoPrueba({ to, subject: asunto });
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: mp.to, subject: mp.subject, html, reply_to: 'admin@conectareynosa.mx' }),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { enviado: true, email_id: j.id || null } : { enviado: false, error: j.message || ('Resend ' + r.status) };
  } catch (e) { return { enviado: false, error: e.message }; }
}

module.exports = { enviarCorreo, esc, hoyMx, diasEntre, fechaLarga, linkColab, faseSugerida, correoCreadora, evaluarContrato, PUNTOS, FASE_TXT };

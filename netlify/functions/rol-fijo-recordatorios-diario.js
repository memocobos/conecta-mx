// netlify/functions/rol-fijo-recordatorios-diario.js — [ROL-AVISOS-1]
// Cron DIARIO (14:00 UTC). Recordatorios de pago en las fechas del ROL FIJO de
// cada viajero (`viajeros_evento.plan_pagos`): apertura de su ventana · último
// día · vencido (día siguiente) · 7 días antes del evento si va en «Antes del
// evento». La lógica, el correo y la bitácora viven en `_lib/rol-avisos`.
//
// 🔒 ENCENDIDO el 4-nov-2026 por palabra de Memo (ROL_AVISOS_VIVO en el lib;
// apagado no lee ni manda nada). El ensayo en seco vive en KameHouse
// (admin-coordi-asignaciones · rol_avisos_ensayo).
const RA = require('./_lib/rol-avisos');
const { aplicarModoPrueba } = require('./_lib/correo-guard');

const FROM = process.env.RESEND_FROM_COBRANZA || 'Conecta Reynosa <admin@conectareynosa.mx>';

async function enviar(to, subject, html) {
  const KEY = process.env.RESEND_KEY || process.env.RESEND_API_KEY;
  if (!KEY || !to) return { ok: false };
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  }).catch(() => null);
  if (!r || !r.ok) return { ok: false };
  const j = await r.json().catch(() => ({}));
  return { ok: true, id: j && j.id };
}

exports.handler = async function () {
  if (!RA.ROL_AVISOS_VIVO) {
    console.log('[rol-avisos] APAGADO (ROL_AVISOS_VIVO=false) — no se lee ni se manda nada.');
    return { statusCode: 200, body: JSON.stringify({ ok: true, apagado: true }) };
  }
  const url = process.env.SUPABASE_URL_KAMEHOUSE;
  const key = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!url || !key) return { statusCode: 500, body: 'Config faltante' };
  const headers = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  let EV = null;
  try { EV = await require('./_lib/catalogo-index').fetchEventosRaw(); } catch (_) { EV = null; }
  // Sin catálogo no sale nada: un recordatorio que no dice a qué viaje se lee como spam.
  if (!Array.isArray(EV)) { console.error('[rol-avisos] catálogo ilegible — hoy no se manda.'); return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'catalogo' }) }; }
  try {
    const r = await RA.correrAvisos({ url, headers, EV, ahora: new Date(), seco: false, enviar });
    delete r.muestra;
    console.log('[rol-avisos] ' + JSON.stringify(r));
    return { statusCode: 200, body: JSON.stringify(Object.assign({ ok: true }, r)) };
  } catch (e) {
    console.error('[rol-avisos] error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};

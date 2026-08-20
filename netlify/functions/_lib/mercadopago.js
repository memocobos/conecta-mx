// =============================================================================
// _lib/mercadopago.js — cliente mínimo de Mercado Pago + verificación de firma
//                       (MP-1a · el contrato)
//
// SIN dependencia npm, igual que `_lib/stripe.js`: este repo no tiene build step
// y el SDK de MP arrastraría un árbol de dependencias que nadie audita. MP habla
// JSON sobre HTTP y su firma es un HMAC-SHA256 que `crypto` de Node hace solo.
//
// Esta tuerca NO toca el flujo de pago: solo deja el contrato escrito y probado.
// La preferencia (MP-1b), el webhook (MP-1c) y el frente (MP-1e) lo consumen.
//
// ── DIFERENCIAS CON STRIPE QUE CUESTAN CARO OLVIDAR ─────────────────────────
//
//  1. EL MONTO NO VIENE EN LA NOTIFICACIÓN. El evento de Stripe trae el objeto
//     con su importe; MP manda SOLO un id. El importe y el estado se leen de
//     `obtenerPago(id)` — GET /v1/payments/{id}—, JAMÁS del cuerpo del webhook.
//     Quien confíe en el cuerpo está escribiendo dinero a partir de algo que
//     cualquiera puede inventar.
//
//  2. EL IMPORTE VA EN PESOS, NO EN CENTAVOS. Stripe cobra 150000 para $1,500.00;
//     MP usa `transaction_amount: 1500.00`. Un copiar-pegar de la lógica vieja
//     cobra 100 veces de menos, y en silencio.
//
//  3. LA FIRMA SE ARMA CON UN MANIFEST, no con el cuerpo crudo. Ver abajo.
//
// ── PROCEDENCIA DEL CONTRATO DE FIRMA (leído, no recordado) ─────────────────
// El formato del manifest se careó contra TRES fuentes el 20-ago-2026, porque
// la primera que consulté daba un formato distinto (`{request_id}.{ts}.{data_id}`)
// y en dinero una discrepancia no se promedia, se resuelve:
//   · MP prompt-library (mercadopago.com.ar/developers/en/prompt-library/…)
//   · mercadopago/sdk-nodejs, discussion #318
//   · MP docs webhooks (mercadopago.com.mx/developers/en/docs/…/webhooks)
// Las tres coinciden en `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
// —con los punto y coma y el FINAL incluido—. La página en español no lo cita
// literal, así que no cuenta como confirmación.
//
// ⚠️ AUN ASÍ, ESTO NO ESTÁ CERRADO HASTA VER UNA NOTIFICACIÓN REAL. La única
//    autoridad sobre el contrato es MP mandando un webhook de verdad. Hay
//    reportes de firmas que validan en prueba y fallan en producción (la
//    discussion #318 es justo eso). El pago real de $1 del 28-ago valida esto
//    ANTES de abrir; si el manifest resulta ser otro, se corrige AQUÍ y ninguna
//    otra pieza de la serie se mueve — por eso el contrato vive en un solo
//    archivo.
//
// Env: PAGOS_MP_MODO (ausencia = APAGADO), MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET.
// =============================================================================

const crypto = require('crypto');

const API = 'https://api.mercadopago.com';

// ── El interruptor. Su AUSENCIA es apagado, como SESION_VIVA_MODO y
//    PAGOS_STRIPE_MODO: para encender hay que decirlo, nunca al revés.
function modo() {
  return String(process.env.PAGOS_MP_MODO || '').trim().toLowerCase();
}
function encendido() {
  const m = modo();
  return m === 'test' || m === 'live';
}

// ── Candado de coherencia: una llave de prueba en modo 'live' cobra de mentiras
//    creyendo que cobra de verdad, y una de producción en 'test' cobra DE VERDAD
//    creyendo que no. Las dos son desastres, así que se rebota antes de llamar.
//    En MP las de producción empiezan con APP_USR- y las de prueba con TEST-.
function llaveCoherente() {
  const tok = String(process.env.MP_ACCESS_TOKEN || '');
  if (!tok) return { ok: false, error: 'MP_ACCESS_TOKEN no configurado' };
  const esPrueba = tok.startsWith('TEST-');
  const esProd = tok.startsWith('APP_USR-');
  if (!esPrueba && !esProd) {
    return { ok: false, error: 'MP_ACCESS_TOKEN con prefijo desconocido (ni TEST- ni APP_USR-)' };
  }
  if (modo() === 'live' && esPrueba) return { ok: false, error: 'modo live con llave TEST-' };
  if (modo() === 'test' && esProd) return { ok: false, error: 'modo test con llave APP_USR-' };
  return { ok: true, live: esProd };
}

// ── HTTP ────────────────────────────────────────────────────────────────────
async function llamar(metodo, ruta, cuerpo, opts) {
  const o = opts || {};
  const _fetch = o.fetchImpl || fetch;
  const tok = o.token || process.env.MP_ACCESS_TOKEN || '';
  const headers = {
    Authorization: `Bearer ${tok}`,
    'Content-Type': 'application/json',
  };
  // Idempotencia del lado de MP para las escrituras: si el POST se reintenta por
  // un timeout de red, MP devuelve el MISMO recurso en vez de crear otro. No
  // sustituye a nuestra idempotencia del webhook — protegen cosas distintas:
  // ésta el alta, aquélla el cobro.
  if (o.idempotencia) headers['X-Idempotency-Key'] = String(o.idempotencia);

  const r = await _fetch(`${API}${ruta}`, {
    method: metodo,
    headers,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* MP contestó algo que no es JSON */ }
  if (!r.ok) {
    return { ok: false, status: r.status, error: (json && (json.message || json.error)) || texto || `HTTP ${r.status}`, json };
  }
  return { ok: true, status: r.status, json };
}

const apiGet = (ruta, opts) => llamar('GET', ruta, undefined, opts);
const apiPost = (ruta, cuerpo, opts) => llamar('POST', ruta, cuerpo, opts);

// ── LA VERDAD DEL DINERO ────────────────────────────────────────────────────
// El estado y el importe autoritativos de un pago. Es la ÚNICA fuente válida
// para decidir si se cobró y cuánto: la notificación solo dice "mira este id".
async function obtenerPago(paymentId, opts) {
  const id = String(paymentId == null ? '' : paymentId).trim();
  if (!/^\d+$/.test(id)) return { ok: false, error: `payment id inválido: "${paymentId}"` };
  const r = await apiGet(`/v1/payments/${encodeURIComponent(id)}`, opts);
  if (!r.ok) return r;
  const p = r.json || {};
  return {
    ok: true,
    id: String(p.id),
    estado: p.status,                          // 'approved' | 'pending' | 'rejected' | …
    detalle: p.status_detail,
    monto: p.transaction_amount,               // ⚠️ EN PESOS, no en centavos
    moneda: p.currency_id,
    referencia: p.external_reference,          // nuestro amarre a la solicitud
    metodo: p.payment_method_id,
    live: p.live_mode === true,
    crudo: p,
  };
}

// ── LA FIRMA ────────────────────────────────────────────────────────────────
// `x-signature: ts=<epoch>,v1=<hex>` y el manifest
//     id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// firmado con HMAC-SHA256 y la clave secreta de notificaciones del panel.
//
// Reglas que NO se negocian, las mismas del verificador de Stripe:
//   · comparación en TIEMPO CONSTANTE (timingSafeEqual), jamás con ===;
//   · TOLERANCIA de tiempo: una firma válida pero vieja es un replay;
//   · sin secreto configurado se RECHAZA — nunca se deja pasar "porque falta
//     la env": un candado que se apaga solo es peor que no tenerlo.
function verificarFirma(args) {
  const a = args || {};
  const sec = a.secreto || process.env.MP_WEBHOOK_SECRET || '';
  if (!sec) return { ok: false, error: 'MP_WEBHOOK_SECRET no configurada' };
  if (!a.xSignature) return { ok: false, error: 'Falta la cabecera x-signature' };
  if (!a.xRequestId) return { ok: false, error: 'Falta la cabecera x-request-id' };
  if (a.dataId == null || a.dataId === '') return { ok: false, error: 'Falta data.id' };

  const partes = {};
  String(a.xSignature).split(',').forEach((p) => {
    const i = p.indexOf('=');
    if (i < 0) return;
    partes[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  if (!partes.ts || !partes.v1) return { ok: false, error: 'x-signature mal formada' };

  const tol = Number.isFinite(a.toleranciaSeg) ? a.toleranciaSeg : 300;   // 5 min
  const ahora = Number.isFinite(a.ahoraSeg) ? a.ahoraSeg : Math.floor(Date.now() / 1000);
  const ts = Number(partes.ts);
  if (!Number.isFinite(ts)) return { ok: false, error: 'ts no numérico' };
  if (Math.abs(ahora - ts) > tol) return { ok: false, error: 'Firma fuera de tolerancia (replay)' };

  const esperado = firmarParaPruebas({ dataId: a.dataId, xRequestId: a.xRequestId, ts: partes.ts, secreto: sec });
  const bufV = Buffer.from(String(partes.v1), 'utf8');
  const bufE = Buffer.from(esperado, 'utf8');
  if (bufV.length !== bufE.length) return { ok: false, error: 'Firma inválida' };
  if (!crypto.timingSafeEqual(bufV, bufE)) return { ok: false, error: 'Firma inválida' };
  return { ok: true, ts };
}

// El manifest, en UN solo lugar. Lo usan el verificador y el arnés: si el
// formato resulta ser otro cuando llegue la primera notificación real, se
// corrige aquí y las dos se enteran a la vez.
function manifest({ dataId, xRequestId, ts }) {
  return `id:${dataId};request-id:${xRequestId};ts:${ts};`;
}

// Firma un manifest como lo firmaría MP. Lo usa el ARNÉS; en producción solo lo
// llama `verificarFirma` para calcular el esperado.
function firmarParaPruebas({ dataId, xRequestId, ts, secreto }) {
  return crypto.createHmac('sha256', secreto || process.env.MP_WEBHOOK_SECRET || '')
    .update(manifest({ dataId, xRequestId, ts }))
    .digest('hex');
}

module.exports = {
  API, modo, encendido, llaveCoherente,
  apiGet, apiPost, obtenerPago,
  verificarFirma, manifest, firmarParaPruebas,
};

// =============================================================================
// _lib/stripe.js — cliente mínimo de Stripe + verificación de firma (ST-1)
//
// SIN dependencia npm: Stripe habla HTTP con form-encoding y su firma es un
// HMAC-SHA256 con `crypto` de Node. Meter el SDK en un repo sin build step para
// dos llamadas sería más superficie de la que ahorra.
//
// LAS LLAVES NUNCA VIVEN AQUÍ: salen de env (STRIPE_SECRET_KEY /
// STRIPE_WEBHOOK_SECRET), las pega Memo en Netlify. Este archivo jamás las
// registra ni las devuelve.
// =============================================================================

const crypto = require('crypto');

// EL INTERRUPTOR. Ausencia = 'off': si nadie lo configuró, Stripe está dormido.
// Solo 'test' y 'live' lo despiertan.
function modo() {
  const m = String(process.env.PAGOS_STRIPE_MODO || 'off').toLowerCase();
  return (m === 'test' || m === 'live') ? m : 'off';
}
function encendido() { return modo() !== 'off'; }

function secreto() { return process.env.STRIPE_SECRET_KEY || ''; }

// La llave DEBE corresponder al modo: una sk_live_ con el interruptor en 'test'
// es dinero real saliendo de una prueba. Se rechaza antes de llamar a nadie.
function llaveCoherente() {
  const k = secreto(), m = modo();
  if (!k) return { ok: false, error: 'STRIPE_SECRET_KEY no configurada' };
  if (m === 'test' && !k.startsWith('sk_test_')) {
    return { ok: false, error: 'Modo test con una llave que no es sk_test_ — se detiene' };
  }
  if (m === 'live' && !k.startsWith('sk_live_')) {
    return { ok: false, error: 'Modo live con una llave que no es sk_live_ — se detiene' };
  }
  return { ok: true };
}

// form-encoding anidado, que es como Stripe recibe los objetos.
function aForm(obj, prefijo, salida) {
  const out = salida || [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const clave = prefijo ? `${prefijo}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') aForm(item, `${clave}[${i}]`, out);
        else out.push(`${encodeURIComponent(`${clave}[${i}]`)}=${encodeURIComponent(item)}`);
      });
    } else if (typeof v === 'object') {
      aForm(v, clave, out);
    } else {
      out.push(`${encodeURIComponent(clave)}=${encodeURIComponent(v)}`);
    }
  }
  return out;
}

// POST a la API de Stripe. `idempotencyKey` evita que un reintento de red cree
// DOS sesiones de checkout para la misma cuota.
async function apiPost(ruta, cuerpo, idempotencyKey) {
  const coh = llaveCoherente();
  if (!coh.ok) return { ok: false, status: 500, error: coh.error };
  const headers = {
    Authorization: 'Bearer ' + secreto(),
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  let r, j;
  try {
    r = await fetch('https://api.stripe.com/v1/' + ruta, {
      method: 'POST', headers, body: aForm(cuerpo).join('&'),
    });
    j = await r.json().catch(() => ({}));
  } catch (e) {
    return { ok: false, status: 502, error: 'No se pudo hablar con Stripe: ' + e.message };
  }
  if (!r.ok) {
    return { ok: false, status: r.status, error: (j && j.error && j.error.message) || 'Stripe rechazó la petición' };
  }
  return { ok: true, data: j };
}

// GET a la API de Stripe. Lo usa el webhook cuando el evento llega FLACO (el
// flujo nuevo de "destinos de evento" puede mandar solo el id del objeto) y hay
// que ir por el objeto completo. Lectura pura: no crea ni cobra nada.
async function apiGet(ruta) {
  const coh = llaveCoherente();
  if (!coh.ok) return { ok: false, status: 500, error: coh.error };
  let r, j;
  try {
    r = await fetch('https://api.stripe.com/v1/' + ruta, {
      headers: { Authorization: 'Bearer ' + secreto() },
    });
    j = await r.json().catch(() => ({}));
  } catch (e) {
    return { ok: false, status: 502, error: 'No se pudo leer de Stripe: ' + e.message };
  }
  if (!r.ok) return { ok: false, status: r.status, error: (j && j.error && j.error.message) || 'Stripe rechazó la lectura' };
  return { ok: true, data: j };
}

// ── VERIFICACIÓN DE FIRMA ────────────────────────────────────────────────────
// Formato de Stripe-Signature: "t=<unix>,v1=<hmac>,v1=<otro>". El HMAC se
// calcula sobre "<t>.<cuerpo crudo>" con el webhook secret.
//
// Dos candados que importan:
//   · comparación en TIEMPO CONSTANTE (timingSafeEqual), no ===.
//   · TOLERANCIA de tiempo: una firma válida pero vieja es un replay.
function verificarFirma(cuerpoCrudo, cabecera, secretoWh, toleranciaSeg, ahoraSeg) {
  const sec = secretoWh || process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!sec) return { ok: false, error: 'STRIPE_WEBHOOK_SECRET no configurada' };
  if (!cabecera) return { ok: false, error: 'Falta la cabecera Stripe-Signature' };

  const partes = {};
  String(cabecera).split(',').forEach((p) => {
    const i = p.indexOf('=');
    if (i < 0) return;
    const k = p.slice(0, i).trim(), v = p.slice(i + 1).trim();
    if (k === 'v1') (partes.v1 = partes.v1 || []).push(v);
    else partes[k] = v;
  });
  if (!partes.t || !partes.v1 || !partes.v1.length) {
    return { ok: false, error: 'Stripe-Signature mal formada' };
  }

  const tol = Number.isFinite(toleranciaSeg) ? toleranciaSeg : 300;   // 5 min
  const ahora = Number.isFinite(ahoraSeg) ? ahoraSeg : Math.floor(Date.now() / 1000);
  const t = Number(partes.t);
  if (!Number.isFinite(t)) return { ok: false, error: 'timestamp inválido en la firma' };
  if (Math.abs(ahora - t) > tol) return { ok: false, error: 'Firma fuera de la ventana de tolerancia (posible replay)' };

  const esperado = crypto.createHmac('sha256', sec)
    .update(`${partes.t}.${cuerpoCrudo}`, 'utf8').digest('hex');
  const bufE = Buffer.from(esperado, 'utf8');
  const coincide = partes.v1.some((v) => {
    const bufV = Buffer.from(String(v), 'utf8');
    if (bufV.length !== bufE.length) return false;      // timingSafeEqual exige igual largo
    return crypto.timingSafeEqual(bufV, bufE);
  });
  if (!coincide) return { ok: false, error: 'Firma inválida' };
  return { ok: true, t };
}

// Solo para el ARNÉS: firmar un cuerpo como lo firmaría Stripe. No lo usa
// ninguna function; vive aquí para que el arnés no reimplemente el algoritmo
// (una copia probaría mi copia, no la verificación real).
function firmarParaPruebas(cuerpoCrudo, secretoWh, tSeg) {
  const t = Number.isFinite(tSeg) ? tSeg : Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', secretoWh).update(`${t}.${cuerpoCrudo}`, 'utf8').digest('hex');
  return `t=${t},v1=${v1}`;
}

module.exports = { modo, encendido, llaveCoherente, apiPost, apiGet, verificarFirma, firmarParaPruebas, _aForm: aForm };

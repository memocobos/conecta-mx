// =============================================================================
// admin-promos — [UB-1] La Casa de Uranai Baba: el CAJERO de las promociones.
//
// Gobierna `promos_codigos` (KH), la tabla que UB-2 compilará al `var PROMOS`
// del index.html. Hoy una promoción vive partida en tres —el cajero, el letrero
// (`flash_promo` de Esferas) y el badge— y SOLO EL CAJERO COBRA. Ésta es la
// pieza que cobra.
//
// Body JSON: { accion, ... }
//   - 'listar'   {}                        → { ok, codigos:[...], catalogo:{...} }
//   - 'crear'    { codigo, ...campos }     → { ok, codigo }
//   - 'editar'   { codigo, ...campos }     → { ok, codigo }
//   - 'archivar' { codigo, archivado }     → { ok }
//   - 'importar' { codigos:[...] }         → { ok, creados, saltados, fallidos }
//        Traer del catálogo: siembra los códigos que el index ya tiene y esta
//        tabla no. NO pisa los que ya están (el que manda es el editor).
//
// 🔒 LA UNIDAD DEL DESCUENTO LA EXIGE EL MOTOR, no esta función:
// `num_nonnulls(monto, pct, segundo_pax) = 1`. Un código elige EXACTAMENTE UNA
// de las tres formas de descontar. La mordida de NATA —`pct:500` queriendo
// decir «$500»— es imposible desde la base. Aquí se valida igual, para dar un
// mensaje humano en vez de un 23514, pero LA VERDAD ESTÁ EN EL CHECK.
//
// Seguridad: Authorization Bearer <JWT> + corsCheck. Solo maestro_roshi, el
// mismo candado que Esferas (los códigos son dinero).
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
// [UB-3] La derivación fila → letrero vive en el lib del compilador: UNA sola
// fuente. Aquí solo se lee la fila y se devuelve el payload; QUIEN ESCRIBE es
// `esferas-actualizar`, el mismo endpoint que usa Esferas.
const { filaALetrero } = require('./_lib/promos-compile');
// [ORACULO-FIX-1] LA CUENTA DE INVENTARIO SE LE PIDE A SU DUEÑO. R4 decía
// «Calle 24: 17 boletos» y quedan 7: restaba `vendidos_fuera` pero no a los
// viajeros que consumen boleto. El dueño de esa cuenta es `_lib/disponibilidad`
// —`compradas − fuera − seguras − apartadas − migrados`, y su término de
// migrados ya pasa por `consumeBoleto`—, así que se le pide, no se recalcula.
// Es la misma regla que rige a las pantallas: ninguna calcula su propia cuenta.
const { cargarDisponibilidad, desgloseZona } = require('./_lib/disponibilidad');

const SB_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
const BASE = `${SB_URL}/rest/v1/promos_codigos`;

const SOLO_ROSHI = ['maestro_roshi'];

// 🔒 Acciones válidas → roles. LA ENTRADA VA AQUÍ O LA ACCIÓN NO EXISTE para el
// despacho: ésa fue RAD-FIX-CAMINO, con tres RPC vivos y «accion inválida» en
// pantalla. El arnés carea las dos listas.
const ACCIONES = {
  listar: SOLO_ROSHI,
  crear: SOLO_ROSHI,
  editar: SOLO_ROSHI,
  archivar: SOLO_ROSHI,
  importar: SOLO_ROSHI,
  // [UB-3] Devuelve el payload del letrero. NO escribe: el escritor es
  // `esferas-actualizar`. Un segundo escritor sobre `esferas_eventos` sería
  // la fórmula número doce esperando a divergir.
  letrero_payload: SOLO_ROSHI,
  // [UB-4] Las lecturas del oráculo. SOLO LEE: Baba propone, jamás crea.
  oraculo: SOLO_ROSHI,
};

const CODIGO_RE = /^[A-Z0-9_]{2,32}$/;
// Los paquetes de la casa. Lista CERRADA: un paquete inventado saldría al
// catálogo público dentro de `excludePkg` y no lo vetaría nada.
const PAQUETES = ['plus', 'ride', 'stay', 'cheap'];

// Las columnas que esta función administra. Se nombran para que un campo nuevo
// de la tabla no viaje solo por venir en el body.
const CAMPOS = [
  'monto', 'pct', 'pct_cheap', 'desc_texto', 'custom_msg', 'hide_amount',
  'only_events', 'all_events', 'only_zones', 'exclude_zones', 'exclude_pkg',
  'starts_at', 'expires_at', 'max_usos', 'single_use',
  'segundo_pax', 'exact_personas',
];

exports.handler = async (event) => {
  const origen = corsCheck(event);
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origen === '' ? '*' : (origen || ''),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (origen === null) return resp(403, headers, { error: 'Origen no permitido' });
  if (event.httpMethod !== 'POST') return resp(405, headers, { error: 'Método no permitido' });
  if (!SB_KEY) return resp(500, headers, { error: 'Falta SUPABASE_SERVICE_KEY_KAMEHOUSE' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return resp(400, headers, { error: 'JSON inválido' }); }

  const accion = body.accion;
  if (!(accion in ACCIONES)) return resp(400, headers, { error: 'accion inválida' });

  const auth = await verifyAdminAuthLive(event, ACCIONES[accion]);
  if (!auth.valid) return resp(auth.status || 401, headers, { error: auth.error || 'No autorizado' });
  const quien = (auth.user && (auth.user.nombre || auth.user.correo)) || 'panel';

  const sb = {
    apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    if (accion === 'listar') {
      const r = await fetch(`${BASE}?select=*&order=archivado.asc,expires_at.desc.nullsfirst`, { headers: sb });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      return resp(200, headers, { ok: true, codigos: await r.json(), paquetes: PAQUETES });
    }

    if (accion === 'crear' || accion === 'editar') {
      const codigo = String(body.codigo || '').trim().toUpperCase();
      if (!CODIGO_RE.test(codigo)) {
        return resp(400, headers, { error: 'El código va en MAYÚSCULAS, sin espacios, de 2 a 32 caracteres' });
      }
      const fila = armar(body);
      if (fila.error) return resp(400, headers, { error: fila.error });

      if (accion === 'crear') {
        const r = await fetch(BASE, {
          method: 'POST',
          headers: { ...sb, Prefer: 'return=representation' },
          body: JSON.stringify({ codigo, ...fila.datos, creado_por: quien, actualizado_por: quien }),
        });
        if (!r.ok) return upstream(headers, await r.text(), 'alta');
        return resp(200, headers, { ok: true, codigo: (await r.json())[0] || null });
      }
      const r = await fetch(`${BASE}?codigo=eq.${encodeURIComponent(codigo)}`, {
        method: 'PATCH',
        headers: { ...sb, Prefer: 'return=representation' },
        body: JSON.stringify({ ...fila.datos, actualizado_por: quien, actualizado_en: new Date().toISOString() }),
      });
      if (!r.ok) return upstream(headers, await r.text(), 'edición');
      const filas = await r.json();
      if (!filas.length) return resp(404, headers, { error: `El código ${codigo} no existe` });
      return resp(200, headers, { ok: true, codigo: filas[0] });
    }

    if (accion === 'archivar') {
      const codigo = String(body.codigo || '').trim().toUpperCase();
      if (!CODIGO_RE.test(codigo)) return resp(400, headers, { error: 'código inválido' });
      const r = await fetch(`${BASE}?codigo=eq.${encodeURIComponent(codigo)}`, {
        method: 'PATCH', headers: { ...sb, Prefer: 'return=representation' },
        body: JSON.stringify({ archivado: body.archivado !== false, actualizado_por: quien, actualizado_en: new Date().toISOString() }),
      });
      if (!r.ok) return upstream(headers, await r.text(), 'archivar');
      const filas = await r.json();
      if (!filas.length) return resp(404, headers, { error: `El código ${codigo} no existe` });
      return resp(200, headers, { ok: true, codigo: filas[0] });
    }

    if (accion === 'oraculo') {
      // 🔒 BABA PROPONE, JAMÁS CREA. Esta acción es de LECTURA PURA: llama al
      // RPC y devuelve lo que dijo. No inserta, no publica, no enciende nada —
      // el clic siempre es de Memo, sobre la ficha pre-llenada.
      const r = await fetch(`${SB_URL}/rest/v1/rpc/promos_oraculo`, {
        method: 'POST', headers: { ...sb, Accept: 'application/json' }, body: '{}',
      });
      if (!r.ok) {
        const t = await r.text();
        // Si el RPC no existe todavía, se DICE con su nombre en vez de un 502
        // opaco: es la diferencia entre «falta correr el SQL» y «algo se rompió».
        if (/promos_oraculo|PGRST202|function .* does not exist/i.test(t)) {
          return resp(503, headers, { error: 'Las esferas aún no están talladas: falta correr `promos_oraculo()` en la base.', falta_rpc: true });
        }
        return upstream(headers, t, 'consulta al oráculo');
      }
      const oraculo = await r.json();
      // 🔒 R4 llega del SQL SIN inventario, marcada `pendiente_inventario`. Se
      // completa aquí con el lib dueño, evento por evento. Si un evento no
      // tiene stock cargado, `desgloseZona` devuelve `disponibles: null` y esa
      // zona NO suma: un número negativo mudo es peor que no dar número.
      await _oraculoInventario(oraculo, sb);
      return resp(200, headers, { ok: true, oraculo });
    }

    if (accion === 'letrero_payload') {
      const codigo = String(body.codigo || '').trim().toUpperCase();
      if (!CODIGO_RE.test(codigo)) return resp(400, headers, { error: 'código inválido' });
      const r = await fetch(`${BASE}?codigo=eq.${encodeURIComponent(codigo)}&select=*&limit=1`, { headers: sb });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const fila = (await r.json())[0];
      if (!fila) return resp(404, headers, { error: `El código ${codigo} no existe` });
      if (fila.archivado) return resp(409, headers, { error: 'Un código archivado no enciende letreros' });

      // 🔒 LA UNIDAD SALE DE LA FILA, jamás del cuerpo de la petición. Si el
      // navegador pudiera mandar el monto, volveríamos a tener dos sitios donde
      // se teclea la misma cifra — y de ahí salió el «500%».
      const l = filaALetrero(fila);
      if (!l.ok) return resp(409, headers, { error: l.motivo, no_cabe: true });
      return resp(200, headers, { ok: true, payloads: l.payloads, flashPromo: l.flashPromo });
    }

    if (accion === 'importar') {
      // TRAER DEL CATÁLOGO. Los códigos llegan YA PARSEADOS del navegador, que
      // es quien lee el `var PROMOS` del index publicado — igual que Esferas.
      const entra = Array.isArray(body.codigos) ? body.codigos : [];
      if (!entra.length) return resp(400, headers, { error: 'No mandaste códigos' });

      const yaR = await fetch(`${BASE}?select=codigo`, { headers: sb });
      if (!yaR.ok) return upstream(headers, await yaR.text(), 'consulta');
      const ya = new Set((await yaR.json()).map(x => x.codigo));

      const creados = [], saltados = [], fallidos = [];
      // 🔒 UNO POR UNO, con su try. Un lote entero que revienta por una fila
      // mala pierde las buenas y no dice cuál falló — la lección de la promesa
      // de la pantalla: try/catch POR FILA.
      for (const c of entra) {
        const codigo = String((c && c.codigo) || '').trim().toUpperCase();
        if (!CODIGO_RE.test(codigo)) { fallidos.push({ codigo, motivo: 'código con forma inválida' }); continue; }
        if (ya.has(codigo)) { saltados.push(codigo); continue; }
        const fila = armar(c);
        if (fila.error) { fallidos.push({ codigo, motivo: fila.error }); continue; }
        try {
          const r = await fetch(BASE, {
            method: 'POST', headers: { ...sb, Prefer: 'return=representation' },
            body: JSON.stringify({ codigo, ...fila.datos, creado_por: `${quien} · del catálogo`, actualizado_por: quien }),
          });
          if (!r.ok) { fallidos.push({ codigo, motivo: recortar(await r.text()) }); continue; }
          creados.push(codigo);
        } catch (e) { fallidos.push({ codigo, motivo: e.message }); }
      }
      return resp(200, headers, { ok: true, creados, saltados, fallidos, pedidos: entra.length });
    }

    return resp(400, headers, { error: 'accion inválida' });
  } catch (e) {
    return resp(500, headers, { error: e.message });
  }
};

// ── armar la fila, validando lo que el motor ya exige ──────────────────────
// Se valida DOS VECES a propósito: aquí para dar un mensaje humano, y en el
// CHECK de la tabla porque una guarda que solo vive en la pantalla se esquiva.
function armar(b) {
  const d = {};
  const num = v => (v === null || v === undefined || v === '') ? null : Number(v);

  d.monto = num(b.monto);
  d.pct = num(b.pct);
  d.pct_cheap = num(b.pct_cheap);
  d.segundo_pax = (b.segundo_pax && typeof b.segundo_pax === 'object' && Object.keys(b.segundo_pax).length)
    ? b.segundo_pax : null;
  d.exact_personas = num(b.exact_personas);

  // 🔒 LA UNIDAD. Tres formas de decir cuánto se descuenta —pesos, porcentaje o
  // el precio fijo del segundo viajero— y un código elige EXACTAMENTE UNA.
  const unidades = [d.monto, d.pct, d.segundo_pax].filter(x => x !== null && x !== undefined).length;
  if (unidades === 0) return { error: 'Elige cómo descuenta: pesos, porcentaje o promoción de pareja' };
  if (unidades > 1) {
    return { error: 'Un código descuenta de UNA sola forma. Elige pesos, porcentaje o pareja — nunca dos: ' +
                    'de ahí salió el «500% de descuento» que el sitio prometió cuando alguien puso $500 en el campo del porcentaje.' };
  }
  if (d.pct_cheap !== null && d.pct === null) return { error: 'El porcentaje para CHEAP necesita un porcentaje base' };
  if (d.monto !== null && !(d.monto > 0)) return { error: 'Los pesos van arriba de cero' };
  if (d.pct !== null && !(d.pct > 0 && d.pct <= 100)) return { error: 'El porcentaje va entre 1 y 100' };
  if (d.segundo_pax && !d.exact_personas) return { error: 'Una promoción de pareja necesita decir para cuántas personas' };
  if (!d.segundo_pax && d.exact_personas) return { error: 'El tamaño de grupo solo aplica a promociones de pareja' };

  d.desc_texto = String(b.desc_texto || '').trim().slice(0, 300);
  if (!d.desc_texto) return { error: 'Falta el texto que ve el cliente' };
  d.custom_msg = txt(b.custom_msg, 300);
  d.hide_amount = b.hide_amount === true;

  // ALCANCE: o nombra eventos o dice «todos». Nunca los dos, nunca ninguno —
  // GOL usa `all_events` y por eso el evento NO puede ser obligatorio.
  d.all_events = b.all_events === true;
  const evs = Array.isArray(b.only_events) ? b.only_events.map(x => String(x).trim()).filter(Boolean) : [];
  if (d.all_events && evs.length) return { error: 'O eliges eventos, o marcas «todos los eventos» — no las dos' };
  if (!d.all_events && !evs.length) return { error: 'Elige el evento, o marca «todos los eventos»' };
  d.only_events = d.all_events ? null : evs;

  d.only_zones = Array.isArray(b.only_zones) && b.only_zones.length
    ? b.only_zones.map(x => String(x).trim()).filter(Boolean) : null;
  d.exclude_zones = (b.exclude_zones && typeof b.exclude_zones === 'object' && Object.keys(b.exclude_zones).length)
    ? b.exclude_zones : null;

  const pk = Array.isArray(b.exclude_pkg) ? b.exclude_pkg.map(x => String(x).trim().toLowerCase()) : [];
  const raro = pk.find(x => !PAQUETES.includes(x));
  if (raro) return { error: `«${raro}» no es un paquete de la casa` };
  d.exclude_pkg = pk;

  // 🔒 LOS DOS NULOS SON LEGÍTIMOS. AIT-1 no tiene vencimiento A PROPÓSITO, y un
  // editor que obligue fecha mata ese trato. Llegan como INSTANTE desde la
  // pantalla, que es quien teclea en hora de Reynosa.
  d.starts_at = b.starts_at ? new Date(b.starts_at).toISOString() : null;
  d.expires_at = b.expires_at ? new Date(b.expires_at).toISOString() : null;
  if (b.starts_at && isNaN(Date.parse(b.starts_at))) return { error: 'La fecha de inicio no se entiende' };
  if (b.expires_at && isNaN(Date.parse(b.expires_at))) return { error: 'La fecha de vencimiento no se entiende' };
  if (d.starts_at && d.expires_at && d.starts_at >= d.expires_at) {
    return { error: 'El vencimiento va después del inicio' };
  }

  d.max_usos = num(b.max_usos) || 9999;
  if (!(d.max_usos > 0)) return { error: 'El tope de usos va arriba de cero' };
  d.single_use = b.single_use === true;

  for (const k of Object.keys(d)) if (!CAMPOS.includes(k)) delete d[k];
  return { datos: d };
}

function txt(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}
function recortar(s) {
  const t = String(s || '');
  try { const j = JSON.parse(t); return (j.message || j.details || t).slice(0, 160); }
  catch (e) { return t.slice(0, 160); }
}
// [ORACULO-FIX-1] Completa R4 con la cuenta del dueño.
async function _oraculoInventario(oraculo, sb) {
  const r4 = (oraculo.lecturas || []).find(l => l && l.regla === 'R4');
  if (!r4 || !r4.pendiente_inventario) return;
  const cand = Array.isArray(r4.items) ? r4.items : [];
  const vivos = [];
  for (const it of cand) {
    try {
      const disp = await cargarDisponibilidad({
        khUrl: SB_URL, khKey: SB_KEY,
        portalUrl: process.env.PORTAL_SUPABASE_URL, portalKey: process.env.PORTAL_SUPABASE_SERVICE,
        evento_id: it.slug,
      });
      if (!disp || disp.error || !disp.gestionado) continue;   // sin stock cargado: no se opina
      let total = 0, zonas = 0;
      for (const z of Object.keys(disp.stockPorZona || {})) {
        const d = desgloseZona(disp, z);
        if (d && Number.isFinite(d.disponibles) && d.disponibles > 0) { total += d.disponibles; zonas++; }
      }
      if (total > 0) vivos.push({ ...it, inventario: total, zonas_con_lugar: zonas });
    } catch (e) { /* un evento que no se puede contar no inventa un número */ }
  }
  r4.items = vivos;
  r4.pendiente_inventario = false;
  r4.ciegos = cand.length - vivos.length;
  r4.nublado = vivos.length === 0;
  if (r4.nublado) r4.motivo = 'no hay inventario capturado en los eventos que se acercan';
  r4.fuente = 'esferas_eventos.fecha_inicio + _lib/disponibilidad (el dueño de la cuenta)';
}

function resp(statusCode, headers, obj) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}
function upstream(headers, detail, op) {
  return resp(502, headers, { error: `La base rechazó el ${op}`, detail: recortar(detail) });
}

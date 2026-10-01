// =============================================================================
// _lib/concilia — CONCILIA-1 fase 1: el careo CAJA ↔ CONTRATOS, **solo lectura**
// =============================================================================
// Orden de Memo (1-oct-2026), tercera pata de la fase 2. Hoy el careo Excel
// aplica abonos a `abonos_viajero` y nadie los carea contra las CUENTAS de
// dinero del Portal (las cubetas de `admin-saldos`). El cuadre caja↔contratos
// se hacía a ojo.
//
// 🔒 NO ESCRIBE UN PESO. Ni un PATCH, ni un POST, ni un DELETE: esta pieza
// solo LEE y REPORTA. Aplicar correcciones es la fase 2, renglón por renglón y
// con confirmación. Si algún día alguien le agrega una escritura, el careo lo
// caza: `mide:concilia-1` afirma que el módulo no contiene ningún método que no
// sea GET.
//
// 🔒 CERO FÓRMULAS NUEVAS DE «CUÁNTO DINERO HAY» (ley AUD-1). La auditoría
// encontró ONCE maneras de decirlo y diez leían un solo libro; cada `reduce`
// sobre pagos en una pantalla nueva es la número doce esperando a divergir.
// Así que aquí se separan DOS cosas que se confunden fácil:
//   · «cuánto dinero hay» / «cuánto lleva abonado este viajero» → **se le
//     PREGUNTA al dueño**: `saldoMigrado` de `_lib/cuenta-evento`, que es puro
//     y está exportado justo para esto. Aquí no se suman abonos por viajero.
//   · «cuánto suman los N renglones que estoy NOMBRANDO» → eso no es un saldo,
//     es el TAMAÑO del montón que el reporte ya está enseñando. Se calcula aquí
//     y se rotula como tal. La diferencia entre las dos no es sutileza: la
//     primera es una afirmación sobre el negocio y la segunda sobre esta lista.
//
// 🔒 UN CERO ES UNA AFIRMACIÓN. «$0 de diferencia» solo se pinta si las DOS
// fuentes contestaron. Si una falló, se dice `se_pudo_carear:false` con su
// motivo — porque «no hay diferencia» y «no pude mirar» se ven igual en un cero
// y significan lo contrario. Esta casa ya pagó un «Cobrado $0» con $136,391
// cobrados.
//
// ⚠️ LO QUE ESTA FASE **NO** HACE, dicho para que nadie lo busque: formalizar
// la columna `fuente` en `abonos_viajero`. Eso es SQL (de Jane) más un cambio
// de ESCRITURA en el careo, y esta fase no escribe. Mientras no exista, la
// fuente se **DERIVA** de la nota — y se rotula como derivada (`fuente_derivada`
// viaja en la respuesta), porque una etiqueta adivinada presentada como guardada
// es un dato bueno con la etiqueta equivocada.
// =============================================================================

const { normalizarNombre } = require('./excel-careo');
const { saldoMigrado } = require('./cuenta-evento');

// ── EL LECTOR, calcado de `cuenta-evento`: devuelve { data } | { error } ──────
// Un error NUNCA se traga: la mitad de un careo es peor que ningún careo,
// porque se lee como «no hay diferencia».
function hacerLeer(_fetch, url, key) {
  const h = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  return async (tabla, query) => {
    try {
      const r = await _fetch(`${url}/rest/v1/${tabla}?${query}`, { headers: h });
      if (!r.ok) return { error: `Supabase rechazó la consulta de ${tabla}`, detail: (await r.text()).slice(0, 300) };
      const d = await r.json();
      return { data: Array.isArray(d) ? d : [] };
    } catch (e) {
      return { error: `Error consultando ${tabla}`, detail: e.message };
    }
  };
}

// ── LA FUENTE, DERIVADA DE LA NOTA ───────────────────────────────────────────
// ⚠️ Es un PARCHE con fecha de caducidad, y va dicho: la nota la escribe el
// careo (`Careo Excel <pestaña> <fecha>`) y mañana alguien la cambia sin saber
// que aquí se lee. Por eso lo que no casa NO se adivina: cae en `manual` si hay
// nota y en `sin-nota` si no la hay, y las dos se REPORTAN. Un montón llamado
// «manual» que en realidad es «no supe» mandaría a buscar a una persona que no
// capturó nada.
const FUENTES = ['excel-careo', 'mercadopago', 'manual', 'sin-nota'];
function fuenteDe(nota) {
  const n = String(nota == null ? '' : nota).trim();
  if (!n) return 'sin-nota';
  if (/^careo\s+excel/i.test(n)) return 'excel-careo';
  if (/mercado\s*pago|\bmercadopago\b/i.test(n)) return 'mercadopago';
  return 'manual';
}

// ── EL PERIODO ───────────────────────────────────────────────────────────────
// Las dos puntas INCLUSIVAS, en `YYYY-MM-DD`, y se validan en la puerta: una
// fecha basura que se acomoda sola («2026-13-45» sale como la cadena "Invalid
// Date", que es truthy y pasa los candados) ya mordió en esta casa. Se exige la
// FORMA y además que el día exista de verdad.
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
function diaValido(s) {
  if (!RE_DIA.test(String(s || ''))) return false;
  const d = new Date(String(s) + 'T12:00:00Z');
  if (Number.isNaN(d.getTime())) return false;
  // Y que no se haya ACOMODADO: el 31 de febrero vuelve como 2 o 3 de marzo.
  return d.toISOString().slice(0, 10) === String(s);
}

// ── EL CASAMIENTO ────────────────────────────────────────────────────────────
// Por nombre normalizado + monto exacto, UNO A UNO y CONSUMIENDO.
// 🔒 NO SE USA UN `Map` POR NOMBRE: dos personas pueden pagar lo mismo el mismo
// día, y un `new Map` por una llave no única DESCARTA en silencio (esta casa ya
// perdió gente así). Cada llave guarda una COLA y cada casado saca uno.
// 🔒 Y EL MONTO ES EXACTO, no aproximado: «se parece» es una decisión de
// negocio que nadie firmó. Dos renglones que difieren un peso salen los DOS en
// su montón, con nombre, y lo resuelve un humano — que es justo el punto del
// reporte.
function casar(contratos, caja) {
  const cola = new Map();
  for (const c of caja) {
    const k = normalizarNombre(c.nombre) + '||' + Math.round(Number(c.monto) || 0);
    if (!cola.has(k)) cola.set(k, []);
    cola.get(k).push(c);
  }
  const casados = [], soloContratos = [];
  for (const a of contratos) {
    const k = normalizarNombre(a.nombre) + '||' + Math.round(Number(a.monto) || 0);
    const fila = cola.get(k);
    if (fila && fila.length) {
      const c = fila.shift();
      c.__casado = true;
      casados.push({ nombre: a.nombre, monto: a.monto, abono_id: a.abono_id,
                     caja_origen: c.origen, caja_id: c.id, cuenta: c.cuenta,
                     fecha_contrato: a.fecha, fecha_caja: c.fecha });
      continue;
    }
    soloContratos.push(a);
  }
  const soloCaja = caja.filter((c) => !c.__casado).map((c) => { const { __casado, ...resto } = c; return resto; });
  return { casados, soloContratos, soloCaja };
}

// El tamaño de un montón que el reporte ENSEÑA. No es un saldo: es la suma de
// los renglones que van a salir nombrados en la pantalla. Rotulado a propósito
// para que nadie lo confunda con «cuánto dinero hay» (AUD-1).
function tamanoDelMonton(filas) {
  return (filas || []).reduce((a, x) => a + (Math.round(Number(x.monto) || 0)), 0);
}

// ── EL LADO CONTRATOS (KameHouse) ────────────────────────────────────────────
async function ladoContratos(leerKH, desde, hasta) {
  const ra = await leerKH('abonos_viajero',
    `fecha=gte.${desde}&fecha=lte.${hasta}`
    + '&select=id,viajero_id,monto,fecha,nota,capturado_por,created_at&limit=20000');
  if (ra.error) return { ok: false, error: ra.error, detail: ra.detail };
  const abonos = ra.data;
  // Los NOMBRES, que son el punto entero de este reporte: «$8,400 de diferencia»
  // manda a buscar; «los $1,200 de Laura del 8-nov no están en caja» se resuelve.
  const ids = [...new Set(abonos.map((a) => a && a.viajero_id).filter(Boolean))];
  let porId = new Map();
  if (ids.length) {
    const enc = (s) => '"' + String(s).replace(/"/g, '') + '"';
    const rv = await leerKH('viajeros_evento',
      `id=in.(${ids.map(enc).join(',')})`
      + '&select=id,nombre,evento_id,total_contrato,abonado_previo&limit=20000');
    if (rv.error) return { ok: false, error: rv.error, detail: rv.detail };
    porId = new Map(rv.data.map((v) => [v.id, v]));
  }
  // 🔒 Y TODOS LOS ABONOS DE ESOS VIAJEROS, no solo los del periodo: el saldo de
  // una persona NO es lo que abonó esta semana. Se leen para poder preguntarle
  // al DUEÑO (`saldoMigrado`) cuánto lleva — en vez de sumarlo aquí, que sería
  // la fórmula número doce.
  let abonosDe = new Map();
  if (ids.length) {
    const enc = (s) => '"' + String(s).replace(/"/g, '') + '"';
    const rt = await leerKH('abonos_viajero',
      `viajero_id=in.(${ids.map(enc).join(',')})&select=viajero_id,monto&limit=20000`);
    if (rt.error) return { ok: false, error: rt.error, detail: rt.detail };
    for (const a of rt.data) {
      if (!a || !a.viajero_id) continue;
      if (!abonosDe.has(a.viajero_id)) abonosDe.set(a.viajero_id, []);
      abonosDe.get(a.viajero_id).push(a);
    }
  }
  const filas = [], sinNombre = [];
  for (const a of abonos) {
    const v = porId.get(a.viajero_id) || null;
    const nombre = v && v.nombre ? String(v.nombre) : '';
    // Un abono cuyo viajero no se encontró NO se tira y NO se cuenta como
    // casable: se NOMBRA en su propio montón. Tirarlo en silencio sería un
    // descuadre invisible, que es el defecto que esta tuerca viene a cerrar.
    if (!nombre) { sinNombre.push({ abono_id: a.id, viajero_id: a.viajero_id, monto: Number(a.monto) || 0, fecha: a.fecha }); continue; }
    // 🔒 EL SALDO SE LO CONTESTA EL DUEÑO, no un reduce de aquí.
    const s = v ? saldoMigrado(v, abonosDe.get(a.viajero_id)) : null;
    filas.push({
      abono_id: a.id, viajero_id: a.viajero_id, nombre, evento_id: v ? v.evento_id : null,
      monto: Number(a.monto) || 0, fecha: a.fecha, nota: a.nota || '',
      capturado_por: a.capturado_por || null, creado_en: a.created_at || null,
      fuente: fuenteDe(a.nota),
      // Contexto para el humano que va a resolver el renglón, PEDIDO al dueño:
      // si al viajero ya no le falta nada, un abono sin pago de caja huele a
      // captura doble; si le falta, huele a pago no registrado.
      abonado_total: s ? s.abonado : null,
      resta: s ? s.resta : null,
    });
  }
  const por_fuente = {};
  for (const f of FUENTES) por_fuente[f] = { filas: 0, monto: 0 };
  for (const f of filas) {
    const b = por_fuente[f.fuente] || (por_fuente[f.fuente] = { filas: 0, monto: 0 });
    b.filas++; b.monto += f.monto;
  }
  return { ok: true, filas, sin_nombre: sinNombre, por_fuente,
           // Rotulado: es el tamaño de ESTA lista, no un saldo del negocio.
           monton_monto: tamanoDelMonton(filas), monton_filas: filas.length };
}

// ── EL LADO CAJA (Portal) ────────────────────────────────────────────────────
// Las MISMAS tablas que lee `admin-saldos`, con los mismos filtros de estado —
// leer otras sería inventar una segunda definición de «lo que entró a la caja».
async function ladoCaja(leerP, desde, hasta) {
  const rp = await leerP('pagos',
    `estado=eq.pagado&fecha_pagada=gte.${desde}&fecha_pagada=lte.${hasta}`
    + '&select=id,cuenta,monto,monto_pagado,fecha_pagada,solicitud_id,cliente_id&limit=5000');
  if (rp.error) return { ok: false, error: rp.error, detail: rp.detail };
  const ri = await leerP('ingresos',
    `fecha=gte.${desde}&fecha=lte.${hasta}`
    + '&select=id,cuenta,monto,concepto,fecha,cliente_id,evento_id&limit=5000');
  if (ri.error) return { ok: false, error: ri.error, detail: ri.detail };

  // Los nombres: solicitud → cliente, y el cliente suelto del ingreso.
  const solIds = [...new Set(rp.data.map((p) => p.solicitud_id).filter(Boolean))];
  const solMap = new Map();
  if (solIds.length) {
    const rs = await leerP('solicitudes_tour',
      `id=in.(${solIds.join(',')})&select=id,evento_nombre,cliente_id&limit=5000`);
    if (rs.error) return { ok: false, error: rs.error, detail: rs.detail };
    for (const s of rs.data) solMap.set(s.id, s);
  }
  const cliIds = [...new Set([
    ...rp.data.map((p) => p.cliente_id),
    ...[...solMap.values()].map((s) => s.cliente_id),
    ...ri.data.map((i) => i.cliente_id),
  ].filter(Boolean))];
  const cliMap = new Map();
  if (cliIds.length) {
    const rc = await leerP('clientes',
      `id=in.(${cliIds.join(',')})&select=id,nombre_completo&limit=5000`);
    if (rc.error) return { ok: false, error: rc.error, detail: rc.detail };
    for (const c of rc.data) cliMap.set(c.id, c.nombre_completo || '');
  }
  const nombreDe = (cid) => (cid && cliMap.get(cid)) || '';

  const filas = [], sinNombre = [];
  for (const p of rp.data) {
    const sol = p.solicitud_id ? solMap.get(p.solicitud_id) : null;
    const nombre = nombreDe(p.cliente_id) || nombreDe(sol && sol.cliente_id);
    // ⚠️ `monto_pagado` MANDA sobre `monto` cuando existe: es lo que de verdad
    // entró. Usar `monto` haría que un pago parcial se viera como completo y el
    // careo acusaría a la caja de un faltante que no existe.
    const monto = Number(p.monto_pagado != null ? p.monto_pagado : p.monto) || 0;
    const base = { origen: 'pago', id: p.id, monto, fecha: p.fecha_pagada,
                   cuenta: p.cuenta || null, concepto: (sol && sol.evento_nombre) || null };
    if (!nombre) { sinNombre.push(base); continue; }
    filas.push({ ...base, nombre });
  }
  for (const i of ri.data) {
    const nombre = nombreDe(i.cliente_id);
    const base = { origen: 'ingreso', id: i.id, monto: Number(i.monto) || 0, fecha: i.fecha,
                   cuenta: i.cuenta || null, concepto: i.concepto || null, evento_id: i.evento_id || null };
    if (!nombre) { sinNombre.push(base); continue; }
    filas.push({ ...base, nombre });
  }
  return { ok: true, filas, sin_nombre: sinNombre,
           monton_monto: tamanoDelMonton(filas), monton_filas: filas.length };
}

// ── EL CAREO COMPLETO ────────────────────────────────────────────────────────
async function conciliar(opts) {
  const o = opts || {};
  const _fetch = o.fetchImpl || fetch;
  if (!diaValido(o.desde) || !diaValido(o.hasta)) {
    return { error: 'El periodo va en `desde` y `hasta` con la forma YYYY-MM-DD, y los dos días tienen que existir de verdad.' };
  }
  if (String(o.desde) > String(o.hasta)) {
    return { error: 'El periodo va al revés: `desde` es posterior a `hasta`.' };
  }
  const leerKH = hacerLeer(_fetch, o.khUrl, o.khService);
  const leerP = hacerLeer(_fetch, o.portalUrl, o.portalService);

  // Los dos lados en paralelo, pero SIN `Promise.all` que tire el conjunto: si
  // uno falla se quiere el otro para poder DECIR cuál falló. Un careo a medias
  // se reporta como careo a medias, no como careo.
  const [contratos, caja] = await Promise.all([
    ladoContratos(leerKH, o.desde, o.hasta).catch((e) => ({ ok: false, error: 'Excepción leyendo contratos', detail: e.message })),
    ladoCaja(leerP, o.desde, o.hasta).catch((e) => ({ ok: false, error: 'Excepción leyendo caja', detail: e.message })),
  ]);

  const sePudo = contratos.ok === true && caja.ok === true;
  const salida = {
    periodo: { desde: o.desde, hasta: o.hasta },
    contratos, caja,
    se_pudo_carear: sePudo,
    // 🔒 La fuente va rotulada como DERIVADA mientras la columna no exista.
    fuente_derivada: true,
    // 🔒 SOLO LECTURA, dicho en la respuesta: la pantalla no tiene que
    // adivinarlo para saber que aquí no hay botón de aplicar.
    solo_lectura: true,
  };
  if (!sePudo) {
    salida.motivo = !contratos.ok
      ? ('No se pudo leer el lado CONTRATOS: ' + (contratos.error || 'sin detalle'))
      : ('No se pudo leer el lado CAJA: ' + (caja.error || 'sin detalle'));
    // 🔒 Y LA DIFERENCIA VIAJA EN **null**, NO EN CERO. Un cero aquí diría «todo
    // cuadra» justo cuando no se pudo mirar, y es la mentira más cara que este
    // reporte podría contar.
    salida.diferencia = null;
    salida.solo_contratos = null;
    salida.solo_caja = null;
    salida.casados = null;
    return salida;
  }
  const m = casar(contratos.filas, caja.filas);
  salida.casados = m.casados;
  salida.solo_contratos = m.soloContratos;
  salida.solo_caja = m.soloCaja;
  salida.totales = {
    casados_filas: m.casados.length,
    solo_contratos_filas: m.soloContratos.length,
    solo_contratos_monto: tamanoDelMonton(m.soloContratos),
    solo_caja_filas: m.soloCaja.length,
    solo_caja_monto: tamanoDelMonton(m.soloCaja),
    // Sin nombre en cada lado: no son descuadres, son renglones que este careo
    // NO PUDO intentar casar. Se cuentan aparte para no inflar la diferencia
    // con lo que en realidad es un hueco de datos.
    sin_nombre_contratos: (contratos.sin_nombre || []).length,
    sin_nombre_caja: (caja.sin_nombre || []).length,
  };
  // La DIFERENCIA del periodo: lo que está en contratos y no en caja, menos lo
  // inverso. Es la suma de los renglones NOMBRADOS arriba — no un saldo.
  salida.diferencia = salida.totales.solo_contratos_monto - salida.totales.solo_caja_monto;
  salida.cuadra = salida.diferencia === 0
    && salida.totales.solo_contratos_filas === 0 && salida.totales.solo_caja_filas === 0;
  return salida;
}

module.exports = { conciliar, casar, fuenteDe, diaValido, tamanoDelMonton, FUENTES };

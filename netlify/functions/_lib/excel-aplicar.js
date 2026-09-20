// =============================================================================
// _lib/excel-aplicar.js — QUÉ se va a escribir (CUADRE-1b), en función pura
// =============================================================================
// Toma el resultado de un careo FRESCO y devuelve el PLAN: los abonos, los
// totales y las altas que el botón va a escribir, más lo que NO va a tocar y
// por qué. Puro a propósito: el arnés puede carearlo sin red de por medio, y
// la vista previa y el aplicar salen del MISMO plan — enseñar una cosa y
// escribir otra sería la peor forma de este botón.
//
// 🔒 LAS TRES REGLAS DE MEMO VIVEN AQUÍ, cada una con su razón escrita:
//
//   1. PAGOS: solo las diferencias POSITIVAS. Una negativa significa que el
//      SISTEMA VA ADELANTE del Excel, y va adelante A PROPÓSITO: ~159 filas
//      traen los pagos de Numerología que las chicas no ven en su pestaña.
//      «Aplicar» una negativa restaría dinero que la gente sí pagó. Se
//      reportan aparte, y si la fila trae la marca de Numerología se dice.
//
//   2. TOTALES: el clic global solo toca los DERIVADOS con `excel_total > 0`.
//      · un derivado es un PISO del catálogo (sin hotel ni upgrades): que la
//        pestaña difiera es lo ESPERADO, y la pestaña gana;
//      · un EXACTO salió de la libreta de Memo — ahí la diferencia es un
//        cambio real que quiere MIRAR, no que le apliquen en bola;
//      · un `excel_total = 0` es casi siempre una fórmula sin llenar (20 de 78
//        renglones medidos el 20-sep): aplicarlo pondría en cero un total bueno.
//      Los dos últimos tienen botón de renglón, uno por uno y a mano.
//
//   3. BAJAS Y AMBIGUOS: JAMÁS, ni en bola ni por renglón. Una baja es una
//      persona y sigue pidiendo firma; elegir entre dos homónimos es inventar
//      el dato que falta. No están aquí, y `MONTONES_APLICABLES` es la lista
//      blanca que impide que un `solo:'bajas'` encuentre puerta.
// =============================================================================

const { normalizarNombre, TOLERANCIA_MXN } = require('./excel-careo');

// Los paquetes que `viajero_migrar` acepta. Se dicen aquí para poder SALTAR
// con motivo en vez de mandar un alta a rebotar contra el otro handler.
const PAQUETES_MIGRAR = ['plus', 'ride', 'stay', 'cheap'];

// 🔒 LISTA BLANCA. Lo que no está aquí NO TIENE PUERTA, y por eso `bajas` y
// `ambiguos` no aparecen: un `solo:'bajas'` se rehúsa antes de tocar nada.
const MONTONES_APLICABLES = ['abonos', 'totales', 'altas'];

// 🔒 UN GUION NO ES UNA ZONA. En la pestaña, «-» es como las chicas escriben
// «nada» —no un valor—, y la diferencia importa justo aquí: `viajero_migrar`
// exige zona, y una zona falsa pasa su candado y crea la fila igual.
//
// MEDIDO CONTRA PRODUCCIÓN EL 20-SEP, y por eso existe esta función: las filas
// 38-42 de «Young Miko- 19 de Septiembre» traen Nombre «matamoros»/«matomoros»,
// paquete RIDE, Boleto «-» y todo en $0. NO son personas: son los LUGARES DE
// RECOGIDA apartados. Con el guion pasando por zona buena, el botón iba a dar
// de alta CINCO PERSONAS QUE NO EXISTEN en producción — lo vi en la vista
// previa real, no en el arnés.
//
// Se arregla por la ZONA y no metiendo «matamoros» a la CHATARRA a propósito:
// esa lista se mira con `includes` sobre el nombre, y Matamoros es un APELLIDO
// mexicano corriente — habría borrado a cualquier «Ana Matamoros» de verdad.
// El hecho que distingue al placeholder no es cómo se llama, es que no tiene
// zona.
const ZONA_VACIA = ['', '-', '--', '---', 'n/a', 'na', 'sin zona'];
function zonaUtil(z) {
  const t = String(z == null ? '' : z).trim();
  return ZONA_VACIA.includes(normalizarNombre(t)) ? '' : t;
}

// Fecha de hoy en Reynosa. `America/Matamoros`, NO Monterrey ni Cancún, y
// JAMÁS `toISOString()`: pasadas las 6 de la tarde de acá ya es mañana en
// Greenwich, y en esta casa se trabaja de noche.
function hoyReynosa() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Matamoros', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// ¿Por qué el sistema va ADELANTE del Excel en esta fila? No decide nada —la
// negativa no se aplica venga de donde venga— pero deja que la pantalla lo diga
// en vez de enseñar un descuadre mudo.
//
// [CUADRE-2a] MANDA LA FUENTE VIVA, y la marca vieja de `notas` queda de
// RESPALDO. El orden importa y por eso no se hizo el cambio a secas: la fuente
// viva todavía no existe —el parser del libro es 2b—, así que cambiar hoy a
// «solo fuente viva» BORRARÍA el rótulo que hoy funciona y dejaría a Bulma con
// el descuadre mudo durante toda la ventana entre las dos tuercas. Cuando 2b
// entre, `fuentes` traerá 'numerologia' y el respaldo dejará de alcanzarse solo.
//
// ⏳ La marca de `notas` se retira cuando la fuente viva cubra esas ~159 filas
// —no antes—, y se retira MIDIENDO que ya no queda ninguna que solo ella vea.
function porQueVaAdelante(persona, notas) {
  const viva = !!(persona && Array.isArray(persona.fuentes) && persona.fuentes.includes('numerologia'));
  if (viva) return { numerologia: true, por: 'fuente' };
  if (/numerolog/i.test(String(notas || ''))) return { numerologia: true, por: 'nota' };
  return { numerologia: false, por: null };
}

// planear(careo, opciones) → { abonos, totales, altas, negativas, saltados }
//
// `opciones.solo`   — un montón de MONTONES_APLICABLES, o nada para el global.
// `opciones.claves` — nombres normalizados elegidos a mano (el botón de
//                     renglón). Sin `claves`, manda la regla del clic global.
function planear(careo, opciones) {
  const o = opciones || {};
  const solo = o.solo || null;
  const claves = Array.isArray(o.claves) && o.claves.length
    ? new Set(o.claves.map(normalizarNombre)) : null;
  const quiere = (m) => !solo || solo === m;
  const elegida = (clave) => !claves || claves.has(clave);

  const M = careo.montones;
  const porClave = new Map((careo.personas || []).map((p) => [p.clave, p]));
  const vPorId = new Map((careo.viajeros || []).map((v) => [v.id, v]));
  const abonos = [], totales = [], altas = [], negativas = [], saltados = [];

  // ── 1. PAGOS ──────────────────────────────────────────────────────────────
  for (const g of (M.pagos || [])) {
    const clave = normalizarNombre(g.nombre);
    const v = vPorId.get(g.viajero_id);
    if (g.diferencia <= TOLERANCIA_MXN) {
      // 🔒 NEGATIVA: nunca se aplica. Se NOMBRA, que es distinto de callarla.
      const pq = porQueVaAdelante(porClave.get(clave), v && v.notas);
      negativas.push({ nombre: g.nombre, viajero_id: g.viajero_id, excel: g.excel,
        sistema: g.base, diferencia: g.diferencia,
        numerologia: pq.numerologia, numerologia_por: pq.por });
      continue;
    }
    if (!quiere('abonos') || !elegida(clave)) continue;
    const p = porClave.get(clave);
    abonos.push({ clave, nombre: g.nombre, viajero_id: g.viajero_id, monto: g.diferencia,
      excel: g.excel, sistema: g.base, pestanas: (p && p.pestanas) || [] });
  }

  // ── 2. TOTALES DE CONTRATO ────────────────────────────────────────────────
  for (const x of (M.totales_contrato || [])) {
    const clave = normalizarNombre(x.nombre);
    // El clic global (sin `claves`) SOLO toca derivados con monto. Con `claves`
    // manda la elección de un humano, que es la puerta de los otros dos casos.
    const enGlobal = x.derivado === true && x.excel_total > 0;
    if (!claves && !enGlobal) {
      saltados.push({ nombre: x.nombre, montón: 'totales',
        motivo: x.excel_total === 0
          ? 'la pestaña dice $0 — casi siempre una fórmula sin llenar; aplicarlo pondría en cero un total bueno. Va por su botón, a mano.'
          : 'el total del sistema es un EXACTO de la libreta: una diferencia ahí es un cambio real que hay que mirar. Va por su botón, a mano.' });
      continue;
    }
    if (!quiere('totales') || !elegida(clave)) continue;
    const v = vPorId.get(x.viajero_id);
    totales.push({ clave, nombre: x.nombre, viajero_id: x.viajero_id,
      excel_total: x.excel_total, sistema_total: x.sistema_total, derivado: x.derivado,
      notas_previas: (v && v.notas) || '' });
  }

  // ── 3. ALTAS ──────────────────────────────────────────────────────────────
  // Dos orígenes, una sola puerta: `viajero_migrar`.
  //   · NUEVOS    — en el Excel y no en el sistema, con dinero encima.
  //   · APARTADOS — en el Excel, sin un peso y sin fila. 🔒 «SI ESTÁ EN EL
  //     EXCEL, VA» (firmado por Memo): no haber abonado todavía no lo hace
  //     menos viajero.
  const candidatos = [
    ...(M.nuevos || []).map((n) => ({ nombre: n.nombre, origen: 'nuevo' })),
    ...(M.apartados || []).filter((a) => !a.en_sistema).map((a) => ({ nombre: a.nombre, origen: 'apartado' })),
  ];
  for (const c of candidatos) {
    const clave = normalizarNombre(c.nombre);
    if (!quiere('altas') || !elegida(clave)) continue;
    const p = porClave.get(clave);
    if (!p) { saltados.push({ nombre: c.nombre, montón: 'altas', motivo: 'no lo encontré en la pestaña al recalcular' }); continue; }

    // Las tres que `viajero_migrar` EXIGE. Se comprueban aquí para poder
    // saltar CON NOMBRE Y MOTIVO —el patrón del puente al Portal— en vez de
    // mandar el alta a rebotar y perder a la persona en un error genérico.
    const paquete = normalizarNombre(p.paquete);
    const zona = zonaUtil(p.zona);
    if (!zona) {
      saltados.push({ nombre: c.nombre, montón: 'altas',
        motivo: p.zona ? `su zona en la pestaña es «${p.zona}», que ahí significa «nada» — y el alta la exige (sin zona no descuenta de ningún stock)`
                       : 'sin zona en la pestaña, y el alta la exige (sin zona no descuenta de ningún stock)' });
      continue;
    }
    if (!PAQUETES_MIGRAR.includes(paquete)) {
      saltados.push({ nombre: c.nombre, montón: 'altas',
        motivo: p.paquete ? `paquete «${p.paquete}» no es uno de ${PAQUETES_MIGRAR.join('/')}` : 'sin paquete en la pestaña, y el alta lo exige' });
      continue;
    }
    // 🔒 Y EL TOTAL. `viajero_migrar` lo exige porque una fila sin él NO SUMA
    // en ninguna cuenta (`saldoMigrado`): daría de alta a alguien invisible
    // para el dinero. Un `total` null es el hueco de CUADRE-1a —columna
    // ausente o celda vacía—, y sigue sin ser un cero.
    if (p.total == null) {
      saltados.push({ nombre: c.nombre, montón: 'altas',
        motivo: 'la pestaña no trae su Total (columna ausente o celda vacía), y el alta lo exige: sin total la fila no suma en ninguna cuenta' });
      continue;
    }
    altas.push({ clave, nombre: p.nombre, origen: c.origen,
      tipo_paquete: paquete, zona_boleto: zona, talla_playera: p.talla || '',
      total_contrato: p.total,
      // 🔒 UN «$0» TECLEADO NO ES UN CONTRATO DE CERO PESOS. Es la misma
      // verdad que sostiene la regla 2 de arriba, aplicada al nacimiento: casi
      // siempre es una fórmula que no se llenó. La persona SÍ se da de alta
      // —«si está en el Excel, VA», y saltarla la perdería— pero nace MARCADA,
      // igual que las 128 filas que TOTAL-1 dejó con «⚠ total pendiente»: así
      // el careo de mañana la vuelve a levantar en vez de darla por saldada.
      total_pendiente: p.total === 0,
      // 🔒 SEMÁNTICA DE `abonado_previo` (VJ-3): dinero que vino del Excel y
      // queda CONGELADO. Para un apartado es 0 por definición.
      abonado_previo: c.origen === 'apartado' ? 0 : p.abonado,
      pestanas: p.pestanas || [] });
  }

  return { abonos, totales, altas, negativas, saltados };
}


// ── LA EJECUCIÓN DEL PLAN ───────────────────────────────────────────────────
// [CUADRE-3] Sacada del handler de 1b para que el botón de UN evento y el de
// TODOS escriban por la MISMA puerta. Dos rutinas de escritura no serían «dos
// iguales», serían «dos que todavía no divergen» — y la que divergiera
// escribiría dinero con otro criterio. Es la misma razón por la que la tubería
// del careo vive en `_lib/excel-careo-correr`.
//
// ⚠️ NO decide NADA: todo lo que se escribe ya lo decidió `planear`. Aquí solo
// se obra el plan, y por eso las tres reglas de Memo no se repiten aquí — no
// tendrían dónde aplicarse.
// Cuántos PATCH en paralelo.
//
// ⏱ SUBIDO DE 8 A 24 POR UNA MEDICIÓN DE CUADRE-3, no por gusto. El recorrido
// completo destapó que `dalemix` trae 224 totales por corregir: a 8 por tanda
// son 28 rondas secuenciales × ~175 ms = ~4.9 s SOLO de escritura, encima de
// los ~5 s que cuesta su careo — arriba del corte de 10 s de Netlify. A 24 son
// ~10 rondas, ~1.7 s, y cabe con holgura.
//
// Son PATCH de UNA fila por `id`, contra PostgREST con service key: 24 a la vez
// no es carga, y el `Promise.all` sigue esperando a cada tanda antes de la
// siguiente — no se sueltan 224 de golpe.
const TANDA = 24;

async function ejecutarPlan({ plan, eventoId, pestanaNombre, quien, origin, authHeader, SB_URL }) {
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  const sb = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
  const hoy = hoyReynosa();
  // ⚠️ `quien` llega POR PARÁMETRO y sale del TOKEN en el handler — nunca del
  // cliente. El anti-spoofing no se relajó al mudarse: se movió el sitio donde
  // se lee, no de dónde.
  const resultado = { abonos: [], totales: [], altas: [], errores: [] };

  // ── 1. LOS ABONOS, EN UN SOLO INSERT ──────────────────────────────────────
  // Un arreglo en un POST: una sola ida y vuelta para todos. Sin `on_conflict`
  // (regla de la casa) — la idempotencia la da el re-careo, no la base.
  if (plan.abonos.length) {
    const filas = plan.abonos.map((x) => ({
      viajero_id: x.viajero_id, monto: x.monto, fecha: hoy, capturado_por: quien,
      nota: `Careo Excel ${(x.pestanas && x.pestanas[0]) || pestanaNombre} ${hoy}`,
    }));
    const r = await fetch(`${SB_URL}/rest/v1/abonos_viajero`, {
      method: 'POST', headers: { ...sb, Prefer: 'return=representation' }, body: JSON.stringify(filas),
    });
    if (!r.ok) resultado.errores.push({ paso: 'abonos', detalle: (await r.text()).slice(0, 300) });
    else {
      const puestas = await r.json().catch(() => []);
      resultado.abonos = plan.abonos.map((x, i) => ({ nombre: x.nombre, viajero_id: x.viajero_id,
        monto: x.monto, abono_id: (puestas[i] || {}).id || null }));
    }
  }

  // ── 2. LOS TOTALES, UN PATCH POR FILA ─────────────────────────────────────
  // No hay bulk update con valores distintos que no sea un upsert, y el upsert
  // está prohibido en esta casa. Se paralelizan por tandas para caber en el
  // reloj de Netlify.
  //
  // 🔒 LA NOTA SE ANEXA, NO PISA. La nota vieja dice de dónde salió el total
  // derivado; borrarla dejaría la fila sin su historia justo cuando cambia.
  for (let i = 0; i < plan.totales.length; i += TANDA) {
    const tanda = plan.totales.slice(i, i + TANDA);
    await Promise.all(tanda.map(async (x) => {
      const notas = `${x.notas_previas || ''} · Total de pestaña (careo ${hoy})`.replace(/^ · /, '').slice(0, 1000);
      const r = await fetch(`${SB_URL}/rest/v1/viajeros_evento?id=eq.${encodeURIComponent(x.viajero_id)}`, {
        method: 'PATCH', headers: { ...sb, Prefer: 'return=representation' },
        // ⚠️ SOLO estas dos columnas. `abonado_previo` está CONGELADO (VJ-3) y
        // no se menciona siquiera: lo que no se nombra no se puede pisar.
        body: JSON.stringify({ total_contrato: x.excel_total, notas }),
      });
      if (!r.ok) { resultado.errores.push({ paso: 'total', nombre: x.nombre, detalle: (await r.text()).slice(0, 200) }); return; }
      const filas = await r.json().catch(() => []);
      resultado.totales.push({ nombre: x.nombre, viajero_id: x.viajero_id,
        de: x.sistema_total, a: x.excel_total, tocadas: filas.length });
    }));
  }

  // ── 3. LAS ALTAS, POR LA PUERTA DE SIEMPRE ────────────────────────────────
  // 🔒 NO HAY INSERT NUEVO AQUÍ. Se invoca el handler REAL de
  // `admin-coordi-asignaciones` con la acción `viajero_migrar` —la misma que
  // usa el alta a mano del panel—, con el token del admin que apretó el botón.
  // Así el alta hereda TODO: su lista de roles, sus validaciones campo por
  // campo, el candado de que el evento exista, el sello `tipo_viajero:'cliente'`
  // del que depende `consumeBoleto`, y el aviso del doble descuento de MIG-1b.
  // Copiar el INSERT habría sido una segunda puerta que envejece sola.
  if (plan.altas.length) {
    const asign = require('../admin-coordi-asignaciones');   // vive un nivel arriba: este lib está en _lib/
    for (const x of plan.altas) {
      const ev2 = {
        httpMethod: 'POST',
        headers: { origin, authorization: authHeader || '' },
        body: JSON.stringify({
          accion: 'viajero_migrar', evento_id: eventoId, nombre: x.nombre,
          tipo_paquete: x.tipo_paquete, zona_boleto: x.zona_boleto,
          total_contrato: x.total_contrato, abonado_previo: x.abonado_previo,
          talla_playera: x.talla_playera || '',
          notas: `Alta por careo Excel ${(x.pestanas && x.pestanas[0]) || pestanaNombre} ${hoy}`
               + (x.origen === 'apartado' ? ' · apartado sin abonar (si está en el Excel, va)' : '')
               // La marca que hace que el careo de mañana la vuelva a levantar:
               // nació con el $0 de la pestaña, que no es un contrato de cero.
               + (x.total_pendiente ? ' · ⚠ total pendiente (la pestaña decía $0)' : ''),
        }),
      };
      const r2 = await asign.handler(ev2);
      let c2 = {}; try { c2 = JSON.parse(r2.body); } catch (_) {}
      if (r2.statusCode !== 200 || !c2.viajero) {
        resultado.errores.push({ paso: 'alta', nombre: x.nombre, status: r2.statusCode, detalle: String(c2.error || '').slice(0, 200) });
        continue;
      }
      resultado.altas.push({ nombre: x.nombre, viajero_id: c2.viajero.id, origen: x.origen,
        via: 'viajero_migrar', aviso_doble_descuento: c2.aviso_doble_descuento || null });
    }
  }
  return resultado;
}

module.exports = { planear, hoyReynosa, porQueVaAdelante, ejecutarPlan,
                   MONTONES_APLICABLES, PAQUETES_MIGRAR };

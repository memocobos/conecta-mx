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

module.exports = { planear, hoyReynosa, porQueVaAdelante,
                   MONTONES_APLICABLES, PAQUETES_MIGRAR };

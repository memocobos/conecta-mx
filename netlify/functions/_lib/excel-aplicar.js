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

const { normalizarNombre, TOLERANCIA_MXN, esZonaUtil } = require('./excel-careo');
// [CAREO-ZONA-1] La parte PURA de la puerta de zonas. La lista canónica la trae
// el careo (`careo.zonasCanonicas`): aquí no se pide el catálogo, para que
// `planear` siga siendo síncrono y puro.
const { resolverZonaFicha } = require('./zona-ficha');
// [DISPO-NORM-1] El dueño de «¿son la misma zona?» — el montón `fuera` empareja
// chatarra↔base por zona normalizada, jamás por cadena exacta.
const { normalizarZona } = require('./normalizar-zona');

// Los paquetes que `viajero_migrar` acepta. Se dicen aquí para poder SALTAR
// con motivo en vez de mandar un alta a rebotar contra el otro handler.
const PAQUETES_MIGRAR = ['plus', 'ride', 'stay', 'cheap'];

// 🔒 LISTA BLANCA. Lo que no está aquí NO TIENE PUERTA, y por eso `bajas` y
// `ambiguos` no aparecen: un `solo:'bajas'` se rehúsa antes de tocar nada.
// [CAREO-ZONA-1] Tres puertas nuevas: `zonas` (el cambio de zona de la fila),
// `partidas` (el CHEAP repartido entre varias zonas) y `bajas` (la fila ROJA).
//
// 🔴 OJO, HAY **DOS COSAS LLAMADAS «BAJAS»** Y SOLO UNA TIENE PUERTA:
//   · `montones.bajas` del CAREO  = gente que está en el sistema y NO en la
//     pestaña. Sigue SIN puerta, y debe seguir: que alguien no aparezca este mes
//     puede ser una pestaña nueva, un nombre mal escrito o una pestaña que no se
//     pudo cosechar. Eso espera firma.
//   · `plan.bajas` de AQUÍ           = gente cuya fila del Excel está **ROJA**.
//     Ésa sí tiene puerta, porque la firma ya existe: «todo lo marcado en rojo
//     son cancelaciones» (Memo, 30-sep).
// 🔒 Este montón se llena SOLO de `p.roja` y JAMÁS de `M.bajas` — cablearlos
// convertiría «no vino en la pestaña» en «cancelado» y borraría lugares de gente
// que sí viaja. `ambiguos` sigue sin puerta a propósito.
const MONTONES_APLICABLES = ['abonos', 'totales', 'altas', 'boletos', 'fuera',
                             'zonas', 'partidas', 'bajas'];

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
// [CAREO-ZONA-1] ⚠️ LA LISTA SE PIDE, NO SE REPITE. Esta lista y la del parser
// (`ZONA_NO_ES_ZONA`) eran la misma escrita dos veces, y la de aquí solo se
// consultaba en UN sitio — por eso «-» se contaba como boleto. El dueño es el
// parser, que es quien ve las filas.
// Pesos para los motivos. Se escribe aquí y no se importa de la pantalla: este
// lib corre en el servidor y la pantalla no es su dueño.
const _mxn = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');

function zonaUtil(z) {
  const t = String(z == null ? '' : z).trim();
  return esZonaUtil(t) ? t : '';
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
  const abonos = [], totales = [], altas = [], negativas = [], saltados = [], boletos = [];

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
      excel: g.excel, sistema: g.base, pestanas: (p && p.pestanas) || [],
      // [CUADRE-4] El paquete, para la vista del Resumen. Sale del viajero que
      // YA está en la mano (`vPorId`): ni una consulta más. El reloj de los
      // 10 s va en 8.6 en la peor tanda, así que una consulta por renglón sobre
      // 967 abonos no es una opción — sería la tuerca que rompe el botón.
      tipo_paquete: (v && v.paquete) || '', zona: (v && v.zona) || '' });
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

  // ── 2.5 [BOLETOS-1] LA SINCRONÍA DE BOLETOS ───────────────────────────────
  // 🔒 ES CONTEO, NO DINERO, y por eso SÍ entra al clic global: la fuente de
  // verdad es la pestaña, que lleva UNA FILA POR BOLETO. Que el sistema tenga
  // una fila por PERSONA no es un desacuerdo de criterio —como sí lo es un
  // total derivado contra uno de libreta—: es que le falta el número.
  //
  // Lo que costó no tenerlo, medido sobre Soy Luna el 20-sep: VIP con 17
  // boletos vendidos contra 12 filas, y el sitio publicando «8 libres»
  // quedando 3. La clase muerde en cada evento con multi-boleto.
  //
  // 🔒 SOLO EN AUTOMÁTICO CUANDO NO HAY NADA QUE ADIVINAR: una sola zona en la
  // pestaña Y que coincida con la de su fila. Si los boletos vienen repartidos
  // entre zonas, la fila del sistema es UNA y no se sabe cuántos van a cada
  // una: repartirlos sería inventar, y ya mordió con Angel. Eso sale como
  // AVISO, con nombre.
  // El emparejamiento por nombre, con la MISMA llave normalizada que usa
  // `carear` — no una propia: dos criterios de emparejamiento serían dos
  // listas que todavía no divergen.
  const porNombreBase = new Map();
  for (const v of (careo.viajeros || [])) {
    const k = normalizarNombre(v.nombre);
    if (!porNombreBase.has(k)) porNombreBase.set(k, []);
    porNombreBase.get(k).push(v);
  }
  const avisosBoletos = [];
  // ── [CAREO-ZONA-1] LOS TRES MONTONES NUEVOS ───────────────────────────────
  // `zonas`    → la zona de la fila difiere de `zona_boleto` → se propone el cambio.
  // `partidas` → un CHEAP con boletos en VARIAS zonas → una fila por zona.
  // `bajas`    → la fila está ROJA en el Excel → cancelación.
  // `avisosZonas` → lo que NO se aplica, con nombre: zona que la ficha no
  //                 conoce, catálogo ilegible, PLUS repartido, pestaña con
  //                 `regla_zona`. La puerta decide igual que en compras:
  //                 **canonizada se aplica y SE DICE, desconocida NO se aplica
  //                 y se nombra.**
  const zonasPlan = [], partidas = [], bajas = [], avisosZonas = [];
  const CANON = Array.isArray(careo.zonasCanonicas) ? careo.zonasCanonicas : null;
  // La zona de la pestaña, pasada por la puerta. Sin catálogo no se canoniza
  // NADA y se dice — fingir que se validó es el hoyo de DISPO-NORM-1.
  const porLaPuerta = (zc) => {
    if (!CANON) return { estado: 'sin-catalogo', zona: String(zc || '').trim() };
    return resolverZonaFicha(CANON, zc);
  };
  for (const p of (careo.personas || [])) {
    const mismos = porNombreBase.get(p.clave) || [];
    if (mismos.length !== 1) continue;          // los ambiguos ya salen en su montón
    const v = mismos[0];

    // ── 2.5a LA FILA ROJA ES UNA CANCELACIÓN ────────────────────────────────
    // Regla firmada de Memo (30-sep): «todo lo marcado en rojo en el Excel son
    // cancelaciones». Se propone la BAJA: `boletos = 0` y `zona_boleto = NULL`,
    // que es lo que libera el lugar.
    // 🔒 EL ABONADO NO SE TOCA. El dinero cobrado queda registrado —
    // precedente medido: Diana Marlene y Nohemi (karolg#1) conservan sus $5,500
    // con `boletos 0` y zona en NULL. Una baja no es una devolución.
    // ⚠️ Y va ANTES que todo lo demás: a una persona cancelada no se le propone
    // cambiarle la zona ni partirle la fila.
    // 🔒 [CAREO-ZONA-1b] IDEMPOTENCIA: quien YA está bajada no vuelve al montón.
    // Medido en el barrido del 1-oct: 116 bajas aplicadas, 0 errores — y 18
    // filas con la nota DOS VECES. El montón es para las que FALTAN; sin esto,
    // cada careo diario las re-aplicaría engordando `notas` sin fin.
    // 🔒 SE MIRA EL **CRUDO**, no el normalizado: `leerBase` convierte un
    // `boletos = 0` en **1** (su respaldo contra el null, que es correcto para
    // la sincronía), así que preguntarle al normalizado dejaba esta guarda
    // INALCANZABLE — y las bajas se re-proponían en cada careo. Cuando el crudo
    // no viene (un llamador viejo), se cae al normalizado: así el candado
    // degrada en vez de tronar.
    const boletosReales = (v.boletos_crudo != null) ? Number(v.boletos_crudo) : Number(v.boletos);
    const yaBaja = boletosReales === 0 && !String(v.zona || '').trim();

    // ── [CAREO-ZONA-1b] EL ROJO DEL LIBRO, Y SU CASO FINO ──────────────────
    // Regla firmada de Memo (1-oct): el rojo cancela en los DOS libros. Pero
    // una persona VIVA en la pestaña cuya compra del LIBRO está roja NO es una
    // baja: la fila roja cancela ESA compra CHEAP — su dinero y sus boletos ya
    // quedaron fuera en `fundirNumerologia` — y la persona sigue viajando con su
    // paquete. Cancelarla entera por una fila del libro sería demasiado, así
    // que sale como AVISO y lo decide un humano.
    // ⚠️ El orden importa: esto va ANTES de la baja, porque una persona con
    // pestaña viva y libro rojo NO debe caer en `p.roja` por el libro.
    if (p.libro_rojo && (p.pestanas || []).length) {
      avisosZonas.push({ nombre: p.nombre, viajero_id: v.id, zonas: p.zonasReales || p.zonas || {},
        de: String(v.zona || '') || null, libro_rojo: p.libro_rojo,
        motivo: `tiene ${p.libro_rojo} compra(s) ROJA(S) en el libro de Numerología `
              + `(${p.libro_rojo_monto ? _mxn(p.libro_rojo_monto) + ' que NO se suman' : 'sin dinero'}) `
              + `pero SIGUE VIVA en la pestaña «${(p.pestanas || [])[0]}»: la fila roja cancela esa compra, `
              + 'no a la persona — lo decide un humano.' });
      continue;
    }

    if (p.roja) {
      if (!yaBaja && quiere('bajas') && elegida(p.clave)) {
        bajas.push({ clave: p.clave, nombre: p.nombre, viajero_id: v.id,
          de_zona: String(v.zona || '') || null, de_boletos: Number(v.boletos || 1),
          abonado: Number(v.abonado_previo || 0) || null, notas_previas: v.notas || '',
          // 🔒 [CAREO-ZONA-1c] EL DINERO DE UN CANCELADO ES GANANCIA (regla de
          // Memo, 1-oct): la baja iguala el contrato a LO COBRADO para que el
          // saldo quede en 0. ⚠️ Es `v.abonado`, **no** `v.abonado_previo`: lo
          // cobrado es `abonado_previo + Σ abonos_viajero` (la regla de oro del
          // saldo de un migrado, VJ-3). Con el `abonado_previo` a secas, quien
          // tenga abonos encima se quedaría con saldo — y sería saldo A FAVOR
          // del cliente, el error que sí se cobra caro.
          // Y SIN `|| null`: un cobrado de $0 es un NÚMERO (contrato a cero),
          // no un hueco — el mismo hoyo de CUADRE-1a. El `abonado` de arriba lo
          // lleva porque ahí es un dato de reporte; aquí decide una escritura.
          cobrado: Number(v.abonado || 0),
          de_total: v.total_contrato == null ? null : Number(v.total_contrato),
          // De dónde vino el rojo: la pestaña o el libro. La nota lo dirá, porque
          // «cancelada» sin decir dónde manda a buscar en la hoja equivocada.
          origen_rojo: (p.pestanas || []).length ? 'pestana' : 'libro' });
      }
      continue;
    }
    // Y una persona que SOLO existe en el libro, con su compra roja: baja
    // completa — no hay otra compra que la sostenga. `fundirNumerologia` le pone
    // `roja` a esas, así que entra por el `if (p.roja)` de arriba y este
    // comentario existe para que no parezca un caso olvidado.

    // ── 2.5b LA ZONA DE LA FILA, Y LAS FILAS «-» ───────────────────────────
    // 🔴 LAS ZONAS SE CUENTAN POR SU FORMA NORMALIZADA, NO POR LA CADENA
    // CRUDA — y esto es el caso Karla de `juniorh`, que el brief nombra: sus dos
    // filas dicen «3ER NIVEL CENTRAL» y «3er Nivel Central», que son LA MISMA
    // zona escrita de dos formas. Contando crudo salían DOS zonas y el plan le
    // proponía PARTIR la fila: una fila nueva por una mayúscula. No es un
    // cambio de zona ni un reparto — **es solo el conteo** (2 boletos).
    // La pregunta «¿son la misma?» se le hace al dueño de siempre; aquí solo se
    // AGRUPA con su respuesta, conservando una ortografía para que la puerta
    // tenga qué canonizar.
    // 🔴 SI `zonasReales` NO VIENE, SE DERIVA DE `zonas` — y esto lo cazó el
    // careo de Numerología, no una lectura. `zonasReales` lo pone
    // `parsearPestana`, pero NO todos los productores pasan por ahí: las
    // personas que solo existen en el libro las arma `fundirNumerologia`, y
    // cualquier llamador que construya una persona a mano tampoco lo trae. Sin
    // esta caída, su conteo se volvía 0 **en silencio** y la persona se saltaba
    // entera: un boleto que deja de contarse cierra zonas que sí tienen lugar.
    // ⚠️ La caída FILTRA igual (una zona «-» sigue sin contar), así que degrada al
    // comportamiento viejo sin heredar su hoyo.
    const brutas = (p.zonasReales && Object.keys(p.zonasReales).length) ? p.zonasReales
      : Object.fromEntries(Object.entries(p.zonas || {}).filter(([zc]) => esZonaUtil(zc)));
    const reales = {};
    const crudaDe = {};
    for (const [zc, n] of Object.entries(brutas)) {
      const k = normalizarNombre(zc);
      if (!(k in crudaDe)) crudaDe[k] = zc;
      reales[crudaDe[k]] = (reales[crudaDe[k]] || 0) + (Number(n) || 0);
    }
    const realesK = Object.keys(reales);
    const enPestana = Object.values(reales).reduce((a, b) => a + b, 0);
    // Los guiones, igual: si el productor no los contó, se derivan de `zonas`.
    const guiones = (p.guiones != null) ? Number(p.guiones)
      : Object.entries(p.zonas || {}).filter(([zc]) => !esZonaUtil(zc))
              .reduce((a, [, n]) => a + (Number(n) || 0), 0);
    const zonaSis = String(v.zona || '').trim();
    const paqCheap = String(p.paquete || v.paquete || '').trim().toLowerCase() === 'cheap';

    // ⚠️ PESTAÑA CON `regla_zona`: la columna Boleto es el selector del EVENTO
    // (el día de Corona), no el asiento. No es un cambio de zona.
    if (p.reglaZona) {
      if (realesK.length && zonaSis && normalizarNombre(realesK[0]) !== normalizarNombre(zonaSis)) {
        avisosZonas.push({ nombre: p.nombre, viajero_id: v.id, zonas: reales, de: zonaSis,
          motivo: `su pestaña se reparte por zona (regla «${p.reglaZona}»), así que la columna Boleto es `
                + 'el DÍA del evento y no el asiento: un cambio de zona aquí sería proponer el día.' });
      }
      continue;
    }

    // TODAS sus filas en «-» → no tiene boleto de ninguna zona. Se propone
    // `zona_boleto = NULL`, que es lo que libera el lugar (el caso Ximena
    // Ocañas: el index decía AGOTADO con 1 libre).
    // ⚠️ NO se propone `boletos`: una fila «-» no cuenta como boleto, así que no
    // hay número que escribir — y el estado aplicado el 30-sep dejó `boletos`
    // como estaba. Inventar un 0 aquí sería una decisión que nadie tomó.
    if (!realesK.length && guiones > 0) {
      if (zonaSis && quiere('zonas') && elegida(p.clave)) {
        zonasPlan.push({ clave: p.clave, nombre: p.nombre, viajero_id: v.id,
          de: zonaSis, a: null, estado_puerta: 'sin-zona', notas_previas: v.notas || '',
          motivo: `sus ${guiones} fila(s) del Excel traen Boleto «-»: no ocupa boleto de ninguna zona.` });
      }
      continue;
    }

    // 🔴 LOS BOLETOS SE CUENTAN DE LAS ZONAS **REALES**, NO DE `filas` — y
    // desde CAREO-ZONA-1, tampoco de `zonas` a secas: una fila «-» no cuenta
    // como boleto (el caso Monserrat: 1 Platino + 1 «-» son UN boleto, no dos).
    // Lo de `filas` sigue valiendo y es la razón original: lo incrementan las
    // DOS fuentes del lado-Excel, y medido contra producción el 20-sep, 15
    // personas de Soy Luna están en las dos — el libro de Memo repitiendo los
    // MISMOS boletos que la pestaña. Con `filas` se habrían escrito 4 donde hay 2.
    if (!enPestana) continue;
    const actual = Number(v.boletos || 1);

    // ── 2.5c EL CHEAP REPARTIDO → UNA FILA POR ZONA ─────────────────────────
    // Regla de Memo (30-sep, caso Diana Loredo en natanael): un CHEAP son SOLO
    // boletos, así que sus filas pueden repartirse entre 2+ zonas. El sistema
    // tiene UNA fila, y repartir los boletos dentro de ella era imposible: por
    // eso esto era un AVISO. Hoy se PARTE.
    // 🔒 EL DINERO SE QUEDA ENTERO EN LA FILA PRINCIPAL — la de MÁS boletos, y
    // a empate la primera. Las filas nuevas nacen en 0 con una nota que apunta
    // a ella. Repartir el dinero entre zonas sería inventar cuánto pagó por
    // cada boleto, y el precedente aplicado el 30-sep es exactamente éste:
    // Diana Loredo conserva sus $4,200 en Tercer Nivel y su fila de Segundo
    // Nivel nació en total 0 / abonado 0.
    // ⚠️ SOLO CHEAP. Un PLUS con dos zonas lleva hotel y transporte dentro: eso
    // sigue siendo aviso para ojo humano.
    if (realesK.length > 1) {
      if (!paqCheap) {
        avisosBoletos.push({ nombre: p.nombre, viajero_id: v.id, de: actual, a: enPestana,
          zonas: reales,
          motivo: `sus ${enPestana} boletos están repartidos entre ${realesK.length} zonas `
                + `(${realesK.join(', ')}) y NO es CHEAP: partir un paquete con hotel y transporte `
                + 'pide ojo humano.' });
        continue;
      }
      // Las zonas, por la puerta. Si ALGUNA es desconocida no se parte nada: una
      // fila nueva con una zona que la ficha no tiene es el hoyo de DISPO-NORM-1
      // naciendo otra vez.
      const vistas = realesK.map((zc) => ({ zc, v: porLaPuerta(zc), n: reales[zc] }));
      const mala = vistas.find((x) => x.v.estado !== 'exacta' && x.v.estado !== 'canonizada');
      if (mala) {
        avisosZonas.push({ nombre: p.nombre, viajero_id: v.id, zonas: reales, de: zonaSis,
          motivo: `no se parte: la zona «${mala.zc}» ${mala.v.estado === 'sin-catalogo'
            ? 'no se pudo validar (el catálogo no se leyó)'
            : 'no existe en la ficha'} — escribirla creaba una zona que el sitio no conoce.` });
        continue;
      }
      if (!quiere('partidas') || !elegida(p.clave)) continue;
      // La PRINCIPAL: la de más boletos; a empate, la primera que apareció.
      let principal = vistas[0];
      for (const x of vistas) if (x.n > principal.n) principal = x;
      partidas.push({ clave: p.clave, nombre: p.nombre, viajero_id: v.id,
        paquete: 'cheap', notas_previas: v.notas || '',
        principal: { zona: principal.v.zona, boletos: principal.n, capturada: principal.zc },
        nuevas: vistas.filter((x) => x !== principal)
                      .map((x) => ({ zona: x.v.zona, boletos: x.n, capturada: x.zc })),
        de_zona: zonaSis || null, de_boletos: actual,
        canonizadas: vistas.filter((x) => x.v.estado === 'canonizada').map((x) => x.zc) });
      continue;
    }

    // ── 2.5d UNA SOLA ZONA REAL: la zona y el conteo, en la MISMA pasada ─────
    // Hoy esto eran DOS avisos que se bloqueaban entre sí: el conteo no se
    // aplicaba porque la zona no coincidía, y la zona no se tocaba nunca. Ese
    // empate dejó 28 personas con boletos de menos el 30-sep.
    const unica = realesK[0];
    const puerta = porLaPuerta(unica);
    const mismaZona = zonaSis && normalizarNombre(unica) === normalizarNombre(zonaSis);
    if (!mismaZona) {
      if (puerta.estado !== 'exacta' && puerta.estado !== 'canonizada') {
        avisosZonas.push({ nombre: p.nombre, viajero_id: v.id, zonas: reales, de: zonaSis,
          a_capturada: unica, estado_puerta: puerta.estado,
          motivo: `la pestaña lo pone en «${unica}» y ${puerta.estado === 'sin-catalogo'
            ? 'el catálogo no se pudo leer para validarla'
            : 'la ficha no tiene esa zona'}: el careo no escribe una zona que el sitio no conoce.` });
        continue;
      }
      if (quiere('zonas') && elegida(p.clave)) {
        zonasPlan.push({ clave: p.clave, nombre: p.nombre, viajero_id: v.id,
          notas_previas: v.notas || '',
          de: zonaSis || null, a: puerta.zona, capturada: unica,
          estado_puerta: puerta.estado,
          boletos_de: actual, boletos_a: enPestana,
          guiones: guiones || undefined });
      }
      // El conteo viaja DENTRO del cambio de zona: son la misma pasada, y
      // escribirlos por separado dejaría la fila un instante con la zona nueva
      // y el conteo viejo.
      continue;
    }
    if (enPestana === actual) continue;         // ya cuadra
    if (!quiere('boletos') || !elegida(p.clave)) continue;
    boletos.push({ clave: p.clave, nombre: p.nombre, viajero_id: v.id,
      de: actual, a: enPestana, zona: zonaSis,
      // Las filas «-» se REPORTAN aunque no cuenten: el caso Monserrat (1
      // Platino + 1 «-») tiene que poder leerse sin abrir el Excel.
      guiones: guiones || undefined });
  }

  // ── 2.6 [BOLETOS-1 adenda] LA CHATARRA → `vendidos_fuera` ─────────────────
  // La cuenta completa del Excel es `restan = pedido − boletos de clientes −
  // chatarra`. Los dos primeros ya los sabe el sistema; el tercero vivía solo
  // en la pestaña. Medido en Soy Luna: 8 boletos de chatarra que el sistema no
  // veía, con `stock_ajustes` VACÍO.
  //
  // 🔒 LA ESCRITURA ES **SET**, JAMÁS SUMA — eso se obra en `ejecutarPlan`,
  // pero la razón se dice aquí porque es la que ordena todo: `stock_ajustes`
  // SUMA por diseño y tiene UNIQUE en (evento_id, zona). Un sync que sumara
  // convertiría cada clic en boletos de más: es la mordida de CREA-1.
  const fuera = [];
  if (quiere('fuera')) {
    // [DISPO-NORM-1] 🔒 EL EMPAREJAMIENTO ES POR ZONA **NORMALIZADA**, no por
    // cadena exacta. Con el emparejamiento exacto, una llave del Excel escrita
    // distinto a la de la base («GENERAL» vs «General») salía como DOS
    // renglones: crear la fantasma Y poner en cero la buena — el careo del
    // 28-sep propuso exactamente eso, deshaciendo una alineación del mismo
    // día. La ortografía que se ESCRIBE es la de la fila que ya existe en la
    // base (que desde la puerta es la canónica), y solo si no hay fila, la de
    // la chatarra (que `correrCareo` ya canonizó contra la ficha).
    const actualPorNorm = new Map();   // norm → fila de stock_ajustes
    for (const a of (careo.ajustes || [])) {
      const zt = String(a.zona || '').trim();
      if (zt) actualPorNorm.set(normalizarZona(zt), a);
    }
    const contadoPorNorm = new Map();  // norm → { zona: ortografía chatarra, n }
    for (const zc in (careo.chatarraPorZona || {})) {
      const zt = String(zc).trim();
      if (!zt) continue;
      const k = normalizarZona(zt);
      const ya = contadoPorNorm.get(k);
      if (ya) ya.n += Number(careo.chatarraPorZona[zc] || 0);
      else contadoPorNorm.set(k, { zona: zt, n: Number(careo.chatarraPorZona[zc] || 0) });
    }
    for (const k of new Set([...actualPorNorm.keys(), ...contadoPorNorm.keys()])) {
      const fila = actualPorNorm.get(k);
      const ch = contadoPorNorm.get(k);
      const contado = Number((ch && ch.n) || 0);
      const actual = Number((fila && fila.vendidos_fuera) || 0);
      if (contado === actual) continue;
      const zEscribe = (fila && String(fila.zona).trim()) || (ch && ch.zona) || '';
      if (!zEscribe) continue;
      if (claves && !claves.has(normalizarNombre(zEscribe))) continue;
      fuera.push({ zona: zEscribe, de: actual, a: contado, ajuste_id: (fila && fila.id) || null });
    }
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
      // [BOLETOS-1] El alta NACE con su número: las de pestaña con sus filas,
      // las del libro con su `boletos` (el parser ya lo trae). El caso Danna
      // —2 lugares en una fila— queda cubierto por aquí y por la sincronía.
      // Misma razón que arriba: los renglones de la PESTAÑA (`zonas`), y si la
      // persona vive solo en el libro, el `boletos` que trae el parser.
      boletos: Math.max(1, Object.values(p.zonas || {}).reduce((a, b) => a + b, 0) || Number(p.boletos || 1)),
      pestanas: p.pestanas || [] });
  }

  return { abonos, totales, altas, negativas, saltados, boletos, fuera,
           avisos_boletos: avisosBoletos,
           // [CAREO-ZONA-1]
           zonas: zonasPlan, partidas, bajas, avisos_zonas: avisosZonas,
           // ⚠️ Se DICE cuando el catálogo no se pudo leer: sin él la puerta no
           // canoniza nada y los montones de zona salen vacíos — un vacío sin
           // razón se lee como «no había nada que cambiar».
           zonas_sin_catalogo: CANON ? false : true };
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
  const resultado = { abonos: [], totales: [], altas: [], boletos: [], fuera: [],
                      // [CAREO-ZONA-1]
                      zonas: [], partidas: [], bajas: [],
                      // [CAREO-ZONA-1b] Las que la base rehusó porque ya estaban
                      // bajadas. Viajan APARTE de `bajas`: no se escribieron.
                      bajas_ya_estaban: [], errores: [] };
  // La nota se AGREGA, nunca pisa: el historial de una fila es su rastro.
  const _nota = (previas, txt) => {
    const p0 = String(previas == null ? '' : previas).trim();
    return p0 ? (p0 + ' · ' + txt) : txt;
  };

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

  // ── 2.5 [BOLETOS-1] LOS BOLETOS ───────────────────────────────────────────
  // Un PATCH por fila, en tandas, igual que los totales. 🔒 SOLO la columna
  // `boletos`: `abonado_previo` está congelado (VJ-3) y el total es otra
  // cuenta — lo que no se nombra no se puede pisar.
  for (let i = 0; i < plan.boletos.length; i += TANDA) {
    const tanda = plan.boletos.slice(i, i + TANDA);
    await Promise.all(tanda.map(async (x) => {
      const r = await fetch(`${SB_URL}/rest/v1/viajeros_evento?id=eq.${encodeURIComponent(x.viajero_id)}`, {
        method: 'PATCH', headers: { ...sb, Prefer: 'return=representation' },
        body: JSON.stringify({ boletos: x.a }),
      });
      if (!r.ok) { resultado.errores.push({ paso: 'boletos', nombre: x.nombre, detalle: (await r.text()).slice(0, 200) }); return; }
      resultado.boletos.push({ nombre: x.nombre, viajero_id: x.viajero_id, de: x.de, a: x.a });
    }));
  }

  // ── 2.5a [CAREO-ZONA-1] LA ZONA, Y EL CONTEO EN EL MISMO PATCH ────────────
  // 🔒 UN SOLO PATCH POR PERSONA. La zona y el conteo son la MISMA verdad de la
  // pestaña; escribirlos en dos pasos dejaría la fila un instante con la zona
  // nueva y el conteo viejo — y si el segundo falla, queda así. El empate entre
  // los dos avisos es justo lo que dejó 28 personas sin corregir el 30-sep.
  // ⚠️ `a: null` es el caso Ximena (todas sus filas en «-»): se limpia la zona y
  // NO se toca `boletos`, porque una fila «-» no es un número que escribir.
  for (let i = 0; i < (plan.zonas || []).length; i += TANDA) {
    const tanda = plan.zonas.slice(i, i + TANDA);
    await Promise.all(tanda.map(async (x) => {
      const cuerpo = { zona_boleto: x.a };
      if (x.boletos_a != null && x.boletos_a !== x.boletos_de) cuerpo.boletos = x.boletos_a;
      const nota = x.a == null
        ? `Careo zonas ${hoy}: sus filas del Excel traen Boleto «-» — zona liberada (no ocupa boleto)`
        : `Careo zonas ${hoy}: ${x.de ? `«${x.de}» → ` : ''}«${x.a}» según la pestaña`
          + (x.estado_puerta === 'canonizada' ? ` (escrita «${x.capturada}», canonizada a la ficha)` : '')
          + (cuerpo.boletos != null ? ` · boletos ${x.boletos_de}→${x.boletos_a}` : '')
          + (x.guiones ? ` · ${x.guiones} fila(s) en «-» no cuentan` : '');
      const r = await fetch(`${SB_URL}/rest/v1/viajeros_evento?id=eq.${encodeURIComponent(x.viajero_id)}`, {
        method: 'PATCH', headers: { ...sb, Prefer: 'return=representation' },
        body: JSON.stringify({ ...cuerpo, notas: _nota(x.notas_previas, nota) }),
      });
      if (!r.ok) { resultado.errores.push({ paso: 'zonas', nombre: x.nombre, detalle: (await r.text()).slice(0, 200) }); return; }
      resultado.zonas.push({ nombre: x.nombre, viajero_id: x.viajero_id, de: x.de, a: x.a,
                             boletos: cuerpo.boletos != null ? `${x.boletos_de}→${x.boletos_a}` : null,
                             canonizada: x.estado_puerta === 'canonizada' ? x.capturada : null });
    }));
  }

  // ── 2.5b [CAREO-ZONA-1] EL CHEAP REPARTIDO: UNA FILA POR ZONA ─────────────
  // 🔒 EL ORDEN IMPORTA Y NO ES CAPRICHO: primero se CORRIGE la principal
  // (zona + boletos) y solo si eso salió bien se INSERTAN las nuevas. Al revés,
  // un fallo a media partida dejaría boletos DUPLICADOS — la fila vieja con su
  // conteo entero más las nuevas— y el stock cerraría zonas que sí tienen lugar.
  // 🔒 EL DINERO NO SE REPARTE: la principal conserva `total_contrato` y
  // `abonado_previo` intactos (no se nombran, así que no se pisan) y las nuevas
  // nacen en 0. Repartirlo sería inventar cuánto pagó por cada boleto.
  for (const x of (plan.partidas || [])) {
    const rP = await fetch(`${SB_URL}/rest/v1/viajeros_evento?id=eq.${encodeURIComponent(x.viajero_id)}`, {
      method: 'PATCH', headers: { ...sb, Prefer: 'return=representation' },
      body: JSON.stringify({
        zona_boleto: x.principal.zona, boletos: x.principal.boletos,
        notas: _nota(x.notas_previas,
          `Fila partida ${hoy}: CHEAP repartido — se queda con ${x.principal.boletos} boleto(s) de `
          + `«${x.principal.zona}» y el DINERO entero; sus otros boletos salieron a fila(s) aparte`),
      }),
    });
    if (!rP.ok) {
      resultado.errores.push({ paso: 'partidas', nombre: x.nombre, detalle: (await rP.text()).slice(0, 200) });
      continue;      // ← sin tocar las nuevas: no se duplican boletos
    }
    const nuevas = [];
    for (const n of x.nuevas) {
      const rN = await fetch(`${SB_URL}/rest/v1/viajeros_evento`, {
        method: 'POST', headers: { ...sb, Prefer: 'return=representation' },
        body: JSON.stringify([{
          evento_id: eventoId, nombre: x.nombre, zona_boleto: n.zona, boletos: n.boletos,
          tipo_paquete: 'cheap', tipo_viajero: 'cliente',
          // 🔒 EN CERO, Y DICHO: el dinero vive en la fila principal.
          total_contrato: 0, abonado_previo: 0,
          notas: `Fila partida ${hoy}: su(s) ${n.boletos} boleto(s) de «${n.zona}» `
               + `(el dinero vive en su fila de «${x.principal.zona}»)`,
        }]),
      });
      if (!rN.ok) { resultado.errores.push({ paso: 'partidas', nombre: x.nombre, detalle: (await rN.text()).slice(0, 200) }); continue; }
      nuevas.push({ zona: n.zona, boletos: n.boletos });
    }
    resultado.partidas.push({ nombre: x.nombre, viajero_id: x.viajero_id,
      principal: x.principal, nuevas, canonizadas: x.canonizadas });
  }

  // ── 2.5c [CAREO-ZONA-1] LA FILA ROJA: LA BAJA ─────────────────────────────
  // Regla firmada de Memo (30-sep): «todo lo marcado en rojo en el Excel son
  // cancelaciones». `boletos = 0` y `zona_boleto = NULL`, que es lo que libera
  // el lugar.
  // 🔒 EL ABONADO **NO SE NOMBRA**, así que no se pisa: el dinero cobrado queda
  // registrado. Precedente medido en la base — Diana Marlene y Nohemi
  // (karolg#1) conservan sus $5,500 con boletos 0 y zona NULL. Una baja no es
  // una devolución, y el careo no decide dinero que nadie le pidió decidir.
  for (let i = 0; i < (plan.bajas || []).length; i += TANDA) {
    const tanda = plan.bajas.slice(i, i + TANDA);
    await Promise.all(tanda.map(async (x) => {
      // 🔴 [CAREO-ZONA-1b] LA ESCRITURA ES CONDICIONAL, y no es paranoia: la
      // guarda de `planear` hace que una baja YA aplicada no se re-proponga,
      // pero eso no basta. Medido el 1-oct: 116 bajas aplicadas y **18 filas
      // con la nota DOS VECES**. La causa no es el plan — es CAREO-RETRY-1: una
      // tanda que da 504 se reintenta con el MISMO `desde`, y si el reintento
      // arranca antes de que la primera pasada aterrice, los DOS planes se
      // calcularon con la persona aún viva y los dos escriben.
      // 🔒 EL FILTRO LO CIERRA EN LA BASE: el PATCH solo casa con filas que
      // **todavía no están bajadas**. La segunda escritura casa 0 filas y no
      // engorda la nota. Es el único sitio donde dos planes en vuelo no pueden
      // pisarse — una guarda en el plan siempre llega tarde a una carrera.
      // ⚠️ VA CON `or=`, NO con `boletos=neq.0` a secas: un `boletos` en NULL no
      // casa con `neq.0` — un NOT contra NULL traga filas, en SQL y en PostgREST—
      // y esa fila se habría quedado sin bajar en silencio. El `or` la salva por
      // la otra rama.
      const filtro = `id=eq.${encodeURIComponent(x.viajero_id)}`
        + '&or=(boletos.neq.0,zona_boleto.not.is.null)';
      const r = await fetch(`${SB_URL}/rest/v1/viajeros_evento?${filtro}`, {
        method: 'PATCH', headers: { ...sb, Prefer: 'return=representation' },
        // 🔒 [CAREO-ZONA-1c] `total_contrato` = LO COBRADO, para que el saldo
        // quede en 0: el dinero de un cancelado es GANANCIA (regla de Memo,
        // 1-oct, sellada en CLAUDE.md). El ABONADO sigue sin tocarse — lo que
        // se mueve es el contrato, no el dinero— y la nota tiene que decir las
        // DOS cosas: una nota que solo menciona la mitad de la escritura es un
        // letrero que esconde lo otro.
        body: JSON.stringify({ boletos: 0, zona_boleto: null, total_contrato: x.cobrado,
          notas: _nota(x.notas_previas,
            `CANCELADA (fila roja del ${x.origen_rojo === 'libro' ? 'libro de Numerología' : 'Excel'}) ${hoy}: `
            + `venía con ${x.de_boletos} boleto(s) de «${x.de_zona || 'sin zona'}» · el abonado NO se toca`
            + ` · total ${x.de_total == null ? 'sin fijar' : _mxn(x.de_total)} → ${_mxn(x.cobrado)} `
            + '(lo cobrado es ganancia: saldo 0)') }),
      });
      if (!r.ok) { resultado.errores.push({ paso: 'bajas', nombre: x.nombre, detalle: (await r.text()).slice(0, 200) }); return; }
      // 🔒 CERO FILAS CASADAS = YA ESTABA BAJADA, y se dice en vez de contarla
      // como aplicada: un conteo que suma lo que no escribió es un número que
      // miente, y aquí el número se le enseña a Bulma.
      const filasTocadas = await r.json().catch(() => []);
      if (Array.isArray(filasTocadas) && filasTocadas.length === 0) {
        resultado.bajas_ya_estaban.push({ nombre: x.nombre, viajero_id: x.viajero_id });
        return;
      }
      resultado.bajas.push({ nombre: x.nombre, viajero_id: x.viajero_id,
        de_zona: x.de_zona, de_boletos: x.de_boletos, abonado_intacto: x.abonado,
        // [CAREO-ZONA-1c] De dónde a dónde se movió el contrato: un número pelado
        // no se audita, y esta escritura la firma un humano.
        total_de: x.de_total, total_a: x.cobrado,
        origen_rojo: x.origen_rojo || 'pestana' });
    }));
  }

  // ── 2.6 [BOLETOS-1 adenda] `vendidos_fuera`: SET, JAMÁS SUMA ──────────────
  // 🔒 `stock_ajustes` SUMA por diseño y tiene UNIQUE en (evento_id, zona). Si
  // esto insertara cada vez, el segundo clic duplicaría boletos —la mordida de
  // CREA-1— y si usara `on_conflict` rompería la regla de la casa. Así que:
  // la fila YA VIENE LEÍDA del careo (con su `id`), y se decide con eso.
  //   · hay fila  → PATCH por `id` al valor ABSOLUTO;
  //   · no hay    → INSERT directo, sin `on_conflict`.
  for (const x of plan.fuera) {
    const cuerpo = { vendidos_fuera: x.a };
    let r;
    if (x.ajuste_id) {
      r = await fetch(`${SB_URL}/rest/v1/stock_ajustes?id=eq.${encodeURIComponent(x.ajuste_id)}`, {
        method: 'PATCH', headers: { ...sb, Prefer: 'return=representation' }, body: JSON.stringify(cuerpo) });
    } else {
      r = await fetch(`${SB_URL}/rest/v1/stock_ajustes`, {
        method: 'POST', headers: { ...sb, Prefer: 'return=representation' },
        body: JSON.stringify({ evento_id: eventoId, zona: x.zona, ...cuerpo,
          nota: `Chatarra contada del careo Excel ${hoy}` }) });
    }
    if (!r.ok) { resultado.errores.push({ paso: 'fuera', zona: x.zona, detalle: (await r.text()).slice(0, 200) }); continue; }
    resultado.fuera.push({ zona: x.zona, de: x.de, a: x.a });
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
          boletos: x.boletos || 1,
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

#!/usr/bin/env node
// =============================================================================
// scripts/mide-boletos.js — EL CAREO DE BOLETOS-1
// =============================================================================
// EL STOCK CONTABA FILAS, NO BOLETOS. La pestaña de las chicas lleva UNA FILA
// POR BOLETO; el sistema, una por PERSONA. El careo funde por nombre y el
// dinero cuadra —por eso nadie lo vio en meses— pero cada contador de stock
// hacía COUNT(filas), así que una persona con 4 boletos descontaba UNO.
//
// MEDIDO sobre la pestaña real de Soy Luna el 20-sep, después de que Memo lo
// destapara usando el sitio:
//   · 56 renglones = 38 personas únicas;
//   · VIP: 17 renglones (boletos vendidos) contra 12 filas en el sistema;
//   · stock comprado de VIP = 20 → el sitio publicaba «8 libres» quedando 3.
//   · 12 personas con más de un boleto, 0 con boletos repartidos entre zonas.
//
// La columna `viajeros_evento.boletos` (integer NOT NULL DEFAULT 1) ya existe
// —la sembró Jane— y hoy vale 1 en las 2,468 filas: hasta esta tuerca, cero
// cambio de comportamiento.
//
// 🔒 `consumeBoleto` SIGUE SIENDO EL ÚNICO DUEÑO de QUIÉN consume. Lo que
// cambia es CUÁNTO: `boletos` en vez de 1. RIDE sigue sin consumir, y este
// careo lo exige aunque la fila traiga boletos 2.
// =============================================================================

const path = require('path');
const RAIZ = path.join(__dirname, '..');
let ok = 0, mal = 0; const fallos = [];
const af = (c, e) => { if (c) ok++; else { mal++; fallos.push(e); } };

const { cargarDisponibilidad, evaluarZona } = require(path.join(RAIZ, 'netlify/functions/_lib/disponibilidad'));
const { disponiblesPorEvento } = require(path.join(RAIZ, 'netlify/functions/_lib/agotado-derivado'));
const { consumeBoleto } = require(path.join(RAIZ, 'netlify/functions/_lib/paquete-viaje'));

// ── LA RED FALSA ────────────────────────────────────────────────────────────
// Devuelve lo que se le siembre y ANOTA qué columnas se pidieron: si el
// `select` no trae `boletos`, el contador no puede contarlos por mucho que el
// código lo intente — y ése es un fallo que se ve como «todo en 1».
function redFalsa(tablas) {
  const selects = {};
  return {
    selects,
    fetchFalso: async (url) => {
      const u = new URL(url);
      const tabla = u.pathname.replace('/rest/v1/', '');
      selects[tabla] = u.searchParams.get('select') || '';
      let filas = tablas[tabla] || [];
      const ev = (u.searchParams.get('evento_id') || '').replace(/^eq\./, '');
      if (ev) filas = filas.filter((f) => String(f.evento_id) === ev);
      return { ok: true, status: 200, json: async () => filas, text: async () => '' };
    },
  };
}

// El fixture de Soy Luna, con los números REALES medidos.
const SOYLUNA = () => ({
  compras: [{ evento_id: 'soyluna', zona: 'VIP', cantidad: 20 },
            { evento_id: 'soyluna', zona: 'Barrera', cantidad: 13 }],
  // [adenda] La chatarra de Soy Luna, ya sincronizada: VIP 2 (Marietta
  // creadora ×2), Balcón 2, Platino 1, Megacable 2, Plata 1 = 8 boletos que el
  // sistema no veía. Medido contra la pestaña real el 20-sep.
  stock_ajustes: [{ evento_id: 'soyluna', zona: 'VIP', vendidos_fuera: 2 }],
  viajeros_evento: [
    // Sergio: UNA fila, CUATRO boletos. Antes descontaba 1.
    { evento_id: 'soyluna', nombre: 'Sergio', zona_boleto: 'VIP', tipo_paquete: 'plus', tipo_viajero: 'cliente', boletos: 4, total_contrato: 4000 },
    // Stephany: 3 boletos. Perla, Marietta, Vianney: 2 cada una.
    { evento_id: 'soyluna', nombre: 'Stephany', zona_boleto: 'VIP', tipo_paquete: 'plus', tipo_viajero: 'cliente', boletos: 3, total_contrato: 3000 },
    { evento_id: 'soyluna', nombre: 'Perla', zona_boleto: 'VIP', tipo_paquete: 'plus', tipo_viajero: 'cliente', boletos: 2, total_contrato: 2000 },
    { evento_id: 'soyluna', nombre: 'Marietta', zona_boleto: 'VIP', tipo_paquete: 'plus', tipo_viajero: 'cliente', boletos: 2, total_contrato: 2000 },
    { evento_id: 'soyluna', nombre: 'Vianney', zona_boleto: 'VIP', tipo_paquete: 'plus', tipo_viajero: 'cliente', boletos: 2, total_contrato: 2000 },
    // Y ocho personas de un solo boleto → 4+3+2+2+2+8 = 21… se ajusta a 17
    // abajo con las que de verdad hay: aquí van CUATRO de una.
    { evento_id: 'soyluna', nombre: 'Uno', zona_boleto: 'VIP', tipo_paquete: 'plus', tipo_viajero: 'cliente', boletos: 1, total_contrato: 1000 },
    { evento_id: 'soyluna', nombre: 'Dos', zona_boleto: 'VIP', tipo_paquete: 'plus', tipo_viajero: 'cliente', boletos: 1, total_contrato: 1000 },
    { evento_id: 'soyluna', nombre: 'Tres', zona_boleto: 'VIP', tipo_paquete: 'plus', tipo_viajero: 'cliente', boletos: 1, total_contrato: 1000 },
    { evento_id: 'soyluna', nombre: 'Cuatro', zona_boleto: 'VIP', tipo_paquete: 'plus', tipo_viajero: 'cliente', boletos: 1, total_contrato: 1000 },
    // 🔒 RIDE NO CONSUME, traiga los boletos que traiga.
    { evento_id: 'soyluna', nombre: 'Viajero Ride', zona_boleto: 'VIP', tipo_paquete: 'ride', tipo_viajero: 'cliente', boletos: 2, total_contrato: 2700 },
    // Y una fila SIN tocar, que sigue en 1 (regresión).
    { evento_id: 'soyluna', nombre: 'Intacta', zona_boleto: 'Barrera', tipo_paquete: 'plus', tipo_viajero: 'cliente', boletos: 1, total_contrato: 1000 },
    // 🔒 UNA FILA SIN LA LLAVE `boletos` — lo que llegaría con un select viejo
    // o si la columna volviera a ser nullable. Tiene que contar 1, NO 0:
    // contar 0 SOBREVENDE, y contar de más solo deja de vender. Ante la duda,
    // el lado seguro. (Sin este caso, cambiar el respaldo a 0 pasaba VERDE.)
    { evento_id: 'soyluna', nombre: 'Sin Llave', zona_boleto: 'Barrera', tipo_paquete: 'plus', tipo_viajero: 'cliente', total_contrato: 1000 },
  ],
  solicitudes_tour: [],
});

(async () => {
  console.log('CAREO BOLETOS-1 · el stock cuenta BOLETOS, no filas\n');

  const base = SOYLUNA();
  const red = redFalsa(base);
  const disp = await cargarDisponibilidad({
    fetchImpl: red.fetchFalso,
    khUrl: 'https://kh.test', khKey: 'k', portalUrl: 'https://pt.test', portalKey: 'k',
    evento_id: 'soyluna',
  });
  af(!disp.error, 'no se pudo cargar la disponibilidad: ' + disp.error);

  // ── [1] EL SELECT TRAE `boletos` ─────────────────────────────────────────
  // Sin la columna en el `select`, el contador no puede contarla por mucho que
  // el código lo intente — y el fallo se ve como «todo en 1», que es justo lo
  // que se está arreglando.
  console.log('[1] el select de viajeros');
  console.log('    ' + JSON.stringify(red.selects.viajeros_evento));
  af(/\bboletos\b/.test(red.selects.viajeros_evento || ''),
     'el select de `viajeros_evento` no pide `boletos`: el contador los leería como undefined y caería a 1');

  // ── [2] EL CONTEO: 17 boletos, no 10 filas ───────────────────────────────
  console.log('\n[2] VIP de Soy Luna');
  const vip = evaluarZona(disp, 'VIP', 1);
  const filasVip = base.viajeros_evento.filter((v) => v.zona_boleto === 'VIP' && consumeBoleto(v.tipo_paquete, v.tipo_viajero)).length;
  const bolVip = base.viajeros_evento.filter((v) => v.zona_boleto === 'VIP' && consumeBoleto(v.tipo_paquete, v.tipo_viajero))
    .reduce((a, v) => a + v.boletos, 0);
  console.log(`    filas que consumen: ${filasVip} · boletos: ${bolVip} · chatarra 2 · stock 20 → restante ${vip.restante}`);
  af(bolVip === 17, 'el fixture no suma 17 boletos sino ' + bolVip + ': el caso de prueba no es el medido');
  // 🔒 LA FRASE QUE MEMO ESPERA VER EN SU SITIO: «¡Último lugar!».
  af(vip.restante === 1, 'quedan ' + vip.restante + ' y la cuenta completa da 1 (20 − 17 boletos − 2 de chatarra)');
  // CONTROL POSITIVO DEL CASO: contando filas darían 10, o sea 10 libres. Si el
  // restante fuera 10, el careo estaría midiendo el defecto y no el arreglo.
  af(vip.restante !== (20 - filasVip),
     'el restante coincide con contar FILAS (' + (20 - filasVip) + '): no se está sumando `boletos`');
  af(vip.restante !== (20 - bolVip),
     'el restante ignora la chatarra (' + (20 - bolVip) + '): «Vendido X» no es viajero pero SÍ ocupa boleto');

  // ── [3] 🔒 RIDE NO CONSUME, traiga los boletos que traiga ────────────────
  console.log('\n[3] el RIDE con boletos 2');
  // Si RIDE consumiera, el restante sería 1 en vez de 3.
  af(vip.restante === 1, 'el RIDE con boletos 2 descontó: restante ' + vip.restante);
  af(consumeBoleto('ride', 'cliente') === false, 'consumeBoleto cambió de opinión sobre RIDE: eso es de su dueño, no de esta tuerca');
  console.log('    RIDE sigue sin consumir ✓');

  // ── [4] REGRESIÓN: la fila en 1 sigue descontando 1 ──────────────────────
  console.log('\n[4] la fila sin tocar');
  const barr = evaluarZona(disp, 'Barrera', 1);
  console.log(`    Barrera: stock 13 · 1 fila con boletos:1 + 1 fila SIN la llave → restante ${barr.restante}`);
  af(barr.restante === 11, 'Barrera: restante ' + barr.restante + ', se esperaban 11 (13 − 1 − 1)');
  // 🔒 EL RESPALDO ES 1, NO 0. Un `boletos` ausente contado como cero
  // SOBREVENDE; contado como uno, a lo más deja de vender.
  af(barr.restante !== 12, 'la fila SIN la llave `boletos` se contó como CERO: eso sobrevende');

  // ── [5] EL OTRO CONTADOR: el del publish (auto-semáforo) ─────────────────
  // Son DOS los que cuentan filas consumidoras, y arreglar uno solo dejaría al
  // sitio apagando zonas con un número y publicándolas con otro.
  console.log('\n[5] el contador del publish (`disponiblesPorEvento`)');
  const st = disponiblesPorEvento({
    compras: base.compras, ajustes: base.stock_ajustes, viajeros: base.viajeros_evento, consumeBoleto,
  });
  // ⏳ ACTUALIZADO EN ZONA-NORM-1 (25-sep-2026), con su razón: el Map de
  // `disponiblesPorEvento` ya NO se llavea con la ortografía cruda de lo
  // capturado, sino con la zona **NORMALIZADA** — porque «Retractil Oro» de una
  // pestaña y «Retráctil Oro» de la ficha eran dos llaves y lo capturado restaba
  // de una que el aviso nunca consultaba. Así que `.get('VIP')` ya no existe.
  // 🔒 Y LA LLAVE SE LA PIDE AL DUEÑO en vez de teclear `'vip'`: si mañana la
  // forma aprende a quitar puntos, este careo la sigue sin que nadie lo toque —
  // teclear la llave a mano sería la copia que todavía no diverge.
  const { normalizarZona } = require(path.join(RAIZ, 'netlify/functions/_lib/normalizar-zona'));
  const vipPub = st.get('soyluna').get(normalizarZona('VIP'));
  console.log(`    VIP según el publish: ${vipPub}   (llave «${normalizarZona('VIP')}»)`);
  af(vipPub === 1, 'el contador del publish dice ' + vipPub + ' y debe decir 1 (20 − 17 − 2)');
  af(st.get('soyluna').get(normalizarZona('Barrera')) === 11,
     'Barrera en el publish: ' + st.get('soyluna').get(normalizarZona('Barrera')) + ', se esperaban 11');
  // Y el candado que la mudanza de llave hace posible: la MISMA zona escrita de
  // otra forma cae en la MISMA cuenta, que es el punto de la tuerca.
  af(st.get('soyluna').get(normalizarZona('  vip  ')) === vipPub,
     'la zona escrita distinto NO cae en la misma llave: es justo el hoyo que ZONA-NORM-1 cierra');

  // ── [6] LO QUE VE EL CLIENTE: «¡Últimos 3!» ──────────────────────────────
  // El remate: el endpoint público tiene que sacar el 3 por su cuenta, que es
  // lo que el chip del index pinta.
  console.log('\n[6] lo que sale por el endpoint público');
  const redP = redFalsa(base);
  const dispP = await cargarDisponibilidad({
    fetchImpl: redP.fetchFalso, khUrl: 'https://kh.test', khKey: 'k',
    portalUrl: 'https://pt.test', portalKey: 'k', evento_id: 'soyluna',
  });
  const pocas = {};
  Object.keys(dispP.stockPorZona || {}).forEach((z) => {
    const e = evaluarZona(dispP, z, 1);
    if (e.restante > 0 && e.restante <= 5) pocas[z] = e.restante;
  });
  console.log('    zonas_pocas: ' + JSON.stringify(pocas));
  // 🔒 LA CUENTA COMPLETA, cuadrada al boleto contra la tablita «Restan» de las
  // chicas: 20 pedidos − 17 boletos de clientes − 2 de chatarra = 1.
  af(pocas.VIP === 1, 'el endpoint diría «¡Últimos ' + pocas.VIP + '!» y la cuenta completa da 1 '
     + '(20 − 17 − 2): o no se suman los boletos, o no se resta la chatarra');
  af(!('Barrera' in pocas), 'Barrera tiene 12 libres y se coló a las pocas');

  console.log('\n──────────────────────────────────────────────');
  console.log((mal === 0 ? '✅ VERDE' : '❌ ROJO') + ' · ' + ok + ' aserciones en verde, ' + mal + ' en rojo');
  fallos.forEach((f) => console.log('  · ' + f));
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e.message, '\n', e.stack); process.exit(1); });

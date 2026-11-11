// mide:pn-multi-1 — [PN-MULTI-1, 11-nov-2026] La preventa a ciegas de un
// evento MULTIFECHA (Pa'l Norte: 3 · 2 · 1 día) elige paquete: primero la
// fecha, luego paquete/zona de ESA fecha; al aplicar, el lugar se MUDA a
// 'slug#N' con valor esperado. Cero dinero abonado tocado.
const path = require('path');
const RAIZ = path.join(__dirname, '..');
let V = 0, R = 0;
const af = (c, m) => { let ok; try { ok = typeof c === 'function' ? !!c() : !!c; } catch (e) { ok = false; m += ' · ' + e.message; } ok ? V++ : R++; console.log((ok ? '  ✓ ' : '  ✗ ') + m); };
const L = (f) => path.join(RAIZ, 'netlify/functions/_lib/', f);
const gen = (p) => ({ n: 'General', p }), prox = (n) => ({ n, p: 0, prox: 1 });
const hot = (n) => [{ k: 'compartida', n: 'Compartida (4)', e: 0, pp: 0, viaj: [1, 2, 3, 4] }, { k: 'individual', n: 'Individual', e: 1960 * n, pp: 1960 * n, viaj: [1] }, { k: 'doble', n: 'Doble', e: 650 * n, pp: 650 * n, viaj: [2] }];
const ent = (lbl, n, plus, cheap, ride) => ({ lbl, ds: '2027-03-26', noches: n, ride, hotel: hot(n), zonas: [gen(plus), prox('VIP')], cheapZonas: [gen(cheap), prox('VIP')] });
const EV = [{ id: 'palnorte', a: "Pa'l Norte 2027", f: '26, 27 y 28 mar 2027', ds: '2027-03-26', v: 'Parque Fundidora', st: '', sep: 300, sepCheap: 300, hotelPP: true,
  zonas: [gen(5000), prox('VIP')], cheapZonas: [gen(2900), prox('VIP')],
  multifecha: [ent('3 Días', 3, 10900, 6600, 5300), ent('2 Días', 2, 8000, 4800, 4267), ent('1 Día', 1, 5000, 2900, 3133)] },
  { id: 'unafecha', a: 'Una fecha', f: '1 feb 2027', ds: '2027-02-01', v: 'Arena Monterrey', st: '', sep: 300, sepCheap: 300, zonas: [gen(4000)], cheapZonas: [gen(2500)] }];
const C = require(L('catalogo-index.js'));
C.fetchEventosRaw = async () => EV; C.fetchHotelesGlobales = async () => ({});
const OP = require(L('opciones-paquete.js'));
(async () => {
  console.log('══ mide:pn-multi-1 ══\n[A] opciones');
  const a = await OP.opcionesPaquete('palnorte');
  af(a.ok && a.multifecha && a.fechas.length === 3 && a.paquetes.length === 0, 'sin fecha: trae las 3 fechas y CERO paquetes');
  af(a.fechas.map((f) => f.evento_id).join() === 'palnorte#0,palnorte#1,palnorte#2', 'cada fecha con su evento_id slug#N');
  const b = await OP.opcionesPaquete('palnorte', 1);
  const plus = b.paquetes.find((p) => p.paquete === 'plus');
  af(b.evento_destino === 'palnorte#1' && plus && plus.zonas.length === 1 && plus.zonas[0].precio === 8000, 'con fecha 1: PLUS General $8,000 y la VIP próximamente NO se ofrece');
  af(b.paquetes.find((p) => p.paquete === 'ride').precio === 4267, 'RIDE de 2 días = $4,267');
  const c = await OP.validarEleccion('palnorte', { paquete: 'plus', zona: 'General', hotel: 'Compartida (4)' });
  af(!c.ok && /cuántos días/.test(c.motivo), 'sin fecha_idx NO valida (no adivina la fecha)');
  const d = await OP.validarEleccion('palnorte', { paquete: 'plus', zona: 'General', hotel: 'Individual', fecha_idx: 0 });
  af(d.ok && d.precio === 10900 + 5880 && d.evento_destino === 'palnorte#0', 'Individual de 3 noches cobra 3 × $1,960 y apunta a palnorte#0: ' + d.precio);
  af(OP.totalPreventa(d.precio, 1) === d.precio - 300, 'el descuento de preventa sigue siendo lista − $300');
  const u = await OP.opcionesPaquete('unafecha');
  af(u.ok && !u.multifecha && u.paquetes.length > 0 && u.evento_destino === null, 'control: un evento de UNA fecha responde como siempre');
  const x = await OP.opcionesPaquete('palnorte', 7);
  af(!x.ok, 'una fecha que no existe se rechaza');

  console.log('[B] aplicar mueve el lugar a la fecha');
  const escrituras = [];
  const fila = { id: '11111111-1111-1111-1111-111111111111', evento_id: 'palnorte', nombre: 'Prueba', tipo_paquete: 'cheap', zona_boleto: 'Preventa a ciegas', total_contrato: 300, boletos: 1, notas: null };
  global.fetch = async (url, opt = {}) => {
    const m = (opt.method || 'GET');
    if (m === 'PATCH') { escrituras.push({ url, body: JSON.parse(opt.body) }); return { ok: true, json: async () => [Object.assign({}, fila, JSON.parse(opt.body))] }; }
    if (/viajeros_evento\?id=eq/.test(url)) return { ok: true, json: async () => [fila] };
    return { ok: true, json: async () => [], text: async () => '' };
  };
  const ZF = require(L('zona-ficha.js')); ZF.puertaZona = async () => ({ estado: 'ok', zona: 'General' });
  const CC = require(L('contrato-cliente.js')); CC.emitirContratos = async () => ({ enviados: [] });
  delete require.cache[L('preventa-aplicar.js')];
  const AP = require(L('preventa-aplicar.js'));
  const r = await AP.aplicarPaquetePreventa({ id: fila.id, paquete: 'plus', zona: 'General', total: 10600, hotel: 'Compartida (4)', evento_destino: 'palnorte#0', quien: 'careo', KH_URL: 'http://kh', KH_KEY: 'k' });
  const w = escrituras[0] || {};
  af(r.status === 200 && w.body && w.body.evento_id === 'palnorte#0', 'el PATCH muda el lugar a palnorte#0');
  af(/evento_id=eq\.palnorte&/.test(w.url || ''), 'con valor esperado: solo si sigue en palnorte (2º clic no lo mueve dos veces)');
  af(w.body && !('abonado_previo' in w.body), 'el dinero abonado NO se toca');
  af(/fecha palnorte#0/.test(w.body && w.body.notas || ''), 'el sello en notas dice a qué fecha se mudó');
  const r2 = await AP.aplicarPaquetePreventa({ id: fila.id, paquete: 'plus', zona: 'General', total: 10600, evento_destino: 'karolg#0', quien: 'careo', KH_URL: 'http://kh', KH_KEY: 'k' });
  af(r2.status === 400, 'otro evento como destino se rechaza (otro tour es otra venta)');
  console.log(`\n${R ? '🔴 ROJO' : '✅ VERDE'} · ${V} en verde · ${R} en rojo`);
  process.exit(R ? 1 : 0);
})();

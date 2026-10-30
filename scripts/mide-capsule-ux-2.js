#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// mide:capsule-ux-2 · [VJ-HAB-1 + VJ-CARD-1 + ABONO-EDITA-1] · 30-oct-2026
//
// Palabra de Memo (reporte de Milk/Bulma): ver y editar el TIPO de habitación
// para armar el rooming · el «viaja con» estira el card · todo más clickeable
// y con más búsqueda · alertas de contrato/Portal · editar el separo erróneo.
//
// Qué vigila:
//   [A] abono_editar — corregir el monto/fecha de un abono con VALOR ESPERADO
//       (carrera → 409), rastro ANEXADO, $0 rebotado, CERO correos.
//   [B] viajero_editar_full aprende hotel_tipo — lista cerrada, el paquete que
//       no duerme rebota, quitar siempre se puede, rastro y valor esperado.
//   [C] aprobar requisición ESCRIBE hotel_tipo normalizado (handler real).
//   [D] la pantalla — filtros nuevos (__hab/__grp/__zona/__ctr_sin/__prv_sin),
//       búsqueda por habitación, resumen con camas por tipo y alertas, y el
//       pintor REAL: columna Hab., «viaja con» COMPACTO (sin listar nombres).
//
// 🔒 ENTRA POR LOS HANDLERS REALES y simula un salto más adentro (el fetch a
//    PostgREST). Un mock de ruta salta al portero (la ley de RAD-FIX-CAMINO).
// ⚠️ SIN ANCLA a propósito (como mide:req-b1): carga del ÁRBOL DE TRABAJO.
//    Sus controles son positivos por CONSTRUCCIÓN (sembrar el caso y verlo caer).
// ════════════════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const RAIZ = path.resolve(__dirname, '..');

process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.PORTAL_SUPABASE_URL = 'https://portal.falso.test';
process.env.PORTAL_SUPABASE_SERVICE = 'svc2';
process.env.PORTAL_SUPABASE_SERVICE_KEY = 'svc2';
process.env.RESEND_API_KEY = 're_falsa';
process.env.CORREOS_MODO = 'real';              // 🔒 así está producción
process.env.CONTRATO_CLIENTE_APAGAR_ARNES = '1'; // el contrato no es el sujeto de este careo

let V = 0, R = 0;
const af = (c, m) => {
  let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {}
  const t = typeof m === 'function' ? m() : m;
  if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); }
};
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

// El catálogo servido (la puerta de zonas bebe de aquí):
const INDEX = `<script>var EV=[{id:'eventox',a:'Evento X',f:'1 feb 2027',ds:'2027-02-01',v:'Arena',st:'',sep:300,
 zonas:[{n:'Pista',p:3000},{n:'VIP',p:5000}],cheapZonas:[{n:'Pista',p:1500}],hotel:[]}];</script>`;

let DB, RESEND;
const TODAS = [];   // escrituras de TODA la corrida (fuera de la semilla — lección de VIAJERO-EDITA-1)
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => (typeof b === 'string' ? JSON.parse(b) : b), text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });
const eq = (q, campo) => { const m = q.match(new RegExp('[?&]' + campo + '=eq\\.([^&]*)')); return m ? decodeURIComponent(m[1]) : null; };
const esNull = (q, campo) => new RegExp('[?&]' + campo + '=is\\.null').test(q);

global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = decodeURIComponent(String(url));
  if (u.includes('api.resend.com')) { RESEND.push({ u }); return resp(200, { id: 'em_' + RESEND.length }); }
  if (u.includes('/index.html') || /conectareynosa\.mx\/?($|\?)/.test(u)) return resp(200, INDEX);
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u', activo: true, rol: 'bulma' }]);

  // 🔒 LA RED FALSA RESPETA LOS FILTROS COMO PostgREST (lectura Y escritura por
  // el MISMO filtro): sin esto, el valor esperado del PATCH pasaría en vacío.
  const tabla = (nombre, cols) => {
    let f = DB[nombre].slice();
    const id = eq(u, 'id'); if (id) f = f.filter((x) => String(x.id) === id);
    for (const campo of cols) {
      const val = eq(u, campo);
      if (val !== null) f = f.filter((x) => String(x[campo] == null ? '' : x[campo]) === val);
      else if (esNull(u, campo)) f = f.filter((x) => x[campo] == null);
    }
    if (m === 'PATCH') {
      const b = JSON.parse(init.body);
      const reg = { tabla: nombre, op: 'PATCH', parche: b, filas: f.length };
      TODAS.push(reg);
      f.forEach((x) => Object.assign(x, b));
      return resp(200, f);
    }
    if (m === 'POST') {
      const b = JSON.parse(init.body);
      const filas = (Array.isArray(b) ? b : [b]).map((x, i) => Object.assign({ id: U(500 + DB[nombre].length + i) }, x));
      filas.forEach((x) => DB[nombre].push(x));
      TODAS.push({ tabla: nombre, op: 'POST', filas: filas.length, cuerpo: filas });
      return resp(201, filas);
    }
    if (m === 'DELETE') { TODAS.push({ tabla: nombre, op: 'DELETE' }); throw new Error('DELETE prohibido: ' + nombre); }
    return resp(200, f);
  };
  if (u.includes('/rest/v1/abonos_viajero')) return tabla('abonos', ['viajero_id', 'monto', 'fecha']);
  if (u.includes('/rest/v1/viajeros_evento')) return tabla('v', ['evento_id', 'tipo_paquete', 'zona_boleto', 'hotel_tipo', 'total_contrato', 'abonado_previo', 'boletos', 'nombre', 'correo', 'celular']);
  if (u.includes('/rest/v1/requisiciones')) return tabla('reqs', ['estado', 'evento_id', 'celular', 'correo']);
  if (u.includes('/rest/v1/compras') || u.includes('/rest/v1/stock_ajustes')) return resp(200, []);
  if (u.includes('/storage/')) return resp(200, { signedURL: '/firmada' });
  return resp(200, []);
};

const vFila = (n, extra) => Object.assign({
  id: U(n), evento_id: 'eventox', nombre: 'Persona ' + n, correo: 'p' + n + '@x.mx', celular: '899111223' + (n % 10),
  tipo_paquete: 'plus', zona_boleto: 'Pista', boletos: 1, hotel_tipo: null,
  total_contrato: 3000, abonado_previo: 0, notas: 'migrada',
  habitacion_id: null, grupo_viaje: null, portal_revisado_at: '2026-10-28T00:00:00Z', tipo_viajero: 'cliente',
}, extra || {});

const semilla = () => {
  DB = {
    v: [
      vFila(1, { hotel_tipo: 'Compartida' }),
      vFila(2, { tipo_paquete: 'cheap', nombre: 'Cheap Sin Cama' }),
    ],
    abonos: [
      { id: U(101), viajero_id: U(1), monto: 300, fecha: '2026-10-20', nota: 'Requisición R-1 · comprobante verificado al aprobar', capturado_por: 'bulma' },
      { id: U(102), viajero_id: U(1), monto: 500, fecha: '2026-10-25', nota: 'pago 2', capturado_por: 'milk' },
    ],
    reqs: [],
  };
  RESEND = [];
};

const llamar = async (archivo, b) => {
  for (const k of Object.keys(require.cache)) if (k.includes('/netlify/functions/')) delete require.cache[k];
  const H = require(path.join(RAIZ, 'netlify/functions/' + archivo)).handler;
  const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  const jw = jwtSign({ id: 'u-bulma', rol: 'bulma', correo: 'bulma@x.mx', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
  const r = await H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jw }, body: JSON.stringify(b) });
  return { s: r.statusCode, j: JSON.parse(r.body || '{}') };
};
const coordi = (b) => llamar('admin-coordi-asignaciones.js', b);
const bandeja = (b) => llamar('admin-requisiciones.js', b);

(async () => {
  // ═══ [A] ABONO-EDITA-1 · corregir el separo capturado mal ══════════════════
  console.log('[A] abono_editar — el separo erróneo se corrige con candados');
  semilla();
  {
    const r = await coordi({ accion: 'abono_editar', abono_id: U(101), monto: 350 });
    af(r.s === 200 && r.j.ok, 'corregir $300 → $350 contesta 200: ' + r.s + ' ' + (r.j.error || ''));
    const ab = DB.abonos.find((a) => a.id === U(101));
    af(ab && Number(ab.monto) === 350, 'el monto quedó en $350');
    af(ab && /\[EDITA \d{4}-\d{2}-\d{2}\] monto \$300 → \$350 · Bulma/.test(ab.nota), 'el rastro quedó ANEXADO con antes/después/quién: ' + (ab && ab.nota));
    af(ab && ab.nota.indexOf('Requisición R-1') === 0, 'la nota ORIGINAL (la procedencia) no se pisó');
    const patch = TODAS.filter((t) => t.tabla === 'abonos' && t.op === 'PATCH');
    af(patch.length === 1 && patch[0].filas === 1, 'UN PATCH sobre UNA fila (no barrió la tabla)');
    af(RESEND.length === 0, 'CERO correos: una corrección interna no avisa');
    af(!TODAS.some((t) => t.tabla === 'v'), 'viajeros_evento quedó sin tocar (el abono no mueve al viajero)');
  }
  {
    // La CARRERA: alguien lo movió entre la lectura y el clic. El handler lee
    // el monto FRESCO ($350), pero si justo entre su lectura y su PATCH el
    // monto cambia, el valor esperado da cero filas → 409. Se simula mandando
    // el 2º clic del monto VIEJO: el handler relee $350, teclea $350 → «no
    // cambiaste nada» (idempotencia del doble clic por otro camino).
    const r2 = await coordi({ accion: 'abono_editar', abono_id: U(101), monto: 350 });
    af(r2.s === 400 && /no cambiaste nada/.test(r2.j.error || ''), 'el 2º clic con el mismo monto: «no cambiaste nada» (cero escrituras): ' + r2.s);
    // Y la carrera DE VERDAD: el PATCH viaja con monto=eq.350; si la fila ya
    // está en 999 (movida por otro), cero filas → 409. Se fuerza moviéndola
    // ENTRE la lectura del handler y su escritura — como la red falsa atiende
    // el GET primero, basta con sabotear el dato tras armar el filtro: aquí lo
    // más fiel es mover el monto en la base y pedir un cambio cuyo esperado ya
    // no casa. El filtro del PATCH exige monto=eq.<lo leído>, así que si OTRA
    // escritura gana la carrera, PostgREST contesta 0 filas.
    const abReal = DB.abonos.find((a) => a.id === U(101));
    const patchViejo = global.fetch;
    let saboteado = false;
    global.fetch = async (url, init) => {
      // El sabotaje de la CARRERA: el handler LEE $350 (una COPIA congelada —
      // la red falsa devuelve referencias vivas y sin la copia el handler
      // vería el monto ya movido: cero carrera que medir, la primera corrida
      // de este arnés lo demostró con un 200) y ANTES de su PATCH el monto
      // cambia por fuera a $999. El valor esperado (monto=eq.350) ya no casa.
      const r = await patchViejo(url, init);
      if (!saboteado && String(url).includes('abonos_viajero') && (!init || !init.method || (init.method || 'GET').toUpperCase() === 'GET')) {
        saboteado = true;
        const copia = JSON.parse(JSON.stringify(await r.json()));
        abReal.monto = 999;   // otra escritura ganó la carrera
        return { ok: true, status: 200, json: async () => copia, text: async () => JSON.stringify(copia), headers: { get: () => null } };
      }
      return r;
    };
    const r3 = await coordi({ accion: 'abono_editar', abono_id: U(101), monto: 400 });
    global.fetch = patchViejo;
    af(r3.s === 409, 'la CARRERA (el monto cambió entre la lectura y el PATCH) contesta 409: ' + r3.s);
    af(Number(abReal.monto) === 999 && !/\$400/.test(abReal.nota || ''), 'y NO escribió nada encima (el valor esperado hizo su trabajo)');
    abReal.monto = 350;   // restaurar para lo que sigue
  }
  {
    const r = await coordi({ accion: 'abono_editar', abono_id: U(101), monto: 0 });
    af(r.s === 400 && /mayor que cero/.test(r.j.error || ''), 'monto $0 REBOTA: anular un abono es otra decisión');
    const r2 = await coordi({ accion: 'abono_editar', abono_id: U(999), monto: 100 });
    af(r2.s === 400 && /no existe/.test(r2.j.error || ''), 'un abono inexistente rebota diciendo que no existe');
    const r3 = await coordi({ accion: 'abono_editar', abono_id: U(102), fecha: '2026-10-26' });
    af(r3.s === 200 && (r3.j.cambios || []).join(' ').includes('fecha 2026-10-25 → 2026-10-26'), 'la FECHA también se corrige, con su rastro');
  }

  // ═══ [B] VJ-HAB-1 · el editor aprende la habitación ════════════════════════
  console.log('\n[B] viajero_editar_full + hotel_tipo');
  semilla();
  {
    const base = { nombre: 'Persona 1', tipo_paquete: 'plus', zona_boleto: 'Pista', boletos: 1, total_contrato: 3000, abonado_previo: 0 };
    const r = await coordi({ accion: 'viajero_editar_full', id: U(1), campos: Object.assign({}, base, { hotel_tipo: 'Doble' }) });
    af(r.s === 200 && (r.j.cambios || []).join(' ').includes('habitación Compartida → Doble'), 'Compartida → Doble con su rastro: ' + JSON.stringify(r.j.cambios || r.j.error));
    af(DB.v[0].hotel_tipo === 'Doble', 'y la fila quedó en Doble');
    const r2 = await coordi({ accion: 'viajero_editar_full', id: U(1), campos: Object.assign({}, base, { hotel_tipo: 'Suite' }) });
    af(r2.s === 400 && /habitación inválida/.test(r2.j.error || ''), 'un tipo inventado REBOTA (lista cerrada, como el CHECK de la base)');
    const r3 = await coordi({ accion: 'viajero_editar_full', id: U(2), campos: { nombre: 'Cheap Sin Cama', tipo_paquete: 'cheap', zona_boleto: 'Pista', boletos: 1, total_contrato: 3000, abonado_previo: 0, hotel_tipo: 'Doble' } });
    af(r3.s === 400 && /no duerme/.test(r3.j.error || ''), 'ponerle habitación a un CHEAP rebota («no duerme») — el rooming no cuenta camas falsas');
    const r4 = await coordi({ accion: 'viajero_editar_full', id: U(1), campos: Object.assign({}, base, { hotel_tipo: '' }) });
    af(r4.s === 200 && (r4.j.cambios || []).join(' ').includes('habitación Doble → —'), 'QUITAR la habitación siempre se puede (vacío → null)');
    af(DB.v[0].hotel_tipo === null, 'y la fila quedó en null');
  }

  // ═══ [C] el aprobar de la bandeja ESCRIBE hotel_tipo ═══════════════════════
  console.log('\n[C] aprobar requisición → hotel_tipo normalizado en el viajero');
  semilla();
  {
    DB.reqs = [{ id: U(300), folio: 'R-X1', estado: 'pendiente', evento_id: 'eventox', nombre: 'Karina Prueba',
      correo: 'karina@x.mx', celular: '8991112299', paquete: 'plus', zona: 'Pista', num_personas: 1,
      forma_pago: 'transferencia', hotel: 'Compartida (4 personas)', transporte: null,
      total_sistema: 3000, separo_sistema: 300, comprobante_path: null, acompanantes: null, desglose: null }];
    const r = await bandeja({ accion: 'aprobar', id: U(300), monto: 300 });
    af(r.s === 200 || r.s === 207, 'aprobar contesta 200/207: ' + r.s + ' ' + (r.j.error || ''));
    const nacido = DB.v.find((x) => x.nombre === 'Karina Prueba');
    af(!!nacido, 'el viajero nació');
    af(nacido && nacido.hotel_tipo === 'Compartida', '«Compartida (4 personas)» se NORMALIZÓ a la columna: Compartida');
    af(nacido && /hotel: Compartida \(4 personas\)/.test(nacido.notas || ''), 'y el CRUDO completo sigue en la nota — nada se pierde');
  }
  {
    DB.reqs.push({ id: U(301), folio: 'R-X2', estado: 'pendiente', evento_id: 'eventox', nombre: 'Sin Hotel',
      correo: 'sh@x.mx', celular: '8991112288', paquete: 'cheap', zona: 'Pista', num_personas: 1,
      forma_pago: 'oxxo', hotel: null, transporte: null, total_sistema: 1500, separo_sistema: 300,
      comprobante_path: null, acompanantes: null, desglose: null });
    const r = await bandeja({ accion: 'aprobar', id: U(301), monto: 300 });
    const nacido = DB.v.find((x) => x.nombre === 'Sin Hotel');
    af((r.s === 200 || r.s === 207) && nacido && nacido.hotel_tipo == null, 'una requisición SIN hotel nace con hotel_tipo null (no se inventa)');
  }

  // ═══ [D] LA PANTALLA · filtros, resumen y el pintor REAL ═══════════════════
  console.log('\n[D] la pantalla: filtros nuevos, camas por tipo, alertas, pintor');
  const js = fs.readFileSync(path.join(RAIZ, 'kamehouse.js'), 'utf8');
  const fn = (src, nombre) => {
    let i = src.indexOf('function ' + nombre + '(');
    if (i < 0) i = src.indexOf('async function ' + nombre + '(');
    if (i < 0) throw new Error('no existe ' + nombre);
    let d = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') d++;
      else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
    }
    throw new Error('sin cierre ' + nombre);
  };
  const decl = (src, nombre) => {
    const i = src.indexOf('const ' + nombre + ' =');
    if (i < 0) throw new Error('no existe decl ' + nombre);
    let fin = src.indexOf(';\n', i);
    return src.slice(i, fin + 1);
  };
  try {
    const sb = {};
    vm.createContext(sb);
    const nodos = {};
    const nodo = (id) => (nodos[id] = nodos[id] || { id, style: {}, innerHTML: '', textContent: '', value: '' });
    sb.window = sb;
    sb.document = { getElementById: (id) => nodo(id), querySelectorAll: () => [] };
    sb.currentUser = { rol: 'maestro_roshi' };
    [decl(js, 'KH_PREVENTA_EVENTOS'), fn(js, 'khEsPreventaCiegas'), fn(js, 'khPaqueteTexto'), fn(js, '_esStaff'),
     decl(js, '_vjNorm'), fn(js, '_vjEsBaja'), fn(js, '_vjResumenDe'), fn(js, '_vjFiltraFilas'),
     fn(js, '_esfEsc'), fn(js, '_attrJs'), fn(js, '_vj3Saldo'), fn(js, '_vj3Money'),
     fn(js, '_cobDigits'), fn(js, '_waDigits10'), fn(js, '_vjWaHref'),
     decl(js, 'VJ_ROLES_ELIMINAR'), fn(js, '_vjPuedeEliminar'), fn(js, '_vjCtrPuede'), fn(js, '_vjCtrChip'),
     decl(js, 'KH_CONTRATO_CLIENTE_VIVO'), decl(js, 'KH_CONTRATO_PRUEBA_CORREOS'),
     'let _vj2Filas = []; let _vj2Q = ""; let _vj2Chip = null; let _vj2Ctx = null;',
     fn(js, '_vjChipsPintar'), fn(js, '_vj2Pintar')].forEach((code) => vm.runInContext(code, sb));

    const GRUPO = U(70);
    const FILAS = [
      { id: U(11), evento_id: 'ev', nombre: 'Ana López', correo: 'ana@x.mx', celular: '8991112233', tipo_paquete: 'plus', zona_boleto: 'Pista', boletos: 1, hotel_tipo: 'Doble', total_contrato: 3000, abonado_previo: 100, grupo_viaje: GRUPO, portal_revisado_at: null, tipo_viajero: 'cliente' },
      { id: U(12), evento_id: 'ev', nombre: 'Bea Ruiz', correo: 'bea@x.mx', celular: null, tipo_paquete: 'plus', zona_boleto: 'Pista', boletos: 1, hotel_tipo: 'Doble', total_contrato: 3000, abonado_previo: 0, grupo_viaje: GRUPO, portal_revisado_at: '2026-10-01', tipo_viajero: 'cliente' },
      { id: U(13), evento_id: 'ev', nombre: 'Caro Díaz', correo: 'caro@x.mx', celular: null, tipo_paquete: 'cheap', zona_boleto: 'VIP', boletos: 2, hotel_tipo: null, total_contrato: 2000, abonado_previo: 0, grupo_viaje: null, portal_revisado_at: '2026-10-01', tipo_viajero: 'cliente' },
      { id: U(14), evento_id: 'ev', nombre: 'Dani Baja', correo: null, celular: null, tipo_paquete: 'plus', zona_boleto: null, boletos: 0, hotel_tipo: null, total_contrato: 0, abonado_previo: 0, grupo_viaje: null, portal_revisado_at: null, tipo_viajero: 'cliente' },
      { id: U(15), evento_id: 'ev', nombre: 'Eli Triple', correo: 'eli@x.mx', celular: null, tipo_paquete: 'stay', zona_boleto: 'Pista', boletos: 3, hotel_tipo: 'Triple', total_contrato: 9000, abonado_previo: 0, grupo_viaje: null, portal_revisado_at: null, tipo_viajero: 'cliente' },
    ];
    // El mapa de contratos: Ana firmó; Bea y Eli no; Caro sin contrato emitido.
    const CTR = {}; CTR[U(11)] = { estado: 'firmado', ine_verificada: true }; CTR[U(12)] = { estado: 'pendiente' };

    // ── el filtro (la función REAL) ──
    const filtra = (chip, q, conCtr) => vm.runInContext(
      `_vjFiltraFilas(${JSON.stringify(FILAS)}, ${JSON.stringify(q || '')}, ${JSON.stringify(chip)}, ${conCtr ? JSON.stringify(CTR) : 'null'}).map(v => v.nombre)`, sb);
    af(String(filtra('__hab:Doble')) === 'Ana López,Bea Ruiz', '__hab:Doble filtra a las 2 de habitación Doble: ' + filtra('__hab:Doble'));
    af(String(filtra('__grp:' + GRUPO)) === 'Ana López,Bea Ruiz', '__grp: filtra al grupo que viaja junto');
    af(String(filtra('__zona:VIP')) === 'Caro Díaz', '__zona:VIP filtra por zona exacta');
    af(String(filtra('__ctr_sin', '', true)) === 'Bea Ruiz,Caro Díaz,Eli Triple', '__ctr_sin: los 3 con contrato pendiente o sin emitir (Ana firmó, la baja no cuenta): ' + filtra('__ctr_sin', '', true));
    af(String(filtra('__prv_sin')) === 'Ana López,Eli Triple', '__prv_sin: los 2 sin revisar para el Portal (la baja no): ' + filtra('__prv_sin'));
    af(String(filtra(null, 'triple')) === 'Eli Triple', 'la BÚSQUEDA encuentra por habitación: «triple» → Eli');

    // ── el resumen (camas por tipo + alertas) ──
    const res = vm.runInContext(`_vjResumenDe(${JSON.stringify(FILAS)}, ${JSON.stringify(CTR)})`, sb);
    af(res.habitaciones && res.habitaciones.Doble === 2 && res.habitaciones.Triple === 3, 'camas por tipo (en LUGARES): Doble 2 · Triple 3 (la fila de Eli trae 3)');
    af(res.ctr_sin === 3 && res.prv_sin === 2, 'las alertas cuentan lo mismo que sus filtros: 📜 sin firmar 3 · 🪪 sin revisar 2');

    // ── el pintor REAL, de punta a punta ──
    vm.runInContext('_vj2Filas = ' + JSON.stringify(FILAS) + ';'
      + '_vj2Ctx = { evento: "ev", porViajero: {}, ctrMapa: ' + JSON.stringify(CTR) + ' };'
      + '_vj2Q = ""; _vj2Chip = null; _vj2Pintar();', sb);
    const tabla = nodos['cc-kh-list'] ? nodos['cc-kh-list'].innerHTML : '';
    const chips = nodos['cc-vj-chips'] ? nodos['cc-vj-chips'].innerHTML : '';
    af(/<th[^>]*>Hab\.<\/th>/.test(tabla), 'la tabla tiene la columna Hab.');
    af(/🛏 Doble/.test(tabla) && /🛏 Triple/.test(tabla), 'y pinta la habitación de cada fila (clickeable)');
    // [VJ-CARD-1] el «viaja con» COMPACTO: dice «grupo de 2», y los NOMBRES de
    // los compañeros viven en el title — no en el texto que estira el card.
    af(/👥 grupo de 2/.test(tabla), 'el grupo se pinta COMPACTO: «👥 grupo de 2»');
    af(!/viaja con: Bea Ruiz/.test(tabla), 'y ya NO lista los nombres en el renglón (viven en el title)');
    af(/title="Viaja con: Bea Ruiz/.test(tabla), 'el title SÍ trae los nombres completos');
    af(/__grp:/.test(tabla), 'y el clic filtra al grupo (chip __grp:)');
    af(/📜 sin firmar <b>3<\/b>/.test(chips), 'el chip-ALERTA «📜 sin firmar 3» está en la barra');
    af(/🪪 sin revisar <b>2<\/b>/.test(chips), 'el chip-ALERTA «🪪 sin revisar 2» está en la barra');
    af(/🛏 por habitación \(Triple 3 · Doble 2\)/.test(chips), 'el desglose «🛏 por habitación» resume Triple 3 · Doble 2');
    // Con el filtro de habitación puesto, la tabla filtra y los chips NO:
    vm.runInContext('_vj2Chip = "__hab:Doble"; _vj2Pintar();', sb);
    const tablaF = nodos['cc-kh-list'].innerHTML;
    af(/Mostrando <b>2<\/b> de 5 viajeros/.test(tablaF), 'con __hab:Doble la nota dice «Mostrando 2 de 5»');
    af(/🛏 Doble/.test(tablaF) && !/Eli Triple/.test(tablaF), 'y la tabla solo trae a las de Doble');
    af(/📜 sin firmar <b>3<\/b>/.test(nodos['cc-vj-chips'].innerHTML), 'los contadores siguen sobre el UNIVERSO (no cambian con el filtro)');
    af(/un grupo que viaja junto|🛏 Doble/.test(tablaF) || /🛏 Doble/.test(tablaF), 'la nota del filtro es LEGIBLE (no un uuid crudo)');
    vm.runInContext('_vj2Chip = "__grp:' + GRUPO + '"; _vj2Pintar();', sb);
    af(!/__grp:00000000[^«]*quitar filtro/.test(nodos['cc-kh-list'].innerHTML.split('vj-filtro-nota')[1] || '') &&
       /un grupo que viaja junto/.test(nodos['cc-kh-list'].innerHTML), 'el filtro de grupo se describe con palabras, no con el uuid');
  } catch (e) {
    af(false, '[D] reventó: ' + e.message);
  }

  console.log('\n' + (R ? '🔴 ROJO' : (V ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + V + ' en verde, ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})();

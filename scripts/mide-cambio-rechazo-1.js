#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// mide:cambio-rechazo-1 · [CAMBIO-RECHAZO-1 + RECHAZO-EDITA-1] · 30-oct-2026
//
// Dos tuercas hermanas, nacidas de la misma pregunta de Memo:
//   A · El «No procede» de un cambio (hotel/zona/fecha/otro/pago) AVISA por
//       correo — medido: antes el motivo moría en `cambios_viajero.respuesta`
//       y el cliente jamás se enteraba.
//   B · El editor del motivo de rechazo (requisiciones) deja de BORRAR el
//       mensaje personal: el repintado de los 700 ms destruía el textarea y,
//       con chip elegido, re-decidía el texto desde la PLANTILLA.
//
// ⚠️ SIN ANCLA a propósito (como mide:rechazo-1): carga del ÁRBOL DE TRABAJO.
//    Sus controles son positivos por CONSTRUCCIÓN — se siembra el caso y se ve
//    caer — porque sin BASE no hay control positivo por commit.
// 🔒 El bloque A entra por el HANDLER REAL (admin-requisiciones) y simula un
//    salto más adentro (PostgREST + Resend). El B carga la PANTALLA REAL
//    (kamehouse-requisiciones.js) en vm con DOM falso que registra identidad
//    de nodos — así «el textarea no se destruyó» se mide por referencia.
// ════════════════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const RAIZ = path.resolve(__dirname, '..');

process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.RESEND_API_KEY = 're_falsa';
process.env.CORREOS_MODO = 'real'; // así está producción; el cero sale del flujo, no de un desvío

let V = 0, R = 0;
const af = (c, m) => {
  let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {}
  const t = typeof m === 'function' ? m() : m;
  if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); }
};
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

const INDEX = `<script>var EV=[{id:'fuerzaregida',a:'Fuerza Regida',f:'11 de diciembre',ds:'2026-12-11',v:'Arena Monterrey',st:'',inc:['Boleto'],sep:500,zonas:[{n:'Barrera',p:5500}],hotel:[]}];</script>`;

// ── la red falsa ─────────────────────────────────────────────────────────────
let DB, RESEND, CATALOGO_CAIDO = false, RESEND_FALLA = false;
const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => (typeof b === 'string' ? JSON.parse(b) : b), text: async () => (typeof b === 'string' ? b : JSON.stringify(b)), headers: { get: () => null } });
const eq = (q, campo) => { const m = q.match(new RegExp('[?&]' + campo + '=eq\\.([^&]*)')); return m ? decodeURIComponent(m[1]) : null; };

global.fetch = async (url, init) => {
  init = init || {}; const m = (init.method || 'GET').toUpperCase(); const u = decodeURIComponent(String(url));
  if (u.includes('api.resend.com')) {
    if (RESEND_FALLA) return resp(500, { message: 'Resend caído' });
    RESEND.push(JSON.parse(init.body)); return resp(200, { id: 'em_' + RESEND.length });
  }
  if (u.includes('/index.html') || /conectareynosa\.mx\/?($|\?)/.test(u)) return CATALOGO_CAIDO ? resp(500, 'caído') : resp(200, INDEX);
  if (u.includes('/rest/v1/usuarios')) return resp(200, [{ id: 'u', activo: true, rol: 'bulma' }]);
  if (u.includes('/rest/v1/viajeros_evento')) {
    if (m !== 'GET') { DB.dinero.push(['viajeros_evento', m]); return resp(200, []); }
    const id = eq(u, 'id'); return resp(200, DB.v.filter((x) => !id || x.id === id));
  }
  if (u.includes('/rest/v1/abonos_viajero')) {
    if (m !== 'GET') { DB.dinero.push(['abonos_viajero', m]); return resp(200, []); }
    return resp(200, []);
  }
  if (u.includes('/rest/v1/cambios_viajero')) {
    if (m === 'DELETE') throw new Error('DELETE prohibido');
    let f = DB.c.slice();
    const id = eq(u, 'id'); if (id) f = f.filter((x) => x.id === id);
    const est = eq(u, 'estado'); if (est) f = f.filter((x) => x.estado === est);
    if (m === 'PATCH') {
      const b = JSON.parse(init.body);
      DB.escrituras.push(['PATCH', b]);
      f.forEach((x) => Object.assign(x, b));
      return resp(200, f); // Prefer return=representation
    }
    return resp(200, f);
  }
  return resp(200, []);
};

const cambio = (n, extra) => Object.assign({
  id: U(n), viajero_id: U(100 + n), evento_id: 'fuerzaregida#0', correo: 'ana@x.mx', nombre: 'Ana López',
  tipo: 'hotel', detalle: 'Quiero habitación doble', estado: 'pendiente', respuesta: null, foto_path: null,
}, extra || {});
const semilla = () => ({
  escrituras: [], dinero: [],
  v: [{ id: U(101), nombre: 'Ana López Garza', evento_id: 'fuerzaregida#0', total_contrato: 5500, abonado_previo: 600 }],
  c: [
    cambio(1),                                                        // hotel, con correo
    cambio(2, { tipo: 'pago', viajero_id: U(101), foto_path: 'portal/x/f.jpg' }), // comprobante
    cambio(3, { tipo: 'paquete', paquete_pedido: 'plus', zona_pedida: 'Barrera' }), // el de PREVENTA-PORTAL-2
    cambio(4, { correo: null }),                                      // sin correo
    cambio(5, { tipo: 'zona' }),
  ],
});
const limpiar = () => { for (const k of Object.keys(require.cache)) if (k.includes('/netlify/functions/')) delete require.cache[k]; };
const llamar = async (b) => {
  limpiar();
  const H = require(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js')).handler;
  const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  const jw = jwtSign({ id: 'u-bulma', rol: 'bulma', correo: 'bulma@x.mx', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
  const r = await H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jw }, body: JSON.stringify(b) });
  return { s: r.statusCode, j: JSON.parse(r.body || '{}') };
};

(async () => {
  console.log('══ mide:cambio-rechazo-1 ══\n[A] el handler real: rechazar un cambio AVISA');

  // A1 · rechazar un cambio de hotel → UN correo con el motivo tal cual
  DB = semilla(); RESEND = []; CATALOGO_CAIDO = false; RESEND_FALLA = false;
  let r = await llamar({ accion: 'cambio_cerrar', id: U(1), estado: 'rechazada', respuesta: 'Ya no hay habitaciones dobles para tu fecha' });
  af(r.s === 200 && r.j.ok, 'el cierre contesta 200 ok');
  af(RESEND.length === 1, () => 'sale EXACTAMENTE un correo — ' + RESEND.length);
  af(RESEND[0] && RESEND[0].to && RESEND[0].to[0] === 'ana@x.mx', 'al correo de la fila');
  af(RESEND[0] && /Sobre tu solicitud de cambio/.test(RESEND[0].subject), () => 'asunto de cambio — ' + (RESEND[0] || {}).subject);
  af(RESEND[0] && RESEND[0].html.includes('Ya no hay habitaciones dobles para tu fecha'), 'el MOTIVO viaja TAL CUAL en el HTML impreso');
  af(RESEND[0] && /sigue tal como estaba/.test(RESEND[0].html), 'y dice que su lugar NO se movió');
  af(RESEND[0] && RESEND[0].html.includes('Fuerza Regida'), 'con el nombre del evento del catálogo');
  af(RESEND[0] && RESEND[0].html.includes('Ana'), 'saluda por su nombre');
  af(r.j.correo && r.j.correo.ok === true && r.j.correo.enviado === 'ana@x.mx', 'la bandeja se entera: correo.ok con el destinatario');
  af(DB.c[0].estado === 'rechazada' && DB.c[0].respuesta === 'Ya no hay habitaciones dobles para tu fecha', 'la fila quedó cerrada con la respuesta');

  // A2 · el comprobante rechazado tiene su propia cara
  DB = semilla(); RESEND = [];
  r = await llamar({ accion: 'cambio_cerrar', id: U(2), estado: 'rechazada', respuesta: 'La foto no se alcanza a leer' });
  af(RESEND.length === 1 && /Sobre tu comprobante de pago/.test(RESEND[0].subject), () => 'tipo pago → asunto de comprobante — ' + ((RESEND[0] || {}).subject || 'sin correo'));
  af(RESEND[0] && /súbelo de nuevo|subelo de nuevo/i.test(RESEND[0].html), 'y le dice el camino: subirlo otra vez');

  // A3 · ATENDIDA no manda correo (lo atendido se ve en su plan)
  DB = semilla(); RESEND = [];
  r = await llamar({ accion: 'cambio_cerrar', id: U(1), estado: 'atendida', respuesta: 'pasó a doble' });
  af(r.s === 200 && RESEND.length === 0, () => 'atendida (no-paquete) → CERO correos — ' + RESEND.length);

  // A4 · el tipo paquete SIGUE por su dueño (correo-paquete) — regresión
  DB = semilla(); RESEND = [];
  r = await llamar({ accion: 'cambio_cerrar', id: U(3), estado: 'rechazada', respuesta: 'Esa zona ya se agotó' });
  af(RESEND.length === 1 && /elección de paquete/.test(RESEND[0].subject), () => 'paquete rechazado → el correo de PREVENTA-PORTAL-2, no el nuevo — ' + ((RESEND[0] || {}).subject || 'sin correo'));

  // A5 · Resend caído JAMÁS tumba el cierre
  DB = semilla(); RESEND = []; RESEND_FALLA = true;
  r = await llamar({ accion: 'cambio_cerrar', id: U(1), estado: 'rechazada', respuesta: 'Ya no hay lugares' });
  af(r.s === 200 && r.j.ok && DB.c[0].estado === 'rechazada', 'con Resend caído el cambio queda cerrado igual');
  af(r.j.correo && r.j.correo.ok === false && /Resend/.test(r.j.correo.aviso || ''), 'y la bandeja lo DICE (correo.ok false con la razón)');
  RESEND_FALLA = false;

  // A6 · sin correo en la fila → se dice, no se truena
  DB = semilla(); RESEND = [];
  r = await llamar({ accion: 'cambio_cerrar', id: U(4), estado: 'rechazada', respuesta: 'No procede este cambio' });
  af(r.s === 200 && RESEND.length === 0 && r.j.correo && /sin correo/i.test(r.j.correo.aviso || ''), 'sin correo → cero envíos y el aviso manda a WhatsApp');

  // A7 · catálogo caído → el correo SALE igual (fail-soft de RECHAZO-AVISO-1,
  //      no el fail-closed de CONSUELO-VERDAD: aquí no se promete nada derivado)
  DB = semilla(); RESEND = []; CATALOGO_CAIDO = true;
  r = await llamar({ accion: 'cambio_cerrar', id: U(5), estado: 'rechazada', respuesta: 'Esa zona ya no está disponible' });
  af(RESEND.length === 1, 'catálogo ilegible → el aviso sale igual');
  af(RESEND[0] && !RESEND[0].html.includes('Fuerza Regida') && !RESEND[0].html.includes('fuerzaregida'), 'sin catálogo no se inventa el nombre NI se fuga el slug crudo');
  CATALOGO_CAIDO = false;

  // A8 · 2º clic → 409 y cero correos de más
  DB = semilla(); RESEND = [];
  await llamar({ accion: 'cambio_cerrar', id: U(1), estado: 'rechazada', respuesta: 'Ya no hay lugares' });
  const antes = RESEND.length;
  r = await llamar({ accion: 'cambio_cerrar', id: U(1), estado: 'rechazada', respuesta: 'Ya no hay lugares' });
  af(r.s === 409 && RESEND.length === antes, '2º clic → 409 y NINGÚN correo repetido');

  // A9 · motivo corto en rechazada → 400 sin escribir ni mandar
  DB = semilla(); RESEND = [];
  r = await llamar({ accion: 'cambio_cerrar', id: U(1), estado: 'rechazada', respuesta: 'no' });
  af(r.s === 400 && DB.escrituras.length === 0 && RESEND.length === 0, 'motivo de 2 letras → 400, cero escrituras, cero correos');

  // A10 · EL DINERO NO SE TOCA, por el hecho: en todo el bloque, cero
  //       escrituras a viajeros_evento/abonos_viajero. Con control positivo:
  //       el contador SÍ ve una inyectada.
  af(DB.dinero.length === 0, () => 'cero escrituras de dinero en el cierre — ' + JSON.stringify(DB.dinero));
  await global.fetch('https://kh.falso.test/rest/v1/abonos_viajero', { method: 'POST', body: '{}' });
  af(DB.dinero.length === 1, 'control positivo: el contador de dinero SÍ ve una escritura inyectada');

  // ── [B] LA PANTALLA REAL: el textarea del motivo ya no se borra ────────────
  console.log('\n[B] la pantalla real (vm + DOM falso): RECHAZO-EDITA-1');
  const fuente = fs.readFileSync(path.join(RAIZ, 'kamehouse-requisiciones.js'), 'utf8');

  // DOM falso con REGISTRO por id: asignar innerHTML des-registra los hijos
  // viejos y registra los nuevos — así «el textarea sobrevivió» se mide por
  // IDENTIDAD de nodo, que es el hecho (un nodo nuevo = foco perdido).
  const decode = (s) => String(s).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  function mkDoc() {
    const reg = new Map();
    function mkEl(id, tag) {
      const e = { id, tagName: (tag || 'div').toUpperCase(), style: { display: '' }, dataset: {}, value: '', disabled: false, textContent: '', _html: '', _kids: [] };
      Object.defineProperty(e, 'innerHTML', {
        get() { return this._html; },
        set(h) {
          this._kids.forEach((k) => reg.delete(k)); this._kids = [];
          this._html = String(h);
          const re = /<(textarea|div|button|input|iframe|details)\b[^>]*\bid="([^"]+)"[^>]*>/g; let m;
          while ((m = re.exec(this._html))) {
            const kid = mkEl(m[2], m[1]);
            if (m[1] === 'textarea') {
              const resto = this._html.slice(re.lastIndex); const fin = resto.indexOf('</textarea>');
              kid.value = decode(fin >= 0 ? resto.slice(0, fin) : '');
            }
            reg.set(m[2], kid); this._kids.push(m[2]);
          }
        },
      });
      return e;
    }
    return {
      getElementById: (id) => reg.get(id) || null,
      querySelector: () => null,
      _mk: (id) => { const e = mkEl(id); reg.set(id, e); return e; },
    };
  }

  const ID = U(9);
  const doc = mkDoc();
  doc._mk('req-rch-' + ID).style.display = 'none';
  const MOTIVOS = [
    { clave: 'zona_agotada', etiqueta: 'Zona agotada', texto: 'La zona que elegiste ya se agotó.', avisa: true },
    { clave: 'otro', etiqueta: 'Otro', texto: '', avisa: true },
  ];
  const LLAMADAS = [];
  const sandbox = {
    console, setTimeout, clearTimeout, Promise, Date, Math, JSON, Object, Array, String, Number, RegExp, Error, encodeURIComponent, decodeURIComponent,
    document: doc, window: {}, showToast: () => {}, loadRequisiciones: () => {}, loadCambiosPortal: () => {}, confirm: () => true, prompt: () => null,
    currentUser: { rol: 'bulma' }, khPaqueteTexto: () => 'PLUS',
    // el servidor falso de la pantalla: contesta el rechazo_preview con el
    // texto que le llegó IMPRESO en el html — así se mide que la previa habla
    // del texto del humano, no de la plantilla.
    khAdminFetch: async (ruta, init) => {
      const b = JSON.parse((init || {}).body || '{}'); LLAMADAS.push(b);
      let j;
      if (b.accion === 'rechazo_preview') {
        j = { ok: true, motivos: MOTIVOS, pago: false, ya_viaja: { viaja: false, comprobado: true }, wa: null,
          preview: { avisa: true, error: null, to: 'ana@x.mx', subject: 'Sobre tu reservación', html: '<b>PREVIA[' + (b.motivo || '') + ']</b>', catalogo_ok: true } };
      } else { j = { ok: true, aviso: { avisado: true, to: 'ana@x.mx' } }; }
      return { ok: true, status: 200, json: async () => j };
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const expuesto = {};
  sandbox.__exponer = (o) => Object.assign(expuesto, o);
  vm.runInContext(fuente + `
    ;__exponer({ pintar: _reqBdjRchPintar, abrir: _reqBdjRechazar, elegir: _reqBdjRchElegir,
      preview: _reqBdjRchPreview, refrescar: _reqBdjRchRefrescar, go: _reqBdjRechazarGo,
      claveDe: (id) => _reqClaveSel[id], sembrarMotivos: (id, m) => { _reqMotivos[id] = m; } });`,
    sandbox, { filename: 'kamehouse-requisiciones.vm.js' });
  const espera = () => new Promise((res) => setTimeout(res, 30));

  // B1 · abrir pinta el editor completo
  expuesto.abrir(ID); await espera();
  const t1 = doc.getElementById('req-rch-txt-' + ID);
  af(!!t1 && t1.tagName === 'TEXTAREA', 'al abrir existe el textarea del motivo');
  af(!!doc.getElementById('req-rch-prev-' + ID), 'y la vista previa vive en su PROPIO contenedor (req-rch-prev)');
  af(t1 && t1.value === '', 'nace vacío: sin chip no se inventa texto');

  // B2 · tocar un chip PRELLENA (el gesto de «dame el texto de la casa»)
  expuesto.elegir(ID, 'zona_agotada'); await espera();
  const t2 = doc.getElementById('req-rch-txt-' + ID);
  af(t2 && t2.value === 'La zona que elegiste ya se agotó.', 'el chip prellena su plantilla');
  af(expuesto.claveDe(ID) === 'zona_agotada', 'y la clave queda en el STORE, no en el DOM');

  // B3 · EL CORAZÓN: editar a mano + refresco de tecleo → el texto SOBREVIVE
  const MANUAL = 'Hola Ana, te escribo yo: tu zona se agotó pero te aparto Oro al mismo precio si me confirmas hoy.';
  t2.value = MANUAL;
  const prevAntes = doc.getElementById('req-rch-prev-' + ID);
  await expuesto.preview(ID); await espera();
  const t3 = doc.getElementById('req-rch-txt-' + ID);
  af(t3 === t2, '🔒 el textarea es EL MISMO NODO tras el refresco (no se destruyó = el foco no se va)');
  af(t3 && t3.value === MANUAL, '🔒 el mensaje personal SOBREVIVE el refresco — el defecto que Memo reportó');
  af(doc.getElementById('req-rch-prev-' + ID) === prevAntes && prevAntes.innerHTML.includes('PREVIA[' + MANUAL + ']'),
    'y la vista previa SÍ se refrescó, hablando del texto del humano');

  // B4 · control por construcción: la decisión VIEJA, con estos mismos insumos,
  //      devolvía la PLANTILLA (el borrado); el render completo de HOY conserva
  //      el manual aunque haya chip elegido.
  const sel = MOTIVOS[0]; const txtPrevio = MANUAL; const clave = 'zona_agotada';
  const decisionVieja = (txtPrevio != null && txtPrevio !== '' && clave === null) ? txtPrevio : sel.texto;
  af(decisionVieja === sel.texto && decisionVieja !== MANUAL, 'control: la línea VIEJA habría revertido a la plantilla (el bug existía)');
  await expuesto.pintar(ID, 'zona_agotada'); await espera();
  const t4 = doc.getElementById('req-rch-txt-' + ID);
  af(t4 && t4.value === MANUAL, 'incluso un repintado COMPLETO con chip elegido conserva el mensaje manual');

  // B5 · el refresco de tecleo llama a la PREVIA, no al repintado completo
  af(String(expuesto.refrescar).includes('_reqBdjRchPreview') && !String(expuesto.refrescar).includes('_reqBdjRchPintar'),
    'el oninput va a _reqBdjRchPreview (jamás al repintado que destruye el textarea)');

  // B6 · rechazar manda el texto del humano + la clave del store
  LLAMADAS.length = 0;
  await expuesto.go(ID); await espera();
  const envio = LLAMADAS.find((x) => x.accion === 'rechazar');
  af(!!envio && envio.motivo === MANUAL, 'lo que VIAJA al rechazar es el textarea (el mensaje personal)');
  af(!!envio && envio.motivo_clave === 'zona_agotada', 'con la clave del store');

  console.log(`\n══ ${R === 0 ? '✅ VERDE' : '🔴 ROJO'} · ${V} en verde · ${R} en rojo ══`);
  if (V === 0) { console.log('NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  process.exit(R === 0 ? 0 : 1);
})().catch((e) => { console.error('ARNÉS CAÍDO:', e); process.exit(1); });

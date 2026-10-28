#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// mide:rechazo-1 · [RECHAZO-AVISO-1] · 28-oct-2026
//
// Qué vigila: que rechazar AVISE, que avise lo correcto, y que las tres cosas
// que NO debe hacer sigan sin hacerse.
//
// ⚠️ SIN ANCLA a propósito (como mide:req-b1 y mide:cuadre-aplicar): carga del
//    ÁRBOL DE TRABAJO. No sufre la trampa del commit —mide lo que acabas de
//    escribir— y en cambio no puede traer control positivo POR COMMIT. Sus
//    controles son positivos por CONSTRUCCIÓN: se siembra el caso y se ve caer.
//
// 🔒 Entra por el HANDLER REAL y simula un salto más adentro (el fetch a
//    PostgREST y a Resend). Un mock de ruta saltaría al portero — esa lección
//    ya costó tres tuercas rotas en producción con el careo en verde.
// ════════════════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');

process.env.JWT_SECRET = 'secreto-de-arnes';
process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'svc';
process.env.RESEND_API_KEY = 're_falsa';
// 🔒 'real' a propósito: así está producción. En 'prueba' mediríamos un mundo
//    que no existe — «no mandó» y «mandó a otro buzón» no son lo mismo.
process.env.CORREOS_MODO = 'real';

let V = 0, R = 0;
const af = (c, m) => {
  let ok = false; try { ok = !!(typeof c === 'function' ? c() : c); } catch (_) {}
  const t = typeof m === 'function' ? m() : m;
  if (ok) { V++; console.log('  ✓ ' + t); } else { R++; console.log('  ✗ ' + t); }
};
const U = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

const INDEX = `<script>var EV=[{id:'fuerzaregida',a:'Fuerza Regida',f:'11 de diciembre',ds:'2026-12-11',v:'Arena Monterrey',st:'',inc:['Boleto'],sep:500,zonas:[{n:'Barrera',p:5500}],hotel:[]}];</script>`;

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
  if (u.includes('/rest/v1/requisiciones')) {
    if (m === 'DELETE') throw new Error('DELETE prohibido');
    let f = DB.r.slice();
    const id = eq(u, 'id'); if (id) f = f.filter((x) => x.id === id);
    const est = eq(u, 'estado'); if (est) f = f.filter((x) => x.estado === est);
    if (m === 'PATCH') {
      const b = JSON.parse(init.body);
      // 🔒 La red falsa muerde como la base: una clave fuera del CHECK rebota.
      if (Object.prototype.hasOwnProperty.call(b, 'motivo_clave') && b.motivo_clave !== null
        && !['zona_agotada', 'fecha_agotada', 'comprobante', 'datos', 'whatsapp', 'otro'].includes(b.motivo_clave)) {
        return resp(400, { code: '23514', message: 'violates check constraint requisiciones_motivo_clave_check' });
      }
      DB.escrituras.push(['PATCH', b]);
      f.forEach((x) => Object.assign(x, b));
      return resp(200, f);
    }
    return resp(200, f);
  }
  return resp(200, []);
};

const fila = (n, extra) => Object.assign({
  id: U(n), folio: 'R-TEST' + n, evento_id: 'fuerzaregida#0', evento_nombre: 'Fuerza Regida - This is Our Dream Tour',
  paquete: 'plus', zona: 'Barrera', num_personas: 2, nombre: 'Jose Pérez', correo: 'jose@x.mx', celular: '8112345678',
  comprobante_path: 'req/abc.jpg', estado: 'pendiente', motivo_rechazo: null, motivo_clave: null,
  separo_sistema: 600, total_sistema: 11000, aviso_at: null, aviso_email_id: null,
}, extra || {});
const semilla = () => ({ escrituras: [], r: [
  fila(1),                                   // pagó, con correo
  fila(2, { comprobante_path: null }),       // NO pagó
  fila(3, { correo: null }),                 // sin correo, con WhatsApp
  fila(4, { celular: null, correo: null }),  // sin nada
] });

const cargar = () => {
  for (const k of Object.keys(require.cache)) if (k.includes('/netlify/functions/')) delete require.cache[k];
  return require(path.join(RAIZ, 'netlify/functions/_lib/correo-rechazo.js'));
};
const llamar = async (b) => {
  const H = require(path.join(RAIZ, 'netlify/functions/admin-requisiciones.js')).handler;
  const { jwtSign } = require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js'));
  const jw = jwtSign({ id: 'u-bulma', rol: 'bulma', correo: 'bulma@x.mx', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);
  const r = await H({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + jw }, body: JSON.stringify(b) });
  return { s: r.statusCode, j: JSON.parse(r.body || '{}') };
};

(async () => {
  console.log('══ mide:rechazo-1 ══\n[M] el catálogo de motivos');
  let CR = cargar();
  af(CR.MOTIVOS.length === 6, () => 'son 6 motivos (los 5 de la casa + «Otro») — ' + CR.MOTIVOS.length);
  af(CR.MOTIVOS.filter((m) => m.avisa).length === 5 && CR.motivoDe('whatsapp').avisa === false,
    '5 avisan; «ya te contactamos por WhatsApp» es el ÚNICO que se calla');
  af(CR.MOTIVOS.every((m) => m.clave && m.etiqueta) && CR.MOTIVOS.filter((m) => m.clave !== 'otro').every((m) => m.texto),
    'cada motivo trae clave, etiqueta y texto prellenado (salvo «Otro», que nace vacío a propósito)');
  af(CR.avisaCon(null) === true && CR.avisaCon('no_existe') === true,
    'sin clave (fila vieja) el lado seguro es AVISAR: callarse es el defecto que vinimos a curar');
  // 🔒 Las DOS listas: la del lib y la del CHECK de la base (acta RECHAZO-AVISO-1).
  const acta = require('fs').readFileSync(path.join(RAIZ, 'migraciones/RECHAZO-AVISO-1.sql'), 'utf8');
  const enActa = (acta.match(/check \(motivo_clave is null or motivo_clave in\s*\n?\s*\(([^)]*)\)/) || [])[1] || '';
  const clavesActa = enActa.split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean).sort();
  af(clavesActa.length === 6 && clavesActa.join(',') === CR.CLAVES.slice().sort().join(','),
    () => 'el CHECK de la base trae las MISMAS 6 claves que el lib — ' + clavesActa.join(','));

  console.log('\n[R] el correo');
  const ev = { id: 'fuerzaregida', a: 'Fuerza Regida', f: '11 de diciembre', v: 'Arena Monterrey' };
  const r1 = CR.renderRechazo({ correo: 'jose@x.mx', nombre: 'Jose Pérez', folio: 'R-QEDVM', evento_id: 'fuerzaregida#0', evento_nombre: 'X', ev, paquete: 'plus', zona: 'Barrera', personas: 2, pago: true, motivo_texto: 'Ya no hay lugares en esa zona. ¿Cambiamos a la del 12?' });
  af(!r1.error && /Jose, no pudimos apartarte ese lugar/.test(r1.html), 'saluda por su primer nombre y dice de una qué pasó');
  af(/Ya no hay lugares en esa zona\. ¿Cambiamos a la del 12\?/.test(r1.html),
    'el motivo viaja TAL CUAL lo escribió quien rechaza — es lo que el cliente lee');
  af(/queda a tu favor/i.test(r1.html) && /no tienes que volver a pagar/i.test(r1.html),
    'quien pagó: su dinero queda A FAVOR (decisión de Memo, 28-oct)');
  af(/si prefieres que te lo regresemos/i.test(r1.html), 'y la salida de reembolso queda dicha, no escondida');
  // 🔒 El monto NO se dice: `separo_sistema` es lo cotizado, no lo transferido.
  af(!/\$600|\$11,000|\$ ?\d/.test(r1.html.replace(/wa\.me[^"]*/g, '')),
    'NO inventa un monto: «tu pago», nunca «tus $600» (el sistema no sabe cuánto transfirió)');
  af(/wa\.me\/528119771072/.test(r1.html) && /conectareynosa\.mx\/fuerzaregida/.test(r1.html),
    'lleva WhatsApp de reservas y el link al evento para elegir otra zona');
  af(/folio R-QEDVM/.test(r1.subject) && /Fuerza Regida/.test(r1.subject), () => 'el asunto nombra el evento y el folio — ' + r1.subject);
  const r2 = CR.renderRechazo({ correo: 'ana@x.mx', nombre: 'Ana', folio: 'R-2', evento_id: 'fuerzaregida', evento_nombre: 'X', ev, personas: 1, pago: false, motivo_texto: 'Faltan tus datos' });
  af(!/queda a tu favor/i.test(r2.html), 'quien NO pagó no recibe el bloque del dinero: lo dejaría esperando un dinero que no existe');
  af(CR.renderRechazo({ correo: 'x@x.mx', nombre: 'A', ev, motivo_texto: '' }).error, 'sin motivo NO se manda');
  af(CR.renderRechazo({ correo: 'no-es-correo', nombre: 'A', ev, motivo_texto: 'algo' }).error, 'sin correo usable NO se manda');
  af(CR.renderRechazo({ correo: 'x@x.mx', nombre: 'A', ev: null, evento_nombre: '', motivo_texto: 'algo' }).error,
    'sin saber de qué viaje es, NO se manda (ni con catálogo ni con el nombre guardado)');
  const r3 = CR.renderRechazo({ correo: 'x@x.mx', nombre: 'A', folio: 'R-3', evento_nombre: 'Fuerza Regida - Dream Tour', ev: null, personas: 1, pago: true, motivo_texto: 'algo' });
  af(!r3.error && /Fuerza Regida/.test(r3.html) && !/conectareynosa\.mx\/fuerza/.test(r3.html),
    'catálogo caído: el aviso SALE igual con el nombre guardado, sin fecha ni link (fail-soft, no es una promesa derivada)');

  console.log('\n[P] la vista previa NO escribe ni manda');
  DB = semilla(); RESEND = [];
  let r = await llamar({ accion: 'rechazo_preview', id: U(1), motivo_clave: 'zona_agotada' });
  af(r.s === 200 && r.j.preview && /Ya no tenemos lugares disponibles en la zona/.test(r.j.preview.html),
    'la vista previa trae el correo armado con el texto del motivo elegido');
  af(r.j.motivos && r.j.motivos.length === 6 && r.j.pago === true,
    'y le dice a la pantalla los 6 motivos y que esta persona SÍ pagó');
  af(DB.escrituras.length === 0 && RESEND.length === 0, 'CERO escrituras y CERO correos: enseñar no es mandar');
  af(DB.r[0].estado === 'pendiente', 'la solicitud sigue PENDIENTE después de la vista previa');

  console.log('\n[A] rechazar avisa');
  DB = semilla(); RESEND = [];
  r = await llamar({ accion: 'rechazar', id: U(1), motivo: 'Ya no hay lugar en Barrera. ¿Cambiamos a la del 12?', motivo_clave: 'zona_agotada' });
  af(r.s === 200 && DB.r[0].estado === 'rechazada', 'la solicitud queda rechazada');
  af(RESEND.length === 1 && RESEND[0].to[0] === 'jose@x.mx', () => 'y SALE UN correo a su dirección — ' + RESEND.length);
  af(/¿Cambiamos a la del 12\?/.test(RESEND[0].html), 'con el texto editado a mano, no con la plantilla');
  af(r.j.aviso && r.j.aviso.avisado === true, 'la respuesta DICE que sí se avisó');
  af(DB.r[0].motivo_clave === 'zona_agotada' && DB.r[0].motivo_rechazo === 'Ya no hay lugar en Barrera. ¿Cambiamos a la del 12?',
    'se guardan las DOS cosas: la clave (para contar) y el texto (lo que leyó)');
  af(DB.r[0].aviso_at && DB.r[0].aviso_email_id === 'em_1', 'y queda el sello de que se le avisó, con el id del correo');
  // 🔒 El sello va DESPUÉS del envío.
  const iSello = DB.escrituras.findIndex((e) => e[1] && e[1].aviso_at);
  const iRech = DB.escrituras.findIndex((e) => e[1] && e[1].estado === 'rechazada');
  af(iRech >= 0 && iSello > iRech, 'el sello se escribe DESPUÉS del rechazo y del envío, nunca antes');

  console.log('\n[C] los que NO deben recibir correo');
  DB = semilla(); RESEND = [];
  r = await llamar({ accion: 'rechazar', id: U(1), motivo: 'Resuelto por WhatsApp', motivo_clave: 'whatsapp' });
  af(r.s === 200 && DB.r[0].estado === 'rechazada' && RESEND.length === 0,
    'cierre por WhatsApp: se rechaza y NO sale correo (contradecirte con quien ya estás hablando)');
  af(r.j.aviso.avisado === false && /cierre interno/i.test(r.j.aviso.razon), 'y la bandeja lo DICE, no lo esconde');
  DB = semilla(); RESEND = [];
  r = await llamar({ accion: 'rechazar', id: U(3), motivo: 'Ya no hay lugar', motivo_clave: 'zona_agotada' });
  af(r.s === 200 && DB.r[2].estado === 'rechazada' && RESEND.length === 0, 'sin correo: la solicitud se rechaza igual');
  af(r.j.aviso.avisado === false && /wa\.me\/528112345678/.test(r.j.aviso.wa || ''),
    'y se devuelve su WhatsApp con el mensaje escrito, para avisarle a mano');
  af(/queda a tu favor/i.test(decodeURIComponent(r.j.aviso.wa || '')), 'ese WhatsApp también le dice que su pago queda a favor');
  DB = semilla(); RESEND = [];
  r = await llamar({ accion: 'rechazar', id: U(4), motivo: 'Ya no hay lugar', motivo_clave: 'zona_agotada' });
  af(r.s === 200 && r.j.aviso.avisado === false && !r.j.aviso.wa, 'sin correo NI WhatsApp: se dice que no hay por dónde');

  console.log('\n[F] el aviso jamás tumba el rechazo');
  DB = semilla(); RESEND = []; RESEND_FALLA = true;
  r = await llamar({ accion: 'rechazar', id: U(1), motivo: 'Ya no hay lugar', motivo_clave: 'zona_agotada' });
  RESEND_FALLA = false;
  af(r.s === 200 && DB.r[0].estado === 'rechazada', 'Resend caído: la solicitud QUEDA rechazada (el correo es consecuencia, no condición)');
  af(r.j.aviso.avisado === false && /rebot/i.test(r.j.aviso.razon) && r.j.aviso.wa, 'y se dice que no salió, con el WhatsApp a la mano');
  af(!DB.r[0].aviso_at, '🔒 y NO se sella: sellar sin haber mandado deja a alguien marcado como avisado');
  DB = semilla(); RESEND = []; CATALOGO_CAIDO = true;
  r = await llamar({ accion: 'rechazar', id: U(1), motivo: 'Ya no hay lugar', motivo_clave: 'zona_agotada' });
  CATALOGO_CAIDO = false;
  af(r.s === 200 && RESEND.length === 1 && r.j.aviso.avisado === true,
    'catálogo caído: el correo SALE igual (no es una promesa derivada — fail-soft a propósito)');

  console.log('\n[G] las guardas que ya estaban');
  DB = semilla(); RESEND = [];
  r = await llamar({ accion: 'rechazar', id: U(1), motivo: 'no', motivo_clave: 'zona_agotada' });
  af(r.s === 400 && DB.escrituras.length === 0 && RESEND.length === 0, 'motivo de menos de 3 letras → 400, nada se escribe ni sale');
  r = await llamar({ accion: 'rechazar', id: U(1), motivo: 'Ya no hay lugar', motivo_clave: 'porque_si' });
  af(r.s === 400 && DB.escrituras.length === 0 && RESEND.length === 0, 'clave inventada → 400 ANTES de tocar la base');
  DB = semilla(); RESEND = [];
  DB.r[0].estado = 'aprobada';
  r = await llamar({ accion: 'rechazar', id: U(1), motivo: 'Ya no hay lugar', motivo_clave: 'zona_agotada' });
  af(r.s === 409 && RESEND.length === 0, 'una que ya no está pendiente → 409 y CERO correos (nadie avisa dos veces)');
  DB = semilla(); RESEND = [];
  r = await llamar({ accion: 'rechazar', id: U(1), motivo: 'Ya no hay lugar' });
  af(r.s === 200 && RESEND.length === 1 && DB.r[0].motivo_clave === null,
    'sin clave (una pantalla vieja en caché) sigue funcionando y SÍ avisa');

  console.log('\n[U] la pantalla');
  const ui = require('fs').readFileSync(path.join(RAIZ, 'kamehouse-requisiciones.js'), 'utf8');
  af(/accion: 'rechazo_preview'/.test(ui), 'la bandeja pide la vista previa al servidor');
  af(!/_REQ_MOTIVOS\s*=/.test(ui), '⚰️ la lista vieja de 5 textos tecleados en el front MURIÓ: el dueño es el lib');
  af(/Rechazar y avisar/.test(ui), 'el botón dice lo que hace');
  af(/motivo_clave: clave/.test(ui), 'y manda la clave del motivo elegido');
  af(/Sin avisar/.test(ui) && /Avisado por correo/.test(ui),
    'un rechazo SIN avisar ya no se ve igual que uno avisado (eso dejó a 4 personas esperando)');
  af(/a\.avisado/.test(ui) && /no se le avisó/.test(ui),
    'tras rechazar, la pantalla DICE si el cliente se enteró — el rechazo y el aviso son dos hechos distintos');

  console.log('\n══ RESULTADO ══');
  if (V === 0) { console.log('⚠️ NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})().catch((e) => { console.log('💥 el arnés se cayó: ' + e.stack); process.exit(1); });

#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// mide-mig-1d-ii.js — MIG-1d-ii · el botón que INVITA al Portal, por evento
//
// Orden de Memo (1-oct-2026). 🔴 CORREOS_MODO ESTÁ EN 'real': este arnés corre
// en SECO y afirma CERO ENVÍOS — con control positivo del contador, porque un
// contador que no puede ver envíos tiene un cero que no dice nada.
//
// 🔒 LOS DOS LADOS SON COMMITS. Y commitear exige RE-ANCLAR.
// 🔒 SE ENTRA POR EL HANDLER REAL y se simula UN SALTO MÁS ADENTRO (PostgREST,
//    Resend y el catálogo). Un mock por ruta salta al portero.
// ══════════════════════════════════════════════════════════════════════════
const fs = require('fs'), os = require('os'), path = require('path');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');

let verde = 0, rojo = 0, completo = false;
const fallos = [];
function af(cond, msg) {
  let ok = false, extra = '';
  try { ok = (typeof cond === 'function') ? !!cond() : !!cond; }
  catch (e) { ok = false; extra = '  [EXCEPCIÓN: ' + e.message + ']'; }
  if (ok) { verde++; return; }
  let t; try { t = (typeof msg === 'function') ? msg() : msg; }
  catch (e) { t = '(el mensaje también reventó: ' + e.message + ')'; }
  rojo++; fallos.push(t + extra); console.log('   ✗ ' + t + extra);
}
function ver(fn) { try { const v = fn(); return v === undefined ? 'undefined' : JSON.stringify(v); } catch (e) { return '«no se pudo leer: ' + e.message + '»'; } }
function marcador() {
  console.log('\n' + '─'.repeat(46));
  if (!completo) console.log('❌ ARNÉS CAÍDO · la corrida NO llegó al final: lo de abajo NO se midió');
  if (verde + rojo === 0) { console.log('⚠️  NADA MEDIDO · cero aserciones corrieron: esto NO es un verde'); return; }
  console.log((rojo ? '❌ ROJO · ' : '✅ VERDE · ') + verde + ' en verde, ' + rojo + ' en rojo');
  fallos.slice(0, 20).forEach((f) => console.log('  · ' + f));
}
function sacar(ref, etiqueta) {
  const sha = execSync('git rev-parse ' + ref, { cwd: RAIZ, encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), etiqueta + '-' + sha.slice(0, 7) + '-'));
  execSync('git archive ' + sha + ' | tar -x -C ' + dir, { cwd: RAIZ, shell: '/bin/bash' });
  return { sha, dir };
}
const BASE = process.env.BASE || '09ac540';       // el merge de CONCILIA-1
const HEAD_SHA = process.env.HEAD_SHA || 'HEAD';

// El guardián de la trampa que esta casa paga una y otra vez: el arnés mide el
// COMMIT, no el árbol. Copiado de mide:concilia-1 (ahí se explica entero).
const MEDIDOS = ['netlify/functions/admin-portal-invitar.js', 'netlify/functions/_lib/invitacion-portal.js',
                 'ACTA-MIG-1D-II.sql'];
function avisarSiSucio() {
  let sucio = '';
  try { sucio = execSync('git status --porcelain -- ' + MEDIDOS.join(' '), { cwd: RAIZ, encoding: 'utf8' }).trim(); } catch (_) { return; }
  if (!sucio) return;
  let mismo = false;
  try {
    mismo = execSync('git rev-parse ' + HEAD_SHA, { cwd: RAIZ, encoding: 'utf8' }).trim()
         === execSync('git rev-parse HEAD', { cwd: RAIZ, encoding: 'utf8' }).trim();
  } catch (_) { mismo = false; }
  if (!mismo) return;
  console.log('\n⚠️  EL ARNÉS MIDE EL COMMIT, NO TU ÁRBOL DE TRABAJO.');
  console.log('   Estos archivos tienen cambios SIN COMMITEAR y por eso NO se están midiendo:');
  sucio.split('\n').forEach((l) => console.log('     ' + l));
  console.log('   Committea y vuelve a correr — o pasa HEAD_SHA=<sha> si quieres medir otro árbol.\n');
  process.exit(2);
}

// ── EL PADRÓN FALSO ─────────────────────────────────────────────────────────
// Cada fila mide UNA regla, y están a propósito:
const VIAJEROS = [
  // Sí recibe: puenteado y con correo bueno.
  { id: 'v1', nombre: 'Laura Mendez Rios', correo: 'Laura@Correo.com', portal_cliente_id: 'c1' },
  // 🔒 LA MISMA PERSONA, SEGUNDA FILA: es UNA invitación, no dos.
  { id: 'v1b', nombre: 'Laura Mendez Rios', correo: 'laura@correo.com', portal_cliente_id: 'c1' },
  // Sí recibe.
  { id: 'v2', nombre: 'Jorge Pineda Soto', correo: 'jorge@correo.com', portal_cliente_id: 'c2' },
  // YA INVITADO (está en la bitácora): se salta.
  { id: 'v3', nombre: 'Ya Invitado Perez', correo: 'yainvitado@correo.com', portal_cliente_id: 'c3' },
  // SIN PUENTE: no se invita — lo mandaría a un portal que no lo reconoce.
  { id: 'v4', nombre: 'Sin Puente Lopez', correo: 'sinpuente@correo.com', portal_cliente_id: null },
  // Correo con forma mala.
  { id: 'v5', nombre: 'Correo Malo Ruiz', correo: 'no-es-un-correo', portal_cliente_id: 'c5' },
  // Sin correo.
  { id: 'v6', nombre: 'Sin Correo Diaz', correo: '', portal_cliente_id: 'c6' },
];
const BITACORA = [{ correo: 'yainvitado@correo.com', evento_id: 'karolg#1', enviado_en: '2026-09-30', enviado_por: 'bulma@x', email_id: 'e0' }];
const KH_URL = 'https://npgnhsmwpcipxgvfxrho.supabase.co';
const EV_CATALOGO = { id: 'karolg', a: 'Karol G', f: '7 Nov', ds: '2026-11-07', v: 'Estadio GNP, CDMX' };

// ── LA RED FALSA ────────────────────────────────────────────────────────────
// 🔴 CUENTA LOS ENVÍOS A RESEND. Es el contador cuyo cero hay que poder creer, y
// por eso tiene control positivo más abajo: un contador que no puede ver un
// envío daría cero SIEMPRE, y su cero no diría nada.
let ENVIOS = [], ESCRITURAS = [], SIN_TABLA = false, SIN_CATALOGO = false, BITACORA_FALLA = false;
function armarRed(dir) {
  ENVIOS = []; ESCRITURAS = [];
  global.fetch = async (url, opts) => {
    const u = String(url), met = (opts && opts.method) || 'GET';
    if (u.startsWith('https://api.resend.com')) {
      ENVIOS.push(JSON.parse((opts && opts.body) || '{}'));
      return { ok: true, status: 200, json: async () => ({ id: 'em-' + ENVIOS.length }), text: async () => '' };
    }
    if (/index\.html$/.test(u)) {
      if (SIN_CATALOGO) throw new Error('la red falsa no sirve el catálogo en este escenario');
      return { ok: true, status: 200, text: async () => 'var EV=[' + JSON.stringify(EV_CATALOGO) + '];', json: async () => ({}) };
    }
    if (!u.startsWith(KH_URL)) throw new Error('la red falsa no conoce ese destino: ' + u);
    const uu = new URL(u);
    const tabla = uu.pathname.replace('/rest/v1/', '');
    if (met !== 'GET') { ESCRITURAS.push({ met, tabla, cuerpo: JSON.parse((opts && opts.body) || '{}') }); return { ok: true, status: 201, json: async () => [{ id: 'b1' }], text: async () => '' }; }
    if (tabla === 'invitaciones_portal') {
      if (SIN_TABLA) return { ok: false, status: 404, text: async () => '{"message":"Could not find the table \'public.invitaciones_portal\'"}', json: async () => ({}) };
      if (BITACORA_FALLA) return { ok: false, status: 503, text: async () => 'la base tose', json: async () => ({}) };
      return { ok: true, status: 200, json: async () => BITACORA, text: async () => '' };
    }
    if (tabla === 'viajeros_evento') return { ok: true, status: 200, json: async () => VIAJEROS, text: async () => '' };
    throw new Error('la red falsa no conoce esa tabla: ' + tabla);
  };
}
function limpiar(dir) {
  for (const f of ['admin-portal-invitar.js', '_lib/invitacion-portal.js', '_lib/correo-forma.js',
                   '_lib/correo-guard.js', '_lib/catalogo-index.js', '_lib/verify-admin.js']) {
    try { delete require.cache[require.resolve(path.join(dir, 'netlify/functions', f))]; } catch (_) {}
  }
  const va = require.resolve(path.join(dir, 'netlify/functions/_lib/verify-admin.js'));
  require.cache[va] = { id: va, filename: va, loaded: true, exports: {
    corsCheck: () => 'https://conectareynosa.mx',
    verifyAdminAuthLive: async (ev, roles) => ({ valid: true, roles, user: { id: 'u1', correo: 'bulma@x', rol: 'bulma' } }),
  } };
  process.env.SUPABASE_URL_KAMEHOUSE = KH_URL;
  process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
  process.env.RESEND_API_KEY = 'rk';
  process.env.URL = 'https://conectareynosa.mx';
  // 🔴 EL MODO DE CORREOS SE DEJA EN **REAL** A PROPÓSITO, que es como está en
  // producción desde el 31-jul. Ponerlo en 'prueba' aquí haría que el arnés
  // midiera un mundo que no existe: el cero de envíos tiene que salir del SECO,
  // no de un desvío. Es la diferencia entre «no mandó» y «mandó a otro buzón».
  process.env.CORREOS_MODO = 'real';
}

(async function main() {
  process.on('exit', marcador);
  avisarSiSucio();
  const b = sacar(BASE, 'mg-base'), h = sacar(HEAD_SHA, 'mg-head');
  console.log('BASE ' + b.sha.slice(0, 7) + '   HEAD ' + h.sha.slice(0, 7) + '\n');
  if (b.sha === h.sha) { console.log('❌ BASE y HEAD son el MISMO commit.'); process.exit(1); }

  const pedir = async (body, dir) => {
    const d0 = dir || h.dir;
    armarRed(d0); limpiar(d0);
    const mod = require(path.join(d0, 'netlify/functions/admin-portal-invitar.js'));
    const res = await mod.handler({
      httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer x' },
      body: JSON.stringify(body),
    });
    return { res, d: JSON.parse(res.body || '{}'), envios: ENVIOS.slice(), escrituras: ESCRITURAS.slice() };
  };

  // ── [I] EL INSTRUMENTO ────────────────────────────────────────────────
  console.log('[I] el instrumento');
  const srcH = fs.readFileSync(path.join(h.dir, 'netlify/functions/admin-portal-invitar.js'), 'utf8');
  af(/const ACCIONES = new Set\(\['vista_previa', 'enviar'\]\)/.test(srcH),
     'las acciones no están en `ACCIONES`: tres tuercas llegaron rotas a prod por eso');
  af(/__origin === null/.test(srcH),
     'la guarda de CORS es de dos estados: `corsCheck` devuelve `\'\'` para MISMO-ORIGEN y `null` para '
     + 'rechazado, y preguntar por falsy trata a la propia página como intrusa (el 403 de /diseno)');
  af(fs.existsSync(path.join(h.dir, 'ACTA-MIG-1D-II.sql')),
     'falta el acta con el SQL: hay SQL que correr y sin acta nadie sabría buscarlo');

  // ── [S] LA CORRIDA SECA · CERO ENVÍOS ─────────────────────────────────
  // 🔴 EL CANDADO QUE MEMO PIDIÓ: CORREOS_MODO está en real y aquí no sale un
  // solo correo.
  console.log('\n[S] la corrida seca · cero envíos');
  const rSeco = await pedir({ accion: 'enviar', evento_id: 'karolg#1' });
  console.log('    enviar sin banderas → ' + rSeco.res.statusCode + ' seco=' + ver(() => rSeco.d.seco)
    + ' envíos REALES=' + rSeco.envios.length);
  af(rSeco.res.statusCode === 200 && rSeco.d.seco === true,
     () => '🔴 `enviar` SIN banderas no corrió en SECO. El seco tiene que ser el DEFAULT: olvidar una bandera '
     + 'no puede mandar correos de verdad. Salió ' + ver(() => ({ st: rSeco.res.statusCode, seco: rSeco.d.seco })));
  af(rSeco.envios.length === 0,
     () => '🔴 LA CORRIDA SECA MANDÓ ' + rSeco.envios.length + ' CORREO(S). CORREOS_MODO está en real: esto le '
     + 'escribió a gente de verdad.');
  af(rSeco.escrituras.length === 0,
     () => 'la corrida seca ESCRIBIÓ en la base: ' + ver(() => rSeco.escrituras.map((e) => e.met + ' ' + e.tabla)));
  af(rSeco.d.enviados === 0 && rSeco.d.asentados === 0, () => 'el seco no reporta sus ceros: ' + ver(() => rSeco.d));
  af(/CORRIDA SECA/.test(rSeco.d.aviso || '') && /REAL/.test(rSeco.d.aviso || ''),
     () => 'el seco no AVISA que el modo es real: quien lo lea tiene que saber que el siguiente clic sí manda. '
     + ver(() => rSeco.d.aviso));
  af(rSeco.d.resumen && rSeco.d.resumen.modo_correos === 'real',
     () => 'la respuesta no dice en qué modo está el correo: ' + ver(() => rSeco.d.resumen));
  // Y con `seco:false` pero SIN confirmar: tampoco manda.
  const rSinConf = await pedir({ accion: 'enviar', evento_id: 'karolg#1', seco: false });
  console.log('    seco:false sin confirmar → ' + rSinConf.res.statusCode + ' envíos=' + rSinConf.envios.length);
  af(rSinConf.res.statusCode === 400 && rSinConf.envios.length === 0,
     () => '🔴 un `seco:false` SIN `confirmar:true` mandó correos: son DOS gestos a propósito. Salió '
     + rSinConf.res.statusCode + ' con ' + rSinConf.envios.length + ' envío(s)');

  // ── [+] CONTROL POSITIVO DEL CONTADOR ─────────────────────────────────
  // 🔴 SIN ESTO, EL CERO DE ARRIBA NO DICE NADA: un contador que no puede ver un
  // envío da cero siempre. Se manda de verdad (contra la red falsa) y se exige
  // que el contador lo VEA.
  console.log('\n[+] control positivo del contador de envíos');
  const rReal = await pedir({ accion: 'enviar', evento_id: 'karolg#1', seco: false, confirmar: true });
  console.log('    envío confirmado → ' + rReal.res.statusCode + ' contados=' + rReal.envios.length
    + ' reportados=' + ver(() => rReal.d.enviados));
  af(rReal.envios.length > 0,
     '🔴 CONTROL POSITIVO: con el envío confirmado el contador tenía que VER envíos. Si da cero aquí, su cero '
     + 'de la corrida seca no prueba nada — sería un contador ciego.');
  af(rReal.envios.length === 2 && rReal.d.enviados === 2,
     () => 'tenían que salir DOS (Laura y Jorge): ' + ver(() => ({ contados: rReal.envios.length, reportados: rReal.d.enviados })));
  // 🔒 UNA PERSONA, UN CORREO: Laura tiene DOS filas y recibe UNO.
  const aLaura = rReal.envios.filter((e) => JSON.stringify(e.to).includes('laura@correo.com'));
  af(aLaura.length === 1,
     () => '🔴 Laura tiene DOS filas y recibió ' + aLaura.length + ' correos: se agrupa por CORREO, no por fila. '
     + 'Mandar dos iguales el mismo día es la lección del consuelo.');
  // 🔒 Y EN MINÚSCULAS, que es la llave con la que `portal-reclamar-cuenta` enlaza.
  af(aLaura.length === 1 && JSON.stringify(aLaura[0].to) === JSON.stringify(['laura@correo.com']),
     () => '🔴 el correo no salió en MINÚSCULAS: su fila dice «Laura@Correo.com» y el enlace del Portal se hace '
     + 'por el correo en minúsculas. Cerrar el círculo por suerte no es cerrarlo. Salió ' + ver(() => aLaura[0] && aLaura[0].to));
  // La bitácora se asienta DESPUÉS, una por envío.
  const asientos = rReal.escrituras.filter((e) => e.tabla === 'invitaciones_portal');
  af(asientos.length === 2 && rReal.d.asentados === 2,
     () => 'cada envío tiene que asentarse en la bitácora: ' + ver(() => ({ asientos: asientos.length, dice: rReal.d.asentados })));
  af(asientos.every((a) => a.cuerpo.correo === a.cuerpo.correo.toLowerCase() && a.cuerpo.evento_id === 'karolg#1'),
     () => 'el asiento no lleva el correo en minúsculas y su evento: ' + ver(() => asientos.map((a) => a.cuerpo)));
  // 🔒 Δ DINERO = 0: lo único que escribe es la bitácora.
  const otras = rReal.escrituras.filter((e) => e.tabla !== 'invitaciones_portal');
  af(otras.length === 0,
     () => '🔴 escribió algo que NO es la bitácora: cero escrituras de dinero, igual que el puente. '
     + ver(() => otras.map((e) => e.met + ' ' + e.tabla)));

  // ── [Q] QUIÉN RECIBE Y QUIÉN NO, CON MOTIVO ───────────────────────────
  console.log('\n[Q] a quién invita, y por qué no a los demás');
  const vp = await pedir({ accion: 'vista_previa', evento_id: 'karolg#1' });
  const nombres = (vp.d.invitar || []).map((x) => x.correo).sort();
  console.log('    recibirían: ' + ver(() => nombres));
  console.log('    saltados: ' + ver(() => (vp.d.saltados || []).map((x) => x.nombre + ' — ' + (x.motivo || '').slice(0, 42))));
  af(JSON.stringify(nombres) === JSON.stringify(['jorge@correo.com', 'laura@correo.com']),
     () => 'la lista no es exactamente Laura y Jorge: ' + ver(() => nombres));
  af((vp.d.ya_invitados || []).some((x) => /yainvitado/.test(x.correo)),
     () => 'el YA INVITADO no se saltó: la bitácora es la llave de la idempotencia. ' + ver(() => vp.d.ya_invitados));
  const sinPuente = (vp.d.saltados || []).find((x) => /Sin Puente/.test(x.nombre || ''));
  af(sinPuente && /puente/i.test(sinPuente.motivo),
     () => '🔴 se invitaría a alguien SIN `portal_cliente_id`: lo mandaría a un portal que no lo reconoce, que es '
     + 'justo lo que el puente existe para evitar. ' + ver(() => sinPuente));
  af((vp.d.saltados || []).some((x) => /Correo Malo/.test(x.nombre || ''))
     && (vp.d.saltados || []).some((x) => /Sin Correo/.test(x.nombre || '')),
     () => 'los correos malos y ausentes no se nombran con su motivo: ' + ver(() => vp.d.saltados));
  af(vp.envios.length === 0, 'la VISTA PREVIA mandó correos');

  // ── [R] EL RENDER SE DERIVA DEL CATÁLOGO ──────────────────────────────
  // Doctrina PROMO-DERIVA: nada tecleado. Se COMPRUEBA moviendo el catálogo.
  console.log('\n[R] el render se deriva, no se teclea');
  af(vp.d.render && /Karol G/.test(vp.d.render.html) && /Karol G/.test(vp.d.render.subject),
     () => 'el render no trae el artista del catálogo: ' + ver(() => vp.d.render && vp.d.render.subject));
  af(vp.d.render && /7 Nov/.test(vp.d.render.html) && /Estadio GNP/.test(vp.d.render.html),
     'el render no trae la fecha y el lugar del catálogo');
  af(vp.d.render && /laura@correo\.com/.test(vp.d.render.html),
     'el render no dice CON QUÉ CORREO registrarse, que es la llave del enlace');
  {
    // 🔴 EL CONTROL: se MUEVE el catálogo y el render tiene que moverse con él.
    // Si no cambia, el texto estaba tecleado y el careo de arriba pasó en vacío.
    const antes = EV_CATALOGO.a, antesF = EV_CATALOGO.f;
    EV_CATALOGO.a = 'Bad Bunny'; EV_CATALOGO.f = '3 Dic';
    const vp2 = await pedir({ accion: 'vista_previa', evento_id: 'karolg#1' });
    EV_CATALOGO.a = antes; EV_CATALOGO.f = antesF;
    console.log('    con el catálogo movido → ' + ver(() => vp2.d.render && vp2.d.render.subject));
    af(vp2.d.render && /Bad Bunny/.test(vp2.d.render.subject) && /3 Dic/.test(vp2.d.render.html),
       () => '🔴 se movió el catálogo y el render NO se movió: entonces el texto está TECLEADO y lo de arriba '
       + 'pasó en vacío. El día que el evento cambie de fecha, el correo anunciaría la vieja. Salió '
       + ver(() => vp2.d.render && vp2.d.render.subject));
  }
  {
    // Y SIN catálogo NO SE MANDA: un «tu viaje» sin decir a qué se lee como spam.
    SIN_CATALOGO = true;
    const vpNc = await pedir({ accion: 'vista_previa', evento_id: 'karolg#1' });
    const enNc = await pedir({ accion: 'enviar', evento_id: 'karolg#1', seco: false, confirmar: true });
    SIN_CATALOGO = false;
    console.log('    sin catálogo → previa render=' + ver(() => vpNc.d.render)
      + ' · enviar=' + enNc.res.statusCode + ' envíos=' + enNc.envios.length);
    af(vpNc.d.render === null && typeof vpNc.d.render_error === 'string',
       () => 'sin catálogo el render tenía que salir NULO y DICHO, no a medias: ' + ver(() => vpNc.d.render));
    af(enNc.res.statusCode === 400 && enNc.envios.length === 0,
       () => '🔴 se mandó un correo SIN saber de qué evento habla: ' + enNc.envios.length + ' envío(s)');
  }

  // ── [B] LA BITÁCORA AUSENTE O ILEGIBLE: SE RINDE ──────────────────────
  // 🔴 El caso más peligroso de todos: sin bitácora, «a quién ya invité» no tiene
  // respuesta, y seguir sería mandar repetidos.
  console.log('\n[B] sin bitácora no se invita a nadie');
  for (const [etiq, prender] of [['la tabla NO EXISTE', () => { SIN_TABLA = true; }], ['la base TOSE', () => { BITACORA_FALLA = true; }]]) {
    prender();
    const rb = await pedir({ accion: 'enviar', evento_id: 'karolg#1', seco: false, confirmar: true });
    SIN_TABLA = false; BITACORA_FALLA = false;
    console.log('    ' + etiq + ' → ' + rb.res.statusCode + ' ' + (rb.d.codigo || '') + ' envíos=' + rb.envios.length);
    af(rb.res.statusCode >= 500 && rb.envios.length === 0,
       () => '🔴 con «' + etiq + '» se mandaron ' + rb.envios.length + ' correo(s): «no sé a quién ya invité» no '
       + 'es «a nadie», y la diferencia son correos repetidos que no se deshacen');
    af(/BITACORA|SIN_BITACORA/.test(rb.d.codigo || ''), () => 'el código no nombra la bitácora: ' + ver(() => rb.d.codigo));
  }
  {
    SIN_TABLA = true;
    const rb = await pedir({ accion: 'enviar', evento_id: 'karolg#1' });
    SIN_TABLA = false;
    af(/ACTA-MIG-1D-II\.sql/.test(rb.d.error || ''),
       () => 'con la tabla ausente el mensaje no manda al SQL: un registro que nadie sabría buscar es registro '
       + 'muerto. Salió ' + ver(() => rb.d.error));
  }

  // ── [T] NO EXISTE «INVITAR A TODOS», Y EL TOPE ────────────────────────
  console.log('\n[T] sin evento no hay invitación · y el tope por clic');
  const rSinEv = await pedir({ accion: 'enviar', seco: false, confirmar: true });
  console.log('    sin evento_id → ' + rSinEv.res.statusCode + ' ' + (rSinEv.d.codigo || '') + ' envíos=' + rSinEv.envios.length);
  af(rSinEv.res.statusCode === 400 && rSinEv.envios.length === 0 && rSinEv.d.codigo === 'FALTA_EVENTO',
     () => '🔴 sin `evento_id` mandó correos: no existe «invitar a todos» a propósito — dalemix metería ~156 de '
     + 'golpe. Salió ' + rSinEv.res.statusCode);
  {
    // El tope: se siembran 61 puenteados y el clic se rehúsa DICIENDO cuántos.
    const guardado = VIAJEROS.slice();
    for (let i = 0; i < 61; i++) VIAJEROS.push({ id: 'm' + i, nombre: 'Masivo ' + i, correo: 'masivo' + i + '@correo.com', portal_cliente_id: 'cm' + i });
    const rTope = await pedir({ accion: 'enviar', evento_id: 'karolg#1', seco: false, confirmar: true });
    VIAJEROS.length = 0; guardado.forEach((v) => VIAJEROS.push(v));
    console.log('    63 personas → ' + rTope.res.statusCode + ' ' + (rTope.d.codigo || '') + ' envíos=' + rTope.envios.length);
    af(rTope.res.statusCode === 400 && rTope.envios.length === 0 && rTope.d.codigo === 'DEMASIADOS',
       () => '🔴 un clic mandó más que el tope: «el primer evento real va CHICO» es orden de Memo, y que un clic '
       + 'mande 156 correos no puede ser un accidente. Salió ' + rTope.res.statusCode + ' con ' + rTope.envios.length);
    af(/\d+/.test(rTope.d.error || '') && /tope/i.test(rTope.d.error || ''),
       () => 'el rechazo no dice CUÁNTOS son ni cuál es el tope: ' + ver(() => rTope.d.error));
  }

  // ── [E] EL REENVÍO EXPLÍCITO ──────────────────────────────────────────
  console.log('\n[E] el reenvío, solo si se pide');
  const rRe = await pedir({ accion: 'vista_previa', evento_id: 'karolg#1', reenviar: true });
  console.log('    reenviar:true → recibirían ' + ver(() => (rRe.d.invitar || []).length));
  af((rRe.d.invitar || []).some((x) => /yainvitado/.test(x.correo)),
     () => 'con `reenviar:true` el ya-invitado tenía que volver a la lista: ' + ver(() => (rRe.d.invitar || []).map((x) => x.correo)));
  af(rRe.d.resumen && rRe.d.resumen.reenviar === true, 'la respuesta no dice que va en modo reenvío');

  // ── [F] EL FLUJO CIERRA: puente → invitación → registro → plan ────────
  // 🔒 No se mide «existe el archivo»: se mide que la LLAVE sea la misma en los
  // cuatro pasos. Si el puente guarda minúsculas y la invitación manda otra
  // forma, el cliente se registra y el Portal no lo reconoce — y eso se vería
  // como un problema del cliente.
  console.log('\n[F] el flujo entero cierra por la MISMA llave');
  const srcPuente = fs.readFileSync(path.join(h.dir, 'netlify/functions/admin-portal-puente.js'), 'utf8');
  const srcRecl = fs.readFileSync(path.join(h.dir, 'netlify/functions/portal-reclamar-cuenta.js'), 'utf8');
  const srcPlan = fs.readFileSync(path.join(h.dir, 'netlify/functions/portal-mi-plan-migrado.js'), 'utf8');
  const srcLib = fs.readFileSync(path.join(h.dir, 'netlify/functions/_lib/invitacion-portal.js'), 'utf8');
  af(/llaveCorreo/.test(srcPuente) && /llaveCorreo/.test(srcLib),
     'el puente y la invitación no usan la MISMA `llaveCorreo`: dos reglas de correo esperando a divergir');
  af(/toLowerCase\(\)/.test(srcRecl),
     '`portal-reclamar-cuenta` ya no enlaza por el correo en minúsculas: la llave del flujo cambió');
  // ⚠️ MI PRIMERA ASERCIÓN AQUÍ ASUMIÓ EL MECANISMO en vez de leerlo: dije que el
  // último paso enlaza por `portal_cliente_id` y **no es así**. Resuelve por el
  // CORREO VERIFICADO del JWT, en minúsculas, contra `viajeros_evento.correo`.
  // Corregida a la verdad — y la verdad es más estricta, porque hace que la
  // minúscula sea la llave de los CUATRO pasos, no de tres.
  af(/viajeros_evento\?correo=eq\./.test(srcPlan) && /toLowerCase\(\)/.test(srcPlan),
     '`portal-mi-plan-migrado` ya no busca el plan por `viajeros_evento?correo=eq.<minúsculas>`: la llave del '
     + 'cuarto paso cambió, y con ella la razón por la que la invitación manda el correo en minúsculas');

  // ── 🔴 EL HOYO QUE SALIÓ DE LEERLO: el `eq` es SENSIBLE A MAYÚSCULAS ────
  // Una fila guardada como «Laura@Correo.com» no la encuentra un JWT
  // «laura@correo.com». La persona se registra, el Portal la enlaza y su plan sale
  // VACÍO — con nuestro correo diciendo «ya puedes ver tu plan». Esta tuerca no lo
  // arregla (es un UPDATE a datos de gente) pero NO PUEDE CALLARLO.
  console.log('\n[¡] el ojo del plan vacío · el correo con mayúsculas en la fila');
  const ojo = (vp.d.ojo_plan_vacio || []);
  console.log('    marcados: ' + ver(() => ojo.map((x) => x.correo + ' — ' + (x.ojo_plan_vacio || '').slice(0, 50))));
  af(ojo.length === 1 && /laura/.test(ojo[0].correo),
     () => '🔴 Laura tiene UNA fila guardada como «Laura@Correo.com» y el reporte no la marca. '
     + '`portal-mi-plan-migrado` busca con `eq` EXACTO en minúsculas: esa fila es invisible para ella, así que '
     + 'vería su viaje incompleto — y el correo que le mandamos dice que ya puede verlo. Salió ' + ver(() => ojo));
  af(ojo.length === 1 && Array.isArray(ojo[0].filas_invisibles) && ojo[0].filas_invisibles.includes('v1'),
     () => 'no se NOMBRA la fila invisible: sin el id, el humano no sabe cuál arreglar. ' + ver(() => ojo[0]));
  af(ojo.length === 1 && /incompleto/i.test(ojo[0].ojo_plan_vacio || ''),
     () => 'Laura tiene UNA fila buena y UNA mala, así que su caso es «vería su viaje INCOMPLETO», no «plan '
     + 'vacío»: los dos casos se arreglan igual pero NO se explican igual. ' + ver(() => ojo[0].ojo_plan_vacio));
  af(vp.d.resumen && vp.d.resumen.ojo_plan_vacio === 1,
     () => 'el resumen no cuenta el montón del ojo: es lo que Memo mira antes del primer envío. ' + ver(() => vp.d.resumen));
  {
    // 🔒 CONTROL: si TODAS las filas de alguien están en mayúsculas, el aviso
    // tiene que decir «VACÍO», no «incompleto». Dos casos, dos frases.
    const guardado = VIAJEROS.slice();
    VIAJEROS.push({ id: 'vM', nombre: 'Todo Mayus Perez', correo: 'TODO@Correo.com', portal_cliente_id: 'cM' });
    const vpM = await pedir({ accion: 'vista_previa', evento_id: 'karolg#1' });
    VIAJEROS.length = 0; guardado.forEach((v) => VIAJEROS.push(v));
    const soloMayus = (vpM.d.ojo_plan_vacio || []).find((x) => /todo@correo/.test(x.correo));
    console.log('    todo en mayúsculas → ' + ver(() => soloMayus && soloMayus.ojo_plan_vacio.slice(0, 60)));
    af(soloMayus && /VACÍO/.test(soloMayus.ojo_plan_vacio),
       () => 'con TODAS sus filas en mayúsculas el aviso tenía que decir que su plan saldría VACÍO: '
       + ver(() => soloMayus && soloMayus.ojo_plan_vacio));
  }
  {
    const { llaveCorreo } = require(path.join(h.dir, 'netlify/functions/_lib/correo-forma.js'));
    af(llaveCorreo('Laura@Correo.com') === 'laura@correo.com',
       () => 'la llave del correo no normaliza a minúsculas: ' + ver(() => llaveCorreo('Laura@Correo.com')));
  }

  // ── [C] CONTROL POSITIVO · en BASE esto NO EXISTÍA ────────────────────
  console.log('\n[C] control positivo · BASE');
  const hay = fs.existsSync(path.join(b.dir, 'netlify/functions/admin-portal-invitar.js'));
  console.log('    BASE trae el botón de invitar: ' + hay);
  af(!hay, 'CONTROL POSITIVO: en BASE no podía existir el botón — si ya estaba, esta tuerca no lo agrega');

  completo = true;
  process.exit(rojo ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN DEL ARNÉS: ' + e.stack); process.exit(1); });

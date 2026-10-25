#!/usr/bin/env node
/* [RADIO-V2a · 24-oct-2026] LA PARRILLA DE RADIO CONECTA.
 * Dos mitades: [A] el dueño (_lib/radio-cartelera) con RELOJ INYECTADO — las
 * fechas del fixture son instantes UTC convertidos por la lib a pared de
 * Reynosa, con el caso del CAMBIO DE HORARIO que caza un huso tecleado (la ley
 * de la Nube) — y [B] los dos handlers REALES con red falsa que respeta
 * filtros y guarda estado (las 4 leyes de la base de mentira).
 * ⚠️ SIN ANCLA a propósito (árbol de trabajo). */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

process.env.SUPABASE_URL_KAMEHOUSE = 'https://kh.falso.test';
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'service-falsa';
process.env.JWT_SECRET = 'secreto-del-arnes';

let ok = 0, ko = 0;
const af = (c, m) => { try { c = typeof c === 'function' ? c() : c; } catch (e) { c = false; m += ' · EXC: ' + e.message; } if (c) { ok++; console.log('  ✓ ' + m); } else { ko++; console.log('  ✗ ' + m); } };

const L = require(path.join(RAIZ, 'netlify/functions/_lib/radio-cartelera.js'));

console.log('[A] el dueño, con el reloj inyectado');
// HECHOS del calendario (verificables): el 27-oct-2026 es MARTES y Reynosa va
// en CDT (UTC-5); el horario de verano termina el 1-nov-2026 y el 3-nov-2026
// (martes) Reynosa ya va en CST (UTC-6).
const SEM = { id: 'p1', nombre: 'La Hora Conecta', dia_semana: 2, hora_inicio: '20:00', hora_fin: '22:00', activo: true, archivado: false };
const t2030 = Date.UTC(2026, 9, 28, 1, 30);   // = mar 27-oct-2026 20:30 en Reynosa (CDT)
let r = L.alAireYSiguiente([SEM], t2030);
af(r.al_aire && r.al_aire.nombre === 'La Hora Conecta' && r.al_aire.tipo === 'semanal', 'martes 20:30: el semanal de martes 20-22 está AL AIRE');
af(r.siguiente && r.siguiente.empieza_en_min === 7 * 1440 - 30, 'y el siguiente es el de la próxima semana, con sus minutos exactos');

const t1900 = Date.UTC(2026, 9, 28, 0, 0);    // = mar 27-oct-2026 19:00 (CDT)
r = L.alAireYSiguiente([SEM], t1900);
af(r.al_aire === null, 'a las 19:00 nada está al aire (un hueco no se inventa)');
af(r.siguiente && r.siguiente.empieza_en_min === 60, 'y el siguiente empieza en 60 minutos');

const ESP = { id: 'e1', nombre: 'Entrevista Especial', fecha: '2026-10-27', hora_inicio: '20:30', hora_fin: '21:30', activo: true, archivado: false };
r = L.alAireYSiguiente([SEM, ESP], t2030);
af(r.al_aire && r.al_aire.tipo === 'especial' && r.al_aire.nombre === 'Entrevista Especial', 'LO ESPECÍFICO GANA: el especial de la fecha pisa al semanal, rotulado');

// 🔒 EL CAMBIO DE HORARIO: mar 3-nov-2026 20:30 en Reynosa ya es CST (UTC-6) =
// 02:30Z del 4-nov. Con un «-5» tecleado la pared saldría 21:30 y este
// programa de 20-21 quedaría FUERA — la aserción caza el huso de mano.
const CORTO = { id: 'p2', nombre: 'Programa Corto', dia_semana: 2, hora_inicio: '20:00', hora_fin: '21:00', activo: true, archivado: false };
r = L.alAireYSiguiente([CORTO], Date.UTC(2026, 10, 4, 2, 30));
af(r.al_aire && r.al_aire.nombre === 'Programa Corto', 'tras el cambio de horario (CST) el martes 20:30 sigue siendo martes 20:30 — el huso se DERIVA');

r = L.alAireYSiguiente([{ ...SEM, activo: false }, { ...ESP, archivado: true }], t2030);
af(r.al_aire === null && r.siguiente === null, 'inactivo y archivado no salen al aire ni como siguiente');

const par = L.parrilla([SEM, CORTO, ESP, { ...ESP, id: 'e2', nombre: 'Lejano', fecha: '2026-11-20' }], t1900, 14);
af(par.semanales.length === 2 && par.semanales[0].hora_inicio === '20:00' && par.semanales.every((p) => p.dia_nombre === 'martes'), 'la parrilla semanal sale ordenada con su día en palabras');
af(par.especiales.length === 1 && par.especiales[0].nombre === 'Entrevista Especial', 'los especiales de la ventana entran; el de 24 días queda fuera');

console.log('\n[B] los handlers REALES, por la puerta');
const PROGS = [];
function redNueva() {
  const st = { escrituras: 0, deletes: 0, objetos: {} };
  st.fetch = async (url, init) => {
    const U = String(url); const met = ((init || {}).method || 'GET').toUpperCase();
    const resp = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
    // [RADIO-V2a2] El bucket de fotos: guarda estado (las 4 leyes de la base de mentira).
    if (U.includes('/storage/v1/object/radio-programas/')) {
      const p = U.split('/storage/v1/object/radio-programas/')[1];
      if (met === 'POST') { st.objetos[p] = (init.body && init.body.length) || 0; return resp(200, { Key: p }); }
      if (met === 'DELETE') { delete st.objetos[p]; return resp(200, {}); }
    }
    // [RADIO-V2a2] DELETE existe SOLO sobre radio_programas (eliminar, deliberado);
    // cualquier otro DELETE sigue siendo un 405 que el careo contaría como ajeno.
    if (met === 'DELETE' && U.includes('/rest/v1/radio_programas')) {
      st.deletes++;
      const m = decodeURIComponent(U).match(/id=eq\.([\w-]+)/);
      const i = PROGS.findIndex((x) => x.id === (m && m[1]));
      if (i < 0) return resp(200, []);
      return resp(200, [PROGS.splice(i, 1)[0]]);
    }
    if (met === 'DELETE') { st.deletesAjenos = (st.deletesAjenos || 0) + 1; return resp(405, {}); }
    if (U.includes('/rest/v1/usuarios') && met === 'GET') {
      const m = decodeURIComponent(U).match(/id=eq\.([\w-]+)/);
      const us = { 'u-memo': { id: 'u-memo', rol: 'maestro_roshi', activo: true, nombre: 'Memo' },
                   'u-b': { id: 'u-b', rol: 'bulma', activo: true, nombre: 'Bulma' } };
      return resp(200, m && us[m[1]] ? [us[m[1]]] : []);
    }
    if (U.includes('sesion')) throw new Error('sesion-viva apagada (fail-open)');
    if (U.includes('/rest/v1/radio_programas')) {
      if (st.caida) return resp(500, { message: 'se cayó' });
      if (met === 'GET') {
        // La base de mentira RESPETA los filtros al leer (la primera ley):
        // un GET por id que devolviera la tabla entera haría que «eliminar»
        // barriera la foto del programa equivocado.
        const m = decodeURIComponent(U).match(/id=eq\.([\w-]+)/);
        let filas = m ? PROGS.filter((p) => p.id === m[1]) : PROGS;
        if (U.includes('archivado=is.false')) filas = filas.filter((p) => !p.archivado);
        return resp(200, filas);
      }
      if (met === 'POST') {
        st.escrituras++;
        const fila = { id: '00000000-0000-4000-8000-00000000000' + (PROGS.length + 1), archivado: false, ...JSON.parse(init.body) };
        PROGS.push(fila);
        return resp(201, [fila]);
      }
      if (met === 'PATCH') {
        st.escrituras++;
        const m = decodeURIComponent(U).match(/id=eq\.([\w-]+)/);
        const p = PROGS.find((x) => x.id === (m && m[1]));
        if (!p) return resp(200, []);           // PostgREST: PATCH sin filas = 200 con []
        Object.assign(p, JSON.parse(init.body));
        return resp(200, [p]);
      }
    }
    return resp(404, {});
  };
  return st;
}
function H() {
  Object.keys(require.cache).forEach((k) => { if (k.includes('netlify/functions') || k.includes('netlify\\functions')) delete require.cache[k]; });
  return { admin: require(path.join(RAIZ, 'netlify/functions/admin-radio-cartelera.js')).handler,
           pub: require(path.join(RAIZ, 'netlify/functions/radio-cartelera.js')).handler,
           jwtSign: require(path.join(RAIZ, 'netlify/functions/_lib/verify-admin.js')).jwtSign };
}
const ev = (body, tok) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) });

(async function main() {
  const red = redNueva(); global.fetch = red.fetch;
  const { admin, pub, jwtSign } = H();
  const roshi = jwtSign({ id: 'u-memo', rol: 'maestro_roshi', nombre: 'Memo' }, process.env.JWT_SECRET, 3600);
  const bulma = jwtSign({ id: 'u-b', rol: 'bulma', nombre: 'Bulma' }, process.env.JWT_SECRET, 3600);

  let r = await admin(ev({ accion: 'crear', programa: { nombre: 'X', dia_semana: 2, hora_inicio: '20:00', hora_fin: '22:00' } }, bulma));
  af(r.statusCode === 403, 'la cartelera es SOLO de Memo: bulma rebota 403');

  r = await admin(ev({ accion: 'crear', programa: { nombre: 'Doble', dia_semana: 2, fecha: '2026-11-03', hora_inicio: '20:00', hora_fin: '22:00' } }, roshi));
  af(r.statusCode === 400 && /exactamente uno/i.test(JSON.parse(r.body).error), 'día Y fecha a la vez → 400 con palabras (el CHECK no llega a hablar)');
  r = await admin(ev({ accion: 'crear', programa: { nombre: 'Sin cuándo', hora_inicio: '20:00', hora_fin: '22:00' } }, roshi));
  af(r.statusCode === 400, 'ni día ni fecha → 400 (DEFAULTS-1: el cuándo no se inventa)');
  r = await admin(ev({ accion: 'crear', programa: { nombre: 'Al revés', dia_semana: 2, hora_inicio: '22:00', hora_fin: '20:00' } }, roshi));
  af(r.statusCode === 400 && /medianoche/.test(JSON.parse(r.body).error), 'fin ≤ inicio → 400 que explica cómo capturar el cruce de medianoche');

  r = await admin(ev({ accion: 'crear', programa: { nombre: 'La Hora Conecta', conductor: 'Memo', dia_semana: 2, hora_inicio: '20:00', hora_fin: '22:00', descripcion: 'Estrenos y tours' } }, roshi));
  af(r.statusCode === 200 && JSON.parse(r.body).programa && PROGS.length === 1, 'crear escribe UN INSERT (sin on_conflict) y contesta el programa');

  r = await admin(ev({ accion: 'editar', id: '00000000-0000-4000-8000-000000000099', programa: { nombre: 'Nadie', dia_semana: 1, hora_inicio: '10:00', hora_fin: '11:00' } }, roshi));
  af(r.statusCode === 404, 'editar un id que no existe → 404, no un 200 vacío');
  r = await admin(ev({ accion: 'archivar', id: PROGS[0].id, archivado: true }, roshi));
  af(r.statusCode === 200 && PROGS[0].archivado === true, 'archivar marca la fila (la fila es el acta: jamás se borra)');
  // ⚰️ [RADIO-V2a2] La aserción «CERO DELETEs en el archivo» se RETIRÓ con razón:
  // Memo pidió eliminar de verdad (la cartelera es contenido, no dinero). Lo que
  // queda vigilado: crear/editar/archivar jamás borran, y eliminar va con candado ([C]).
  af(red.deletes === 0, 'crear/editar/archivar no mandaron ni un DELETE');

  // El público: siembra un programa cubriendo AHORA (la pared se la pedimos al DUEÑO).
  PROGS[0].archivado = false;
  const pared = L.paredReynosa(Date.now());
  PROGS[0].dia_semana = pared.dow; PROGS[0].fecha = null;
  PROGS[0].hora_inicio = '00:00'; PROGS[0].hora_fin = '23:59';
  r = await pub({ httpMethod: 'GET', headers: {} });
  let b = JSON.parse(r.body);
  af(r.statusCode === 200 && b.ok === true && b.al_aire && b.al_aire.nombre === 'La Hora Conecta', 'el público contesta la parrilla con el AL AIRE de ahora');
  af(/s-maxage/.test(r.headers['Cache-Control'] || ''), 'y con caché de CDN (la portada de la radio lo pide en cada visita)');
  red.caida = true;
  r = await pub({ httpMethod: 'GET', headers: {} });
  b = JSON.parse(r.body);
  af(r.statusCode === 502 && b.ok === false && (r.headers['Cache-Control'] || '') === 'no-store', 'la base caída contesta 502 ok:false SIN caché — un 200 vacío diría «no hay programas» (cero falso)');
  red.caida = false;
  r = await pub({ httpMethod: 'GET', headers: { origin: 'https://malo.example' } });
  af(r.statusCode === 403, 'un Origin ajeno rebota 403; el GET same-origin de /radio pasa');

  console.log('\n[C] RADIO-V2a2: fin LIBRE · la foto · eliminar');
  // El fin libre en la LIB: mar 27-oct-2026 a las 23:30 (CDT) un programa de
  // 20:00 SIN fin sigue al aire — cubre hasta el cierre del día; a las 19:00 no.
  const LIBRE = { id: 'p3', nombre: 'Programa Libre', dia_semana: 2, hora_inicio: '20:00', hora_fin: null, activo: true, archivado: false };
  let rl = L.alAireYSiguiente([LIBRE], Date.UTC(2026, 9, 28, 4, 30));
  af(rl.al_aire && rl.al_aire.nombre === 'Programa Libre' && rl.al_aire.hora_fin === null, 'SIN hora de fin el programa sigue AL AIRE a las 23:30 (se extiende hasta el cierre del día) y el fin viaja como null, no como «00:00»');
  af(L.alAireYSiguiente([LIBRE], Date.UTC(2026, 9, 28, 0, 0)).al_aire === null, 'pero a las 19:00 todavía no — el inicio sigue mandando');

  r = await admin(ev({ accion: 'crear', programa: { nombre: 'Maratón', dia_semana: 5, hora_inicio: '20:00', hora_fin: '' } }, roshi));
  af(r.statusCode === 200 && PROGS[PROGS.length - 1].hora_fin === null, 'crear con el fin VACÍO pasa: cierre libre (hora_fin null en la fila)');

  // La foto: JPEG por MAGIA DE BYTES sube y queda en el programa; texto disfrazado no.
  const JPEG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64');
  r = await admin(ev({ accion: 'crear', programa: { nombre: 'Con Foto', dia_semana: 3, hora_inicio: '10:00', hora_fin: '12:00' }, foto_b64: JPEG }, roshi));
  let bb = JSON.parse(r.body);
  af(r.statusCode === 200 && /radio-programas\/programas\//.test((bb.programa || {}).foto_url || ''), 'la foto JPEG sube al bucket público y su URL queda en el programa');
  af(Object.keys(red.objetos).length === 1, 'y el bucket tiene exactamente UN objeto');
  r = await admin(ev({ accion: 'crear', programa: { nombre: 'Foto Mala', dia_semana: 4, hora_inicio: '10:00', hora_fin: '12:00' }, foto_b64: Buffer.from('hola, soy texto plano').toString('base64') }, roshi));
  bb = JSON.parse(r.body);
  af(r.statusCode === 200 && bb.ok === true && bb.foto_error && bb.programa && !bb.programa.foto_url, '🔒 lo que no es imagen (magia de bytes, no el nombre) se rechaza DICIÉNDOLO — y el programa queda: la foto jamás tumba el programa');

  // Eliminar: el candado vive en el SERVIDOR (confirmar:true o cero escrituras).
  const antes = PROGS.length;
  r = await admin(ev({ accion: 'eliminar', id: PROGS[0].id }, roshi));
  af(r.statusCode === 400 && PROGS.length === antes && red.deletes === 0, '🔒 eliminar SIN confirmar:true → 400 con CERO escrituras (esconder el botón no basta)');
  r = await admin(ev({ accion: 'eliminar', id: PROGS[0].id, confirmar: true }, roshi));
  af(r.statusCode === 200 && PROGS.length === antes - 1, 'con confirmar la fila SE VA de verdad — la cartelera es contenido, no dinero');
  r = await admin(ev({ accion: 'eliminar', id: '00000000-0000-4000-8000-000000000099', confirmar: true }, roshi));
  af(r.statusCode === 404, 'eliminar un id que no existe → 404, no un 200 vacío');
  const conFoto = PROGS.find((x) => x.foto_url);
  r = await admin(ev({ accion: 'eliminar', id: conFoto.id, confirmar: true }, roshi));
  af(r.statusCode === 200 && Object.keys(red.objetos).length === 0, 'y eliminar al de la foto barre su objeto del bucket (cero huérfanas)');
  af(!red.deletesAjenos, 'ningún DELETE viajó a una tabla que no fuera radio_programas (ni a dinero, ni a nada)');

  console.log('\n' + (ko ? '🔴 ROJO' : (ok ? '✅ VERDE' : 'NADA MEDIDO · esto NO es un verde')) + ' · ' + ok + ' en verde, ' + ko + ' en rojo');
  process.exit(ko ? 1 : 0);
})();

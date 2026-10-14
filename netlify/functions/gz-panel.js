// =============================================================================
// gz-panel.js — [GZ-PANEL-1 · 14-oct-2026] LA PLATAFORMA DEL GUERRERO Z
// Palabra de Memo: «cuando entran a inicio dice mi contrato pero no dice nada …
// un reloj contando meses, días, semanas, horas … tours separar activos de
// pasados … ranking en qué número y cuántos puntos … alertas sobre falta firmar
// contrato, evento asignado, etc … una pestaña de Tours para ver su tour
// asignado, lista de viajeros, rooming list».
//
// SOLO LECTURA. Dos acciones:
//   · 'panel'            → lo de la persona: usuario, contratos, asignaciones,
//                          salidas de bodega, reportes, deudas.
//   · 'tour' {evento_id} → rooming list + link del grupo de WhatsApp de UN tour
//                          suyo. La lista de viajeros NO vive aquí: la sigue
//                          dando `viajero_listar` (la vista de coordi del
//                          servidor, COORDI-LISTA-1) — un dueño por lista.
//
// 🔒 LA PERSONA SALE DEL JWT, nunca del body. Única excepción, y es la razón de
//    esta tuerca: «Ver como» de Montaña Pai solo cambiaba la PANTALLA y el
//    servidor seguía contestando con el JWT de Memo — por eso su Inicio decía
//    «no encontré un contrato a tu correo». Hoy, si el JWT es de maestro_roshi
//    y el body trae `ver_como` (uuid), se contesta COMO esa persona. Para
//    cualquier otro rol `ver_como` se IGNORA (no se rechaza: no hay nada que
//    escalar, simplemente no aplica).
// =============================================================================
const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { gruposDe, baseSlug } = require('./_lib/grupo-whatsapp');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SLUG_RE = /^[A-Za-z0-9_#.\-]{1,120}$/;
const ROLES = ['coordinador', 'cc', 'mister_popo', 'maestro_roshi', 'bulma', 'milk'];

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  const res = (s, o) => ({ statusCode: s, headers, body: JSON.stringify(o) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });
  if (!__origin) return res(403, { error: 'Origen no permitido' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return res(400, { error: 'JSON inválido' }); }
  const accion = body.accion;
  if (!['panel', 'tour'].includes(accion)) return res(400, { error: 'accion inválida' });

  const auth = await verifyAdminAuthLive(event, ROLES);
  if (!auth.valid) return res(auth.status, { error: auth.error });

  const URL_ = process.env.SUPABASE_URL_KAMEHOUSE, KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!URL_ || !KEY) return res(500, { error: 'Faltan env vars KH' });
  const sb = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const get = async (path) => {
    const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: sb });
    if (!r.ok) throw new Error(`${path.split('?')[0]}: ${await r.text()}`);
    return r.json();
  };

  // ── quién es «yo» ────────────────────────────────────────────────────────
  const jwtId = auth.user && (auth.user.id || auth.user.sub);
  let yoId = jwtId;
  let verComo = false;
  if (auth.user.rol === 'maestro_roshi' && body.ver_como && UUID_RE.test(String(body.ver_como)) && body.ver_como !== jwtId) {
    yoId = String(body.ver_como);
    verComo = true;
  }
  if (!UUID_RE.test(String(yoId || ''))) return res(400, { error: 'Sesión sin id de usuario' });

  try {
    const [yo] = await get(`usuarios?id=eq.${yoId}&select=id,nombre,rol,correo,correo_notif,celular,talla_playera,foto_url,strikes,activo&limit=1`);
    if (!yo) return res(404, { error: 'Usuario no encontrado' });

    if (accion === 'panel') {
      // Contratos: por su correo de acceso y su correo de avisos (los dos los
      // usa la casa para mandar contratos). Se ESTRECHA con ilike y la
      // AUTORIDAD es la igualdad exacta en minúsculas (PLAN-CASE-1).
      const correos = [...new Set([yo.correo, yo.correo_notif].filter(Boolean).map((c) => String(c).trim().toLowerCase()))];
      let contratos = [];
      for (const c of correos) {
        const filas = await get(`contratos_creadores?creador_email=ilike.${encodeURIComponent(c)}&select=id,token,plantilla,estado,firmado_at,enviado_at,vigencia_inicio,vigencia_fin,vigencia_meses,evento_nombre,evento_fecha,creador_email&order=firmado_at.desc.nullslast&limit=10`);
        filas.filter((f) => String(f.creador_email || '').trim().toLowerCase() === c).forEach((f) => {
          if (!contratos.some((x) => x.id === f.id)) contratos.push(f);
        });
      }
      contratos = contratos.map(({ creador_email, id, ...r }) => r);

      const [asignaciones, salidas, reportes, deudas] = await Promise.all([
        get(`eventos_coordi?coordi_id=eq.${yoId}&select=id,evento_id,status,indicaciones,asignado_en&order=asignado_en.desc&limit=200`),
        get(`salidas_bodega?solicitante_id=eq.${yoId}&select=id,evento_id,estado,detalle,creado_en,autorizada_en,cerrada_en,faltantes_monto,faltantes_vence,faltantes_pagado_at,devolucion_avisada_at,devolucion_recibida_at&order=creado_en.desc&limit=100`),
        get(`reportes_evento?coordi_id=eq.${yoId}&select=id,evento_id,status,rechazo_motivo,created_at,fecha_aprobado&order=created_at.desc&limit=100`),
        get(`deudas_coordi?coordi_id=eq.${yoId}&select=id,evento_id,tipo,concepto,monto,pagado,created_at&order=created_at.desc&limit=100`).catch(() => []),
      ]);
      const { correo, correo_notif, ...publico } = yo;
      return res(200, {
        ok: true, ver_como: verComo,
        usuario: { ...publico, correo: correo_notif || correo },
        contratos, asignaciones, salidas, reportes, deudas,
      });
    }

    // ── tour ───────────────────────────────────────────────────────────────
    const evento_id = String(body.evento_id || '').trim();
    if (!SLUG_RE.test(evento_id)) return res(400, { error: 'evento_id inválido' });
    const base = baseSlug(evento_id);
    const esAdmin = ['maestro_roshi', 'bulma', 'milk'].includes(auth.user.rol) && !verComo;
    const llaves = [...new Set([evento_id, base])].map(encodeURIComponent).join(',');
    const asig = await get(`eventos_coordi?coordi_id=eq.${yoId}&evento_id=in.(${llaves})&select=id,evento_id,status,indicaciones&limit=1`);
    if (!asig.length && !esAdmin) return res(403, { error: 'No tienes asignación a este evento' });

    // Rooming: las habitaciones del evento (la llave nueva es `evento_slug`;
    // un multifecha guarda por fecha `slug#N`) + quién duerme en cada una
    // según `viajeros_evento.habitacion_id` y los nombres capturados a mano.
    const habsCrudas = await get(`rooming_habitaciones?evento_slug=like.${encodeURIComponent(base)}*&select=id,evento_slug,numero_hab,tipo,orden,ocupantes,hotel_nombre,hotel_direccion,incluye_desayuno,fecha_entrada,fecha_salida&order=orden.asc&limit=500`);
    const habs = habsCrudas.filter((h) => {
      const s = String(h.evento_slug || '');
      if (evento_id.includes('#')) return s === evento_id || s === base;
      return s === base || s.startsWith(base + '#');
    });
    let porHab = {};
    if (habs.length) {
      const ids = habs.map((h) => h.id).join(',');
      const vs = await get(`viajeros_evento?habitacion_id=in.(${ids})&select=nombre,habitacion_id,boletos,zona_boleto&limit=2000`);
      vs.filter((v) => !(Number(v.boletos) === 0 && !v.zona_boleto)).forEach((v) => {
        (porHab[v.habitacion_id] = porHab[v.habitacion_id] || []).push(v.nombre);
      });
    }
    const rooming = habs.map((h) => {
      let ocp = h.ocupantes;
      if (typeof ocp === 'string') { try { ocp = JSON.parse(ocp); } catch { ocp = []; } }
      const nombres = [...new Set([...(porHab[h.id] || []), ...(Array.isArray(ocp) ? ocp : [])].map((x) => String(x || '').trim()).filter(Boolean))];
      return { numero_hab: h.numero_hab, tipo: h.tipo, orden: h.orden, fecha: h.evento_slug, hotel_nombre: h.hotel_nombre, hotel_direccion: h.hotel_direccion, incluye_desayuno: !!h.incluye_desayuno, fecha_entrada: h.fecha_entrada, fecha_salida: h.fecha_salida, ocupantes: nombres };
    });
    const grupos = await gruposDe([evento_id], { KH_URL: URL_, KH_KEY: KEY });
    return res(200, {
      ok: true, ver_como: verComo, evento_id,
      asignacion: asig[0] || null,
      rooming,
      grupo_whatsapp: grupos[evento_id] || null,
    });
  } catch (e) {
    return res(502, { error: 'No se pudo leer tu información', detail: String(e.message || e).slice(0, 300) });
  }
};

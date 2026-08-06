// =============================================================================
// admin-coordi-asignaciones.js — Acceso server-side a `eventos_coordi` y
// `viajeros_evento` (KH) con service_role + verifyAdminAuth.
//
// Cierra la exposición anon: kamehouse.html ya NO lee/escribe estas 2 tablas con
// la anon key. Mismo patrón que admin-tours / admin-rooming / admin-eventos.
// PR-D de la cadena de hardening RLS.
//
//  - `eventos_coordi`  = asignación de un coordi a un evento (slug). status
//                        pendiente|aceptado|declinado. evento_id es SLUG (no uuid).
//  - `viajeros_evento` = staff/cliente registrado a un evento (KH). PII: nombre,
//                        correo, celular, num_emergencia, emergencia_nombre.
//                        (El tab Viajeros del panel y el alta manual viven en el
//                        proyecto PORTAL — solicitudes_tour — NO aquí.)
//
// Body JSON: { accion, ... }
//   eventos_coordi:
//     - 'listar'    { coordi_id?, evento_id?, status? } → { ok, asignaciones:[...] }
//          Lectura del panel (GZ/perfil/ranking/CC/Montaña). Cualquier logueado.
//     - 'crear'     { evento_id, coordi_id, indicaciones? } → { ok, asignacion }
//          Solo admin (maestro_roshi/bulma).
//     - 'eliminar'  { id } → { ok }                         · Solo admin.
//     - 'responder' { id, decision:'aceptar'|'declinar', motivo? } → { ok, asignacion }
//          ANTI-ESCALACIÓN: la asignación debe ser del jwtUserId (salvo admin).
//          Cierra el hueco del UUID enumerable del email-link.
//   viajeros_evento:
//     - 'viajero_upsert_staff' { asig_id } → { ok, viajero }
//          Registra al coordi aceptante como viajero (staff). Idempotente.
//          La identidad (nombre/correo/...) sale de `usuarios` server-side, NUNCA
//          del cliente (anti-spoofing). Owner-coordi del asig o admin.
//     - 'viajero_listar'   { evento_id } → { ok, viajeros:[...] }  (whitelist PII)
//          admin, o coordi CON asignación a ese evento.
//     - 'viajero_eliminar' { id } → { ok }                  · Solo admin.
//
// Seguridad: Authorization Bearer <JWT> (verifyAdminAuth) + corsCheck. Whitelist
// de columnas. UUID/slug validados. service_role NUNCA viaja al navegador.
//
// Env vars (KH): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE, JWT_SECRET.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SLUG_RE = /^[A-Za-z0-9_#.\-]+$/; // evento_id (slug del EV, p.ej. 'karolg#2')
const ROLES_ADMIN = ['maestro_roshi', 'bulma', 'milk'];

// Acciones válidas → roles permitidos (null = cualquier rol logueado; la
// anti-escalación fina se hace en código por coordi_id===jwt).
// [VJ-1] Editar datos del viajero. RESUELTO POR MEMO (6-ago-2026): milk TAMBIÉN
// captura. La ficha pedía solo roshi y bulma, pero `viajero_eliminar` ya usa
// ROLES_ADMIN —que incluye milk—, así que milk podía BORRAR la fila entera y no
// habría podido editarle el correo. Impedir lo menor mientras se permite lo
// mayor no es un candado, es una molestia con cara de candado.
// Queda como constante propia y NO como ROLES_ADMIN a secas: si algún día
// ROLES_ADMIN crece por otra razón, esta lista no se mueve sola.
const ROLES_EDITA_VIAJERO = ['maestro_roshi', 'bulma', 'milk'];

const ACCIONES = {
  listar: null,
  crear: ROLES_ADMIN,
  eliminar: ROLES_ADMIN,
  responder: null,
  viajero_upsert_staff: null,
  viajero_listar: null,
  viajero_eliminar: ROLES_ADMIN,
  viajero_editar: ROLES_EDITA_VIAJERO,
  // [VJ-3] Dinero de los migrados. Mismos roles que editar: quien captura los
  // datos captura los abonos.
  abono_crear: ROLES_EDITA_VIAJERO,
  abonos_listar: ROLES_EDITA_VIAJERO,
};

// [VJ-3] Bucket PRIVADO de los comprobantes de abono. Mismo patrón que
// ine-creadores: nada público, todo por URL firmada que caduca.
const BUCKET_ABONOS = 'abonos-viajeros';
const FOTO_TTL = 3600;                 // 1 hora
const FOTO_MAX_BYTES = 6 * 1024 * 1024;

// Correo con forma de correo. Mismo criterio que el resto de la casa.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Columnas que viajan al navegador al leer `eventos_coordi`.
const EC_COLS = 'id,evento_id,coordi_id,indicaciones,status,motivo_declinacion';

// Whitelist ESTRICTA de `viajeros_evento` (PII) — solo lo que la descarga usa.
const VE_READ_COLS = 'id,evento_id,nombre,correo,celular,talla_playera,num_emergencia,emergencia_nombre,tipo_paquete,zona_boleto,notas,tipo_viajero,usuario_id,created_at:creado_en';

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!__origin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Origen no permitido' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const accion = body.accion;
  if (!(accion in ACCIONES)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'accion inválida' }) };
  }

  const auth = await verifyAdminAuthLive(event, ACCIONES[accion] || undefined);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  const jwtUserId = auth.user && (auth.user.id || auth.user.sub);
  const jwtRol = auth.user && auth.user.rol;
  if (!jwtUserId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JWT sin id de usuario' }) };
  }
  const esAdmin = ROLES_ADMIN.includes(jwtRol);

  const env = readEnv();
  if (env.error) return { statusCode: 500, headers, body: JSON.stringify({ error: env.error }) };

  const sbHeaders = {
    apikey: env.KH_SB_SERVICE,
    Authorization: 'Bearer ' + env.KH_SB_SERVICE,
    'Content-Type': 'application/json',
  };
  const baseEC = `${env.KH_SB_URL}/rest/v1/eventos_coordi`;
  const baseVE = `${env.KH_SB_URL}/rest/v1/viajeros_evento`;
  const baseUsuarios = `${env.KH_SB_URL}/rest/v1/usuarios`;

  try {
    // ── eventos_coordi: listar ───────────────────────────────────────────
    if (accion === 'listar') {
      const sp = new URLSearchParams();
      sp.set('select', EC_COLS);
      if (has(body, 'coordi_id')) {
        const cid = String(body.coordi_id || '').trim();
        if (!UUID_RE.test(cid)) return bad(headers, 'coordi_id inválido');
        sp.append('coordi_id', `eq.${cid}`);
      }
      if (has(body, 'evento_id')) {
        const ev = String(body.evento_id || '').trim();
        if (!ev || !SLUG_RE.test(ev) || ev.length > 120) return bad(headers, 'evento_id inválido');
        sp.append('evento_id', `eq.${ev}`);
      }
      if (has(body, 'status')) {
        const st = String(body.status || '').trim();
        // admite 'aceptado' | 'pendiente' | 'declinado' (lista simple)
        if (!/^[a-z_,]+$/.test(st) || st.length > 60) return bad(headers, 'status inválido');
        sp.append('status', st.includes(',') ? `in.(${st})` : `eq.${st}`);
      }
      sp.set('limit', '2000');
      const r = await fetch(`${baseEC}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const asignaciones = await r.json();
      return ok(headers, { asignaciones });
    }

    // ── eventos_coordi: crear (admin) ────────────────────────────────────
    if (accion === 'crear') {
      const evento_id = String(body.evento_id || '').trim();
      const coordi_id = String(body.coordi_id || '').trim();
      if (!evento_id || !SLUG_RE.test(evento_id) || evento_id.length > 120) return bad(headers, 'evento_id inválido');
      if (!UUID_RE.test(coordi_id)) return bad(headers, 'coordi_id inválido');
      const fila = {
        evento_id,
        coordi_id,
        indicaciones: cleanText(body.indicaciones, 2000),
        status: 'pendiente',
      };
      const r = await fetch(baseEC, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(fila),
      });
      if (!r.ok) return upstream(headers, await r.text(), 'insert');
      const rows = await r.json();
      return ok(headers, { asignacion: rows[0] || null });
    }

    // ── eventos_coordi: eliminar (admin) ─────────────────────────────────
    if (accion === 'eliminar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');
      const r = await fetch(`${baseEC}?id=eq.${id}`, {
        method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      if (!r.ok) return upstream(headers, await r.text(), 'delete');
      return ok(headers, {});
    }

    // ── eventos_coordi: responder (aceptar/declinar) — ANTI-ESCALACIÓN ────
    if (accion === 'responder') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');
      const decision = String(body.decision || '').trim();
      if (decision !== 'aceptar' && decision !== 'declinar') return bad(headers, 'decision inválida');

      const asig = await getAsig(baseEC, sbHeaders, id);
      if (!asig) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Asignación no encontrada' }) };
      // El coordi solo responde SU propia asignación; admins pasan.
      if (!esAdmin && asig.coordi_id !== jwtUserId) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'No puedes responder una asignación de otra persona' }) };
      }

      const patch = decision === 'aceptar'
        ? { status: 'aceptado' }
        : { status: 'declinado', motivo_declinacion: cleanText(body.motivo, 1000) };
      const r = await fetch(`${baseEC}?id=eq.${id}`, {
        method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) return upstream(headers, await r.text(), 'update');
      // Devolvemos identidad del asig para que el front arme la alerta a Memo
      // sin un GET extra (preserva el shape del flujo de declinar).
      return ok(headers, { asignacion: { id, evento_id: asig.evento_id, coordi_id: asig.coordi_id, status: patch.status } });
    }

    // ── viajeros_evento: upsert staff (idempotente, identidad server-side) ─
    if (accion === 'viajero_upsert_staff') {
      const asigId = String(body.asig_id || '').trim();
      if (!UUID_RE.test(asigId)) return bad(headers, 'asig_id inválido');

      const asig = await getAsig(baseEC, sbHeaders, asigId);
      if (!asig || !asig.evento_id || !asig.coordi_id) return ok(headers, { viajero: null }); // best-effort
      if (!esAdmin && asig.coordi_id !== jwtUserId) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'No puedes registrar viajero de otra asignación' }) };
      }

      // Identidad SIEMPRE de `usuarios` (anti-spoofing), nunca del cliente.
      const ur = await fetch(
        `${baseUsuarios}?id=eq.${asig.coordi_id}&select=id,nombre,celular,correo,talla_playera,num_emergencia,nombre_emergencia,rol&limit=1`,
        { headers: sbHeaders });
      if (!ur.ok) return upstream(headers, await ur.text(), 'consulta');
      const u = (await ur.json())[0];
      if (!u) return ok(headers, { viajero: null });

      // Idempotencia por (evento_id, correo).
      if (u.correo) {
        const ex = await fetch(
          `${baseVE}?evento_id=eq.${encodeURIComponent(asig.evento_id)}&correo=eq.${encodeURIComponent(u.correo)}&select=id&limit=1`,
          { headers: sbHeaders });
        if (ex.ok) {
          const exRows = await ex.json();
          if (exRows.length) return ok(headers, { viajero: exRows[0] });
        }
      }

      const baseRow = {
        evento_id: asig.evento_id,
        nombre: u.nombre,
        celular: u.celular || null,
        correo: u.correo || null,
        talla_playera: u.talla_playera || null,
        num_emergencia: u.num_emergencia || null,
        emergencia_nombre: u.nombre_emergencia || null,
        tipo_paquete: 'PLUS',
        notas: `[STAFF:${u.rol || 'staff'}] Asignación automática por aceptar tour`,
      };

      // Intenta con tipo_viajero/usuario_id; si la migración de columnas no está
      // en prod, reintenta sin esos campos (mismo fallback que el front 9801).
      let ins = await fetch(baseVE, {
        method: 'POST', headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ ...baseRow, tipo_viajero: u.rol || 'staff', usuario_id: u.id }),
      });
      if (!ins.ok) {
        const detail = await ins.text();
        if (/tipo_viajero|usuario_id|schema cache|column/i.test(detail)) {
          ins = await fetch(baseVE, {
            method: 'POST', headers: { ...sbHeaders, Prefer: 'return=representation' },
            body: JSON.stringify(baseRow),
          });
          if (!ins.ok) return upstream(headers, await ins.text(), 'insert');
        } else {
          return upstream(headers, detail, 'insert');
        }
      }
      const insRows = await ins.json();
      return ok(headers, { viajero: insRows[0] || null });
    }

    // ── viajeros_evento: listar (descarga) — admin o coordi del evento ────
    if (accion === 'viajero_listar') {
      const evento_id = String(body.evento_id || '').trim();
      if (!evento_id || !SLUG_RE.test(evento_id) || evento_id.length > 120) return bad(headers, 'evento_id inválido');

      if (!esAdmin) {
        // El coordi debe tener una asignación a ese evento.
        const cr = await fetch(
          `${baseEC}?coordi_id=eq.${jwtUserId}&evento_id=eq.${encodeURIComponent(evento_id)}&select=id&limit=1`,
          { headers: sbHeaders });
        if (!cr.ok) return upstream(headers, await cr.text(), 'consulta');
        if (!(await cr.json()).length) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'No tienes asignación a este evento' }) };
        }
      }

      // [VJ-3] EL DINERO NO SE LE PIDE A LA BASE SI QUIEN PREGUNTA NO PUEDE
      // VERLO. No se trae y se esconde en el render: no se trae. Un coordi
      // recibe EXACTAMENTE las columnas de siempre, así que ni abriendo la
      // consola ve el total de un cliente. Misma filosofía que el desglose de
      // comisiones que el vendedor jamás recibe.
      const puedeDinero = ROLES_EDITA_VIAJERO.includes(jwtRol);
      const cols = puedeDinero ? `${VE_READ_COLS},total_contrato,abonado_previo` : VE_READ_COLS;
      const sp = new URLSearchParams();
      sp.set('select', cols);
      sp.append('evento_id', `eq.${evento_id}`);
      sp.set('order', 'nombre.asc');
      sp.set('limit', '2000');
      const r = await fetch(`${baseVE}?${sp.toString()}`, { headers: sbHeaders });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const viajeros = await r.json();
      return ok(headers, { viajeros });
    }

    // ── viajeros_evento: editar datos de contacto (admin) ────────────────
    // [VJ-1] La migración del Excel dejó viajeros CHEAP con nombre y zona nada
    // más. Esto es la escritura que llena lo que falta desde la alerta.
    //
    // WHITELIST DURA de campos: lo que no esté en la lista NO se escribe y la
    // petición se rechaza. Sin eso, un `campos` con `evento_id` o `tipo_paquete`
    // movería a la persona de evento o de paquete desde una pantalla que dice
    // "capturar correo y celular".
    //
    // LECTURA Y ESCRITURA CON EL MISMO FILTRO (`id=eq.`): es la regla de la casa
    // — un PATCH cuyo filtro no empata con el de la lectura escribe sobre filas
    // que nadie miró. Aquí importa doble porque hay personas con VARIAS filas
    // (Humberto y Elizabeth tienen 2 boletos cada uno): tocar una no puede tocar
    // la otra.
    if (accion === 'viajero_editar') {
      // Segundo cerrojo, no adorno: el de arriba (ACCIONES) lo aplica
      // verifyAdminAuthLive; éste vuelve a mirar el rol del JWT ya resuelto por
      // si alguien registra la acción con `null` al agregar la siguiente.
      if (!ROLES_EDITA_VIAJERO.includes(jwtRol)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Solo un admin puede editar los datos del viajero' }) };
      }
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');

      const campos = (body.campos && typeof body.campos === 'object' && !Array.isArray(body.campos)) ? body.campos : null;
      if (!campos) return bad(headers, 'campos inválido');

      const PERMITIDOS = ['correo', 'celular', 'talla_playera', 'num_emergencia', 'emergencia_nombre', 'notas'];
      const ajenos = Object.keys(campos).filter((k) => !PERMITIDOS.includes(k));
      if (ajenos.length) return bad(headers, 'campo no editable: ' + ajenos.join(', '));

      const patch = {};
      for (const k of PERMITIDOS) {
        if (!Object.prototype.hasOwnProperty.call(campos, k)) continue;
        const v = campos[k] == null ? '' : String(campos[k]).trim();
        // Vacío se guarda como NULL, no como cadena vacía: '' se cuela en los
        // filtros de "sin correo" y en los correos salientes como destinatario
        // en blanco. Ausente es ausente.
        if (v === '') { patch[k] = null; continue; }
        if (v.length > 500) return bad(headers, `${k} demasiado largo`);
        if (k === 'correo' && !EMAIL_RE.test(v)) return bad(headers, 'correo inválido');
        patch[k] = v;
      }
      if (!Object.keys(patch).length) return bad(headers, 'nada que actualizar');

      // La fila tiene que existir ANTES de escribirle: un PATCH sobre un id que
      // no está contesta 200 con cero filas y se leería como "guardado".
      const pre = await fetch(`${baseVE}?id=eq.${id}&select=id&limit=1`, { headers: sbHeaders });
      if (!pre.ok) return upstream(headers, await pre.text(), 'consulta');
      if (!(await pre.json()).length) return bad(headers, 'ese viajero no existe');

      const r = await fetch(`${baseVE}?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) return upstream(headers, await r.text(), 'update');
      const filas = await r.json();
      // Se devuelve cuántas filas tocó: si algún día el filtro se aflojara, el
      // número lo grita en vez de esconderlo.
      return ok(headers, { viajero: filas[0] || null, tocadas: filas.length });
    }

    // ── abonos_viajero: registrar un abono (admin) ───────────────────────
    // [VJ-3] El dinero de los migrados NO se recalcula de paquete + hotel +
    // vuelo: el total del Excel ya traía todo eso adentro. Aquí solo se SUMAN
    // abonos nuevos sobre un total y un abonado que están CONGELADOS.
    if (accion === 'abono_crear') {
      if (!ROLES_EDITA_VIAJERO.includes(jwtRol)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'No puedes registrar abonos' }) };
      }
      const viajero_id = String(body.viajero_id || '').trim();
      if (!UUID_RE.test(viajero_id)) return bad(headers, 'viajero_id inválido');

      const monto = Number(body.monto);
      // > 0 estricto: un abono de cero no es un abono, y uno negativo sería una
      // devolución disfrazada que descuadraría el saldo sin dejar rastro de qué
      // fue. Si algún día hay devoluciones, van con su propio concepto.
      if (!Number.isFinite(monto) || monto <= 0) return bad(headers, 'El monto tiene que ser mayor que cero');
      if (monto > 1000000) return bad(headers, 'Monto fuera de rango');

      const fecha = String(body.fecha || '').trim();
      if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return bad(headers, 'Fecha inválida');
      const nota = String(body.nota || '').trim().slice(0, 500) || null;

      // La fila tiene que existir ANTES: un INSERT con FK a un id fantasma
      // truena feo, y el evento hace falta para armar el path de la foto.
      const pre = await fetch(`${baseVE}?id=eq.${viajero_id}&select=id,evento_id&limit=1`, { headers: sbHeaders });
      if (!pre.ok) return upstream(headers, await pre.text(), 'consulta');
      const vRows = await pre.json();
      if (!vRows.length) return bad(headers, 'ese viajero no existe');

      // ── Foto OPCIONAL ──
      let foto_path = null;
      if (body.foto) {
        const img = _decodeImagen(body.foto);
        if (img.error) return bad(headers, 'Foto inválida: ' + img.error);
        if (img.tooBig) return bad(headers, 'La foto pesa demasiado (máx 6 MB)');
        // <evento>/<viajero_id>/<uuid>.<ext> — el evento adelante para poder
        // barrer por evento sin abrir cada carpeta.
        foto_path = `${String(vRows[0].evento_id || 'sin-evento')}/${viajero_id}/${_uuid()}.${img.ext}`;
        try { await _subirAbono(env, foto_path, img.bytes, img.mime); }
        catch (e) { return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo subir la foto', detail: e.message }) }; }
      }

      // capturado_por sale del JWT, NUNCA del cliente (mismo anti-spoofing que
      // strikes_log.por_quien): quien registró el dinero no se puede inventar.
      const fila = {
        viajero_id, monto, nota, foto_path,
        capturado_por: (auth.user && (auth.user.nombre || auth.user.username || auth.user.correo)) || jwtUserId,
      };
      if (fecha) fila.fecha = fecha;

      // INSERT directo, sin on_conflict (regla de la casa).
      const r = await fetch(`${env.KH_SB_URL}/rest/v1/abonos_viajero`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(fila),
      });
      if (!r.ok) return upstream(headers, await r.text(), 'insert');
      const creado = (await r.json())[0] || null;
      return ok(headers, { abono: creado });
    }

    // ── abonos_viajero: listar los de un viajero (admin) ─────────────────
    if (accion === 'abonos_listar') {
      if (!ROLES_EDITA_VIAJERO.includes(jwtRol)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'No puedes ver los abonos' }) };
      }
      // Dos modos: UNO (la ficha) o TODO UN EVENTO (la tabla de migrados, que
      // necesita el saldo de 29 filas y no puede hacer 29 llamadas). Se extiende
      // esta acción en vez de inventar otra: es la misma lectura con otro filtro.
      const viajero_id = String(body.viajero_id || '').trim();
      const evento_id = String(body.evento_id || '').trim();
      let filtro;
      if (viajero_id) {
        if (!UUID_RE.test(viajero_id)) return bad(headers, 'viajero_id inválido');
        filtro = `viajero_id=eq.${viajero_id}`;
      } else if (evento_id) {
        if (!SLUG_RE.test(evento_id) || evento_id.length > 120) return bad(headers, 'evento_id inválido');
        const vr = await fetch(`${baseVE}?evento_id=eq.${encodeURIComponent(evento_id)}&select=id&limit=2000`, { headers: sbHeaders });
        if (!vr.ok) return upstream(headers, await vr.text(), 'consulta');
        const ids = (await vr.json()).map((x) => x.id).filter(Boolean);
        // Sin viajeros no hay abonos: se contesta vacío en vez de mandar un
        // `in.()` vacío, que PostgREST rechaza.
        if (!ids.length) return ok(headers, { abonos: [] });
        filtro = `viajero_id=in.(${ids.join(',')})`;
      } else {
        return bad(headers, 'falta viajero_id o evento_id');
      }

      // Whitelist: `foto_path` NO viaja al navegador; lo que viaja es su URL
      // firmada, que caduca. Mandar el path invitaría a construir URLs a mano.
      const r = await fetch(
        `${env.KH_SB_URL}/rest/v1/abonos_viajero?${filtro}` +
        `&select=id,viajero_id,monto,fecha,nota,foto_path,capturado_por,created_at&order=fecha.desc,created_at.desc`,
        { headers: sbHeaders });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const filas = await r.json();

      // Solo se firma la foto cuando se pidió UN viajero (la ficha, que las
      // muestra). Para el barrido del evento firmar 29 URLs sería 29 llamadas a
      // storage para miniaturas que nadie va a abrir; se manda si HAY foto y ya.
      const abonos = [];
      for (const a of filas) {
        const { foto_path, ...resto } = a;
        abonos.push({
          ...resto,
          tiene_foto: !!foto_path,
          foto_url: (viajero_id && foto_path) ? await _firmarAbono(env, foto_path) : null,
        });
      }
      return ok(headers, { abonos });
    }

    // ── viajeros_evento: eliminar (admin) ────────────────────────────────
    if (accion === 'viajero_eliminar') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');
      const r = await fetch(`${baseVE}?id=eq.${id}`, {
        method: 'DELETE', headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      if (!r.ok) return upstream(headers, await r.text(), 'delete');
      return ok(headers, {});
    }

    return bad(headers, 'accion inválida');
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Error en admin-coordi-asignaciones', detail: e.message }) };
  }
};

// ----- [VJ-3] helpers de la foto del abono -----
// Copiados del molde de contrato-firmar/contrato-obtener (INE): decodificar
// data-URI, subir con service_role y firmar para leer. El bucket es privado,
// así que la URL firmada es la ÚNICA forma de ver el comprobante.

function _uuid() {
  try { return require('crypto').randomUUID(); }
  catch (_) {
    // Sin randomUUID (runtime viejo): un id único que igual sirve de nombre de
    // archivo. No es criptográfico y no hace falta que lo sea — el bucket es
    // privado y el path no se adivina desde fuera.
    return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
}

function _decodeImagen(dataUri) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(String(dataUri || ''));
  if (!m) return { error: 'no es una imagen en base64' };
  const mime = m[1].toLowerCase();
  let bytes;
  try { bytes = Buffer.from(m[2].replace(/\s+/g, ''), 'base64'); }
  catch (_) { return { error: 'base64 corrupta' }; }
  if (!bytes.length) return { error: 'bytes vacíos' };
  if (bytes.length > FOTO_MAX_BYTES) return { tooBig: true };
  const ext = mime === 'image/png' ? 'png'
    : mime === 'image/webp' ? 'webp'
    : mime === 'image/heic' ? 'heic'
    : mime === 'image/heif' ? 'heif'
    : 'jpg';
  return { bytes, mime, ext };
}

async function _subirAbono(env, path, bytes, contentType) {
  const r = await fetch(`${env.KH_SB_URL}/storage/v1/object/${BUCKET_ABONOS}/${encodeURI(path)}`, {
    method: 'POST',
    headers: {
      apikey: env.KH_SB_SERVICE,
      Authorization: 'Bearer ' + env.KH_SB_SERVICE,
      'Content-Type': contentType,
      // SIN x-upsert: cada abono estrena su uuid, así que un path repetido
      // sería un error de verdad y conviene que truene en vez de pisar una
      // foto que ya estaba.
    },
    body: bytes,
  });
  if (!r.ok) throw new Error(`Storage ${r.status}: ${await r.text()}`);
  return path;
}

async function _firmarAbono(env, path) {
  try {
    const r = await fetch(`${env.KH_SB_URL}/storage/v1/object/sign/${BUCKET_ABONOS}/${encodeURI(path)}`, {
      method: 'POST',
      headers: {
        apikey: env.KH_SB_SERVICE,
        Authorization: 'Bearer ' + env.KH_SB_SERVICE,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: FOTO_TTL }),
    });
    if (!r.ok) { console.error('[abonos] sign', r.status, await r.text().catch(() => '')); return null; }
    const j = await r.json();
    // Fails-soft: sin URL, la fila del abono igual se muestra; lo que falta es
    // la foto, no el dinero.
    return (j && j.signedURL) ? `${env.KH_SB_URL}/storage/v1${j.signedURL}` : null;
  } catch (e) { console.error('[abonos] sign exception:', e.message); return null; }
}

// ----- helpers -----

function has(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && obj[k] !== ''; }

function cleanText(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

async function getAsig(baseEC, sbHeaders, id) {
  const r = await fetch(`${baseEC}?id=eq.${id}&select=id,evento_id,coordi_id,status&limit=1`, { headers: sbHeaders });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

function ok(headers, extra) {
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ...(extra || {}) }) };
}
function bad(headers, error) {
  return { statusCode: 400, headers, body: JSON.stringify({ error }) };
}
function upstream(headers, detail, op) {
  return { statusCode: 502, headers, body: JSON.stringify({ error: `KH rechazó el ${op}`, detail }) };
}

function readEnv() {
  const KH_SB_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_SB_SERVICE = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_SB_URL || !KH_SB_SERVICE) {
    return { error: 'Faltan env vars KH (SUPABASE_URL_KAMEHOUSE/SERVICE_KEY_KAMEHOUSE)' };
  }
  return { KH_SB_URL, KH_SB_SERVICE };
}

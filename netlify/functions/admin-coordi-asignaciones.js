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
const { EPOCA_INICIO, esEpocaNueva } = require('./_lib/epoca'); // [EPOCA-1]
const { resolverPrecioVenta } = require('./_lib/precio-zona');
// [VJ-5] La regla de quién duerme es la MISMA de VJ-4, importada — no copiada.
// [CREA-1c] `consumeBoleto` viene de su DUEÑO. La cortesía suma a
// `vendidos_fuera`, y esa contabilidad DESCANSA en que la fila del viajero no
// descuente por su cuenta: si descontara, el mismo boleto se restaría dos
// veces. Preguntárselo a la función en vez de copiar la regla.
const { duerme, motivoNoDuerme, consumeBoleto, viaja, esCliente, normPaquete } = require('./_lib/paquete-viaje');
// [COB-MIG-1] La fórmula sellada de VJ-3, de su dueño. NO se re-escribe aquí:
// `resta = total_contrato − abonado_previo − Σ abonos` ya vive en el lib del
// dinero y la usan la cuenta del evento y los saldos. Una cuarta copia sería la
// que diverja el día que alguien "mejore" una sola.
const { saldoMigrado } = require('./_lib/cuenta-evento');
// [DISPO-NORM-1] La puerta de zonas: la zona del boleto nace con la ortografía
// de la FICHA o no nace (firmado por Memo, 28-sep). Sin ella, un alta con
// «GENERAL» descuenta stock de una llave que el aviso de agotado no consulta.
const { puertaZona } = require('./_lib/zona-ficha');
const { cargarDisponibilidad, evaluarZona } = require('./_lib/disponibilidad');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SLUG_RE = /^[A-Za-z0-9_#.\-]+$/; // evento_id (slug del EV, p.ej. 'karolg#2')
const ROLES_ADMIN = ['maestro_roshi', 'bulma', 'milk'];

// [CREA-1b] Cortesías. La lista de tallas es la MISMA de la casa (perfil,
// alta de viajero, contrato) — asertada contra kamehouse.js en el arnés.
const TALLAS_CORTESIA = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
// Tope de cordura: Day llevó 2 (ella + acompañante). Cuatro ya es un grupo,
// y un grupo no es una cortesía — que lo capture el alta normal.
const MAX_BOLETOS_CORTESIA = 4;
// 🔒 EL PAQUETE SALE DE LA PLANTILLA DEL CONTRATO, firmado por Jane:
// creadora → CHEAP · coordinador/staff → PLUS (el caso Victor). Es una tabla
// EXPLÍCITA y sin default: una plantilla que no esté aquí se rechaza, en vez
// de colarse con el paquete de otro.
const PAQUETE_POR_PLANTILLA = {
  creadora:       { tipo_paquete: 'CHEAP', tipo_viajero: 'creadora',    nota: 'Cortesía creadora de contenido',  notaStock: 'solo boleto + kit' },
  coordinador:    { tipo_paquete: 'PLUS',  tipo_viajero: 'coordinador', nota: 'Boleto de coordinador',           notaStock: 'asignado de bodega, no es venta' },
  auxiliar_admin: { tipo_paquete: 'PLUS',  tipo_viajero: 'staff',       nota: 'Boleto de staff',                 notaStock: 'asignado de bodega, no es venta' },
};

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
  viajero_elegir_paquete: ROLES_EDITA_VIAJERO, // [PREVENTA-ELEGIR-1]
  contrato_cliente_estado: ROLES_EDITA_VIAJERO, // [CONTRATO-CLIENTE-1]
  contrato_cliente_enviar: ROLES_EDITA_VIAJERO, // [CONTRATO-CLIENTE-1]
  contrato_cliente_ine: ROLES_EDITA_VIAJERO, // [CONTRATO-CLIENTE-2] ver la INE (URLs firmadas)
  contrato_cliente_verificar: ROLES_EDITA_VIAJERO, // [CONTRATO-CLIENTE-2] la INE coincide
  contrato_cliente_lista: ROLES_EDITA_VIAJERO, // [CTR-RECUERDA-1] todos los contratos de clientes
  contrato_cliente_recordar: ROLES_EDITA_VIAJERO, // [CTR-RECUERDA-1] recordatorio de firma (seco por default)
  // [CREA-1b] Regalar un boleto es mover inventario: mismos roles que capturan
  // viajeros. Y la entrada VA AQUÍ o la acción no existe para el portero —
  // ésa fue RAD-FIX-CAMINO: tres RPC vivos y 'accion inválida' en pantalla.
  cortesia_asignar: ROLES_EDITA_VIAJERO,
  // [VJ-3] Dinero de los migrados. Mismos roles que editar: quien captura los
  // datos captura los abonos.
  abono_crear: ROLES_EDITA_VIAJERO,
  abonos_listar: ROLES_EDITA_VIAJERO,
  // [GRUPO-WA-1] El link del grupo de WhatsApp por evento.
  grupo_wa_ver: ROLES_EDITA_VIAJERO,
  grupo_wa_guardar: ROLES_EDITA_VIAJERO,
  // [GRUPO-VIAJE-1] «Estas personas viajan juntas» — a mano, por Bulma/Milk.
  grupo_viaje_juntar: ROLES_EDITA_VIAJERO,
  grupo_viaje_separar: ROLES_EDITA_VIAJERO,
  deudores_migrados: ROLES_EDITA_VIAJERO,
  // [VJ-5] Acomodar migrados en cuartos.
  viajero_habitacion: ROLES_EDITA_VIAJERO,
  // [MIG-1a] El alta de un viajero ARBITRARIO (el del Excel). Mismos roles que
  // editar y que los abonos: quien captura los datos captura el alta.
  viajero_migrar: ROLES_EDITA_VIAJERO,
  precio_sugerido: ROLES_EDITA_VIAJERO,   // [CAP-MIG-FIX] solo sugiere; no escribe nada
  viajero_buscar_parecido: ROLES_EDITA_VIAJERO,
  // [STAFF-BOLETO-1] El boleto de un coordi/staff en UN tour (por fecha).
  staff_boleto: ROLES_EDITA_VIAJERO,
  // [ALARMAS-1] La logística del equipo en una sola lista para el Resumen.
  alarmas_operacion: ROLES_EDITA_VIAJERO,
  // [CC-CARDS-1] Lo que cada tarjeta de Capsule dice ANTES de abrirla.
  capsule_resumen: ROLES_EDITA_VIAJERO,
  // [CREA-BAJA-1] Dar de baja la colaboración de una creadora: escribe en su
  // contrato, le quita la cortesía y le MANDA UN CORREO. Solo Memo.
  contrato_cancelar: ['maestro_roshi'],
};

// [VJ-3] Bucket PRIVADO de los comprobantes de abono. Mismo patrón que
// ine-creadores: nada público, todo por URL firmada que caduca.
const BUCKET_ABONOS = 'abonos-viajeros';
const FOTO_TTL = 3600;                 // 1 hora
const FOTO_MAX_BYTES = 6 * 1024 * 1024;

// Correo con forma de correo. Mismo criterio que el resto de la casa.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// [MIG-1a] Los cuatro paquetes que el negocio conoce. Se valida contra esta
// lista y no contra "lo que venga" porque `cuentaParaPaquete` TRUENA con un
// paquete desconocido (`throw`), y la regla de quién viaja y quién duerme
// (`_lib/paquete-viaje`) también decide por este valor. Un typo aquí no daría
// error hoy: daría un viajero que meses después no sube al camión y cuyo dinero
// no se sabe a qué banco va.
const PAQUETES_MIGRAR = ['plus', 'ride', 'stay', 'cheap'];

// [MIG-1a] Dinero desde el formulario: acepta "8,500.50", "$8500", "8500".
// Devuelve null si NO es un número — null es "no se pudo leer", que es distinto
// de 0. Confundirlos capturaría un contrato de cero pesos sin avisar.
function _numDinero(v) {
  if (v == null) return null;
  const s = String(v).replace(/[$\s,]/g, '').trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

// [MIG-1a] Nombre normalizado para buscar parecidos: sin acentos, sin dobles
// espacios, minúsculas. NO se guarda así — solo se compara.
function _normNombre(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// Columnas que viajan al navegador al leer `eventos_coordi`.
const EC_COLS = 'id,evento_id,coordi_id,indicaciones,status,motivo_declinacion';

// Whitelist ESTRICTA de `viajeros_evento` (PII) — solo lo que la descarga usa.
// [GRUPO-VIAJE-1] + boletos (un titular de 3 lugares se lee distinto que uno
// de 1) y grupo_viaje (quién viaja con quién). Ninguno es dinero ni PII nueva.
const VE_READ_COLS = 'id,evento_id,nombre,correo,celular,talla_playera,num_emergencia,emergencia_nombre,emergencia_parentesco,tipo_paquete,zona_boleto,notas,tipo_viajero,usuario_id,created_at:creado_en,boletos,grupo_viaje,sin_boleto';

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
  // [CREA-1b] La cortesía nace del contrato y aterriza en el stock.
  const baseContratos = `${env.KH_SB_URL}/rest/v1/contratos_creadores`;
  const baseStock = `${env.KH_SB_URL}/rest/v1/stock_ajustes`;

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

    // ── [CC-CARDS-1 13-oct] el resumen de cada tour para las tarjetas ─────
    // Palabra de Memo: «en la card antes de abrir el evento que venga info del
    // tour, coordinador asignado, creadora asignada, cantidad de viajeros». Una
    // llamada para TODOS los tours (sin N consultas por tarjeta). SOLO LEE.
    // Llave = la de la tarjeta (`omar#1`); una asignación vieja al evento base
    // se reparte a todas sus fechas.
    if (accion === 'capsule_resumen') {
      const leer = async (url) => { const r = await fetch(url, { headers: sbHeaders }); if (!r.ok) throw new Error(url.split('/rest/v1/')[1].split('?')[0] + ' ' + r.status); return r.json(); };
      let ve, asigs, usus, ctrs;
      try {
        [ve, asigs, usus, ctrs] = await Promise.all([
          leer(`${baseVE}?select=evento_id,tipo_viajero,tipo_paquete,zona_boleto,boletos,usuario_id,nombre,talla_playera,sin_boleto&limit=20000`),
          leer(`${baseEC}?select=evento_id,coordi_id,status&limit=5000`),
          leer(`${baseUsuarios}?select=id,nombre,rol&limit=1000`),
          leer(`${baseContratos}?plantilla=eq.creadora&select=id,creador_nombre,creador_email,estado,evento_nombre,evento_fecha,datos&limit=2000`),
        ]);
      } catch (e) { return upstream(headers, e.message, 'consulta'); }
      const out = {};
      const de = (k) => (out[k] = out[k] || { viajeros: 0, por_paquete: {}, equipo: [], creadoras: [] });
      const esBaja = (v) => Number(v.boletos) === 0 && !v.zona_boleto;
      (ve || []).forEach((v) => {
        if (!esCliente(v.tipo_viajero) || esBaja(v)) return;
        const o = de(v.evento_id); const n = Number(v.boletos) > 0 ? Number(v.boletos) : 1;
        o.viajeros += n;
        const p = String(v.tipo_paquete || '—').toUpperCase();
        o.por_paquete[p] = (o.por_paquete[p] || 0) + n;
      });
      const uDe = {}; (usus || []).forEach((u) => { uDe[u.id] = u; });
      const staffDe = (llave, uid) => (ve || []).find((v) => v.usuario_id === uid && !esCliente(v.tipo_viajero) && v.evento_id === llave);
      (asigs || []).forEach((a) => {
        if (a.status === 'declinado') return;
        const u = uDe[a.coordi_id] || {};
        const fila = staffDe(a.evento_id, a.coordi_id);
        de(a.evento_id).equipo.push({ nombre: u.nombre || '—', rol: u.rol || null, status: a.status || 'pendiente', boleto: fila ? (fila.zona_boleto || null) : null, sin_boleto: !!(fila && fila.sin_boleto), base: !String(a.evento_id).includes('#') });
      });
      // Creadoras: la cortesía ya dice su tour; las que no, se cuelgan por FECHA
      // del contrato (la tarjeta casa fecha + nombre en el navegador).
      const sinTour = [];
      const vistas = new Set();
      (ctrs || []).filter((c) => c.estado !== 'cancelado')
        .sort((x, y) => (x.estado === 'firmado' ? 0 : 1) - (y.estado === 'firmado' ? 0 : 1)).forEach((c) => {
        const k = String(c.creador_email || c.creador_nombre).toLowerCase() + '|' + c.evento_fecha;
        if (vistas.has(k)) return; vistas.add(k);
        const d = (c.datos && typeof c.datos === 'object') ? c.datos : {};
        const item = { contrato_id: c.id, nombre: c.creador_nombre, firmado: c.estado === 'firmado',
          cortesia: d.cortesia ? { zona: d.cortesia.zona, boletos: d.cortesia.boletos } : null,
          acompanante: (d.cortesia && d.cortesia.acompanante) || (d.acompanante && d.acompanante.nombre) || null,
          evento_nombre: c.evento_nombre, evento_fecha: c.evento_fecha };
        if (d.cortesia && d.cortesia.evento_id) de(d.cortesia.evento_id).creadoras.push(item);
        else sinTour.push(item);
      });
      return ok(headers, { tours: out, creadoras_por_fecha: sinTour });
    }

    // ── [ALARMAS-1 13-oct] la logística del equipo, en una lista ───────────
    // Palabra de Memo: «un mejor sistema de alarmas de las acciones de los
    // coordis: ya aceptó evento, falta ponerle boleto, creadora firmó, falta
    // ponerle boleto, tallas…». SOLO LEE. Cada alarma dice qué falta, de quién,
    // en qué tour y cuándo es, y a dónde ir a resolverlo. Solo tours que no han
    // pasado. Rojo = faltan ≤7 días; amarillo = hay tiempo.
    if (accion === 'alarmas_operacion') {
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
      const diasA = (f) => f ? Math.round((Date.parse(f + 'T12:00:00Z') - Date.parse(hoy + 'T12:00:00Z')) / 86400000) : null;
      const leer = async (url) => { const r = await fetch(url, { headers: sbHeaders }); if (!r.ok) throw new Error(url.split('/rest/v1/')[1].split('?')[0] + ' ' + r.status); return r.json(); };
      let asigs, usus, ctrs, staff, reqs, cambios, salidas, EV = [];
      try {
        [asigs, usus, ctrs, staff, reqs, cambios, salidas] = await Promise.all([
          leer(`${baseEC}?select=id,evento_id,coordi_id,status,asignado_en&limit=5000`),
          leer(`${baseUsuarios}?select=id,nombre,rol,correo,talla_playera,activo&limit=1000`),
          leer(`${baseContratos}?select=id,creador_nombre,creador_email,plantilla,estado,evento_nombre,evento_fecha,datos&limit=2000`),
          leer(`${baseVE}?tipo_viajero=not.is.null&tipo_viajero=neq.cliente&select=id,evento_id,usuario_id,nombre,zona_boleto,talla_playera,tipo_viajero,sin_boleto&limit=5000`),
          leer(`${env.KH_SB_URL}/rest/v1/requisiciones?estado=eq.pendiente&select=id&limit=1000`),
          leer(`${env.KH_SB_URL}/rest/v1/cambios_viajero?estado=eq.pendiente&select=id&limit=1000`),
          leer(`${env.KH_SB_URL}/rest/v1/salidas_bodega?estado=eq.solicitada&select=id,evento_id,solicitante_id&limit=500`),
        ]);
      } catch (e) { return upstream(headers, e.message, 'consulta'); }
      try { EV = await require('./_lib/catalogo-index').fetchEventosRaw(); } catch (_) { EV = []; }
      const evDe = {}; (EV || []).forEach((e) => { if (e && e.id) evDe[e.id] = e; });
      // Fecha y nombre de una llave (`omar#1` → la fecha de esa función).
      const infoEv = (llave) => {
        const [b, i] = String(llave || '').split('#'); const e = evDe[b];
        if (!e) return { nombre: llave, fecha: null };
        const mf = (i != null && Array.isArray(e.multifecha)) ? e.multifecha[Number(i)] : null;
        const fecha = (mf && mf.ds) || (i != null && Array.isArray(e.dsList) && e.dsList[Number(i)]) || e.ds || null;
        return { nombre: (e.a || b) + (mf && mf.lbl ? ' · ' + mf.lbl : ''), fecha };
      };
      const uDe = {}; (usus || []).forEach((u) => { uDe[u.id] = u; });
      const firmado = new Set((ctrs || []).filter((c) => c.plantilla === 'coordinador' && c.estado === 'firmado').map((c) => String(c.creador_email || '').toLowerCase()));
      const alarmas = [];
      const push = (a) => { a.nivel = a.nivel || ((a.dias != null && a.dias <= 7) ? 'rojo' : 'amarillo'); alarmas.push(a); };
      // 1) Equipo asignado (coordis/staff) a tours que vienen.
      (asigs || []).forEach((a) => {
        if (a.status === 'declinado') return;
        const ev = infoEv(a.evento_id); const dias = diasA(ev.fecha);
        if (dias == null || dias < 0) return;
        const u = uDe[a.coordi_id] || {}; const quien = u.nombre || 'Alguien';
        const base = { evento_id: a.evento_id, evento: ev.nombre, fecha: ev.fecha, dias, persona: quien };
        if (a.status !== 'aceptado') push({ ...base, tipo: 'por_aceptar', texto: `${quien} no ha aceptado el tour` });
        if (u.rol === 'coordinador' && !firmado.has(String(u.correo || '').toLowerCase())) push({ ...base, tipo: 'sin_contrato', nivel: 'rojo', texto: `${quien} va asignada(o) y NO ha firmado contrato` });
        const fila = (staff || []).find((v) => v.usuario_id === a.coordi_id && (v.evento_id === a.evento_id || String(v.evento_id).split('#')[0] === a.evento_id));
        // [STAFF-SINBOLETO-1] «va sin boleto» es una DECISIÓN, no un faltante: no alarma.
        if (!fila || (!fila.zona_boleto && !fila.sin_boleto)) push({ ...base, tipo: 'sin_boleto', texto: `${quien} no tiene boleto asignado` });
        if (!((fila && fila.talla_playera) || u.talla_playera)) push({ ...base, tipo: 'sin_talla', nivel: 'amarillo', texto: `${quien} no tiene talla de playera` });
      });
      // 2) Creadoras: contrato del tour (por fecha del contrato).
      // Un contrato reenviado deja dos filas pendientes de la misma persona: se
      // avisa una vez (gana la firmada, si la hay).
      const vistos = new Set();
      (ctrs || []).filter((c) => c.plantilla === 'creadora' && c.estado !== 'cancelado')
        .sort((x, y) => (x.estado === 'firmado' ? 0 : 1) - (y.estado === 'firmado' ? 0 : 1)).forEach((c) => {
        const dias = diasA(c.evento_fecha);
        if (dias == null || dias < 0) return;
        const llaveC = String(c.creador_email || c.creador_nombre).toLowerCase() + '|' + c.evento_fecha;
        if (vistos.has(llaveC)) return; vistos.add(llaveC);
        const d = (c.datos && typeof c.datos === 'object') ? c.datos : {};
        const base = { contrato_id: c.id, evento: c.evento_nombre, fecha: c.evento_fecha, dias, persona: c.creador_nombre, evento_id: (d.cortesia && d.cortesia.evento_id) || null };
        if (c.estado !== 'firmado') { push({ ...base, tipo: 'creadora_sin_firma', texto: `${c.creador_nombre} (creadora) no ha firmado su contrato` }); return; }
        if (!d.cortesia) push({ ...base, tipo: 'creadora_sin_boleto', texto: `${c.creador_nombre} (creadora) ya firmó — falta asignarle su cortesía` });
        if (!d.talla) push({ ...base, tipo: 'creadora_sin_talla', nivel: 'amarillo', texto: `${c.creador_nombre} (creadora) sin talla de playera` });
        if (d.acompanante && d.acompanante.nombre && !d.acompanante.talla) push({ ...base, tipo: 'acomp_sin_talla', nivel: 'amarillo', texto: `Acompañante de ${c.creador_nombre} sin talla` });
      });
      // 3) Bandejas que esperan a alguien.
      const bandejas = { requisiciones: (reqs || []).length, cambios: (cambios || []).length, salidas: (salidas || []).length };
      const orden = { rojo: 0, amarillo: 1 };
      alarmas.sort((x, y) => (orden[x.nivel] - orden[y.nivel]) || ((x.dias ?? 999) - (y.dias ?? 999)));
      return ok(headers, { alarmas, bandejas, hoy, catalogo: EV.length > 0 });
    }

    // ── [STAFF-BOLETO-1 13-oct] el boleto de un coordi/staff en un tour ─────
    // Palabra de Memo: «hay que empezarles a asignar boletos» (51 asignaciones).
    // El 🎟 del contrato es de UN evento por contrato y el de coordinador es
    // anual, así que el boleto de staff vive en la ASIGNACIÓN: { evento_id
    // (la llave de la tarjeta, `omar#0`), coordi_id, zona } — zona '' = quitar.
    //   · la zona pasa por la PUERTA de la ficha (desconocida → 400 nombrando
    //     las que sí hay; mal escrita → se guarda la canónica);
    //   · se escribe en SU lugar de viajero (`usuario_id` + evento); si todavía
    //     no aceptó y no tiene lugar, nace igual que al aceptar (staff, PLUS);
    //   · el inventario: [STAFF-BOLETO-2] la FILA del staff con zona ES el
    //     boleto (`ocupaLugar`); `vendidos_fuera` no se toca (lo pisa el careo).
    //     Antes de poner una zona se mide en Kamisama: agotada o sin compras
    //     cargadas → 409. El 2º clic con la misma zona no escribe NADA. Cero DELETEs.
    if (accion === 'staff_boleto') {
      const evento_id = String(body.evento_id || '').trim();
      if (!evento_id || !SLUG_RE.test(evento_id) || evento_id.length > 120) return bad(headers, 'evento_id inválido');
      const coordi_id = String(body.coordi_id || '').trim();
      if (!UUID_RE.test(coordi_id)) return bad(headers, 'coordi_id inválido');
      let zonaPedida = cleanText(body.zona, 120) || '';
      // [STAFF-SINBOLETO-1] '__sin_boleto__' = va al tour pero NO usa boleto en
      // este evento: zona en NULL (no descuenta) + marca que apaga la alarma.
      const sinBoleto = zonaPedida === '__sin_boleto__';
      if (sinBoleto) zonaPedida = '';
      const eventoBase = evento_id.split('#')[0];
      // Tiene que estar asignado a esa fecha o al evento base.
      const ra = await fetch(`${baseEC}?coordi_id=eq.${coordi_id}&evento_id=in.(${[...new Set([evento_id, eventoBase])].map(encodeURIComponent).join(',')})&select=id,status&limit=1`, { headers: sbHeaders });
      if (!ra.ok) return upstream(headers, await ra.text(), 'consulta');
      if (!(await ra.json()).length) return { statusCode: 409, headers, body: JSON.stringify({ error: 'Esa persona no está asignada a este tour' }) };

      let zona = null;
      if (zonaPedida) {
        const pz = await puertaZona(evento_id, zonaPedida);
        if (pz.estado === 'desconocida') return bad(headers, `«${zonaPedida}» no es zona de este evento. Zonas: ${(pz.canonicas || []).join(', ')}`);
        zona = pz.zona;
      }

      // Su lugar de viajero en ESTA fecha.
      const rv = await fetch(`${baseVE}?evento_id=eq.${encodeURIComponent(evento_id)}&usuario_id=eq.${coordi_id}&select=id,zona_boleto,tipo_viajero,notas,sin_boleto&limit=1`, { headers: sbHeaders });
      if (!rv.ok) return upstream(headers, await rv.text(), 'consulta');
      let fila = (await rv.json())[0] || null;
      const zonaVieja = fila ? (fila.zona_boleto || null) : null;
      const sinVieja = !!(fila && fila.sin_boleto);
      if (zonaVieja === zona && sinVieja === sinBoleto) return ok(headers, { ya: true, zona, sin_boleto: sinBoleto });

      // 🔒 [STAFF-BOLETO-2] NO SE SOBREVENDE (palabra de Memo): la zona nueva
      // tiene que tener lugar EN KAMISAMA. La fila del staff ES el boleto
      // (`ocupaLugar`), así que aquí no se toca `vendidos_fuera` — eso lo pisa
      // el careo. Zona sin compras cargadas = no se sabe si hay → se rehúsa.
      if (zona) {
        if (!env.PORTAL_SB_URL || !env.PORTAL_SB_SERVICE) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan llaves del Portal para medir la disponibilidad' }) };
        const disp = await cargarDisponibilidad({ khUrl: env.KH_SB_URL, khKey: env.KH_SB_SERVICE, portalUrl: env.PORTAL_SB_URL, portalKey: env.PORTAL_SB_SERVICE, evento_id });
        if (disp.error) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo medir el inventario; intenta de nuevo' }) };
        const ez = evaluarZona(disp, zona, 1);
        if (!ez.gestionada) return { statusCode: 409, headers, body: JSON.stringify({ error: `«${zona}» no tiene compras cargadas en Kamisama: no se sabe si hay lugar. Carga el pedido primero.`, sin_stock: true }) };
        if (ez.restante < 1) return { statusCode: 409, headers, body: JSON.stringify({ error: `«${zona}» está AGOTADA en Kamisama (quedan ${ez.restante}). Elige otra zona.`, agotada: true, restante: ez.restante }) };
      }

      if (!fila) {
        if (!zona && !sinBoleto) return ok(headers, { ya: true, zona: null });
        const ur = await fetch(`${baseUsuarios}?id=eq.${coordi_id}&select=id,nombre,celular,correo,talla_playera,num_emergencia,nombre_emergencia,rol&limit=1`, { headers: sbHeaders });
        if (!ur.ok) return upstream(headers, await ur.text(), 'consulta');
        const u = (await ur.json())[0];
        if (!u) return bad(headers, 'Usuario no encontrado');
        const ins = await fetch(baseVE, {
          method: 'POST', headers: { ...sbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({
            evento_id, nombre: u.nombre, celular: u.celular || null, correo: u.correo || null,
            talla_playera: u.talla_playera || null, num_emergencia: u.num_emergencia || null,
            emergencia_nombre: u.nombre_emergencia || null, tipo_paquete: 'PLUS',
            tipo_viajero: u.rol || 'staff', usuario_id: u.id, zona_boleto: zona, sin_boleto: sinBoleto,
            notas: sinBoleto ? `[STAFF:${u.rol || 'staff'}] Va al tour SIN boleto en este evento (marcado en Capsule)` : `[STAFF:${u.rol || 'staff'}] Boleto de staff asignado en Capsule (${zona})`,
          }),
        });
        if (!ins.ok) return upstream(headers, await ins.text(), 'insert');
        fila = (await ins.json())[0];
      } else {
        if (esCliente(fila.tipo_viajero)) return { statusCode: 409, headers, body: JSON.stringify({ error: 'Esa fila es de un cliente, no de staff: el boleto de un cliente se maneja en su compra' }) };
        const up = await fetch(`${baseVE}?id=eq.${fila.id}&${zonaVieja ? `zona_boleto=eq.${encodeURIComponent(zonaVieja)}` : 'zona_boleto=is.null'}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({ zona_boleto: zona, sin_boleto: sinBoleto, notas: `${fila.notas || ''} · boleto de staff: ${zonaVieja || (sinVieja ? 'sin boleto' : '—')} → ${zona || (sinBoleto ? 'sin boleto (no lo usa)' : '—')}`.slice(0, 4000) }),
        });
        if (!up.ok) return upstream(headers, await up.text(), 'update');
        if (!(await up.json()).length) return { statusCode: 409, headers, body: JSON.stringify({ error: 'Alguien la cambió al mismo tiempo: recarga y vuelve a intentar' }) };
      }

      return ok(headers, { zona, antes: zonaVieja, sin_boleto: sinBoleto });
    }

    // ── [CREA-1b] cortesía: boleto de cortesía a un evento ────────────────
    // El camino manual de Jane (Day Escamilla en calle24, Victor Gael en
    // calle24), hecho botón. NACE GENÉRICO: creadoras Y staff, con el paquete
    // parametrizado por la plantilla del contrato — no dos caminos gemelos.
    //
    // 🔒 NINGÚN GASTO SE CAPTURA POR UNA CORTESÍA. La inversión en boletos ya
    // pesa COMPLETA en la utilidad desde el día uno (UTIL-C: `cobrado −
    // inversión total en boletos − gastos`). Un boleto de cortesía es un
    // boleto YA COMPRADO que se entrega sin cobrar: lo que cambia es que ese
    // asiento deja de estar disponible para vender, no que salga dinero.
    // Capturar un gasto aquí lo contaría DOS VECES. Por eso esta acción toca
    // `viajeros_evento` y `stock_ajustes`, y NADA de dinero.
    // ── [CREA-BAJA-1] DAR DE BAJA LA COLABORACIÓN DE UNA CREADORA ─────────
    // Palabra de Memo (14-oct): si una creadora no cumple lo pactado antes del
    // evento, se cancela la colaboración y se le avisa por correo que el
    // contrato queda sin efecto. Tres cosas, en este orden:
    //   1) el contrato pasa a estado 'cancelado' (NO se borra: es la prueba de
    //      lo que firmó) con `datos.cancelacion` = motivo, quién y cuándo;
    //   2) si tenía cortesía, sus filas (ella + acompañante) quedan de BAJA
    //      (boletos 0, zona NULL) y el lugar regresa al inventario — sin DELETE;
    //   3) el correo sale DESPUÉS de escribir: si Resend falla, la baja queda y
    //      se DICE que el correo no salió (se reintenta con el mismo botón).
    // 🔒 `seco:true` es el DEFAULT: enseña el correo exacto y lo que se va a
    // tocar, sin escribir ni mandar. Para hacerlo hace falta `confirmar:true`.
    // 🔒 Idempotente: un contrato ya cancelado no se vuelve a cancelar; el 2º
    // clic solo reintenta el correo si no había salido.
    if (accion === 'contrato_cancelar') {
      const contratoId = String(body.contrato_id || '').trim();
      if (!UUID_RE.test(contratoId)) return bad(headers, 'contrato_id inválido');
      const motivo = cleanText(body.motivo, 600);
      if (!motivo || motivo.length < 5) return bad(headers, 'Escribe el motivo (se le manda a la creadora)');
      const seco = body.confirmar !== true;
      const cr = await fetch(`${baseContratos}?id=eq.${contratoId}&select=id,creador_nombre,creador_email,plantilla,estado,evento_nombre,evento_fecha,firmado_at,expectativas,ofrecimiento,datos&limit=1`, { headers: sbHeaders });
      if (!cr.ok) return upstream(headers, await cr.text(), 'consulta');
      const c = (await cr.json())[0];
      if (!c) return bad(headers, 'Ese contrato no existe');
      if (!['creadora', 'creadora_team'].includes(c.plantilla)) return bad(headers, 'Solo se cancelan así los contratos de creadoras');
      const datos = (c.datos && typeof c.datos === 'object') ? c.datos : {};
      const yaCancelado = c.estado === 'cancelado';
      if (!yaCancelado && c.estado !== 'firmado' && c.estado !== 'pendiente') {
        return { statusCode: 409, headers, body: JSON.stringify({ error: `El contrato está en estado «${c.estado}»` }) };
      }
      // Las filas de la cortesía: mismo evento, tipo creadora, nombre de ella o
      // de su acompañante. Se buscan por grupo_viaje cuando lo hay.
      const cort = datos.cortesia || null;
      let filas = [];
      if (cort && cort.evento_id) {
        const rv = await fetch(`${baseVE}?evento_id=eq.${encodeURIComponent(cort.evento_id)}&tipo_viajero=eq.creadora&select=id,nombre,zona_boleto,boletos,grupo_viaje,notas`, { headers: sbHeaders });
        if (!rv.ok) return upstream(headers, await rv.text(), 'consulta de viajeros');
        const todas = await rv.json();
        const norm = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
        const ella = todas.find((v) => norm(v.nombre) === norm(c.creador_nombre));
        const grupo = ella && ella.grupo_viaje;
        const acomp = norm(cort.acompanante || (datos.acompanante && datos.acompanante.nombre));
        filas = todas.filter((v) => v === ella || (grupo && v.grupo_viaje === grupo) || (acomp && norm(v.nombre) === acomp))
          .filter((v) => !(Number(v.boletos) === 0 && !v.zona_boleto));
      }
      const fechaEv = c.evento_fecha ? new Date(c.evento_fecha + 'T12:00:00Z').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Matamoros' }) : '';
      const fechaFirma = c.firmado_at ? new Date(c.firmado_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Matamoros' }) : '';
      const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
      const nombre1 = String(c.creador_nombre || '').trim().split(/\s+/)[0] || '';
      const asunto = `Cancelación de tu colaboración con Conecta Reynosa — ${c.evento_nombre || 'evento'}`;
      const entregables = Array.isArray(c.expectativas) && c.expectativas.length
        ? `<p style="margin:0 0 8px">Lo acordado en la cláusula 2.2 de tu contrato era:</p><ul style="margin:0 0 14px;padding-left:18px">${c.expectativas.map((e) => `<li style="margin:0 0 4px">${esc(e)}</li>`).join('')}</ul>` : '';
      // [CREA-BAJA-2 · 20-oct-2026] Un contrato que NUNCA se firmó también se da
      // de baja (caso Melissa Salas, Bad Gyal: no firmó ni entregó el contenido
      // previo). El correo no puede citarle cláusulas de un contrato que no
      // aceptó: dice que la invitación queda sin efecto.
      const sinFirma = !yaCancelado ? c.estado === 'pendiente' : !c.firmado_at;
      const html = sinFirma
        ? `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;font-size:14px;line-height:1.55">
<div style="background:#000;color:#fff;padding:16px 20px;font-weight:900;letter-spacing:.04em">CONECTA REYNOSA</div>
<div style="padding:20px">
<p style="margin:0 0 12px">Hola ${esc(nombre1)}:</p>
<p style="margin:0 0 12px">Te escribimos para informarte que <b>la invitación a colaborar con Conecta Reynosa para ${esc(c.evento_nombre || 'el evento')}${fechaEv ? ` (${esc(fechaEv)})` : ''} queda cancelada</b>. El contrato de colaboración que te enviamos no se firmó, así que queda <b>sin efecto</b> a partir de hoy.</p>
<p style="margin:0 0 8px"><b>Motivo:</b> ${esc(motivo)}</p>
<p style="margin:0 0 12px">No recibirás los beneficios del intercambio (${esc((Array.isArray(c.ofrecimiento) ? c.ofrecimiento : []).join(', ') || 'boletos y kit')}) y <b>no tienes ningún pago ni reembolso pendiente</b> con nosotros.</p>
<p style="margin:0 0 12px">Si crees que hay un error, respóndenos a este correo.</p>
<p style="margin:0">Gracias por tu tiempo,<br><b>Conecta Reynosa</b></p>
</div></div>`
        : `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;font-size:14px;line-height:1.55">
<div style="background:#000;color:#fff;padding:16px 20px;font-weight:900;letter-spacing:.04em">CONECTA REYNOSA</div>
<div style="padding:20px">
<p style="margin:0 0 12px">Hola ${esc(nombre1)}:</p>
<p style="margin:0 0 12px">Te escribimos para informarte que <b>tu colaboración con Conecta Reynosa para ${esc(c.evento_nombre || 'el evento')}${fechaEv ? ` (${esc(fechaEv)})` : ''} queda cancelada</b>, y el contrato de colaboración${fechaFirma ? ` que firmaste el ${esc(fechaFirma)}` : ''} queda <b>sin efecto</b> a partir de hoy.</p>
<p style="margin:0 0 8px"><b>Motivo:</b> ${esc(motivo)}</p>
${entregables}
<p style="margin:0 0 12px">Esta decisión se toma con base en la cláusula 5 («Políticas de cancelación») de tu contrato, que contempla la cancelación cuando el contenido no se entrega en tiempo y forma.</p>
<p style="margin:0 0 12px">Como la colaboración se cancela <b>antes del evento</b>, no recibirás los beneficios del intercambio (${esc((Array.isArray(c.ofrecimiento) ? c.ofrecimiento : []).join(', ') || 'boletos y kit')}) y <b>no tienes ningún pago ni reembolso pendiente</b> con nosotros.</p>
<p style="margin:0 0 12px">Si crees que hay un error, respóndenos a este correo.</p>
<p style="margin:0">Gracias por tu tiempo,<br><b>Conecta Reynosa</b></p>
</div></div>`;
      const plan = {
        contrato: { id: c.id, nombre: c.creador_nombre, correo: c.creador_email, evento: c.evento_nombre, fecha: c.evento_fecha, estado: c.estado },
        cortesia_baja: filas.map((v) => ({ id: v.id, nombre: v.nombre, zona: v.zona_boleto, boletos: v.boletos })),
        correo: { para: c.creador_email, asunto, html },
      };
      if (seco) return ok(headers, { seco: true, plan, ya_cancelado: yaCancelado });

      const hoy = new Date().toISOString();
      const ahora = { motivo, por: jwtUserId, at: hoy };
      // 1) El contrato. Valor esperado en el filtro: dos clics no escriben dos veces.
      if (!yaCancelado) {
        const nuevosDatos = { ...datos, cancelacion: ahora, estado_previo: c.estado };
        const pr = await fetch(`${baseContratos}?id=eq.${c.id}&estado=eq.${encodeURIComponent(c.estado)}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({ estado: 'cancelado', datos: nuevosDatos }),
        });
        if (!pr.ok) return upstream(headers, await pr.text(), 'cambio del contrato');
        const out = await pr.json();
        if (!out.length) return { statusCode: 409, headers, body: JSON.stringify({ error: 'El contrato cambió mientras tanto; vuelve a abrirlo' }) };
      }
      // 2) La cortesía: baja de sus filas, el lugar vuelve al inventario.
      const bajas = [];
      for (const v of filas) {
        const nota = `${v.notas ? v.notas + ' · ' : ''}BAJA ${hoy.slice(0, 10)}: colaboración cancelada (${motivo.slice(0, 120)}) — zona antes: ${v.zona_boleto || '—'}`;
        const pv = await fetch(`${baseVE}?id=eq.${v.id}&boletos=eq.${Number(v.boletos) || 0}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({ boletos: 0, zona_boleto: null, notas: nota }),
        });
        bajas.push({ id: v.id, nombre: v.nombre, ok: pv.ok });
      }
      // 3) El correo, DESPUÉS de escribir. Un 2º clic sobre uno ya cancelado
      //    solo reintenta si el correo no había salido.
      let correo = { enviado: false };
      const yaSalio = datos.cancelacion && datos.cancelacion.email_id;
      if (yaSalio) correo = { enviado: true, ya: true, email_id: datos.cancelacion.email_id };
      else {
        const RESEND = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
        const FROM = process.env.RESEND_FROM_CONTRATOS || process.env.RESEND_FROM_ROL || 'Conecta Reynosa <admin@conectareynosa.mx>';
        if (!RESEND || !c.creador_email) correo = { enviado: false, error: !RESEND ? 'Falta RESEND_API_KEY' : 'El contrato no tiene correo' };
        else {
          try {
            const { aplicarModoPrueba } = require('./_lib/correo-guard');
            const mp = aplicarModoPrueba({ to: c.creador_email, subject: asunto });
            const er = await fetch('https://api.resend.com/emails', {
              method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ from: FROM, to: mp.to, subject: mp.subject, html, reply_to: 'admin@conectareynosa.mx' }),
            });
            const ej = await er.json().catch(() => ({}));
            correo = er.ok ? { enviado: true, email_id: ej.id || null } : { enviado: false, error: ej.message || ('Resend ' + er.status) };
          } catch (e) { correo = { enviado: false, error: e.message }; }
        }
        if (correo.enviado) {
          // Bitácora del envío en el mismo contrato (lee de nuevo para no pisar).
          const rr = await fetch(`${baseContratos}?id=eq.${c.id}&select=datos&limit=1`, { headers: sbHeaders });
          const d2 = rr.ok ? ((await rr.json())[0] || {}).datos || {} : null;
          if (d2) {
            d2.cancelacion = { ...(d2.cancelacion || ahora), email_id: correo.email_id, email_at: new Date().toISOString() };
            await fetch(`${baseContratos}?id=eq.${c.id}`, { method: 'PATCH', headers: sbHeaders, body: JSON.stringify({ datos: d2 }) });
          }
        }
      }
      return ok(headers, { cancelado: true, ya_cancelado: yaCancelado, bajas, correo });
    }

    if (accion === 'cortesia_asignar') {
      const contratoId = String(body.contrato_id || '').trim();
      if (!UUID_RE.test(contratoId)) return bad(headers, 'contrato_id inválido');
      const evento_id = String(body.evento_id || '').trim();
      if (!evento_id || !SLUG_RE.test(evento_id) || evento_id.length > 120) return bad(headers, 'evento_id inválido');
      const zona = cleanText(body.zona, 120);
      if (!zona) return bad(headers, 'Falta la zona del boleto');
      const boletos = Number(body.boletos);
      if (!Number.isInteger(boletos) || boletos < 1 || boletos > MAX_BOLETOS_CORTESIA) {
        return bad(headers, `Los boletos de cortesía van de 1 a ${MAX_BOLETOS_CORTESIA}`);
      }

      // PUERTA: sin contrato FIRMADO no hay cortesía. Es el par negativo del
      // careo — y la razón de que la acción cuelgue del contrato y no de un
      // formulario libre: el contrato es lo que prueba el acuerdo.
      const cr = await fetch(
        `${baseContratos}?id=eq.${contratoId}&select=id,creador_nombre,creador_email,plantilla,estado,datos&limit=1`,
        { headers: sbHeaders });
      if (!cr.ok) return upstream(headers, await cr.text(), 'consulta');
      const contrato = (await cr.json())[0];
      if (!contrato) return bad(headers, 'Ese contrato no existe');
      if (contrato.estado !== 'firmado') {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'El contrato no está firmado: no hay cortesía que asignar' }) };
      }

      // El paquete SALE DE LA PLANTILLA, y la tabla es explícita: una plantilla
      // desconocida se RECHAZA en vez de caer a un default. Un selector que
      // elige solo inventa un dato (la mordida de `kmt-prov`).
      const paquete = PAQUETE_POR_PLANTILLA[contrato.plantilla];
      if (!paquete) return bad(headers, `No sé qué paquete le toca a un contrato "${contrato.plantilla}"`);

      // IDEMPOTENCIA, y va en el contrato: `stock_ajustes` SUMA, así que un
      // segundo clic duplicaría boletos en silencio. La cortesía queda anotada
      // en `datos.cortesia` (jsonb que ya es nuestro — cero SQL) y el segundo
      // clic no toca nada.
      const datos = (contrato.datos && typeof contrato.datos === 'object') ? contrato.datos : {};
      const yaCort = datos.cortesia;
      if (yaCort && yaCort.evento_id === evento_id) {
        return ok(headers, { ya: true, cortesia: yaCort });
      }

      // TALLA. El predicado NO es "el contrato no tiene `datos`": hoy 26 de 26
      // contratos firmados traen `datos` y NINGUNO trae talla (CREA-1a acaba
      // de nacer). Preguntar por el objeto en vez de por el campo habría dejado
      // pasar 22 con talla nula.
      let talla = cleanText(datos.talla, 8);
      let tallaOrigen = 'contrato';
      if (!talla) {
        talla = cleanText(body.talla, 8);
        if (talla) talla = talla.toUpperCase();
        if (!TALLAS_CORTESIA.includes(talla)) {
          return { statusCode: 409, headers, body: JSON.stringify({
            error: 'Este contrato es anterior a la talla en el formulario: captúrala a mano',
            falta_talla: true,
          }) };
        }
        // 🔒 LA PROCEDENCIA VIAJA CON EL DATO: nadie debe creer después que el
        // contrato la traía. CREA-1a la marca 'contrato'; ésta, distinto.
        tallaOrigen = 'capturada_al_asignar';
      }

      // 🔒 [CREA-1c] EL CANDADO DEL DOBLE DESCUENTO. Se le pregunta a la
      // función dueña, no a una lista de tipos escrita aquí: si la fila que
      // vamos a dejar DESCONTARA boleto por su cuenta, sumar a `vendidos_fuera`
      // restaría el mismo boleto dos veces y el semáforo cerraría zonas que sí
      // tienen lugar. Es exactamente el doble descuento que MIG-1b avisa en el
      // alta de migrados — ahí se DICE porque el dato lo escribió Memo a mano;
      // aquí se IMPIDE, porque el que lo escribiría es este botón.
      if (consumeBoleto(paquete.tipo_paquete, paquete.tipo_viajero)) {
        return { statusCode: 409, headers, body: JSON.stringify({
          error: `Un ${paquete.tipo_viajero} con paquete ${paquete.tipo_paquete} descuenta boleto por su cuenta: sumarlo también a "vendidos fuera" restaría el mismo boleto dos veces. Revisa la tabla de paquetes antes de asignar.`,
          doble_descuento: true,
        }) };
      }

      // [CREA-2] EL ACOMPAÑANTE, de nota a VIAJERO. El contrato lo trae desde
      // CREA-1a (nombre + talla, en pareja) y hasta hoy se quedaba en una nota
      // de la creadora: su talla no llegaba a ningún lado y la lista de viajeros
      // decía 1 persona con 2 boletos descontados. Lo que teclea quien asigna
      // MANDA sobre el contrato (es la corrección humana: Marietta escribió a
      // una tercera persona dentro del nombre); vacío → lo del contrato.
      const acomp = (body.acompanante && typeof body.acompanante === 'object') ? body.acompanante : {};
      // `acompanante: null` explícito = quien asigna lo BORRÓ: no se cae a lo
      // del contrato (si no, no habría forma de decir «va sola con 2 boletos»).
      const acCtr = (body.acompanante !== null && datos.acompanante && typeof datos.acompanante === 'object') ? datos.acompanante : {};
      const acompNombre = cleanText(acomp.nombre, 120) || cleanText(acCtr.nombre, 120);
      let acompTalla = String(cleanText(acomp.talla, 8) || cleanText(acCtr.talla, 8) || '').toUpperCase() || null;
      if (acompTalla && !TALLAS_CORTESIA.includes(acompTalla)) return bad(headers, `Talla de acompañante inválida: ${acompTalla}`);
      // Solo nace viajero si hay un boleto PARA él: con 1 boleto el acompañante
      // no viaja por cortesía, y crear su fila diría que sí.
      const acompViaja = !!acompNombre && boletos >= 2;
      if (acompViaja && !acompTalla) {
        return { statusCode: 409, headers, body: JSON.stringify({
          error: `Falta la talla de ${acompNombre}: captúrala a mano`, falta_talla_acomp: true,
        }) };
      }

      // Mismo patrón que `abono_crear` en este archivo — el contrato de
      // verifyAdminAuthLive es {valid, user:{id,correo,rol}}, NO auth.nombre.
      const quien = (auth.user && (auth.user.nombre || auth.user.correo)) || jwtUserId || 'panel';
      const notaViajero = [
        paquete.nota,
        'solo boleto + kit',
        acompNombre ? `acompañante: ${acompNombre}${acompViaja ? ' (viaja con ella, fila propia)' : ' (sin boleto de cortesía)'}` : null,
        tallaOrigen === 'capturada_al_asignar' ? 'talla capturada al asignar (el contrato no la traía)' : null,
      ].filter(Boolean).join(' · ');

      // ¿Ya hay fila? El caso Victor: `viajero_upsert_staff` YA lo registró al
      // aceptar el tour. Ahí la cortesía no inserta — COMPLETA la zona. Insertar
      // sería duplicar a una persona que ya viaja.
      const claveCorreo = contrato.creador_email || null;
      let existente = null;
      if (claveCorreo) {
        const ex = await fetch(
          `${baseVE}?evento_id=eq.${encodeURIComponent(evento_id)}&correo=eq.${encodeURIComponent(claveCorreo)}&select=id,nombre,zona_boleto,talla_playera,grupo_viaje&limit=1`,
          { headers: sbHeaders });
        if (!ex.ok) return upstream(headers, await ex.text(), 'consulta');
        existente = (await ex.json())[0] || null;
      }

      // [CREA-3] EL CANDADO DEL DUPLICADO POR NOMBRE. La migración del Excel dio
      // de alta gente SIN correo, así que buscar solo por correo deja pasar a
      // quien ya está en la lista (medido 13-oct: Marietta Barrera ya vive en
      // soyluna con 2 boletos VIP pagados). Antes de CREAR a alguien —ella o su
      // acompañante— se busca en el evento por nombre parecido (primer nombre +
      // otra palabra del nombre, sin acentos). Si aparece, NO se escribe nada:
      // se contesta 409 con las filas, y quien asigna decide:
      //   · `viajero_existente_id` → es ella: se COMPLETA esa fila (como Victor);
      //   · `es_otra_persona: true` → son personas distintas: se crea igual.
      // Un candado que adivina «es la misma» y escribe sería peor que ninguno.
      const _tok = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t.length >= 3);
      const _parecido = (a, b) => {
        const ta = _tok(a), tb = new Set(_tok(b));
        if (!ta.length || !tb.has(ta[0])) return false;
        return ta.length === 1 || ta.slice(1).some((t) => tb.has(t));
      };
      let filasEvento = null;
      const _filasEvento = async () => {
        if (filasEvento) return filasEvento;
        const r = await fetch(`${baseVE}?evento_id=eq.${encodeURIComponent(evento_id)}&select=id,nombre,correo,tipo_paquete,tipo_viajero,zona_boleto,boletos,total_contrato,abonado_previo,talla_playera,grupo_viaje&limit=2000`,
          { headers: sbHeaders });
        if (!r.ok) throw new Error('consulta ' + r.status);
        filasEvento = await r.json();
        return filasEvento;
      };
      if (!existente && body.viajero_existente_id) {
        const vid = String(body.viajero_existente_id);
        if (!UUID_RE.test(vid)) return bad(headers, 'viajero_existente_id inválido');
        const fila = (await _filasEvento()).find((v) => v.id === vid);
        if (!fila) return bad(headers, 'Esa fila no es de este evento');
        // [CREA-3b] Una COMPRA no se convierte en cortesía (caso Marietta: compró
        // 2 VIP y aparte le dimos 2 de cortesía). Completarla la sellaría como
        // creadora y dejaría de descontar SUS boletos comprados del inventario
        // —que justo se le sumaba aquí como cortesía—: 4 boletos contados como 2.
        // Si la fila descuenta boleto y trae dinero, la cortesía va APARTE.
        if (consumeBoleto(fila.tipo_paquete, fila.tipo_viajero) &&
            (Number(fila.total_contrato || 0) > 0 || Number(fila.abonado_previo || 0) > 0)) {
          return { statusCode: 409, headers, body: JSON.stringify({
            error: `«${fila.nombre}» es una COMPRA (${fila.boletos || 1} boleto(s), contrato $${Number(fila.total_contrato || 0).toLocaleString('es-MX')}): la cortesía va aparte. Usa «Son otras personas».`,
            es_compra: true,
          }) };
        }
        existente = fila;
      }
      if (!existente && body.es_otra_persona !== true) {
        let filas;
        try { filas = await _filasEvento(); } catch (e) { return upstream(headers, e.message, 'consulta'); }
        const quien = (n) => filas.filter((v) => _parecido(n, v.nombre)).map((v) => ({
          id: v.id, nombre: v.nombre, paquete: v.tipo_paquete, tipo: v.tipo_viajero, zona: v.zona_boleto,
          boletos: v.boletos, contrato: Number(v.total_contrato || 0), pagado_previo: Number(v.abonado_previo || 0),
        }));
        const deElla = quien(contrato.creador_nombre);
        const deEl = acompViaja ? quien(acompNombre) : [];
        if (deElla.length || deEl.length) {
          return { statusCode: 409, headers, body: JSON.stringify({
            error: 'Puede que ya esté en la lista de viajeros de este evento: revisa antes de asignar.',
            posible_duplicado: true, creadora: deElla, acompanante: deEl,
          }) };
        }
      }

      // 🔒 [STAFF-BOLETO-2] NO SE SOBREVENDE: los boletos de la cortesía salen
      // de Kamisama y se miden ANTES de escribir. Zona sin compras o sin lugar
      // suficiente → 409 sin tocar nada.
      if (!existente || existente.zona_boleto !== zona) {
        if (!env.PORTAL_SB_URL || !env.PORTAL_SB_SERVICE) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Faltan llaves del Portal para medir la disponibilidad' }) };
        const disp = await cargarDisponibilidad({ khUrl: env.KH_SB_URL, khKey: env.KH_SB_SERVICE, portalUrl: env.PORTAL_SB_URL, portalKey: env.PORTAL_SB_SERVICE, evento_id });
        if (disp.error) return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo medir el inventario; intenta de nuevo' }) };
        const ez = evaluarZona(disp, zona, boletos);
        if (!ez.gestionada) return { statusCode: 409, headers, body: JSON.stringify({ error: `«${zona}» no tiene compras cargadas en Kamisama: carga el pedido antes de dar cortesías.`, sin_stock: true }) };
        if (ez.sinCupo) return { statusCode: 409, headers, body: JSON.stringify({ error: `«${zona}» no tiene ${boletos} lugar(es) en Kamisama (quedan ${ez.restante}).`, agotada: true, restante: ez.restante }) };
      }

      // [CREA-2] El grupo: si ella ya viajaba en uno, se reusa (no se parte un
      // grupo que armó alguien más); si no, nace uno nuevo. Solo si de verdad
      // va acompañada — un grupo de una persona no dice nada.
      const grupo = acompViaja ? ((existente && existente.grupo_viaje) || require('crypto').randomUUID()) : null;

      let viajero = null;
      if (existente) {
        // [CREA-1c] Sella TAMBIÉN el tipo. El `viajero_upsert_staff` tiene un
        // reintento que inserta SIN `tipo_viajero` si la columna no está en
        // prod, y una fila con el tipo en NULL SÍ descuenta boleto: darle zona
        // sin sellarla la haría descontar además del `vendidos_fuera` que
        // sumamos abajo. El mismo boleto, restado dos veces.
        const up = await fetch(`${baseVE}?id=eq.${existente.id}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({
            zona_boleto: zona, talla_playera: talla,
            tipo_paquete: paquete.tipo_paquete, tipo_viajero: paquete.tipo_viajero,
            boletos: acompViaja ? 1 : boletos,   // [STAFF-BOLETO-2] su fila ES el boleto
            ...(grupo ? { grupo_viaje: grupo } : {}),
          }),
        });
        if (!up.ok) return upstream(headers, await up.text(), 'update');
        viajero = (await up.json())[0] || null;
      } else {
        const fila = {
          evento_id,
          nombre: contrato.creador_nombre,
          correo: claveCorreo,
          zona_boleto: zona,
          talla_playera: talla,
          tipo_paquete: paquete.tipo_paquete,
          tipo_viajero: paquete.tipo_viajero,
          total_contrato: 0,   // no debe nada: es cortesía
          abonado_previo: 0,
          // [STAFF-BOLETO-2] Su fila ES el boleto: si el acompañante tiene fila
          // propia, ella lleva 1; si no, lleva todos los de la cortesía.
          boletos: acompViaja ? 1 : boletos,
          notas: notaViajero,
          ...(grupo ? { grupo_viaje: grupo } : {}),
        };
        const ins = await fetch(baseVE, {
          method: 'POST', headers: { ...sbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify(fila),
        });
        if (!ins.ok) return upstream(headers, await ins.text(), 'insert');
        viajero = (await ins.json())[0] || null;
      }

      // [CREA-2] La fila del acompañante. Mismo paquete y MISMO tipo que ella
      // (el candado del doble descuento de arriba ya lo cubre: su boleto ya va
      // en el `vendidos_fuera` de abajo). Sin correo a propósito: el contrato
      // no lo pide y poner el de ella mezclaría su plan en el Portal.
      // Reintento seguro: si una corrida anterior lo creó y truena después (el
      // stock o el sello), se encuentra por nombre en el evento y se COMPLETA en
      // vez de duplicarlo.
      let acompViajero = null;
      if (acompViaja) {
        const exA = await fetch(
          `${baseVE}?evento_id=eq.${encodeURIComponent(evento_id)}&nombre=eq.${encodeURIComponent(acompNombre)}&tipo_viajero=eq.${encodeURIComponent(paquete.tipo_viajero)}&select=id&limit=1`,
          { headers: sbHeaders });
        if (!exA.ok) return upstream(headers, await exA.text(), 'consulta');
        const yaA = (await exA.json())[0] || null;
        const filaA = {
          zona_boleto: zona, talla_playera: acompTalla,
          tipo_paquete: paquete.tipo_paquete, tipo_viajero: paquete.tipo_viajero,
          grupo_viaje: grupo,
        };
        const rA = yaA
          ? await fetch(`${baseVE}?id=eq.${yaA.id}`, {
              method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=representation' }, body: JSON.stringify(filaA) })
          : await fetch(baseVE, {
              method: 'POST', headers: { ...sbHeaders, Prefer: 'return=representation' },
              body: JSON.stringify({
                ...filaA, evento_id, nombre: acompNombre, correo: null,
                total_contrato: 0, abonado_previo: 0,
                notas: `${paquete.nota} · acompañante de ${contrato.creador_nombre} · solo boleto + kit`,
              }) });
        if (!rA.ok) return upstream(headers, await rA.text(), yaA ? 'update' : 'insert');
        acompViajero = (await rA.json())[0] || null;
      }

      // [STAFF-BOLETO-2] EL INVENTARIO YA NO SE TOCA AQUÍ: la fila de la creadora
      // (y la de su acompañante) con zona ES el boleto (`ocupaLugar` en
      // _lib/paquete-viaje). Sumar además a `vendidos_fuera` lo contaría dos
      // veces — y el careo pisa esa casilla con el Excel de todos modos.
      const stockFinal = null;

      // Sello en el contrato: cierra la idempotencia Y deja el rastro de qué se
      // asignó, sin columna nueva.
      const cortesia = {
        evento_id, zona, boletos,
        talla, talla_origen: tallaOrigen,
        acompanante: acompNombre || null,
        acompanante_talla: acompTalla,
        acompanante_viaja: acompViaja,
        asignado_en: new Date().toISOString(),
        asignado_por: quien,
      };
      const selloR = await fetch(`${baseContratos}?id=eq.${contratoId}`, {
        method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ datos: { ...datos, talla, talla_origen: datos.talla ? (datos.talla_origen || 'contrato') : tallaOrigen, cortesia } }),
      });
      if (!selloR.ok) return upstream(headers, await selloR.text(), 'update');

      return ok(headers, { viajero, acompanante: acompViajero, stock: stockFinal, cortesia, creada: !existente });
    }

    // ── viajeros_evento: listar (descarga) — admin o coordi del evento ────
    if (accion === 'viajero_listar') {
      const evento_id = String(body.evento_id || '').trim();
      if (!evento_id || !SLUG_RE.test(evento_id) || evento_id.length > 120) return bad(headers, 'evento_id inválido');

      // [CC-FECHAS-1] El equipo se asigna al evento BASE; la lista vive por
      // fecha (`soyluna`, `omar#1`). La puerta pregunta por las dos llaves.
      const eventoBase = evento_id.split('#')[0];
      if (!esAdmin) {
        // El coordi debe tener una asignación a ese evento.
        const llaves = [...new Set([evento_id, eventoBase])].map(encodeURIComponent).join(',');
        const cr = await fetch(
          `${baseEC}?coordi_id=eq.${jwtUserId}&evento_id=in.(${llaves})&select=id&limit=1`,
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

      // 🔒 [COORDI-LISTA-1 13-oct] LA VISTA DEL COORDI, decidida EN EL SERVIDOR.
      // Palabra de Memo (con la lista de Soy Luna que bajó una coordi enfrente,
      // que traía celulares, correos, notas internas con montos y a los CHEAP):
      // el coordi ve SOLO nombre · zona · paquete · talla · emergencia, y solo
      // de quien VIAJA con el tour (PLUS/STAY/RIDE — `duerme`, la regla de su
      // dueño). CHEAP no aparece. Esconderlo en la pantalla no basta: lo que
      // no debe ver no se le MANDA (la consola también es pantalla).
      // Y aparte, el EQUIPO: coordis asignados (con su estado) y las creadoras
      // con cortesía, diciendo si viajan con el tour o solo van al concierto.
      if (!puedeDinero) {
        const COLS_COORDI = 'id,nombre,zona_boleto,tipo_paquete,tipo_viajero,talla_playera,emergencia_nombre,emergencia_parentesco,num_emergencia,boletos,grupo_viaje,usuario_id';
        const spc = new URLSearchParams();
        spc.set('select', COLS_COORDI);
        spc.append('evento_id', `eq.${evento_id}`);
        spc.set('order', 'nombre.asc');
        spc.set('limit', '2000');
        const rc = await fetch(`${baseVE}?${spc.toString()}`, { headers: sbHeaders });
        if (!rc.ok) return upstream(headers, await rc.text(), 'consulta');
        const filas = await rc.json();
        const limpia = (v) => ({
          id: v.id, nombre: v.nombre, zona_boleto: v.zona_boleto || null,
          tipo_paquete: normPaquete(v.tipo_paquete) ? String(v.tipo_paquete).toUpperCase() : null,
          talla_playera: v.talla_playera || null,
          emergencia_nombre: v.emergencia_nombre || null, emergencia_parentesco: v.emergencia_parentesco || null,
          num_emergencia: v.num_emergencia || null,
          boletos: v.boletos || 1, grupo_viaje: v.grupo_viaje || null,
        });
        // [COORDI-LISTA-1b] Una BAJA no viaja: el careo la deja con `boletos=0`
        // y la zona en NULL (fila roja = cancelación, CAREO-ZONA-1). Cazado por
        // Memo careando su lista de Soy Luna: Fabiola (cancelada el 8-oct) salía.
        const esBaja = (v) => Number(v.boletos) === 0 && !v.zona_boleto;
        const viajeros = filas.filter((v) => esCliente(v.tipo_viajero) && duerme(v.tipo_paquete) && !esBaja(v)).map(limpia);

        // El equipo: filas de staff/creadoras del evento + asignaciones del
        // evento base (quien está asignado aunque todavía no tenga fila).
        // [AGENCIA-1] Una fila de AGENCIA (Tours Reynosa) no es equipo: solo
        // carga el dinero de una venta al mayoreo. No se le enseña al coordi.
        const staff = filas.filter((v) => !esCliente(v.tipo_viajero) && String(v.tipo_viajero).toLowerCase() !== 'agencia');
        const ra = await fetch(`${baseEC}?evento_id=in.(${[...new Set([evento_id, eventoBase])].map(encodeURIComponent).join(',')})&select=coordi_id,status`, { headers: sbHeaders });
        const asigs = ra.ok ? await ra.json() : [];
        const ids = [...new Set(asigs.map((a) => a.coordi_id).filter((x) => UUID_RE.test(String(x))))];
        let usu = [];
        if (ids.length) {
          const ru = await fetch(`${baseUsuarios}?id=in.(${ids.join(',')})&select=id,nombre,rol`, { headers: sbHeaders });
          if (ru.ok) usu = await ru.json();
        }
        const ROL_TXT = { coordinador: 'Coordinador', cc: 'Creadora de contenido', mister_popo: 'Staff', maestro_roshi: 'Staff', bulma: 'Staff', milk: 'Staff' };
        const TIPO_TXT = { creadora: 'Creadora de contenido', coordinador: 'Coordinador', staff: 'Staff' };
        const equipo = [];
        const yaFila = new Set();
        asigs.forEach((a) => {
          const u = usu.find((x) => x.id === a.coordi_id) || {};
          const fila = staff.find((v) => v.usuario_id && v.usuario_id === a.coordi_id);
          if (fila) yaFila.add(fila.id);
          equipo.push({
            nombre: u.nombre || '—', papel: ROL_TXT[u.rol] || 'Equipo',
            asignacion: a.status || 'pendiente',
            viaja: fila ? viaja(fila.tipo_paquete) : (a.status === 'aceptado' ? true : null),
            zona_boleto: fila ? fila.zona_boleto || null : null,
            talla_playera: fila ? fila.talla_playera || null : null,
          });
        });
        staff.filter((v) => !yaFila.has(v.id)).forEach((v) => {
          equipo.push({
            nombre: v.nombre, papel: TIPO_TXT[String(v.tipo_viajero).toLowerCase()] || 'Equipo',
            asignacion: null, viaja: viaja(v.tipo_paquete),
            zona_boleto: v.zona_boleto || null, talla_playera: v.talla_playera || null,
          });
        });
        return ok(headers, { viajeros, equipo, vista: 'coordi' });
      }
      const cols = puedeDinero ? `${VE_READ_COLS},total_contrato,abonado_previo,portal_revisado_at,portal_revisado_por` : VE_READ_COLS; // [PORTAL-SOLO-1] el sello del Portal viaja solo a quien ve dinero
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

    // ── [PREVENTA-ELEGIR-1] (27-oct-2026) EL DE LA PREVENTA ELIGE SU PAQUETE ──
    // Palabra de Memo: «ya tengo los costos de nsqk para los que hicieron
    // preventa». Hasta hoy KameHouse solo editaba contacto (viajero_editar):
    // pasar de «CHEAP · Preventa a ciegas $300» a su paquete real no tenía
    // puerta. Ésta es esa puerta, y SOLO esa:
    //  · solo para filas EN PREVENTA (cheap + zona «Preventa a ciegas» o sin
    //    zona) — no es un editor general de paquetes;
    //  · la zona pasa por LA PUERTA de la ficha y por el inventario de Kamisama
    //    (palabra de Memo: «lo único que puede pasar es que no haya la zona»);
    //  · el total lo teclea quien captura (regla VJ-3: el sugerido es pista);
    //  · el dinero NO se toca: sus $300 siguen siendo abono/previo y cuentan.
    //  · PATCH con valor esperado: el 2º clic o una carrera escriben 0 filas → 409.
    // ── [CONTRATO-CLIENTE-1] El contrato del cliente desde KameHouse ───────
    // estado: { viajero_id → {estado, firmado_at, envios, url} } de un evento
    // (y sus fechas slug#N). enviar: crea si falta y MANDA (o reenvía) el
    // correo con el link; sin correo devuelve el link para WhatsApp.
    if (accion === 'contrato_cliente_estado') {
      const evento_id = String(body.evento_id || '').trim();
      if (!evento_id || evento_id.length > 80) return bad(headers, 'evento_id inválido');
      const base = evento_id.split('#')[0];
      const r = await fetch(`${env.KH_SB_URL}/rest/v1/contratos_cliente?or=(evento_id.eq.${encodeURIComponent(base)},evento_id.like.${encodeURIComponent(base + '#*')})&estado=neq.anulado&select=id,viajero_id,estado,firmado_at,firmante_nombre,firmante_rol,edad_al_firmar,envios,ine_verificada_at&limit=5000`, { headers: sbHeaders });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const mapa = {};
      (await r.json()).forEach((c) => {
        mapa[c.viajero_id] = { id: c.id, estado: c.estado, firmado_at: c.firmado_at, firmante_nombre: c.firmante_nombre, firmante_rol: c.firmante_rol, edad_al_firmar: c.edad_al_firmar, envios: c.envios, ine_verificada: !!c.ine_verificada_at };
      });
      return ok(headers, { contratos: mapa });
    }
    // [CONTRATO-CLIENTE-2] La INE de un contrato FIRMADO, con URLs firmadas de
    // 10 min (bucket privado), y la marca humana de «la INE coincide».
    if (accion === 'contrato_cliente_ine' || accion === 'contrato_cliente_verificar') {
      const cid = String(body.contrato_id || '').trim();
      if (!/^[0-9a-f-]{36}$/i.test(cid)) return bad(headers, 'contrato_id inválido');
      const rq = await fetch(`${env.KH_SB_URL}/rest/v1/contratos_cliente?id=eq.${cid}&select=id,estado,ine_frente_path,ine_reverso_path,firmante_nombre,firmante_rol,edad_al_firmar,fecha_nacimiento_usada,firmado_por_correo,ine_verificada_at,ine_verificada_por&limit=1`, { headers: sbHeaders });
      if (!rq.ok) return upstream(headers, await rq.text(), 'consulta');
      const c = (await rq.json())[0];
      if (!c || c.estado !== 'firmado') return { statusCode: 404, headers, body: JSON.stringify({ error: 'Ese contrato no está firmado' }) };
      if (accion === 'contrato_cliente_verificar') {
        const quien = (auth.user && (auth.user.nombre || auth.user.correo)) || jwtUserId;
        const pv = await fetch(`${env.KH_SB_URL}/rest/v1/contratos_cliente?id=eq.${cid}&estado=eq.firmado&ine_verificada_at=is.null`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({ ine_verificada_at: new Date().toISOString(), ine_verificada_por: quien }) });
        if (!pv.ok) return upstream(headers, await pv.text(), 'update');
        const fv = await pv.json();
        return ok(headers, { verificada: true, ya: !fv.length });
      }
      const firmar = async (path) => {
        if (!path) return null;
        const sg = await fetch(`${env.KH_SB_URL}/storage/v1/object/sign/contratos-cliente-ine/${path}`, {
          method: 'POST', headers: { ...sbHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 600 }) });
        if (!sg.ok) return null;
        const j = await sg.json().catch(() => ({}));
        return j.signedURL ? `${env.KH_SB_URL}/storage/v1${j.signedURL}` : null;
      };
      return ok(headers, {
        frente: await firmar(c.ine_frente_path), reverso: await firmar(c.ine_reverso_path),
        firmante_nombre: c.firmante_nombre, firmante_rol: c.firmante_rol, edad_al_firmar: c.edad_al_firmar,
        fecha_nacimiento: c.fecha_nacimiento_usada, firmado_por_correo: c.firmado_por_correo,
        verificada_at: c.ine_verificada_at, verificada_por: c.ine_verificada_por,
      });
    }
    if (accion === 'contrato_cliente_enviar') {
      const id = String(body.viajero_id || '').trim();
      if (!/^[0-9a-f-]{36}$/i.test(id)) return bad(headers, 'viajero_id inválido');
      const { emitirContratos } = require('./_lib/contrato-cliente');
      const contrato = await emitirContratos({ viajeroIds: [id], reenviar: true, creado_por: (auth.user && auth.user.correo) || null, KH_URL: env.KH_SB_URL, KH_KEY: env.KH_SB_SERVICE });
      return ok(headers, { contrato });
    }

    // ── [CTR-RECUERDA-1] La pestaña «Clientes» de Contratos y su recordatorio ──
    // lista: TODOS los contratos de cliente (no anulados), con su evento, cuándo
    // se mandó, cuántos avisos lleva y si hoy le toca recordatorio (el motivo lo
    // decide _lib/contrato-cliente, el MISMO dueño que el cron). Solo lee.
    if (accion === 'contrato_cliente_lista') {
      const CC = require('./_lib/contrato-cliente');
      const r = await fetch(`${env.KH_SB_URL}/rest/v1/contratos_cliente?estado=neq.anulado&select=id,viajero_id,evento_id,estado,correo,envios,enviado_at,firmado_at,firmante_nombre,firmante_rol,edad_al_firmar,ine_verificada_at,created_at,nombre:datos->>nombre,evento:datos->>evento,fecha:datos->>fecha,paquete:datos->>paquete_txt,zona:datos->>zona,total:datos->>total&order=created_at.asc&limit=5000`, { headers: sbHeaders });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const filas = await r.json();
      // El catálogo solo aporta la FECHA del viaje (para ordenar y para no
      // recordar a quien ya viajó). Caído = la lista sale igual y lo DICE.
      let EV = null;
      try { EV = await require('./_lib/catalogo-index').fetchEventosRaw(); } catch (_) { EV = null; }
      const catalogo_ok = Array.isArray(EV);
      const ahora = Date.now();
      const contratos = filas.map((c) => {
        const ev = catalogo_ok ? EV.find((e) => e && e.id === String(c.evento_id || '').split('#')[0]) : null;
        const ds = CC.dsDeViajero(ev, c.evento_id);
        return Object.assign({}, c, {
          ds,
          total: c.total != null ? Number(c.total) : null,
          no_recordar: CC.motivoNoRecordar(c, ds, ahora, 'manual'),
          no_recordar_auto: CC.motivoNoRecordar(c, ds, ahora, 'auto'),
        });
      });
      return ok(headers, {
        vivo: CC.CONTRATO_CLIENTE_VIVO, auto_vivo: CC.CONTRATO_CLIENTE_VIVO && CC.RECORDATORIO_AUTO_VIVO,
        cada_dias: CC.RECORDATORIO_CADA_DIAS, tope: CC.RECORDATORIO_TOPE,
        catalogo_ok, contratos,
      });
    }

    // recordar: SECO por default (enseña a quién y el correo tal cual). Para
    // mandar hacen falta `seco:false` Y `confirmar:true` (dos gestos), y el
    // contrato encendido. Tope 60 por clic. Solo PENDIENTES que ya recibieron
    // su contrato y no se avisaron en las últimas horas.
    if (accion === 'contrato_cliente_recordar') {
      const CC = require('./_lib/contrato-cliente');
      const ids = Array.isArray(body.viajero_ids) ? [...new Set(body.viajero_ids.map(String).filter((x) => UUID_RE.test(x)))] : [];
      if (ids.length > 60) return bad(headers, `son ${ids.length}: máximo 60 por clic`);
      const seco = body.seco !== false;
      let EV = null;
      try { EV = await require('./_lib/catalogo-index').fetchEventosRaw(); } catch (_) { EV = null; }
      const evDe = (eid) => (Array.isArray(EV) ? EV.find((e) => e && e.id === String(eid || '').split('#')[0]) : null);

      let filas = [];
      if (ids.length) {
        const lista = ids.map((x) => '"' + x + '"').join(',');
        const r = await fetch(`${env.KH_SB_URL}/rest/v1/contratos_cliente?viajero_id=in.(${encodeURIComponent(lista)})&estado=neq.anulado&select=id,viajero_id,evento_id,estado,correo,envios,enviado_at,nombre:datos->>nombre&limit=200`, { headers: sbHeaders });
        if (!r.ok) return upstream(headers, await r.text(), 'consulta');
        filas = await r.json();
      }
      const ahora = Date.now();
      const tocan = [], saltados = [];
      ids.forEach((vid) => {
        const c = filas.find((f) => f.viajero_id === vid);
        if (!c) { saltados.push({ viajero_id: vid, nombre: null, motivo: 'no tiene contrato' }); return; }
        const mot = CC.motivoNoRecordar(c, CC.dsDeViajero(evDe(c.evento_id), c.evento_id), ahora, 'manual');
        if (mot) { saltados.push({ viajero_id: vid, nombre: c.nombre, motivo: mot }); return; }
        if (!c.correo) { saltados.push({ viajero_id: vid, nombre: c.nombre, motivo: 'sin correo: avísale por WhatsApp' }); return; }
        tocan.push(c);
      });

      if (seco) {
        // El correo TAL CUAL saldría (el primero), o un ejemplo si no hay nadie:
        // el texto se aprueba antes de encender, aunque la lista esté vacía.
        const m = tocan[0];
        const ev = (m && evDe(m.evento_id)) || { a: 'Tu evento', f: '' };
        const render = CC.renderCorreo({ correo: (m && m.correo) || 'cliente@correo.com', ev, contratos: [{ nombre: (m && m.nombre) || 'Nombre' }], recordatorio: true });
        return ok(headers, {
          seco: true, apagado: !CC.CONTRATO_CLIENTE_VIVO, ejemplo: !m,
          a_quien: tocan.map((c) => ({ viajero_id: c.viajero_id, nombre: c.nombre, correo: c.correo, envios: c.envios })),
          saltados, render: { subject: render.subject, html: render.html },
        });
      }
      if (!CC.CONTRATO_CLIENTE_VIVO) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'El contrato del cliente sigue APAGADO: no sale ningún recordatorio hasta encenderlo.', apagado: true }) };
      }
      if (body.confirmar !== true) return bad(headers, 'falta confirmar:true para mandar');
      if (!tocan.length) return ok(headers, { enviados: [], saltados, nada: true });
      const contrato = await CC.emitirContratos({
        viajeroIds: tocan.map((c) => c.viajero_id), reenviar: true, recordatorio: true,
        creado_por: (auth.user && auth.user.correo) || null, KH_URL: env.KH_SB_URL, KH_KEY: env.KH_SB_SERVICE,
      });
      return ok(headers, { contrato, saltados });
    }

    if (accion === 'viajero_elegir_paquete') {
      if (!ROLES_EDITA_VIAJERO.includes(jwtRol)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Solo un admin puede cambiar el paquete' }) };
      }
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');
      const paquete = String(body.tipo_paquete || '').trim().toLowerCase();
      if (!PAQUETES_MIGRAR.includes(paquete)) return bad(headers, `tipo_paquete inválido: se espera uno de ${PAQUETES_MIGRAR.join(', ')}`);
      let zona = String(body.zona_boleto || '').trim();
      const rideSinZona = paquete === 'ride' && !zona;
      if (!zona && !rideSinZona) return bad(headers, 'la zona del boleto es obligatoria');
      if (/^preventa a ciegas$/i.test(zona)) return bad(headers, 'elige la zona REAL, no «Preventa a ciegas»');
      const total = _numDinero(body.total_contrato);
      if (total === null || total <= 0) return bad(headers, 'el costo del paquete es obligatorio y debe ser mayor que cero');

      const pre = await fetch(`${baseVE}?id=eq.${id}&select=id,evento_id,nombre,tipo_paquete,zona_boleto,total_contrato,boletos,notas&limit=1`, { headers: sbHeaders });
      if (!pre.ok) return upstream(headers, await pre.text(), 'consulta');
      const v = (await pre.json())[0];
      if (!v) return bad(headers, 'ese viajero no existe');
      const zonaAct = String(v.zona_boleto || '').trim();
      const enPreventa = String(v.tipo_paquete || '').toLowerCase() === 'cheap' && (!zonaAct || /^preventa a ciegas$/i.test(zonaAct));
      if (!enPreventa) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'Este viajero ya no está en preventa (ya tiene paquete y zona). Si hay que cambiarlo, es un cambio manual aparte.', ya: true }) };
      }

      let zonaAviso = null, stockAviso = null;
      if (!rideSinZona) {
        const vz = await puertaZona(v.evento_id, zona);
        if (vz.estado === 'desconocida') {
          const lista = (vz.canonicas || []).join(' · ');
          return bad(headers, `La zona «${zona}» no existe en la ficha. ` + (lista ? `Las de la ficha: ${lista}.` : ''));
        }
        if (vz.estado === 'canonizada') { zonaAviso = `Zona corregida a «${vz.zona}»`; zona = vz.zona; }
        else if (vz.estado === 'sin-catalogo' || vz.estado === 'sin-evento') zonaAviso = 'La zona se guardó sin validar contra la ficha (catálogo ilegible).';
        // El inventario: si Kamisama ya tiene el pedido de esa zona y no alcanza,
        // NO se vende (palabra de Memo). Si todavía no hay pedido cargado, pasa
        // CON aviso: hoy es el día de la venta y el pedido puede cargarse después.
        if (paquete !== 'ride' && env.PORTAL_SB_URL && env.PORTAL_SB_SERVICE) {
          try {
            const disp = await cargarDisponibilidad({ khUrl: env.KH_SB_URL, khKey: env.KH_SB_SERVICE, portalUrl: env.PORTAL_SB_URL, portalKey: env.PORTAL_SB_SERVICE, evento_id: v.evento_id });
            if (!disp.error) {
              const ez = evaluarZona(disp, zona, Number(v.boletos) || 1);
              if (ez.gestionada && ez.sinCupo) {
                return { statusCode: 409, headers, body: JSON.stringify({ error: `«${zona}» ya no tiene lugar en Kamisama (quedan ${ez.restante}). Ofrécele otra zona.`, agotada: true, restante: ez.restante }) };
              }
              if (!ez.gestionada) stockAviso = `«${zona}» todavía no tiene pedido cargado en Kamisama: no se pudo confirmar que haya lugar.`;
            }
          } catch (_) { stockAviso = 'No se pudo medir el inventario; revisa la zona en Kamisama.'; }
        }
      }

      const quien = (auth.user && (auth.user.nombre || auth.user.correo)) || jwtUserId || 'panel';
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
      const sello = `[PREVENTA→PAQUETE ${hoy}] de PREVENTA A CIEGAS $${Number(v.total_contrato) || 0} a ${paquete.toUpperCase()}${zona ? ' · ' + zona : ''} · total $${total} · capturó ${quien}`;
      const notas = v.notas ? `${v.notas} · ${sello}` : sello;
      // Valor esperado: paquete, zona y total TAL COMO se leyeron.
      const filtroZona = v.zona_boleto == null ? 'zona_boleto=is.null' : `zona_boleto=eq.${encodeURIComponent(v.zona_boleto)}`;
      const filtroTot = v.total_contrato == null ? 'total_contrato=is.null' : `total_contrato=eq.${v.total_contrato}`;
      const r = await fetch(`${baseVE}?id=eq.${id}&tipo_paquete=eq.${encodeURIComponent(v.tipo_paquete)}&${filtroZona}&${filtroTot}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ tipo_paquete: paquete, zona_boleto: zona || null, total_contrato: total, notas }),
      });
      if (!r.ok) return upstream(headers, await r.text(), 'update');
      const filas = await r.json();
      if (!filas.length) return { statusCode: 409, headers, body: JSON.stringify({ error: 'Alguien ya cambió a este viajero mientras tanto. Recarga la lista.', ya: true }) };
      // [CONTRATO-CLIENTE-1] Con paquete REAL nace su contrato (decisión B de
      // Memo: el de la preventa a ciegas espera a este momento), con el anexo
      // de preventa. Jamás deshace el cambio de paquete.
      const { emitirContratos } = require('./_lib/contrato-cliente');
      // [PREVENTA-PORTAL-2] Desde la bandeja el aviso al cliente es UNO (el correo
      // de «paquete confirmado», que ya dice que el contrato se firma en el Portal):
      // la bandeja pide `contrato_sin_correo` y el contrato nace sin su propio correo.
      const contrato = await emitirContratos({ viajeroIds: [filas[0].id], preventa: true, enviar: body.contrato_sin_correo !== true, creado_por: (auth.user && auth.user.correo) || null, KH_URL: env.KH_SB_URL, KH_KEY: env.KH_SB_SERVICE });
      return ok(headers, { viajero: filas[0], zona_aviso: zonaAviso, stock_aviso: stockAviso, contrato });
    }

    // ── [MIG-1a] viajeros_evento: ALTA DE UN VIAJERO DEL EXCEL ─────────────
    //
    // El hueco que faltaba. `viajero_upsert_staff` crea filas tomando la
    // identidad de un COORDINADOR desde `usuarios` (anti-spoofing), y eso está
    // bien para el staff — pero no sirve para capturar a una persona del Excel,
    // que no tiene usuario en el sistema. Esto es lo único que crea un viajero
    // arbitrario, y por eso lleva su propia lista de roles y su propia
    // validación de cada campo.
    //
    // ⚠️ LA REGLA DE ORO DE VJ-3, INTACTA: aquí se CONGELAN `total_contrato` y
    // `abonado_previo` tal como vienen del Excel. NO se calculan de
    // paquete+habitación+vuelo, ni ahora ni después: el total del Excel ya
    // traía todo eso adentro. Lo que se cobre de aquí en adelante entra como
    // ABONO (`abono_crear`), y el saldo lo resuelve la fórmula sellada:
    //     resta = total_contrato − abonado_previo − Σ abonos
    // ═══ [CAP-MIG-FIX] EL COSTO SUGERIDO, DE LA FUENTE ÚNICA ═══════════════
    // Memo pidió que al elegir paquete+zona el costo se PRE-LLENE. La aritmética
    // NO se copia al navegador: se le pregunta a `resolverPrecioVenta`, la misma
    // que sella el precio de una venta del Portal. Una cuarta copia de la regla
    // de precios sería exactamente lo que la casa lleva tres tuercas evitando.
    //
    // ⚠️ ES UNA SUGERENCIA, NO UN CANDADO. La regla de oro de VJ-3 no se toca:
    // lo que se guarda es lo que diga el campo, porque el total del Excel ya
    // trae dentro hotel, transporte y lo que se haya negociado. Si difieren,
    // MANDA EL EXCEL.
    if (accion === 'precio_sugerido') {
      if (!ROLES_EDITA_VIAJERO.includes(jwtRol)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Solo un admin' }) };
      }
      const evId = String(body.evento_id || '').trim();
      if (!evId || !SLUG_RE.test(evId)) return bad(headers, 'evento_id inválido');
      const pq = String(body.tipo_paquete || '').trim().toLowerCase();
      if (!PAQUETES_MIGRAR.includes(pq)) return bad(headers, `tipo_paquete inválido`);
      const zn = String(body.zona || '').trim();
      try {
        const pv = await resolverPrecioVenta({
          evento_id: evId,
          paquete: pq,
          zona: zn || undefined,
          num_personas: 1,          // un migrado = una persona
        });
        // Fails-soft y HONESTO: si el catálogo no alcanza para calcularlo, se
        // dice el motivo. Un cero aquí se leería como "cuesta cero".
        return ok(headers, pv && pv.ok
          ? { sugerido: pv.precio_unit, total: pv.total, separo: pv.separo, desglose: pv.desglose, zona: pv.zona }
          : { sugerido: null, motivo: (pv && pv.motivo) || 'no se pudo calcular' });
      } catch (e) {
        return ok(headers, { sugerido: null, motivo: 'no se pudo calcular' });
      }
    }

    if (accion === 'viajero_migrar') {
      if (!ROLES_EDITA_VIAJERO.includes(jwtRol)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Solo un admin puede dar de alta viajeros' }) };
      }
      const eventoId = String(body.evento_id || '').trim();
      if (!eventoId || eventoId.length > 120 || !SLUG_RE.test(eventoId)) return bad(headers, 'evento_id inválido');

      const nombre = String(body.nombre || '').trim();
      if (!nombre) return bad(headers, 'el nombre es obligatorio');
      if (nombre.length > 200) return bad(headers, 'nombre demasiado largo');

      // Memo firmó que zona y paquete SIEMPRE vienen: son obligatorios, sin
      // caso vacío. Un viajero sin zona no podría descontar de ningún stock
      // (MIG-1b), y uno sin paquete rompe cuentaParaPaquete y la regla de quién
      // viaja y quién duerme.
      const paquete = String(body.tipo_paquete || '').trim().toLowerCase();
      if (!PAQUETES_MIGRAR.includes(paquete)) {
        return bad(headers, `tipo_paquete inválido: se espera uno de ${PAQUETES_MIGRAR.join(', ')}`);
      }
      let zona = String(body.zona_boleto || '').trim();
      // [RIDE-SIN-ZONA-1, 27-oct-2026] Reporte de Milk: «en RIDE no lleva
      // boleto». El RIDE no consume boleto (NO_CONSUMEN_BOLETO en
      // _lib/paquete-viaje) ni descuenta stock, así que exigirle zona obligaba a
      // INVENTAR una. Si viene sin zona nace con zona NULL — igual que la
      // requisición aprobada (admin-requisiciones ya lo hacía). Si alguien SÍ
      // la escribe (un RIDE con forceZona), pasa por la puerta como siempre.
      const rideSinZona = paquete === 'ride' && !zona;
      if (!zona && !rideSinZona) return bad(headers, 'la zona del boleto es obligatoria');
      if (zona.length > 120) return bad(headers, 'zona demasiado larga');
      let zonaAvisoMig = null;
      if (!rideSinZona) {
      // [DISPO-NORM-1] La puerta: desconocida se RECHAZA (una zona que la ficha
      // no tiene es hoyo de ficha y espera Esferas — el caso «Sección C» de
      // hilary); canonizada se guarda con la ortografía de la ficha; catálogo
      // ilegible o evento fuera de él pasa TAL CUAL con aviso en la respuesta
      // (fail-soft dicho: la migración no se detiene porque el CDN tosió).
      const vzMig = await puertaZona(eventoId, zona);
      if (vzMig.estado === 'desconocida') {
        const lista = (vzMig.canonicas || []).join(' · ');
        return bad(headers, `La zona «${zona}» no existe en la ficha de ${eventoId}. `
          + (lista ? `Las de la ficha: ${lista}. ` : '')
          + 'Si es una zona nueva, primero se agrega en Esferas.');
      }
      if (vzMig.estado === 'canonizada') {
        zonaAvisoMig = `Zona corregida a la ortografía de la ficha: «${vzMig.capturada}» → «${vzMig.zona}»`;
        zona = vzMig.zona;
      } else if (vzMig.estado === 'sin-catalogo' || vzMig.estado === 'sin-evento') {
        zonaAvisoMig = 'La zona se guardó sin validar contra la ficha (catálogo ilegible o evento fuera de él).';
      }
      }

      // El dinero. `total_contrato` es obligatorio: una fila sin él NO SUMA en
      // ninguna cuenta (lo dice saldoMigrado en _lib/cuenta-evento), así que
      // capturar un viajero sin total sería capturarlo invisible para el dinero.
      const total = _numDinero(body.total_contrato);
      if (total === null) return bad(headers, 'el costo del paquete es obligatorio y debe ser un número');
      if (total < 0) return bad(headers, 'el costo no puede ser negativo');
      // El abonado sí puede faltar (nadie ha pagado todavía) → 0.
      const abonado = body.abonado_previo == null || String(body.abonado_previo).trim() === ''
        ? 0 : _numDinero(body.abonado_previo);
      if (abonado === null) return bad(headers, 'el abonado debe ser un número');
      if (abonado < 0) return bad(headers, 'el abonado no puede ser negativo');
      // ⚠️ Un abonado MAYOR que el total NO es un error: VJ-3 selló que los
      // saldos a favor son reales y no se corrigen. Se deja pasar a propósito.

      // [BOLETOS-1] Cuántos boletos trae esta persona. La pestaña lleva UNA
      // FILA POR BOLETO y el careo las funde por nombre, así que un alta puede
      // nacer con 4. Se valida aquí, en la puerta, como todo lo demás: un
      // número fuera de rango descontaría stock que no existe.
      let nBoletos = 1;
      if (body.boletos != null && String(body.boletos).trim() !== '') {
        nBoletos = parseInt(body.boletos, 10);
        if (!Number.isInteger(nBoletos) || nBoletos < 1) return bad(headers, 'boletos debe ser un entero mayor que cero');
        if (nBoletos > 50) return bad(headers, 'boletos fuera de rango');
      }
      const fila = {
        evento_id: eventoId,
        nombre,
        tipo_paquete: paquete,
        zona_boleto: zona || null,
        total_contrato: total,
        abonado_previo: abonado,
        tipo_viajero: 'cliente',
        boletos: nBoletos,
      };
      // Los opcionales, con la misma regla que viajero_editar: vacío es NULL,
      // nunca cadena vacía — '' se cuela en los filtros de "sin correo" y en
      // los correos salientes como destinatario en blanco.
      for (const k of ['correo', 'celular', 'talla_playera', 'num_emergencia', 'emergencia_nombre', 'notas']) {
        const v = body[k] == null ? '' : String(body[k]).trim();
        if (v === '') { fila[k] = null; continue; }
        if (v.length > 500) return bad(headers, `${k} demasiado largo`);
        if (k === 'correo' && !EMAIL_RE.test(v)) return bad(headers, 'correo inválido');
        fila[k] = v;
      }

      // El evento tiene que existir. Sin esto, un slug con dedo gordo crea una
      // población fantasma que no aparece en ninguna pantalla y que nadie
      // vuelve a encontrar.
      const em = await fetch(
        `${env.KH_SB_URL}/rest/v1/eventos_meta?slug=eq.${encodeURIComponent(eventoId.split('#')[0])}&select=slug&limit=1`,
        { headers: sbHeaders });
      if (!em.ok) return upstream(headers, await em.text(), 'consulta');
      if (!(await em.json()).length) return bad(headers, `el evento "${eventoId}" no existe`);

      // INSERT directo, sin on_conflict (regla de la casa). El deduplicado NO
      // se hace aquí: se hace ANTES, con `viajero_buscar_parecido`, y lo
      // confirma un humano — porque la llave natural sería el correo y muchos
      // del Excel no lo traen, y en Postgres NULL != NULL deja pasar TODOS los
      // duplicados sin decir nada.
      const r = await fetch(baseVE, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(fila),
      });
      if (!r.ok) {
        const t = await r.text();
        // Un 23505 aquí sería idempotencia, pero hay que CONFIRMAR la causa
        // antes de interpretarla, no adivinarla.
        return upstream(headers, t, 'alta');
      }
      const creado = (await r.json())[0] || null;

      // ═══ [MIG-1b] EL DOBLE DESCUENTO DE LA TRANSICIÓN ═══════════════════
      // Memo capturó su corte del Excel como `vendidos_fuera` (p.ej. 20) para
      // que el semáforo no sobrevendiera mientras no existía la migración.
      // Ahora migra a ESA MISMA gente: cada uno pasa a descontar por su cuenta
      // como cuarto término. Si `vendidos_fuera` se queda en 20, los mismos 20
      // boletos se restan DOS VECES y el semáforo cierra zonas que sí tienen.
      //
      // NO se ajusta solo: `vendidos_fuera` es un dato que Memo escribió a mano
      // y bajarlo sin permiso sería decidir por él —y en el sentido peligroso,
      // porque ABRE stock—. Se DICE, con el número exacto, y el ajuste lo
      // confirma él desde la pantalla. Lo que no puede es quedarse en silencio.
      let avisoDoble = null;
      try {
        const zq = String(fila.zona_boleto || '').trim();
        if (zq) {
          const [aj, mg] = await Promise.all([
            fetch(`${env.KH_SB_URL}/rest/v1/stock_ajustes?evento_id=eq.${encodeURIComponent(eventoId)}&zona=eq.${encodeURIComponent(zq)}&select=vendidos_fuera&limit=1`, { headers: sbHeaders }),
            fetch(`${env.KH_SB_URL}/rest/v1/viajeros_evento?evento_id=eq.${encodeURIComponent(eventoId)}&zona_boleto=eq.${encodeURIComponent(zq)}&select=id&limit=10000`, { headers: sbHeaders }),
          ]);
          if (aj.ok && mg.ok) {
            const fuera = parseInt(((await aj.json())[0] || {}).vendidos_fuera, 10) || 0;
            const migrados = (await mg.json()).length;
            if (fuera > 0) {
              avisoDoble = {
                zona: zq,
                vendidos_fuera: fuera,
                migrados_en_zona: migrados,
                // Lo que quedaría si estos migrados YA estaban dentro de ese corte.
                sugerido: Math.max(0, fuera - migrados),
                mensaje: `Esta zona tiene ${fuera} marcados como "vendidos fuera del sistema" y ahora ${migrados} migrado(s). `
                       + 'Si esa gente ya estaba en tu corte del Excel, se está descontando DOS veces: '
                       + `baja "vendidos fuera" a ${Math.max(0, fuera - migrados)}. Si son personas distintas, déjalo como está.`,
              };
            }
          }
        }
      } catch (_) { /* el aviso es best-effort: jamás tumba una alta que YA se guardó */ }

      // [CONTRATO-CLIENTE-1] Alta manual de Bulma/Milk → el contrato del
      // cliente con su link de firma (palabra de Memo: «que Bulma o Milk metan
      // manualmente, el contrato ya es FUNDAMENTAL»). `contrato:false` lo apaga
      // para una captura que no debe avisar. La lib jamás lanza: el alta YA se
      // guardó y la respuesta DICE qué pasó con el contrato.
      let contrato = null;
      if (creado && body.contrato !== false) {
        const { emitirContratos } = require('./_lib/contrato-cliente');
        contrato = await emitirContratos({ viajeroIds: [creado.id], creado_por: (auth.user && auth.user.correo) || null, KH_URL: env.KH_SB_URL, KH_KEY: env.KH_SB_SERVICE });
      }
      return ok(headers, { viajero: creado, aviso_doble_descuento: avisoDoble, zona_aviso: zonaAvisoMig, contrato });
    }

    // ── [MIG-1a] Buscar parecidos ANTES de dar de alta ─────────────────────
    // El deduplicado que Memo pidió proponer. NO cuelga del correo:
    //   · si hay correo, un choque exacto es casi seguro la misma persona;
    //   · sin correo, se compara el NOMBRE NORMALIZADO dentro del MISMO evento.
    // Y no bloquea nada: devuelve los parecidos para que un humano confirme.
    // Dos personas con el mismo nombre existen; un duplicado silencioso también.
    if (accion === 'viajero_buscar_parecido') {
      if (!ROLES_EDITA_VIAJERO.includes(jwtRol)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'No autorizado' }) };
      }
      const eventoId = String(body.evento_id || '').trim();
      if (!eventoId || !SLUG_RE.test(eventoId)) return bad(headers, 'evento_id inválido');
      const nombre = String(body.nombre || '').trim();
      const correo = String(body.correo || '').trim();
      if (!nombre && !correo) return ok(headers, { parecidos: [] });

      const r = await fetch(
        `${baseVE}?evento_id=eq.${encodeURIComponent(eventoId)}&select=id,nombre,correo,tipo_paquete,zona_boleto,total_contrato&limit=2000`,
        { headers: sbHeaders });
      if (!r.ok) return upstream(headers, await r.text(), 'consulta');
      const filas = await r.json();
      const nn = _normNombre(nombre);
      const cc = correo.toLowerCase();
      const parecidos = filas.filter((v) => {
        if (cc && v.correo && String(v.correo).toLowerCase() === cc) return true;
        return !!nn && _normNombre(v.nombre) === nn;
      });
      return ok(headers, { parecidos });
    }

    // ── abonos_viajero: registrar un abono (admin) ───────────────────────
    // [VJ-3] El dinero de los migrados NO se recalcula de paquete + hotel +
    // vuelo: el total del Excel ya traía todo eso adentro. Aquí solo se SUMAN
    // abonos nuevos sobre un total y un abonado que están CONGELADOS.
    // ═══ [COB-MIG-1] LOS QUE DEBEN, DE UNA SOLA LECTURA ════════════════════════
    // Memo: "la gente empieza a depositar y no hay dónde capturarlo". El formulario
    // de abono existía desde VJ-3 y NADIE PODÍA LLEGARLE: colgaba de una alerta
    // `datos_viajero`, y las únicas 3 que existen son de `melanie`, un evento
    // borrado. Para `calle24` había cero alertas = cero puertas. Por eso
    // `abonos_viajero` lleva 0 filas en toda su historia con 10 migrados vivos.
    //
    // Esta acción es la puerta que faltaba. Devuelve, en UNA lectura por tabla:
    //   · los migrados que DEBEN, con su resta según la fórmula sellada
    //   · los últimos abonos registrados, para el feed de actividad
    //
    // ⚠️ EL SALDO NO SE CALCULA AQUÍ: se le pide a `saldoMigrado` de
    // `_lib/cuenta-evento`, la misma que usan la cuenta del evento y los saldos. La
    // pantalla tampoco resta: recibe el número hecho. Es la regla de la casa —
    // ninguna pantalla saca su propia cuenta.
    //
    // ⚠️ `limit` EXPLÍCITO en las dos consultas. El default de PostgREST son 1000
    // filas y trunca EN SILENCIO: una caja de cobranza a la que le faltan deudores
    // sin avisar es peor que una que no existe.
    if (accion === 'deudores_migrados') {
      if (!ROLES_EDITA_VIAJERO.includes(jwtRol)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'No puedes ver el dinero de los viajeros' }) };
      }
      const [rv, ra] = await Promise.all([
        fetch(`${baseVE}?total_contrato=not.is.null&select=id,evento_id,nombre,celular,zona_boleto,tipo_paquete,tipo_viajero,total_contrato,abonado_previo&limit=20000`, { headers: sbHeaders }),
        fetch(`${env.KH_SB_URL}/rest/v1/abonos_viajero?select=id,viajero_id,monto,fecha,nota,foto_path,capturado_por,created_at&order=created_at.desc&limit=20000`, { headers: sbHeaders }),
      ]);
      if (!rv.ok) return upstream(headers, await rv.text(), 'consulta');
      if (!ra.ok) return upstream(headers, await ra.text(), 'consulta');
      let viajeros = await rv.json();
      const abonos = await ra.json();

      // [EPOCA-1] La cobranza es pantalla OPERATIVA: solo época nueva (palabra
      // de Memo 12-oct — «solo deja la info de calle 24 en adelante»). La fecha
      // sale de esferas; slug sin ficha o sin fecha = época vieja. Si esferas
      // no se puede leer, NO se filtra (mejor cobranza de más que deudores
      // escondidos por una lectura caída) y se reporta.
      let epoca_aviso = null;
      try {
        const rf = await fetch(`${env.KH_SB_URL}/rest/v1/esferas_eventos?select=slug,fecha_inicio&limit=10000`, { headers: sbHeaders });
        if (rf.ok) {
          const filas = await rf.json();
          const fechaDe = {};
          (Array.isArray(filas) ? filas : []).forEach((f) => { if (f && f.slug) fechaDe[f.slug] = f.fecha_inicio || null; });
          const antes = viajeros.length;
          viajeros = viajeros.filter((v) => esEpocaNueva(fechaDe[String(v.evento_id || '').split('#')[0]], EPOCA_INICIO));
          epoca_aviso = { desde: EPOCA_INICIO, excluidos: antes - viajeros.length };
        } else {
          epoca_aviso = { desde: EPOCA_INICIO, aplicada: false, error: 'esferas ilegible' };
        }
      } catch (e) {
        epoca_aviso = { desde: EPOCA_INICIO, aplicada: false, error: e.message };
      }

      const porViajero = {};
      abonos.forEach((a) => { (porViajero[a.viajero_id] = porViajero[a.viajero_id] || []).push(a); });

      const deudores = [];
      viajeros.forEach((v) => {
        const s = saldoMigrado(v, porViajero[v.id]);
        if (!s) return;                       // sin total_contrato no hay deuda que afirmar
        deudores.push({
          id: v.id, evento_id: v.evento_id, nombre: v.nombre, celular: v.celular || null,
          zona_boleto: v.zona_boleto || null, tipo_paquete: v.tipo_paquete || null,
          tipo_viajero: v.tipo_viajero || null,
          total: s.total, abonado: s.abonado, resta: s.resta,
      // ⚠️ `a_favor` se DERIVA aquí de un signo, no se le pide al lib: el
      // `saldoMigrado` del SERVIDOR devuelve {total, abonado, resta} y NO trae
      // `aFavor` — ése es el `_vj3Saldo` del navegador. Asumir que las dos
      // funciones se espejan por tener el mismo papel es la trampa de siempre;
      // se leyó el cuerpo del lib, no se recordó. Comparar no es recalcular.
      a_favor: s.resta < 0,
          abonos: (porViajero[v.id] || []).length,
        });
      });

      // El feed: los últimos registrados, con el nombre de a quién. `abonos` ya
      // viene ordenado por `created_at.desc` desde la consulta — no se re-ordena en
      // el navegador, que es donde la regla de ORD-1 se pierde.
      const nombrePorId = {};
      viajeros.forEach((v) => { nombrePorId[v.id] = v.nombre; });
      const ultimos = abonos.slice(0, 40).map((a) => ({
        id: a.id, viajero_id: a.viajero_id,
        nombre: nombrePorId[a.viajero_id] || null,
        monto: Number(a.monto) || 0, fecha: a.fecha || null, nota: a.nota || null,
        tiene_foto: !!a.foto_path, capturado_por: a.capturado_por || null,
        created_at: a.created_at || null,
      }));

      return ok(headers, { deudores, ultimos, total_abonos: abonos.length, epoca: epoca_aviso }); // [EPOCA-1]
    }
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
      // [CONFIRMA-1] «Recibimos tu pago» al cliente, con la invitación al Portal
      // si todavía no la tenía (el MISMO correo de la bandeja, _lib/correo-
      // confirmacion). Solo en los eventos de EVENTOS_CORREO: fuera de ellos la
      // lib devuelve null y no sale nada. `avisar:false` lo apaga para una
      // captura que no debe avisar (p. ej. corregir un dato viejo).
      // Nunca deshace el abono: si el correo falla, la respuesta lo dice.
      let correo = null;
      if (body.avisar !== false && creado) {
        const { enviarCorreoPago } = require('./_lib/correo-confirmacion');
        correo = await enviarCorreoPago({
          tipo: 'abono', evento_id: vRows[0].evento_id, viajeroIds: [viajero_id],
          recibidoPorViajero: { [viajero_id]: monto },
          enviado_por: (auth.user && auth.user.correo) || null,
          KH_URL: env.KH_SB_URL, KH_KEY: env.KH_SB_SERVICE,
        });
      }
      return ok(headers, { abono: creado, correo });
    }

    // ── [GRUPO-WA-1] El link del grupo de WhatsApp del evento ─────────────
    // Tabla privada `grupos_whatsapp` (RLS deny-all). Lo leen el correo de
    // confirmación y el Portal del dueño verificado; jamás el index público.
    if (accion === 'grupo_wa_ver' || accion === 'grupo_wa_guardar') {
      const evento_id = String(body.evento_id || '').trim();
      if (!evento_id || evento_id.length > 80) return bad(headers, 'evento_id inválido');
      const { normalizarLink, gruposDe, baseSlug } = require('./_lib/grupo-whatsapp');
      const baseGW = `${env.KH_SB_URL}/rest/v1/grupos_whatsapp`;
      if (accion === 'grupo_wa_guardar') {
        const crudo = String(body.link || '').trim();
        // Sin DELETE (regla de la casa): un link equivocado se REEMPLAZA pegando el bueno.
        if (!crudo) return bad(headers, 'Pega el link del grupo (https://chat.whatsapp.com/…). Para cambiarlo, pega el nuevo encima.');
        {
          const link = normalizarLink(crudo);
          if (!link) return bad(headers, 'Ese no parece un link de grupo de WhatsApp (debe ser https://chat.whatsapp.com/…)');
          const quien = (auth.user && (auth.user.nombre || auth.user.correo)) || jwtUserId;
          // ¿Existe? → PATCH; si no → INSERT. Sin on_conflict (regla de la casa).
          const pre = await fetch(`${baseGW}?evento_id=eq.${encodeURIComponent(evento_id)}&select=evento_id`, { headers: sbHeaders });
          if (!pre.ok) return upstream(headers, await pre.text(), 'consulta');
          const existe = (await pre.json()).length > 0;
          const w = await fetch(existe ? `${baseGW}?evento_id=eq.${encodeURIComponent(evento_id)}` : baseGW, {
            method: existe ? 'PATCH' : 'POST',
            headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify(existe ? { link, actualizado_por: quien, updated_at: new Date().toISOString() }
                                        : { evento_id, link, actualizado_por: quien }),
          });
          if (!w.ok) return upstream(headers, await w.text(), existe ? 'update' : 'insert');
        }
      }
      // Lo que rige para esta llave (propio o heredado del evento base).
      const rP = await fetch(`${baseGW}?evento_id=eq.${encodeURIComponent(evento_id)}&select=link`, { headers: sbHeaders });
      if (!rP.ok) return upstream(headers, await rP.text(), 'consulta');
      const propio = ((await rP.json())[0] || {}).link || null;
      const rige = (await gruposDe([evento_id], { KH_URL: env.KH_SB_URL, KH_KEY: env.KH_SB_SERVICE }))[evento_id] || null;
      return ok(headers, { evento_id, propio, link: rige, heredado: !!(rige && !propio), base: baseSlug(evento_id) });
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


    // ── viajeros_evento: poner/quitar cuarto (admin) ─────────────────────
    // [VJ-5] Los migrados del Excel no se podían acomodar: `habitacion_id`
    // existía y ningún picker lo escribía. Esta es esa escritura.
    //
    // Quien NO duerme no puede tener cuarto — y se rechaza AQUÍ, no solo en el
    // picker: esconder la opción es UI, negarla es la regla. Un CHEAP es solo
    // boleto y no tiene hospedaje que asignar.
    if (accion === 'viajero_habitacion') {
      if (!ROLES_EDITA_VIAJERO.includes(jwtRol)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'No puedes acomodar viajeros' }) };
      }
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return bad(headers, 'id inválido');
      // null = sacarlo del cuarto. Es una operación legítima, no un vacío.
      const hab = body.habitacion_id == null || body.habitacion_id === ''
        ? null : String(body.habitacion_id).trim();
      if (hab !== null && !UUID_RE.test(hab)) return bad(headers, 'habitacion_id inválido');

      // MISMO FILTRO que la escritura (id=eq): se lee la fila para saber su
      // paquete antes de decidir, y se escribe sobre esa misma fila.
      const pre = await fetch(`${baseVE}?id=eq.${id}&select=id,tipo_paquete&limit=1`, { headers: sbHeaders });
      if (!pre.ok) return upstream(headers, await pre.text(), 'consulta');
      const filaVE = (await pre.json())[0];
      if (!filaVE) return bad(headers, 'ese viajero no existe');
      // Sacar del cuarto SIEMPRE se permite: si un cheap quedó acomodado por un
      // error viejo, hay que poder quitarlo aunque su paquete ya no lo admita.
      if (hab !== null && !duerme(filaVE.tipo_paquete)) {
        return bad(headers, motivoNoDuerme(filaVE.tipo_paquete));
      }

      const r = await fetch(`${baseVE}?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ habitacion_id: hab }),
      });
      if (!r.ok) return upstream(headers, await r.text(), 'update');
      const filas = await r.json();
      return ok(headers, { viajero: filas[0] || null, tocadas: filas.length });
    }

    // ── [GRUPO-VIAJE-1] Viajan juntos ──────────────────────────────────────
    // `juntar` recibe 2+ ids DEL MISMO EVENTO. Si alguno ya tenía grupo, el
    // grupo nuevo los FUNDE: todos los que compartían cualquiera de esos grupos
    // quedan en uno solo (juntar a Ana con Bety, cuando Bety ya viajaba con
    // Caro, deja a las tres juntas — partir el grupo de Bety sería decidir por
    // Bulma). `separar` saca a UNA persona (grupo → NULL, sin DELETE). Si su
    // grupo se queda con una sola persona, esa también se suelta: un «grupo»
    // de uno no le dice nada a nadie.
    if (accion === 'grupo_viaje_juntar' || accion === 'grupo_viaje_separar') {
      if (!ROLES_EDITA_VIAJERO.includes(jwtRol)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'No puedes agrupar viajeros' }) };
      }
      if (accion === 'grupo_viaje_separar') {
        const id = String(body.id || '').trim();
        if (!UUID_RE.test(id)) return bad(headers, 'id inválido');
        const pre = await fetch(`${baseVE}?id=eq.${id}&select=id,grupo_viaje&limit=1`, { headers: sbHeaders });
        if (!pre.ok) return upstream(headers, await pre.text(), 'consulta');
        const f = (await pre.json())[0];
        if (!f) return bad(headers, 'ese viajero no existe');
        if (!f.grupo_viaje) return ok(headers, { tocadas: 0 });
        const g = f.grupo_viaje;
        const r = await fetch(`${baseVE}?id=eq.${id}&grupo_viaje=eq.${g}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({ grupo_viaje: null }),
        });
        if (!r.ok) return upstream(headers, await r.text(), 'update');
        let tocadas = (await r.json()).length;
        const resto = await fetch(`${baseVE}?grupo_viaje=eq.${g}&select=id`, { headers: sbHeaders });
        if (resto.ok) {
          const quedan = await resto.json();
          if (quedan.length === 1) {
            const r2 = await fetch(`${baseVE}?id=eq.${quedan[0].id}&grupo_viaje=eq.${g}`, {
              method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=representation' },
              body: JSON.stringify({ grupo_viaje: null }),
            });
            if (r2.ok) tocadas += (await r2.json()).length;
          }
        }
        return ok(headers, { tocadas });
      }
      const evento_id = String(body.evento_id || '').trim();
      if (!evento_id || !SLUG_RE.test(evento_id) || evento_id.length > 120) return bad(headers, 'evento_id inválido');
      const ids = Array.from(new Set((Array.isArray(body.ids) ? body.ids : []).map((x) => String(x || '').trim())));
      if (ids.length < 2) return bad(headers, 'Elige al menos 2 personas para juntar');
      if (ids.length > 40 || ids.some((x) => !UUID_RE.test(x))) return bad(headers, 'ids inválidos');
      const pre = await fetch(`${baseVE}?id=in.(${ids.join(',')})&select=id,evento_id,grupo_viaje`, { headers: sbHeaders });
      if (!pre.ok) return upstream(headers, await pre.text(), 'consulta');
      const filas = await pre.json();
      if (filas.length !== ids.length) return bad(headers, 'Alguna de esas personas ya no existe — recarga la lista');
      // 🔒 Un grupo es de UN evento: juntar filas de dos eventos sería mentir
      // en los dos (y `#N` cuenta como otro evento: otra fecha, otro viaje).
      if (filas.some((f) => f.evento_id !== evento_id)) return bad(headers, 'Todas tienen que ser del mismo evento (y la misma fecha)');
      const previos = Array.from(new Set(filas.map((f) => f.grupo_viaje).filter(Boolean)));
      const grupo = previos[0] || _uuid();
      const quien = (auth.user && (auth.user.nombre || auth.user.correo)) || jwtUserId;
      let tocadas = 0;
      // Las filas elegidas…
      const r = await fetch(`${baseVE}?id=in.(${ids.join(',')})&evento_id=eq.${encodeURIComponent(evento_id)}`, {
        method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ grupo_viaje: grupo }),
      });
      if (!r.ok) return upstream(headers, await r.text(), 'update');
      tocadas += (await r.json()).length;
      // …y quienes ya viajaban con ellas (funde los grupos previos).
      for (const g of previos.slice(1)) {
        const r2 = await fetch(`${baseVE}?grupo_viaje=eq.${g}&evento_id=eq.${encodeURIComponent(evento_id)}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({ grupo_viaje: grupo }),
        });
        if (r2.ok) tocadas += (await r2.json()).length;
      }
      return ok(headers, { grupo_viaje: grupo, tocadas, por: quien });
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
  // [STAFF-BOLETO-2] El Portal entra solo para la disponibilidad (sus apartados
  // ocupan lugar); sin él, el boleto de staff se rehúsa en vez de adivinar.
  return { KH_SB_URL, KH_SB_SERVICE,
    PORTAL_SB_URL: process.env.PORTAL_SUPABASE_URL, PORTAL_SB_SERVICE: process.env.PORTAL_SUPABASE_SERVICE_KEY };
}

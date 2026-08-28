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
const { resolverPrecioVenta } = require('./_lib/precio-zona');
// [VJ-5] La regla de quién duerme es la MISMA de VJ-4, importada — no copiada.
// [CREA-1c] `consumeBoleto` viene de su DUEÑO. La cortesía suma a
// `vendidos_fuera`, y esa contabilidad DESCANSA en que la fila del viajero no
// descuente por su cuenta: si descontara, el mismo boleto se restaría dos
// veces. Preguntárselo a la función en vez de copiar la regla.
const { duerme, motivoNoDuerme, consumeBoleto } = require('./_lib/paquete-viaje');
// [COB-MIG-1] La fórmula sellada de VJ-3, de su dueño. NO se re-escribe aquí:
// `resta = total_contrato − abonado_previo − Σ abonos` ya vive en el lib del
// dinero y la usan la cuenta del evento y los saldos. Una cuarta copia sería la
// que diverja el día que alguien "mejore" una sola.
const { saldoMigrado } = require('./_lib/cuenta-evento');

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
  // [CREA-1b] Regalar un boleto es mover inventario: mismos roles que capturan
  // viajeros. Y la entrada VA AQUÍ o la acción no existe para el portero —
  // ésa fue RAD-FIX-CAMINO: tres RPC vivos y 'accion inválida' en pantalla.
  cortesia_asignar: ROLES_EDITA_VIAJERO,
  // [VJ-3] Dinero de los migrados. Mismos roles que editar: quien captura los
  // datos captura los abonos.
  abono_crear: ROLES_EDITA_VIAJERO,
  abonos_listar: ROLES_EDITA_VIAJERO,
  deudores_migrados: ROLES_EDITA_VIAJERO,
  // [VJ-5] Acomodar migrados en cuartos.
  viajero_habitacion: ROLES_EDITA_VIAJERO,
  // [MIG-1a] El alta de un viajero ARBITRARIO (el del Excel). Mismos roles que
  // editar y que los abonos: quien captura los datos captura el alta.
  viajero_migrar: ROLES_EDITA_VIAJERO,
  precio_sugerido: ROLES_EDITA_VIAJERO,   // [CAP-MIG-FIX] solo sugiere; no escribe nada
  viajero_buscar_parecido: ROLES_EDITA_VIAJERO,
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

      const acomp = (body.acompanante && typeof body.acompanante === 'object') ? body.acompanante : {};
      const acompNombre = cleanText(acomp.nombre, 120) || cleanText(datos.acompanante && datos.acompanante.nombre, 120);

      // Mismo patrón que `abono_crear` en este archivo — el contrato de
      // verifyAdminAuthLive es {valid, user:{id,correo,rol}}, NO auth.nombre.
      const quien = (auth.user && (auth.user.nombre || auth.user.correo)) || jwtUserId || 'panel';
      const notaViajero = [
        paquete.nota,
        'solo boleto + kit',
        acompNombre ? `acompañante: ${acompNombre}` : null,
        tallaOrigen === 'capturada_al_asignar' ? 'talla capturada al asignar (el contrato no la traía)' : null,
      ].filter(Boolean).join(' · ');

      // ¿Ya hay fila? El caso Victor: `viajero_upsert_staff` YA lo registró al
      // aceptar el tour. Ahí la cortesía no inserta — COMPLETA la zona. Insertar
      // sería duplicar a una persona que ya viaja.
      const claveCorreo = contrato.creador_email || null;
      let existente = null;
      if (claveCorreo) {
        const ex = await fetch(
          `${baseVE}?evento_id=eq.${encodeURIComponent(evento_id)}&correo=eq.${encodeURIComponent(claveCorreo)}&select=id,nombre,zona_boleto,talla_playera&limit=1`,
          { headers: sbHeaders });
        if (!ex.ok) return upstream(headers, await ex.text(), 'consulta');
        existente = (await ex.json())[0] || null;
      }

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
          notas: notaViajero,
        };
        const ins = await fetch(baseVE, {
          method: 'POST', headers: { ...sbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify(fila),
        });
        if (!ins.ok) return upstream(headers, await ins.text(), 'insert');
        viajero = (await ins.json())[0] || null;
      }

      // STOCK: SUMA sobre la fila (evento_id, zona) — hay UNIQUE ahí, un insert
      // a secas reventaría en la segunda cortesía de la misma zona.
      const stR = await fetch(
        `${baseStock}?evento_id=eq.${encodeURIComponent(evento_id)}&zona=eq.${encodeURIComponent(zona)}&select=id,vendidos_fuera,nota&limit=1`,
        { headers: sbHeaders });
      if (!stR.ok) return upstream(headers, await stR.text(), 'consulta');
      const stock = (await stR.json())[0] || null;
      const notaStock = `${paquete.nota} ${contrato.creador_nombre} (contrato en KameHouse) — ${paquete.notaStock}`;
      let stockFinal;
      if (stock) {
        const suma = Number(stock.vendidos_fuera || 0) + boletos;
        const up = await fetch(`${baseStock}?id=eq.${stock.id}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({ vendidos_fuera: suma, nota: notaStock, updated_por: quien, updated_at: new Date().toISOString() }),
        });
        if (!up.ok) return upstream(headers, await up.text(), 'update');
        stockFinal = (await up.json())[0] || null;
      } else {
        const ins = await fetch(baseStock, {
          method: 'POST', headers: { ...sbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({ evento_id, zona, vendidos_fuera: boletos, nota: notaStock, updated_por: quien }),
        });
        if (!ins.ok) return upstream(headers, await ins.text(), 'insert');
        stockFinal = (await ins.json())[0] || null;
      }

      // Sello en el contrato: cierra la idempotencia Y deja el rastro de qué se
      // asignó, sin columna nueva.
      const cortesia = {
        evento_id, zona, boletos,
        talla, talla_origen: tallaOrigen,
        acompanante: acompNombre || null,
        asignado_en: new Date().toISOString(),
        asignado_por: quien,
      };
      const selloR = await fetch(`${baseContratos}?id=eq.${contratoId}`, {
        method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ datos: { ...datos, talla, talla_origen: datos.talla ? (datos.talla_origen || 'contrato') : tallaOrigen, cortesia } }),
      });
      if (!selloR.ok) return upstream(headers, await selloR.text(), 'update');

      return ok(headers, { viajero, stock: stockFinal, cortesia, creada: !existente });
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
      const zona = String(body.zona_boleto || '').trim();
      if (!zona) return bad(headers, 'la zona del boleto es obligatoria');
      if (zona.length > 120) return bad(headers, 'zona demasiado larga');

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

      const fila = {
        evento_id: eventoId,
        nombre,
        tipo_paquete: paquete,
        zona_boleto: zona,
        total_contrato: total,
        abonado_previo: abonado,
        tipo_viajero: 'cliente',
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

      return ok(headers, { viajero: creado, aviso_doble_descuento: avisoDoble });
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
      const viajeros = await rv.json();
      const abonos = await ra.json();

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

      return ok(headers, { deudores, ultimos, total_abonos: abonos.length });
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

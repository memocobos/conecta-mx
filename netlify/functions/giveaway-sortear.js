// giveaway-sortear.js — el giro y su resolución. PRIVADA (x-admin-token).
//
// ═══════════════════════════════════════════════════════════════════════════
// EL GANADOR LO ELIGE EL SERVIDOR. SIEMPRE.
//
// La página del sorteo solo ANIMA hacia un nombre que ya vino decidido de acá.
// Es lo único que hace el sorteo defendible: si el navegador escogiera, quien
// tiene la consola abierta escoge. Y como el renglón se INSERTA antes de
// contestar, el giro queda registrado aunque a Memo se le caiga el internet a
// media transmisión — no se puede girar hasta que salga alguien conveniente.
// ═══════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');
const G = require('./_lib/giveaway');

// Azar de crypto, no Math.random(): en un sorteo con premio, el generador
// tiene que ser el bueno aunque nadie lo vaya a auditar.
function alAzar(n) {
  if (n <= 0) return -1;
  const limite = Math.floor(0xFFFFFFFF / n) * n;   // sin sesgo por módulo
  let x;
  do { x = crypto.randomBytes(4).readUInt32BE(0); } while (x >= limite);
  return x % n;
}

exports.handler = async (event) => {
  const origin = G.corsCheck(event);
  const headers = G.cabeceras(origin, 'POST, OPTIONS');

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return G.json(405, headers, { ok: false, error: 'Método no permitido' });
  // `=== null` y no `!origin`: corsCheck devuelve '' cuando NO vino el header
  // (petición del mismo sitio, legítima) y null cuando el origen es AJENO.
  // Con `!origin` las dos caían en el mismo 403 y el arreglo de _lib no servía
  // de nada — medido: el cambio en la librería solo, no movió una sola línea
  // del resultado.
  if (origin === null) return G.json(403, headers, { ok: false, error: 'Origen no permitido' });
  if (!G.tokenAdminValido(event)) return G.json(401, headers, { ok: false, error: 'Token inválido' });

  const falta = G.faltaEnv();
  if (falta) return G.json(500, headers, { ok: false, error: falta });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return G.json(400, headers, { ok: false, error: 'JSON inválido' }); }

  const regBase = `${G.SB_URL}/rest/v1/giveaway_registros`;
  const sorBase = `${G.SB_URL}/rest/v1/giveaway_sorteos`;
  const slugQ = encodeURIComponent(G.SLUG);

  // ── GIRAR ────────────────────────────────────────────────────────────────
  if (body.accion === 'girar') {
    let registros = [], sorteos = [];
    try {
      const [rr, rs] = await Promise.all([
        // [SORTEO-ADMIN-1] `eliminado_at=is.null` va EN LA CONSULTA, no en un filtro
        // de después: así un eliminado no puede entrar a la tómbola por ningún
        // camino, ni aunque alguien toque la lógica de abajo. El candado más
        // barato es el que no deja llegar el dato.
        fetch(`${regBase}?slug=eq.${slugQ}&eliminado_at=is.null&select=id,nombre,whatsapp`, { headers: G.sbHeaders() }),
        fetch(`${sorBase}?slug=eq.${slugQ}&select=registro_id,resultado,intento`, { headers: G.sbHeaders() }),
      ]);
      if (!rr.ok) throw new Error('registros ' + rr.status);
      registros = await rr.json().catch(() => []);
      sorteos = rs.ok ? (await rs.json().catch(() => [])) : [];
    } catch (e) {
      console.error('[giveaway-sortear] lectura:', e.message);
      return G.json(502, headers, { ok: false, error: 'No se pudo leer el padrón' });
    }

    const total = Array.isArray(registros) ? registros.length : 0;
    if (!total) return G.json(409, headers, { ok: false, error: 'Todavía no hay participantes' });

    // Quedan fuera SOLO los que ya salieron y NO contestaron. Los 'pendiente'
    // también se excluyen: hay un giro vivo sin resolver, y volver a sacar a la
    // misma persona mientras se le marca sería absurdo.
    const quemados = new Set(
      (Array.isArray(sorteos) ? sorteos : [])
        .filter(s => s && (s.resultado === 'no_contesto' || s.resultado === 'pendiente'))
        .map(s => s.registro_id)
    );
    const elegibles = registros.filter(r => r && !quemados.has(r.id));
    if (!elegibles.length) {
      return G.json(409, headers, { ok: false, error: 'Ya se giró a todos los participantes' });
    }

    const ganador = elegibles[alAzar(elegibles.length)];
    const intento = (Array.isArray(sorteos) ? sorteos.length : 0) + 1;

    // Insert directo (sin on_conflict: aquí no hay índice único que provocarlo).
    let creado = null;
    try {
      const r = await fetch(sorBase, {
        method: 'POST',
        headers: Object.assign({}, G.sbHeaders(), { Prefer: 'return=representation' }),
        body: JSON.stringify({
          slug: G.SLUG,
          registro_id: ganador.id,
          ganador_nombre: ganador.nombre,
          ganador_whatsapp: ganador.whatsapp,
          intento,
          resultado: 'pendiente',
          total_participantes: total,
        }),
      });
      if (!r.ok) throw new Error('insert ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 200));
      const filas = await r.json().catch(() => []);
      creado = Array.isArray(filas) ? filas[0] : null;
    } catch (e) {
      console.error('[giveaway-sortear] insert:', e.message);
      return G.json(502, headers, { ok: false, error: 'No se pudo registrar el giro' });
    }

    return G.json(200, headers, {
      ok: true,
      sorteo_id: creado && creado.id,
      nombre: ganador.nombre,
      whatsapp: ganador.whatsapp,
      intento,
      total_participantes: total,
    });
  }

  // ── RESOLVER ─────────────────────────────────────────────────────────────
  if (body.accion === 'resolver') {
    const id = String(body.sorteo_id || '').trim();
    const resultado = String(body.resultado || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return G.json(400, headers, { ok: false, error: 'sorteo_id inválido' });
    }
    if (resultado !== 'acepto' && resultado !== 'no_contesto') {
      return G.json(400, headers, { ok: false, error: "resultado debe ser 'acepto' o 'no_contesto'" });
    }
    try {
      const r = await fetch(`${sorBase}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: Object.assign({}, G.sbHeaders(), { Prefer: 'return=representation' }),
        body: JSON.stringify({ resultado }),
      });
      if (!r.ok) throw new Error('patch ' + r.status);
      const filas = await r.json().catch(() => []);
      if (!Array.isArray(filas) || !filas.length) {
        return G.json(404, headers, { ok: false, error: 'Ese giro no existe' });
      }
      return G.json(200, headers, { ok: true, resultado });
    } catch (e) {
      console.error('[giveaway-sortear] resolver:', e.message);
      return G.json(502, headers, { ok: false, error: 'No se pudo guardar el resultado' });
    }
  }

  // ── ESTADO ADMIN ─────────────────────────────────────────────────────────
  // Lo mismo que giveaway-estado, MÁS el teléfono. Existe porque /sorteo ahora
  // es público: al recargar con token, el admin tiene que recuperar el
  // teléfono del ganador vivo, y ese dato no puede salir por la puerta
  // pública. Aquí sí, porque aquí se exige token.
  if (body.accion === 'estado_admin') {
    try {
      const r = await fetch(
        `${sorBase}?slug=eq.${slugQ}&select=id,intento,resultado,ganador_nombre,ganador_whatsapp,creado_at&order=intento.desc&limit=1`,
        { headers: G.sbHeaders() }
      );
      if (!r.ok) throw new Error('lectura ' + r.status);
      const filas = await r.json().catch(() => []);
      const u = Array.isArray(filas) ? filas[0] : null;
      return G.json(200, headers, {
        ok: true,
        ultimo: u ? {
          sorteo_id: u.id, intento: u.intento, resultado: u.resultado,
          nombre: u.ganador_nombre, whatsapp: u.ganador_whatsapp, creado_at: u.creado_at,
        } : null,
      });
    } catch (e) {
      console.error('[giveaway-sortear] estado_admin:', e.message);
      return G.json(502, headers, { ok: false, error: 'No se pudo leer el estado' });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // [SORTEO-ADMIN-1] EL PADRÓN COMPLETO — datos personales, puerta privada
  //
  // 🔒 VA POR AQUÍ Y NO POR `giveaway-lista`. Las dos son privadas (las dos
  // exigen x-admin-token), así que la razón NO es «pública vs privada» como
  // podría parecer: `giveaway-lista` devuelve NOMBRES Y NADA MÁS porque su
  // carrusel SALE EN CÁMARA durante la transmisión. Un teléfono ahí es un
  // teléfono en pantalla. El padrón con datos personales vive en esta puerta,
  // que nadie proyecta.
  if (body.accion === 'padron') {
    try {
      const r = await fetch(
        `${regBase}?slug=eq.${slugQ}&select=id,nombre,ciudad,whatsapp,correo,creado_at,` +
        'eliminado_at,eliminado_motivo,eliminado_por&order=creado_at.asc',
        { headers: G.sbHeaders() }
      );
      if (!r.ok) throw new Error('lectura ' + r.status);
      const filas = await r.json().catch(() => []);
      const lista = Array.isArray(filas) ? filas : [];
      return G.json(200, headers, {
        ok: true,
        total: lista.length,
        activos: lista.filter(x => !x.eliminado_at).length,
        eliminados: lista.filter(x => x.eliminado_at).length,
        // El premio se DERIVA de la ciudad con la regla de la casa: la pantalla
        // no vuelve a decidirlo (sería la segunda definición de quién gana qué).
        participantes: lista.map(x => Object.assign({}, x, { premio: G.premioPorCiudad(x.ciudad) })),
      });
    } catch (e) {
      console.error('[giveaway-sortear] padron:', e.message);
      return G.json(502, headers, { ok: false, error: 'No se pudo leer el padrón' });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // [SORTEO-ADMIN-1] ELIMINAR A UN PARTICIPANTE — es un ACTA, no un delete
  //
  // 🔒 TRES CANDADOS, y ninguno es opcional:
  //   1. NUNCA se borra la fila. Se marca `eliminado_at` + motivo + actor. Una
  //      eliminación es una decisión de la que hay que poder dar cuentas; un
  //      DELETE deja el padrón sin memoria de que esa persona existió.
  //   2. MOTIVO OBLIGATORIO, de un catálogo cerrado. Sin él, dentro de un mes
  //      nadie sabe por qué falta alguien — y el «otro» pide texto.
  //   3. SOLO ANTES DE QUE EL SORTEO SE RESUELVA. Con un ganador que ya aceptó,
  //      eliminar sería reescribir el resultado.
  const MOTIVOS = ['duplicado', 'no_cumple', 'solicitud_participante', 'otro'];
  if (body.accion === 'eliminar') {
    const id = String(body.registro_id || '').trim();
    if (!id) return G.json(400, headers, { ok: false, error: 'Falta el participante' });
    const motivo = String(body.motivo || '').trim();
    if (!MOTIVOS.includes(motivo)) {
      return G.json(400, headers, { ok: false, error: 'Elige un motivo: ' + MOTIVOS.join(', ') });
    }
    const detalle = String(body.motivo_detalle || '').trim().slice(0, 200);
    if (motivo === 'otro' && detalle.length < 3) {
      return G.json(400, headers, { ok: false, error: 'Con «otro» hace falta escribir el motivo' });
    }
    // ── El candado del sorteo resuelto, con la voz de ESF-DICE.
    let sorteos = [];
    try {
      const rs = await fetch(`${sorBase}?slug=eq.${slugQ}&select=registro_id,resultado`, { headers: G.sbHeaders() });
      sorteos = rs.ok ? (await rs.json().catch(() => [])) : [];
    } catch (e) {
      return G.json(502, headers, { ok: false, error: 'No se pudo leer el estado del sorteo' });
    }
    const lista = Array.isArray(sorteos) ? sorteos : [];
    if (lista.some(x => x && x.resultado === 'acepto')) {
      return G.json(409, headers, { ok: false, error: 'El sorteo ya se giró y hay ganador: el padrón queda como está' });
    }
    if (lista.some(x => x && x.registro_id === id && x.resultado === 'pendiente')) {
      return G.json(409, headers, { ok: false, error: 'A esta persona se le está girando ahora mismo: resuelve el giro primero' });
    }
    // ── El acta.
    const actor = String((event.headers && event.headers['x-admin-actor']) || 'admin').slice(0, 60);
    try {
      const r = await fetch(`${regBase}?id=eq.${encodeURIComponent(id)}&eliminado_at=is.null`, {
        method: 'PATCH',
        headers: Object.assign({}, G.sbHeaders(), { Prefer: 'return=representation' }),
        body: JSON.stringify({
          eliminado_at: new Date().toISOString(),
          eliminado_motivo: motivo === 'otro' ? ('otro: ' + detalle) : motivo,
          eliminado_por: actor,
        }),
      });
      if (!r.ok) throw new Error('patch ' + r.status);
      const filas = await r.json().catch(() => []);
      // 🔒 EL ÉXITO VACÍO TAMBIÉN HABLA (ESF-DICE): 0 filas no es «listo», es
      // «no había nada que eliminar» — o ya estaba eliminado, o el id no existe.
      if (!Array.isArray(filas) || !filas.length) {
        return G.json(409, headers, { ok: false, error: 'Ese participante ya estaba eliminado (o no existe)' });
      }
      return G.json(200, headers, { ok: true, eliminado: filas[0].id, motivo: filas[0].eliminado_motivo });
    } catch (e) {
      console.error('[giveaway-sortear] eliminar:', e.message);
      return G.json(502, headers, { ok: false, error: 'No se pudo eliminar al participante' });
    }
  }

  return G.json(400, headers, { ok: false, error: "accion debe ser 'girar', 'resolver', 'estado_admin', 'padron' o 'eliminar'" });
};

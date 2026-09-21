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
        // [GIVEAWAY-KG-1] Y `foto_estado=neq.invalidada`, por la MISMA razón:
        // una foto declinada por el equipo queda FUERA del sorteo, y el
        // candado más barato sigue siendo el que no deja llegar el dato.
        // ⚠️ `neq` y no `in.(pendiente,aprobada)`: con `neq` una fila cuyo
        // estado sea NULL —las ~600 de melanie y Natanael, que nacieron antes
        // de la columna— se quedaría FUERA sin que nadie lo decidiera, porque
        // en Postgres `NULL <> 'x'` es NULL y no pasa el filtro. Como esas
        // filas son de OTRO slug, aquí no llegan nunca; pero se dice, porque
        // el día que alguien reuse esta consulta sin el `slug` va a morder.
        fetch(`${regBase}?slug=eq.${slugQ}&eliminado_at=is.null&foto_estado=neq.invalidada`
              + `&select=id,nombre,whatsapp`, { headers: G.sbHeaders() }),
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
  // [GIVEAWAY-KG-1] Cuántas fotos siguen SIN revisar. No bloquea el giro
  // —orden de Memo— pero /sorteo lo pregunta antes y avisa: girar con fotos
  // pendientes es una decisión, y una decisión hay que poder tomarla sabiendo.
  if (body.accion === 'pendientes_foto') {
    const r = await fetch(`${regBase}?slug=eq.${slugQ}&eliminado_at=is.null&foto_estado=eq.pendiente&select=id`,
      { headers: Object.assign({}, G.sbHeaders(), { Prefer: 'count=exact' }) });
    const filas = r.ok ? (await r.json().catch(() => [])) : [];
    return G.json(200, headers, { ok: true, pendientes: Array.isArray(filas) ? filas.length : 0 });
  }

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
        // [GIVEAWAY-KG-1] `instagram`, `foto_path` y `foto_estado` viajan SOLO
        // por aquí: ésta es la puerta CON token. Las públicas no los piden ni
        // los pueden pedir — su `select` es de dos columnas.
        `${regBase}?slug=eq.${slugQ}&select=id,nombre,ciudad,whatsapp,correo,creado_at,` +
        'instagram,foto_path,foto_estado,' +
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
  // La foto se ve con URL FIRMADA de corta duración: el bucket es privado y
  // una URL que no caduca es una foto pública con pasos extra.
  if (body.accion === 'foto_url') {
    const p = String(body.foto_path || '').trim();
    if (!/^[a-z0-9-]+\/[a-f0-9]{12}\/[A-Za-z0-9-]+\.(jpg|png)$/.test(p)) {
      return G.json(400, headers, { ok: false, error: 'Ruta inválida' });
    }
    try {
      const r = await fetch(`${G.SB_URL}/storage/v1/object/sign/giveaway-fotos/${encodeURI(p)}`, {
        method: 'POST', headers: G.sbHeaders(), body: JSON.stringify({ expiresIn: 600 }),   // 10 min
      });
      if (!r.ok) return G.json(502, headers, { ok: false, error: 'No se pudo firmar' });
      const j = await r.json().catch(() => ({}));
      return G.json(200, headers, { ok: true, url: j && j.signedURL ? `${G.SB_URL}/storage/v1${j.signedURL}` : null });
    } catch (e) {
      return G.json(502, headers, { ok: false, error: 'No se pudo firmar' });
    }
  }

  // ═══ [GIVEAWAY-KG-1] LA REVISIÓN DE FOTOS ═════════════════════════════════
  //
  // 🔒 ES REVERSIBLE, Y ESO NO ES UN LUJO: un dedazo en un teléfono no puede
  // sacar a nadie del concurso. Aprobar, invalidar y volver a pendiente son el
  // mismo movimiento —se escribe el estado que se pida— y por eso no hay
  // «invalidar» de una sola dirección. Lo irreversible es `eliminar`, que ya
  // existía y pide motivo.
  if (body.accion === 'revisar_foto') {
    const id = String(body.id || '').trim();
    const estado = String(body.estado || '').trim();
    if (!id) return G.json(400, headers, { ok: false, error: 'Falta el id' });
    // La lista blanca vive aquí Y en el CHECK de la base: un typo
    // («invalidado» por «invalidada») dejaría a alguien DENTRO del sorteo
    // creyendo que quedó fuera, porque el giro excluye por el valor exacto.
    if (!['pendiente', 'aprobada', 'invalidada'].includes(estado)) {
      return G.json(400, headers, { ok: false, error: 'Estado inválido' });
    }
    const r = await fetch(`${regBase}?id=eq.${encodeURIComponent(id)}&slug=eq.${slugQ}`, {
      method: 'PATCH',
      headers: Object.assign({}, G.sbHeaders(), { Prefer: 'return=representation' }),
      body: JSON.stringify({ foto_estado: estado }),
    });
    if (!r.ok) return G.json(502, headers, { ok: false, error: 'No se pudo guardar', detalle: (await r.text()).slice(0, 200) });
    const filas = await r.json().catch(() => []);
    // Cuántas tocó: si el filtro se aflojara algún día, el número lo grita.
    return G.json(200, headers, { ok: true, tocadas: filas.length, estado });
  }

  // ── EL BARRIDO DE HUÉRFANAS ───────────────────────────────────────────────
  // Una foto es HUÉRFANA cuando está en el bucket y NINGÚN registro la nombra.
  //
  // ⚠️ Y SOLO SI LLEVA MÁS DE SEIS HORAS. Entre que se sube y que se guarda el
  // registro pasan segundos, pero una persona puede dejar el formulario a
  // medias y volver un rato después — barrerla a los diez minutos le borraría
  // la foto en la cara. Seis horas es de sobra para cualquier registro real y
  // corto para que no se acumule.
  //
  // 🔒 NO CORRE SOLO. Es un botón del admin que primero ENSEÑA cuántas son y
  // solo borra cuando se le confirma: un barrido automático sobre el bucket de
  // la gente es justo lo que no se hace sin mirar.
  if (body.accion === 'fotos_huerfanas' || body.accion === 'fotos_huerfanas_borrar') {
    const BUCKET = 'giveaway-fotos';
    const HORAS = 6;
    const corte = Date.now() - HORAS * 60 * 60 * 1000;

    // Lo que el bucket tiene, bajo el prefijo de ESTE giveaway.
    const enBucket = [];
    try {
      // El listado es por carpeta, y las fotos viven en <slug>/<prefijo-ip>/.
      const rr = await fetch(`${G.SB_URL}/storage/v1/object/list/${BUCKET}`, {
        method: 'POST', headers: G.sbHeaders(),
        body: JSON.stringify({ prefix: `${G.SLUG}/`, limit: 1000 }),
      });
      const carpetas = rr.ok ? (await rr.json().catch(() => [])) : [];
      for (const c of (Array.isArray(carpetas) ? carpetas : [])) {
        if (!c || !c.name) continue;
        const r2 = await fetch(`${G.SB_URL}/storage/v1/object/list/${BUCKET}`, {
          method: 'POST', headers: G.sbHeaders(),
          body: JSON.stringify({ prefix: `${G.SLUG}/${c.name}/`, limit: 1000 }),
        });
        const objs = r2.ok ? (await r2.json().catch(() => [])) : [];
        for (const o of (Array.isArray(objs) ? objs : [])) {
          if (!o || !o.name) continue;
          enBucket.push({ path: `${G.SLUG}/${c.name}/${o.name}`, creado: Date.parse(o.created_at || o.updated_at || '') });
        }
      }
    } catch (e) {
      return G.json(502, headers, { ok: false, error: 'No se pudo leer el bucket: ' + e.message });
    }

    // Lo que los registros nombran.
    const rp = await fetch(`${regBase}?slug=eq.${slugQ}&select=foto_path&limit=20000`, { headers: G.sbHeaders() });
    const usados = new Set(((rp.ok ? await rp.json().catch(() => []) : []) || [])
      .map((f) => f && f.foto_path).filter(Boolean));

    const huerfanas = enBucket.filter((o) => !usados.has(o.path))
      // Sin fecha legible NO se borra: ante la duda, se queda. Borrar de más
      // es irreversible y borrar de menos solo cuesta unos KB.
      .filter((o) => Number.isFinite(o.creado) && o.creado < corte);

    if (body.accion === 'fotos_huerfanas') {
      return G.json(200, headers, { ok: true, en_bucket: enBucket.length, usadas: usados.size,
        huerfanas: huerfanas.length, horas: HORAS, muestra: huerfanas.slice(0, 5).map((o) => o.path) });
    }
    // Borrar, ya confirmado.
    let borradas = 0;
    for (let i = 0; i < huerfanas.length; i += 50) {
      const lote = huerfanas.slice(i, i + 50).map((o) => o.path);
      const rd = await fetch(`${G.SB_URL}/storage/v1/object/${BUCKET}`, {
        method: 'DELETE', headers: G.sbHeaders(), body: JSON.stringify({ prefixes: lote }),
      });
      if (rd.ok) borradas += lote.length;
    }
    return G.json(200, headers, { ok: true, borradas, de: huerfanas.length });
  }

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

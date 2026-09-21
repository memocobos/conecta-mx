// giveaway-registro.js — alta pública en el giveaway. PÚBLICA (sin JWT): la
// credencial no existe; lo que protege es la validación, el cierre por fecha y
// el límite por IP.
//
// El navegador NUNCA escribe a Supabase: escribe esta función con service_role.

const G = require('./_lib/giveaway');

// [GIVEAWAY-KG-1] El formato de un usuario de Instagram: letras, números,
// punto y guion bajo, hasta 30. Anclado a inicio y fin — sin las anclas,
// «https://instagram.com/fulano» pasaría por traer un tramo válido dentro.
const IG_RE = /^[A-Za-z0-9._]{1,30}$/;
// Y la forma del path que devuelve `giveaway-foto`: `<slug>/<uuid>.<ext>`.
// Se valida la FORMA antes de preguntarle al bucket, para que una cadena con
// `../` ni siquiera llegue a convertirse en una consulta.
const FOTO_PATH_RE = /^[a-z0-9-]+\/[a-f0-9]{12}\/[A-Za-z0-9-]+\.(jpg|png)$/;
const BUCKET_FOTOS = 'giveaway-fotos';

// Máximo de altas por IP en una hora. No es antifraude —una IP compartida son
// muchas personas— es un freno al script que llena la tabla en un minuto.
const MAX_POR_IP_HORA = 5;
const HORA_MS = 3600 * 1000;

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

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

  const falta = G.faltaEnv();
  if (falta) return G.json(500, headers, { ok: false, error: falta });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return G.json(400, headers, { ok: false, error: 'No entendimos los datos, vuelve a intentar' }); }

  // ── Validaciones, EN ESTE ORDEN y con el mensaje que la persona necesita ──
  if (body.acepto !== true) {
    return G.json(400, headers, { ok: false, error: 'Necesitas aceptar las bases para participar' });
  }

  const nombre = String(body.nombre || '').trim().replace(/\s+/g, ' ');
  if (nombre.length < 3) {
    return G.json(400, headers, { ok: false, error: 'Escribe tu nombre completo' });
  }

  // WhatsApp: se quita TODO lo que no sea dígito y deben quedar exactamente 10.
  // Se guarda la versión normalizada — es la que sostiene el índice único, así
  // que "81 1234 5678" y "8112345678" tienen que ser la MISMA fila.
  const whatsapp = String(body.whatsapp || '').replace(/\D/g, '');
  if (whatsapp.length !== 10) {
    return G.json(400, headers, { ok: false, error: 'El WhatsApp va a 10 dígitos, sin lada de país' });
  }

  const correo = String(body.correo || '').trim().toLowerCase();
  if (!CORREO_RE.test(correo) || correo.length > 160) {
    return G.json(400, headers, { ok: false, error: 'Revisa tu correo, algo no cuadra' });
  }

  // [GIVEAWAY-NATA-1] LA CIUDAD ES OBLIGATORIA, y no es un campo de adorno: el
  // premio es DUAL y lo decide la residencia (Reynosa → PLUS; fuera → CHEAP).
  // Medido antes de escribirlo: el formulario de melanie NO la pedía —solo
  // nombre, whatsapp y correo—, así que sin esto el premio no se puede
  // adjudicar y habría que perseguir a la persona por WhatsApp para saberlo.
  // Se guarda TAL CUAL la escribe (con su acento y su «Tamps.»): la que decide
  // es `G.premioPorCiudad`, que normaliza al leer. Guardar el texto normalizado
  // perdería el dato que la persona dio, y el premio se adjudica mirándolo.
  const ciudad = String(body.ciudad || '').trim().replace(/\s+/g, ' ');
  if (ciudad.length < 3 || ciudad.length > 80) {
    return G.json(400, headers, { ok: false, error: 'Escribe tu ciudad — de ella depende tu premio' });
  }

  // ── [GIVEAWAY-KG-1] INSTAGRAM. Obligatorio, y PRIVADO: no sale por ninguna
  // puerta pública. Se acepta con o sin @ porque la gente lo copia de las dos
  // formas, y se guarda SIN @ para que la llave sea una sola.
  // El formato es el de Instagram: letras, números, punto y guion bajo, hasta
  // 30. Validarlo evita que entre una URL completa o un «@ mi cuenta».
  const igCrudo = String(body.instagram || '').trim().replace(/^@+/, '');
  if (!IG_RE.test(igCrudo)) {
    return G.json(400, headers, { ok: false,
      error: 'Revisa tu Instagram: solo el usuario, sin el @ y sin la liga' });
  }
  const instagram = igCrudo;

  // ── [GIVEAWAY-KG-1] LA FOTO. Llega ya subida: el navegador la manda primero
  // a `giveaway-foto` y trae de vuelta su `foto_path`. El orden es a propósito
  // (ver el encabezado de esa función): un archivo huérfano es barato, un
  // registro sin foto es caro.
  //
  // 🔒 SE COMPRUEBA QUE EL PATH EXISTA DE VERDAD. Sin esto, un cliente podría
  // mandar cualquier cadena y quedar registrado sin foto — con su WhatsApp
  // ocupando el índice único, o sea sin poder corregirlo después.
  const fotoPath = String(body.foto_path || '').trim();
  if (!fotoPath || !FOTO_PATH_RE.test(fotoPath)) {
    return G.json(400, headers, { ok: false, error: 'Falta tu foto — súbela antes de participar' });
  }

  // Cierre por fecha. Va DESPUÉS de las validaciones de forma para que quien
  // llegue tarde con datos malos sepa que llegó tarde, no que su correo falla.
  if (G.registroCerrado()) {
    return G.json(410, headers, { ok: false, error: 'El registro ya cerró' });
  }

  // El objeto tiene que estar en el bucket. Se pregunta por HEAD: barato, y no
  // baja la foto.
  try {
    const h = await fetch(`${G.SB_URL}/storage/v1/object/${BUCKET_FOTOS}/${encodeURI(fotoPath)}`, {
      method: 'HEAD', headers: { apikey: G.SB_KEY, Authorization: 'Bearer ' + G.SB_KEY },
    });
    if (!h.ok) {
      return G.json(400, headers, { ok: false,
        error: 'Tu foto no llegó completa. Vuelve a subirla e inténtalo otra vez.' });
    }
  } catch (e) {
    console.warn('[giveaway-registro] no se pudo comprobar la foto:', e.message);
    return G.json(502, headers, { ok: false, error: 'No pudimos verificar tu foto, vuelve a intentar' });
  }

  const ip = G.ipDe(event);
  const ua = String((event.headers && event.headers['user-agent']) || '').slice(0, 400);
  const base = `${G.SB_URL}/rest/v1/giveaway_registros`;

  // ── Límite por IP ────────────────────────────────────────────────────────
  try {
    const desde = new Date(Date.now() - HORA_MS).toISOString();
    const r = await fetch(
      `${base}?ip=eq.${encodeURIComponent(ip)}&creado_at=gte.${encodeURIComponent(desde)}&select=id`,
      { headers: Object.assign({}, G.sbHeaders(), { Prefer: 'count=exact' }) }
    );
    if (r.ok) {
      const filas = await r.json().catch(() => []);
      if (Array.isArray(filas) && filas.length >= MAX_POR_IP_HORA) {
        return G.json(429, headers, { ok: false, error: 'Demasiados registros desde aquí. Inténtalo en un rato.' });
      }
    }
    // Si la consulta falla NO se bloquea: el límite es un freno, no un candado.
    // Perder un registro real por una consulta caída sería peor que el abuso.
  } catch (e) {
    console.warn('[giveaway-registro] no se pudo verificar el límite por IP:', e.message);
  }

  // ── INSERT DIRECTO. Jamás on_conflict/upsert: con índice único revienta
  //    con 42P10. El 23505 NO es un error: es el candado (slug, whatsapp)
  //    funcionando, y se traduce a un mensaje que la persona entiende.
  let r;
  try {
    r = await fetch(base, {
      method: 'POST',
      headers: Object.assign({}, G.sbHeaders(), { Prefer: 'return=representation' }),
      body: JSON.stringify({
        slug: G.SLUG, nombre, whatsapp, correo, ciudad, ip, user_agent: ua,
        instagram, foto_path: fotoPath,   // [GIVEAWAY-KG-1] `foto_estado` lo pone la base en 'pendiente'
      }),
    });
  } catch (e) {
    console.error('[giveaway-registro] red:', e.message);
    return G.json(502, headers, { ok: false, error: 'No pudimos guardar tu registro, vuelve a intentar' });
  }

  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    // 🔒 DOS ÍNDICES ÚNICOS, DOS MENSAJES. Antes había uno solo y su texto
    // decía «ese WhatsApp ya está registrado»: con el de `foto_path` encima,
    // ese mismo texto habría mandado a la persona a revisar un WhatsApp que
    // estaba bien. El 23505 se lee por el NOMBRE de la restricción.
    if (r.status === 409 || /23505/.test(detalle)) {
      if (/foto_path/.test(detalle)) {
        return G.json(409, headers, { ok: false,
          error: 'Esa foto ya está usada en otro registro. Elige otra foto e inténtalo.' });
      }
      return G.json(409, headers, { ok: false, error: 'Ese WhatsApp ya está registrado' });
    }
    // 🔒 LA MIGRACIÓN QUE FALTA, DICHA POR SU NOMBRE. 42703 es «la columna no
    // existe»: pasa si esto se despliega antes de correr
    // `migraciones/GIVEAWAY-KG-1-fotos.sql`. Sin este caso, el día del estreno
    // el síntoma sería un 502 mudo y se buscaría el problema en la red.
    if (/42703/.test(detalle) || /column .* does not exist/i.test(detalle)) {
      console.error('[giveaway-registro] FALTA LA MIGRACIÓN GIVEAWAY-KG-1-fotos.sql');
      return G.json(500, headers, { ok: false,
        error: 'El registro todavía no está listo. Avísale a Conecta.',
        codigo: 'FALTA_MIGRACION' });
    }
    console.error('[giveaway-registro] Supabase', r.status, detalle.slice(0, 300));
    return G.json(502, headers, { ok: false, error: 'No pudimos guardar tu registro, vuelve a intentar' });
  }

  // Posición = cuántos van registrados. Se cuenta DESPUÉS del insert, así que
  // el número que ve la persona ya la incluye a ella.
  let posicion = null;
  try {
    const c = await fetch(`${base}?slug=eq.${encodeURIComponent(G.SLUG)}&select=id`, { headers: G.sbHeaders() });
    if (c.ok) {
      const todos = await c.json().catch(() => []);
      if (Array.isArray(todos)) posicion = todos.length;
    }
  } catch (e) { /* el registro YA quedó: sin número, pero guardado */ }

  return G.json(200, headers, { ok: true, posicion });
};

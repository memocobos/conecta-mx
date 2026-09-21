// =============================================================================
// giveaway-foto.js — sube la foto del participante a un bucket PRIVADO
// =============================================================================
// [GIVEAWAY-KG-1] La foto es obligatoria para participar. Sube por AQUÍ y no
// desde el navegador porque la llave de Storage NO puede bajar al cliente: con
// ella cualquiera escribiría en el bucket del Palacio.
//
// ═══ EL ORDEN: PRIMERO LA FOTO, DESPUÉS EL REGISTRO ════════════════════════
// Algo va a fallar a la mitad alguna vez —señal de celular—, así que el orden
// se elige por CUÁL DE LOS DOS HUECOS DUELE MENOS:
//
//   · registro sin foto  → la persona CREE que está dentro, le falta un campo
//     obligatorio, y su WhatsApp ya ocupa el índice único: no puede volver a
//     registrarse. Se arregla a mano, persona por persona.
//   · foto sin registro  → un archivo huérfano en un bucket privado. No lo ve
//     nadie, no entra al sorteo, no cuesta más que unos KB, y se barre.
//
// El huérfano es barato; el registro cojo es caro. Por eso: se sube primero,
// el navegador se queda con el `foto_path` que devuelve esta función, y lo
// manda en el registro. Si el registro falla y la persona reintenta, REUSA el
// mismo path — no se sube dos veces.
//
// 🔒 Y EL REGISTRO COMPRUEBA QUE EL PATH EXISTA antes de guardarlo, para que
// un cliente no pueda mandar una ruta inventada y quedar registrado sin foto.
//
// Método: POST { foto: 'data:image/jpeg;base64,...' } → { ok, foto_path }
// =============================================================================

const G = require('./_lib/giveaway');

const BUCKET = 'giveaway-fotos';

// 1 MB. La foto YA viene comprimida del navegador (lado mayor 1080, JPEG, meta
// de 300 KB); este tope es el freno de lo que llegue sin pasar por ahí.
const MAX_BYTES = 1024 * 1024;

// ── LA IMAGEN SE RECONOCE POR SUS BYTES, NO POR LO QUE DIGA EL CLIENTE ──────
// El `data:image/jpeg` del encabezado lo escribe quien sube: un .exe renombrado
// llega con esa etiqueta igual de bien. Estas son las firmas reales del
// principio del archivo, que no se pueden fingir sin ser de verdad ese formato.
//
// Se aceptan JPEG y PNG a secas. HEIC NO: el navegador tiene que convertirlo
// antes (lo hace la compresión), y aceptarlo aquí dejaría entrar un formato que
// media web no puede ni mostrar — incluida la cuadrícula de revisión.
function tipoPorBytes(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47
      && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) return { mime: 'image/png', ext: 'png' };
  // HEIC/HEIF: 'ftypheic' / 'ftypmif1' en los bytes 4..12. Se reconoce para
  // poder DECIRLO —«tu iPhone mandó HEIC»— en vez de un «no es imagen» que no
  // ayuda a nadie.
  const ftyp = b.slice(4, 12).toString('latin1');
  if (/^ftyp(heic|heix|hevc|mif1|msf1)/.test(ftyp)) return { heic: true };
  return null;
}

function uuid() {
  try { return require('crypto').randomUUID(); }
  catch (_) { return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
}

exports.handler = async (event) => {
  const origin = G.corsCheck(event);
  const headers = G.cabeceras(origin, 'POST, OPTIONS');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return G.json(405, headers, { ok: false, error: 'Método no permitido' });
  if (origin === null) return G.json(403, headers, { ok: false, error: 'Origen no permitido' });

  const falta = G.faltaEnv();
  if (falta) { console.error('[giveaway-foto]', falta); return G.json(500, headers, { ok: false, error: 'Configuración incompleta' }); }

  // Cerrado el registro, cerrada la subida: si no, el bucket sigue recibiendo
  // fotos de gente que ya no puede participar.
  if (G.registroCerrado()) return G.json(410, headers, { ok: false, error: 'El registro ya cerró' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_) { return G.json(400, headers, { ok: false, error: 'Petición mal formada' }); }

  const m = /^data:([a-zA-Z0-9/.+-]+);base64,([\s\S]+)$/.exec(String(body.foto || ''));
  if (!m) return G.json(400, headers, { ok: false, error: 'No llegó ninguna foto' });

  let bytes;
  try { bytes = Buffer.from(m[2].replace(/\s+/g, ''), 'base64'); }
  catch (_) { return G.json(400, headers, { ok: false, error: 'La foto llegó corrupta, vuelve a intentar' }); }
  if (!bytes.length) return G.json(400, headers, { ok: false, error: 'La foto llegó vacía, vuelve a intentar' });

  // El tope se mide sobre los BYTES YA DECODIFICADOS, no sobre el largo del
  // base64: en base64 el mismo archivo mide un tercio más y el tope saldría mal.
  if (bytes.length > MAX_BYTES) {
    return G.json(413, headers, { ok: false,
      error: 'La foto pesa demasiado. Vuelve a elegirla — la comprimimos antes de subirla.' });
  }

  const tipo = tipoPorBytes(bytes);
  if (tipo && tipo.heic) {
    return G.json(415, headers, { ok: false,
      error: 'Esa foto viene en formato HEIC de iPhone. Vuelve a elegirla: la convertimos sola, pero necesita abrirse primero.' });
  }
  if (!tipo) {
    return G.json(415, headers, { ok: false, error: 'Ese archivo no es una foto. Sube una imagen JPG o PNG.' });
  }

  // 🔒 EL NOMBRE LO PONE EL SERVIDOR, SIEMPRE. Si lo pusiera el cliente podría
  // mandar `../` y escribir fuera de su carpeta, o pisar la foto de otra
  // persona escribiendo su path. Aquí no hay nada del cliente en la ruta.
  const path = `${G.SLUG}/${uuid()}.${tipo.ext}`;

  let r;
  try {
    r = await fetch(`${G.SB_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
      method: 'POST',
      headers: {
        apikey: G.SB_KEY,
        Authorization: 'Bearer ' + G.SB_KEY,
        'Content-Type': tipo.mime,
        // SIN x-upsert: cada foto estrena su uuid, así que un path repetido
        // sería un error de verdad y conviene que truene.
      },
      body: bytes,
    });
  } catch (e) {
    console.error('[giveaway-foto] red:', e.message);
    return G.json(502, headers, { ok: false, error: 'No se pudo subir tu foto. Revisa tu señal e inténtalo otra vez.' });
  }

  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    console.error('[giveaway-foto] Storage', r.status, detalle.slice(0, 300));
    // El bucket que no existe todavía es el caso REAL del día del estreno:
    // se dice con su nombre en vez de un 502 mudo.
    if (r.status === 404 || /Bucket not found/i.test(detalle)) {
      return G.json(500, headers, { ok: false,
        error: 'Todavía no está lista la subida de fotos. Avísale a Conecta.',
        codigo: 'SIN_BUCKET' });
    }
    return G.json(502, headers, { ok: false, error: 'No se pudo subir tu foto. Revisa tu señal e inténtalo otra vez.' });
  }

  return G.json(200, headers, { ok: true, foto_path: path });
};

module.exports.BUCKET = BUCKET;
module.exports.MAX_BYTES = MAX_BYTES;
module.exports.tipoPorBytes = tipoPorBytes;

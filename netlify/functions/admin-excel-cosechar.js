// =============================================================================
// admin-excel-cosechar — la puerta de la cosecha (EXCEL-BOTÓN-1a)
// =============================================================================
// Body JSON:
//   { }                  → la lista de pestañas del Excel
//   { pestana: "..." }   → las filas CRUDAS de esa pestaña + dónde está su
//                          encabezado
//
// FASE 1a: SOLO LEE. No escribe una sola fila en ninguna base, ni marca, ni
// compara. El careo y los cuatro montones son 1b.
//
// Y NO INTERPRETA: devuelve la rejilla tal cual la mandó el Apps Script. El
// protocolo del careo —paquete, boleto, el separo sin encabezado, los pagos
// 1…10, la chatarra, los nombres normalizados— vive en 1b, donde un arnés puede
// carearlo contra filas reales.
//
// Seguridad: mismo molde que admin-marcar-pago (corsCheck + verifyAdminAuthLive).
// Roles maestro_roshi y bulma: la hoja trae nombres, teléfonos y montos de
// gente, y esto es la herramienta de quien cuadra el dinero.
//
// El token del Apps Script vive en `EXCEL_SCRIPT_TOKEN` y NUNCA baja al
// navegador — esa es la razón entera de que la cosecha sea una Function y no un
// fetch de la pantalla.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { cosechar } = require('./_lib/cosecha-excel');

const MAX_NOMBRE_PESTANA = 200;

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

  const auth = await verifyAdminAuthLive(event, ['maestro_roshi', 'bulma']);
  if (!auth.valid) return { statusCode: auth.status, headers, body: JSON.stringify({ error: auth.error }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  let pestana = body.pestana;
  if (pestana != null && typeof pestana !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'pestana debe ser texto' }) };
  }
  pestana = pestana ? String(pestana).trim() : '';
  if (pestana.length > MAX_NOMBRE_PESTANA) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: `pestana demasiado larga (máx ${MAX_NOMBRE_PESTANA})` }) };
  }

  const r = await cosechar({ pestana });

  // Un fallo de la cosecha NO es un 500 genérico: cada uno sale con su código y
  // su mensaje, porque los tres se arreglan distinto y confundirlos manda al
  // admin a arreglar lo que no está roto.
  //   SIN_CONFIG / NO_ES_JSON / SIN_RESPUESTA → 502, es de nuestro lado o del despliegue
  //   TOKEN_INVALIDO                          → 502, el token de Netlify no casa con el del script
  //   PESTANA_NO_EXISTE / SIN_ENCABEZADO      → 404 y 422: el admin puede obrar
  if (!r.ok) {
    const status = r.codigo === 'PESTANA_NO_EXISTE' ? 404
                 : r.codigo === 'SIN_ENCABEZADO' ? 422
                 : 502;
    return { statusCode: status, headers, body: JSON.stringify({
      error: r.mensaje, codigo: r.codigo,
      pestanas: r.pestanas, primeras_filas: r.primeras_filas, pista: r.pista,
    }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify(r) };
};

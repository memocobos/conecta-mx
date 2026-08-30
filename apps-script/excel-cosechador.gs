/**
 * ============================================================================
 * excel-cosechador.gs — el cosechador del Excel, del lado de Google
 * ============================================================================
 * Lo despliegan Memo y Jane en el Drive: yo no puedo, vive en su cuenta.
 * Instrucciones de despliegue al final del archivo.
 *
 * POR QUÉ EXISTE. El plan original era que el navegador del admin le pegara
 * directo a `gviz` con la sesión de Google. Se midió y esa puerta NO EXISTE:
 * desde el origen de conectareynosa.mx el fetch muere en el preflight, con y
 * sin credenciales. Las cosechas que ya funcionaban corrían desde una pestaña
 * de docs.google.com — mismo origen, sin CORS de por medio.
 *
 * Con este script la cosecha se va del navegador al SERVIDOR: nuestra Function
 * le pega aquí con un token, y el navegador del admin jamás toca Google. Cero
 * CORS, cero dependencia de que el admin tenga sesión, y la puerta queda
 * abierta para un careo automático por cron.
 *
 * ── LA REGLA QUE ORDENA ESTE ARCHIVO ────────────────────────────────────────
 * ESTE SCRIPT NO INTERPRETA NADA. Devuelve la rejilla tal cual: no sabe qué es
 * «Nombre», ni el separo, ni los pagos 1…10, ni la chatarra. Todo el protocolo
 * del careo vive del lado nuestro (`_lib/careo-excel.js`), que es donde un
 * arnés puede carearlo contra filas reales. Un script que interpreta es
 * protocolo escondido en un lugar que no se puede probar.
 *
 * ── EL CONTRATO ─────────────────────────────────────────────────────────────
 * ENTRADA (POST, application/json):
 *     { "token": "<el secreto>", "pestana": "Stray Kids - 25 de septiembre" }
 *   · `pestana` opcional: sin ella devuelve solo la lista de pestañas.
 *
 * SALIDA (200 siempre, el resultado va en el cuerpo — un Web App no controla
 * bien su status, así que el éxito se lee de `ok`, nunca del código HTTP):
 *     { ok:true, pestana:"...", filas:[["","Nombre",...],[...]], n_filas:87,
 *       pestanas:["...","..."], leido_en:"2026-08-30T12:00:00.000Z" }
 *     { ok:false, codigo:"TOKEN_INVALIDO"|"PESTANA_NO_EXISTE"|"SIN_TOKEN"
 *                        |"CUERPO_INVALIDO"|"ERROR", error:"...", pestanas:[...] }
 *
 * Las celdas van como TEXTO MOSTRADO (`getDisplayValues`): lo que el humano ve,
 * igual que el CSV que se venía leyendo. Un `$1,243.00` llega así, con su signo
 * y su coma, y el parser de nuestro lado lo entiende — que es donde se puede
 * probar que lo entiende.
 * ============================================================================
 */

// El SID NO se recibe de fuera, a propósito: el script está atado a SU hoja.
// Si el id viajara en la petición, esta URL sería una llave para leer cualquier
// hoja de la cuenta con solo cambiar un parámetro.
var SPREADSHEET_ID = '';   // ← vacío = usa la hoja a la que está atado el script

function _hoja() {
  return SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function _responder(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var cuerpo;
    try { cuerpo = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
    catch (err) { return _responder({ ok: false, codigo: 'CUERPO_INVALIDO', error: 'El cuerpo no es JSON' }); }

    // El despliegue tiene que ser accesible por "cualquiera" —nuestro servidor
    // no tiene sesión de Google—, así que la URL es pública y EL TOKEN ES EL
    // ÚNICO CANDADO. Sin token no se contesta nada, ni la lista de pestañas.
    var esperado = PropertiesService.getScriptProperties().getProperty('CAREO_TOKEN');
    if (!esperado) return _responder({ ok: false, codigo: 'ERROR', error: 'El script no tiene CAREO_TOKEN configurado' });
    if (!cuerpo.token) return _responder({ ok: false, codigo: 'SIN_TOKEN', error: 'Falta el token' });
    if (String(cuerpo.token) !== String(esperado)) {
      return _responder({ ok: false, codigo: 'TOKEN_INVALIDO', error: 'Token incorrecto' });
    }

    var ss = _hoja();
    var pestanas = ss.getSheets().map(function (h) { return h.getName(); });

    // Sin `pestana`: solo el catálogo. Sirve para sembrar el mapeo y para que
    // la pantalla ofrezca una lista en vez de pedir que se escriba a mano.
    var nombre = cuerpo.pestana ? String(cuerpo.pestana) : '';
    if (!nombre) {
      return _responder({ ok: true, pestanas: pestanas, leido_en: new Date().toISOString() });
    }

    var hoja = ss.getSheetByName(nombre);
    if (!hoja) {
      // Se devuelven las pestañas que SÍ hay: un nombre mal escrito se arregla
      // viendo la lista, no adivinando.
      return _responder({ ok: false, codigo: 'PESTANA_NO_EXISTE',
                          error: 'No hay una pestaña llamada "' + nombre + '"', pestanas: pestanas });
    }

    var rango = hoja.getDataRange();
    var filas = rango ? rango.getDisplayValues() : [];
    return _responder({
      ok: true, pestana: nombre, filas: filas, n_filas: filas.length,
      pestanas: pestanas, leido_en: new Date().toISOString(),
    });
  } catch (err) {
    return _responder({ ok: false, codigo: 'ERROR', error: String(err && err.message || err) });
  }
}

// GET existe SOLO para que el despliegue se pueda probar desde el navegador sin
// mandar nada. No devuelve datos: si devolviera, la URL pública sería una fuga.
function doGet() {
  return _responder({ ok: false, codigo: 'SIN_TOKEN',
                      error: 'Este script solo contesta por POST y con token.' });
}

/**
 * ── DESPLIEGUE (Memo y Jane, en Chrome) ─────────────────────────────────────
 *
 * 1. Abrir el Excel en Google Sheets → Extensiones → Apps Script.
 * 2. Pegar este archivo completo, reemplazando lo que haya. Guardar.
 * 3. Configuración del proyecto (el engrane) → Propiedades del script →
 *    Agregar propiedad:  CAREO_TOKEN = <una cadena larga y aleatoria>
 *    (por ejemplo la que salga de: openssl rand -hex 32)
 * 4. Implementar → Nueva implementación → tipo "Aplicación web":
 *       Ejecutar como:        Yo (el dueño de la hoja)
 *       Quién tiene acceso:   Cualquier persona
 *    ⚠️ "Cualquier persona" es OBLIGATORIO porque nuestro servidor no tiene
 *    sesión de Google — y por eso EL TOKEN ES EL ÚNICO CANDADO de esta URL.
 *    Que sea largo y que no se pegue en ningún chat.
 * 5. Copiar la URL que termina en /exec.
 * 6. Ponerlas en Netlify (Site settings → Environment variables), en el sitio
 *    de KameHouse:
 *       EXCEL_SCRIPT_URL    = <la URL /exec>
 *       EXCEL_SCRIPT_TOKEN  = <el mismo CAREO_TOKEN>
 * 7. Probar: abrir la URL /exec en el navegador. Debe contestar
 *    {"ok":false,"codigo":"SIN_TOKEN",...}. Si contesta otra cosa —o pide
 *    iniciar sesión— el paso 4 quedó mal.
 *
 * ⚠️ CADA VEZ que se edite este archivo hay que hacer "Implementar → Administrar
 * implementaciones → editar → Nueva versión". Guardar NO actualiza la URL viva:
 * es la trampa clásica de Apps Script, y se ve como "mi cambio no hizo nada".
 */

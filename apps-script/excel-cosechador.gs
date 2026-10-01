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

// [CAREO-ZONA-1] ¿Este fondo es ROJO? Umbral declarado, pendiente de medición
// contra la pestaña de Karol 7-nov. Acepta '#rrggbb' y '#rgb'; cualquier otra
// cosa (incluido 'white', que es lo que Sheets devuelve para el default) es NO.
function _esRojo(hex) {
  var h = String(hex || '').trim().toLowerCase();
  if (h.charAt(0) !== '#') return false;            // 'white' y los nombrados: no
  if (h.length === 4) h = '#' + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2) + h.charAt(3) + h.charAt(3);
  if (h.length !== 7) return false;
  var r = parseInt(h.substr(1, 2), 16) / 255;
  var g = parseInt(h.substr(3, 2), 16) / 255;
  var b = parseInt(h.substr(5, 2), 16) / 255;
  if (isNaN(r) || isNaN(g) || isNaN(b)) return false;
  return r >= 0.45 && g <= 0.70 && b <= 0.70 && (r - g) >= 0.20 && (r - b) >= 0.20;
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
    // ── [CAREO-ZONA-1] EL COLOR DE FONDO, PARA LAS CANCELACIONES ────────────
    // Regla firmada de Memo (30-sep-2026): «todo lo marcado en rojo en el Excel
    // son cancelaciones.» El cosechador NO interpretaba colores, así que esa
    // regla era invisible para el sistema.
    //
    // 🔒 ESTE SCRIPT NO DECIDE QUIÉN ESTÁ CANCELADO: devuelve el HECHO (qué
    // celdas son rojas y cuántas) y el careo decide. Un script que interpreta
    // es un script que hay que depurar a ciegas desde otro lado — la misma
    // razón por la que las celdas van como texto mostrado y no parseadas.
    //
    // ⚠️ EL UMBRAL ESTÁ DECLARADO AQUÍ Y **ESPERA MEDICIÓN** contra las filas
    // rojas REALES de la pestaña de Karol 7-nov (el fixture vivo que nombra el
    // encargo). Se eligió conservador: rojo dominante y con saturación, para no
    // marcar un rosa pálido de formato ni el blanco por defecto.
    //   r >= 0.45  ·  g <= 0.70  ·  b <= 0.70  ·  r−g >= 0.20  ·  r−b >= 0.20
    // 🔴 EL TECHO DE `g`/`b` NO SOBRA, y lo cacé al probarlo: sin él, el
    // **#f4cccc** de la paleta de Sheets («rojo claro 3», un rosa pálido de
    // formato) pasaba el filtro — r−g da 0.157, suficiente para un umbral que
    // solo mirara dominancia. Lo que distingue un rosa de un rojo es que su
    // verde y su azul están ALTOS, cerca del blanco.
    // Con estos números, la paleta de Sheets cae así:
    //   SÍ  #ff0000 (rojo) · #cc0000 (rojo oscuro 1) · #e06666 (rojo claro 1)
    //       · #ea9999 (rojo claro 2)
    //   NO  #f4cccc (rojo claro 3, el rosa de formato) · #ffcccc · #ffffff
    //       · #cccccc · 'white' (el default, que Sheets devuelve por nombre)
    // 🔒 Y SE DEVUELVE LA CUENTA DE CELDAS ROJAS POR FILA, no solo un booleano:
    // así el umbral se puede corregir con datos en vez de con opiniones, y se
    // ve si el humano pinta la fila entera o solo una celda.
    var fondos = [];
    try { fondos = rango ? rango.getBackgrounds() : []; } catch (e0) { fondos = []; }
    var rojas = filas.map(function (f, i) {
      var fila = fondos[i] || [];
      var n = 0;
      for (var c = 0; c < fila.length; c++) if (_esRojo(fila[c])) n++;
      return n;
    });
    return _responder({
      ok: true, pestana: nombre, filas: filas, n_filas: filas.length,
      // `rojas[i]` = cuántas celdas rojas tiene la fila i. El careo decide con
      // esto; si `getBackgrounds` falla, viaja un arreglo VACÍO y el careo lo
      // lee como «no sé», no como «ninguna roja».
      rojas: rojas, colores_leidos: fondos.length > 0,
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

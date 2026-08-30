// =============================================================================
// _lib/excel-careo.js — el protocolo del careo Excel↔KameHouse (EXCEL-BOTÓN-1b)
// =============================================================================
// Todo lo que sabe interpretar una pestaña vive AQUÍ, en funciones puras, para
// que un arnés pueda carearlo contra filas reales. Ni el Apps Script ni la
// pantalla interpretan nada: uno trae la rejilla, la otra pinta el resultado.
//
// EL PROTOCOLO NO ES MÍO. Sale de los tres careos que Jane corrió a mano contra
// el Excel de verdad, y se hereda tal cual — inventarle mejoras a un protocolo
// probado contra 2,223 viajeros es cambiar lo que funciona por lo que me parece.
// =============================================================================

// ── nombres ─────────────────────────────────────────────────────────────────
// minúsculas · sin acentos · espacios colapsados. Es la llave del careo: dos
// filas con el mismo nombre normalizado son LA MISMA PERSONA.
function normalizarNombre(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // los acentos, por su rango: escribirlos literales los deja a merced del editor
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// La chatarra: filas que no son viajeros sino reventa o control interno. Se
// mira sobre el nombre YA normalizado, porque en el Excel viene de todas las
// formas («Vendido Memo», «VENDIDO», «Coordi Sofía»).
const CHATARRA = ['vendido', 'coordinador', 'coordi', 'hubb', 'viagogo'];
function esChatarra(nombre) {
  const n = normalizarNombre(nombre);
  if (!n) return true;                       // una fila sin nombre no es nadie
  return CHATARRA.some((p) => n.includes(p));
}

// ── dinero ──────────────────────────────────────────────────────────────────
// El Apps Script manda lo que el humano VE: «$1,243.00», «1243», «$ 1,000», ''.
// Todo lo que no sea un número se lee como cero, nunca como NaN: un NaN se
// propaga a la suma y convierte un abonado real en «no es un número».
function leerDinero(celda) {
  const s = String(celda == null ? '' : celda).replace(/[^0-9.\-]/g, '');
  if (!s || s === '-' || s === '.') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// ── el mapa de columnas ─────────────────────────────────────────────────────
// ⚠️ EL SEPARO NO TIENE ENCABEZADO. Va en la columna vacía JUSTO DESPUÉS de
// «Boleto», y ése fue el hoyo que hizo que un careo entero «encontrara» restas
// parejas que no existían (29-ago). Se busca por POSICIÓN, no por nombre,
// porque nombre no tiene.
//
// Los pagos se encabezan «1», «2», … «10». Y algunas pestañas traen además
// «Separo» o «Preventa» CON nombre — en Pa'l Norte la preventa hace de separo.
// Se suman todas las que se encuentren, y el mapa viaja en la respuesta: si una
// pestaña tiene el mapa raro, se ve, en vez de dar un número mal en silencio.
function mapearColumnas(filaEncabezado) {
  const celdas = (filaEncabezado || []).map((x) => String(x == null ? '' : x).trim());
  const norm = celdas.map((x) => normalizarNombre(x));
  const idx = (nombre) => norm.indexOf(normalizarNombre(nombre));

  const nombre = idx('Nombre');
  const boleto = idx('Boleto');
  const mapa = {
    nombre,
    paquete: idx('Paquete'),
    boleto,
    // la vacía justo después de Boleto
    separoSinNombre: (boleto >= 0 && celdas[boleto + 1] === '') ? boleto + 1 : -1,
    separoNombrado: idx('Separo'),
    preventa: idx('Preventa'),
    talla: idx('Talla'),
    correo: idx('Correo'),
    celular: idx('Celular'),
    codigo: idx('Codigo'),
    pagos: [],
  };
  for (let i = 0; i < celdas.length; i++) {
    if (/^([1-9]|10)$/.test(celdas[i])) mapa.pagos.push(i);
  }
  // Las columnas de dinero, en un solo lugar para que la suma y el reporte
  // hablen de lo mismo.
  mapa.dinero = [mapa.separoSinNombre, mapa.separoNombrado, mapa.preventa, ...mapa.pagos]
    .filter((i) => i >= 0);
  return mapa;
}

// ── la pestaña, leída ───────────────────────────────────────────────────────
// filas crudas + dónde está el encabezado → una persona por nombre, con su
// dinero SUMADO. Dos filas del mismo nombre son la misma persona comprando dos
// boletos: se suman, no se pisan ni se duplican.
//
// `reglaZona`: cuando una pestaña se reparte entre varios eventos (Corona
// Capital), solo entran las filas cuya zona sea EXACTAMENTE ese texto. Exacto y
// no «contiene», porque «General» se tragaría a «General Viernes» y los tres
// eventos acabarían con las mismas personas.
function parsearPestana(filas, encabezado, reglaZona) {
  const cabecera = (filas || [])[encabezado ? encabezado.fila : 0] || [];
  const mapa = mapearColumnas(cabecera);
  const out = new Map();
  const descartes = { chatarra: 0, sinNombre: 0, otraZona: 0 };
  const desde = (encabezado ? encabezado.fila : 0) + 1;

  for (let i = desde; i < (filas || []).length; i++) {
    const f = filas[i] || [];
    const nombreCrudo = mapa.nombre >= 0 ? String(f[mapa.nombre] == null ? '' : f[mapa.nombre]).trim() : '';
    if (!nombreCrudo) { descartes.sinNombre++; continue; }
    if (esChatarra(nombreCrudo)) { descartes.chatarra++; continue; }

    const zona = mapa.boleto >= 0 ? String(f[mapa.boleto] == null ? '' : f[mapa.boleto]).trim() : '';
    if (reglaZona && normalizarNombre(zona) !== normalizarNombre(reglaZona)) { descartes.otraZona++; continue; }

    const abonado = mapa.dinero.reduce((a, c) => a + leerDinero(f[c]), 0);
    const clave = normalizarNombre(nombreCrudo);
    const ya = out.get(clave);
    if (ya) {
      // MISMA PERSONA, otra compra: se suma el dinero y se cuentan las filas.
      ya.abonado += abonado;
      ya.filas += 1;
      if (!ya.zona && zona) ya.zona = zona;
    } else {
      out.set(clave, {
        nombre: nombreCrudo, clave, abonado, filas: 1, zona,
        paquete: mapa.paquete >= 0 ? String(f[mapa.paquete] == null ? '' : f[mapa.paquete]).trim() : '',
      });
    }
  }
  return { personas: [...out.values()], mapa, descartes };
}

// ── el careo ────────────────────────────────────────────────────────────────
// Cuatro montones, por nombre normalizado. `base` son los viajeros del sistema,
// ya con su abonado sumado.
//
// La tolerancia es de UN PESO, la misma que usa la reconciliación del dinero en
// el Portal: un centavo de redondeo no es una diferencia de pagos.
const TOLERANCIA_MXN = 1;

function carear(personasExcel, viajerosBase) {
  const enBase = new Map((viajerosBase || []).map((v) => [normalizarNombre(v.nombre), v]));
  const enExcel = new Map((personasExcel || []).map((p) => [p.clave, p]));

  const nuevos = [], pagos = [], iguales = [];
  for (const p of enExcel.values()) {
    const v = enBase.get(p.clave);
    if (!v) { nuevos.push({ nombre: p.nombre, abonado: p.abonado, zona: p.zona, paquete: p.paquete, filas: p.filas }); continue; }
    const dif = Math.round((p.abonado - Number(v.abonado || 0)) * 100) / 100;
    if (Math.abs(dif) > TOLERANCIA_MXN) {
      pagos.push({ nombre: p.nombre, viajero_id: v.id, excel: p.abonado, base: Number(v.abonado || 0), diferencia: dif });
    } else {
      iguales.push({ nombre: p.nombre, viajero_id: v.id, abonado: p.abonado });
    }
  }
  // BAJA: está en el sistema y ya no en el Excel. NO SE BORRA NADA — se nombra
  // y espera firma. Marcar es otra tuerca, y tiene que serlo.
  const bajas = [];
  for (const v of enBase.values()) {
    if (!enExcel.has(normalizarNombre(v.nombre))) {
      bajas.push({ nombre: v.nombre, viajero_id: v.id, abonado: Number(v.abonado || 0) });
    }
  }
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
  return { nuevos: nuevos.sort(porNombre), pagos: pagos.sort(porNombre),
           bajas: bajas.sort(porNombre), iguales: iguales.sort(porNombre) };
}

module.exports = { normalizarNombre, esChatarra, leerDinero, mapearColumnas,
                   parsearPestana, carear, CHATARRA, TOLERANCIA_MXN };

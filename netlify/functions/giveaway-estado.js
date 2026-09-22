// giveaway-estado.js — el estado del sorteo, PÚBLICO y de solo lectura.
//
// La pantalla del sorteo dejó de ser privada: cualquiera entra y ve lo que
// está pasando. Esta function es lo único que necesita para eso.
//
// 🔒 LO QUE NUNCA SALE DE AQUÍ: teléfonos y correos. La respuesta se sirve a
// cualquiera que pida la URL, así que el `select` es una whitelist explícita y
// `ganador_whatsapp` NO está en ella. El teléfono del ganador viaja SOLO por
// giveaway-sortear, que sí exige token.

const G = require('./_lib/giveaway');
// [SORTEO-RONDAS-1] `partirNombre` y el FOLIO se mudaron a _lib/sorteo-escalera:
// aquí eran locales y ningún arnés podía medir las cuatro formas duras que el
// padrón real delató, ni carear el folio contra el que guarda la escalera.
const ESC = require('./_lib/sorteo-escalera');

// 🔒 EL REQUIRE QUE PUEDE FALLAR, Y FALLA RUIDOSO. Mismo caso que en
// giveaway-sortear: `sorteo-tiempos.js` vive en la RAÍZ y ninguna function de
// este repo requería nada de fuera de su carpeta, así que el empaquetado va
// declarado con `included_files` en netlify.toml. Si aun así no llega, esta
// function contesta 500 NOMBRANDO el archivo — jamás un respaldo silencioso a
// números tecleados, que es cómo dos runtimes se separan sin que nadie lo note.
let TI = null, ERR_TIEMPOS = null;
try { TI = require('../../sorteo-tiempos.js'); }
catch (e) { ERR_TIEMPOS = (e && e.message) || String(e); }

// Columnas que SÍ pueden viajar a cualquiera. Whitelist, no lista negra: si
// mañana alguien agrega una columna sensible a la tabla, esto no la filtra
// porque no la nombra.
// `registro_id` se SELECCIONA pero NO se devuelve: sirve solo para calcular el
// folio del ganador aquí adentro. La proyección de abajo lo deja fuera.
// 🔴 `rondas` ENTRA AL SELECT PERO NUNCA SALE EN CRUDO. Su arreglo `orden` está
// en orden de REVOLTURA, o sea que su primer elemento ES EL GANADOR: publicarlo
// tal cual sería publicar la respuesta. Lo que viaja es la PROYECCIÓN
// (`ESC.proyectarRondas`), que re-ordena por folio y recorta por tiempo.
//
// 🔒 `ganador_whatsapp` y `descarte_motivo` NO están aquí, y eso es la mitad
// del candado: whitelist, no lista negra — si mañana alguien agrega una columna
// sensible a la tabla, esto no la filtra porque no la nombra.
const COLS_PUBLICAS = 'id,intento,resultado,ganador_nombre,total_participantes,creado_at,'
  + 'registro_id,rondas,escalon,origen_sorteo_id';

// ── Los rodillos de la tragamonedas ────────────────────────────────────────
// La pantalla necesita nombres y apellidos REALES para que los rodillos giren
// con gente de verdad. Pero el padrón NO se publica: se devuelven las dos
// listas POR SEPARADO y cada una ORDENADA ALFABÉTICAMENTE, lo que rompe la
// correspondencia entre nombre y apellido.
//
// O sea: se ve que "Ana" y "Martínez" están inscritos, pero no que Ana
// Martínez exista. El único nombre completo que sale es el del ganador, que ya
// era público (`ganador_nombre`).
//
// El orden alfabético hace el trabajo de un shuffle SIN aleatoriedad: nada de
// Math.random en este archivo, para que el candado de "el navegador no escoge"
// siga siendo trivial de auditar.
// PARTIR EL NOMBRE: vive en `_lib/sorteo-escalera`, con las cuatro formas duras
// que el padrón real delató documentadas allá y CAREADAS allá. No se repiten
// aquí: dos copias de la misma explicación son dos copias que pueden divergir,
// y la que se queda vieja es la que nadie corre.
//
// 🔒 Lo que sí es de aquí: el servidor y la PÁGINA parten igual. `sorteo.html`
// tiene su gemelo `partir()` para los rodillos, y si difieren el rodillo del
// apellido gira con valores que nunca contienen al ganador. Eso lo carea
// `npm run mide:giveaway-karolg`.
const partirNombre = ESC.partirNombre;

exports.handler = async (event) => {
  const origin = G.corsCheck(event);
  const headers = G.cabeceras(origin, 'GET, OPTIONS');

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return G.json(405, headers, { ok: false, error: 'Método no permitido' });
  if (origin === null) return G.json(403, headers, { ok: false, error: 'Origen no permitido' });

  const falta = G.faltaEnv();
  if (falta) return G.json(500, headers, { ok: false, error: falta });

  // ── ?rodillos=1 ────────────────────────────────────────────────────────
  // La lista de nombres NO viaja en cada consulta. La página pregunta cada 4
  // segundos para ver si ya hubo giro; mandarle los 72 nombres cada vez
  // significa leer las 72 filas de la base 900 veces por hora POR VISITANTE, y
  // justo en el momento en que más gente está mirando. Los nombres se piden
  // aparte: una vez al cargar y, cuando mucho, una vez por minuto.
  const q = (event && event.queryStringParameters) || {};
  const quiereRodillos = String(q.rodillos || '') === '1';

  if (!TI) return G.json(500, headers, { ok: false,
    error: 'No se pudo cargar sorteo-tiempos.js (revisa included_files en netlify.toml): ' + ERR_TIEMPOS });

  // 🔒 DOS VALORES, NUNCA UN SLUG DE LA QUERY (ver `slugDe` en el lib).
  const slug = G.slugDe(q.modo);
  if (slug === null) return G.json(400, headers, { ok: false, error: "modo debe ser 'real' o 'ensayo'" });
  // 🔒 EL ENSAYO NO SALE POR LA PUERTA PÚBLICA. Ésta es la única function del
  // módulo SIN token: el ensayo se ve solo con él.
  if (slug === G.SLUG_ENSAYO && !G.tokenAdminValido(event)) {
    return G.json(401, headers, { ok: false, error: 'El ensayo requiere token' });
  }
  const slugQ = encodeURIComponent(slug);

  // Las fotos NO viajan en cada latido: 24 firmas por visitante cada 4 segundos
  // serían 24 viajes a Storage 900 veces por hora POR VISITANTE, justo cuando
  // más gente está mirando. Se piden aparte, como los rodillos.
  const quiereFotos = String(q.fotos || '') === '1';
  let registros = [], sorteos = [];
  try {
    const [rr, rs] = await Promise.all([
      // `nombre` entra al select SOLO cuando se piden los rodillos. Ni
      // `whatsapp` ni `correo` se nombran: la whitelist sigue siendo explícita.
      // El orden de registro define el FOLIO (el 1º en inscribirse es el #1),
      // y se necesita el orden aunque no se pidan nombres para poder ubicar al
      // ganador.
      // [SORTEO-CIUDAD-1] `ciudad` entra a la whitelist: va en cada ficha del
      // mosaico («Karla M. · Guadalajara») y de ella se DERIVA el premio del
      // ganador. Es público por decisión de Memo. `whatsapp`, `correo` e
      // `instagram` siguen fuera.
      fetch(`${G.SB_URL}/rest/v1/giveaway_registros?slug=eq.${slugQ}`
        + `&select=id,ciudad${quiereRodillos ? ',nombre' : ''}&order=creado_at.asc`,
        { headers: G.sbHeaders() }),
      fetch(`${G.SB_URL}/rest/v1/giveaway_sorteos?slug=eq.${slugQ}&select=${COLS_PUBLICAS}&order=intento.asc`,
        { headers: G.sbHeaders() }),
    ]);
    if (rr.ok) registros = await rr.json().catch(() => []);
    if (rs.ok) sorteos = await rs.json().catch(() => []);
  } catch (e) {
    console.error('[giveaway-estado]', e.message);
    return G.json(502, headers, { ok: false, error: 'No se pudo leer el estado' });
  }

  // El folio es la POSICIÓN en el orden de registro: el primero en inscribirse
  // es el #1. Se calcula aquí y se sirve ya resuelto; el id del registro nunca
  // sale.
  const filas = Array.isArray(registros) ? registros : [];
  // [SORTEO-RONDAS-1] La MISMA definición que usa `girar` para guardar el folio
  // en la escalera. Contados distinto, el número del mosaico y el del tercer
  // rodillo dirían cosas diferentes en cámara.
  const folioPorId = ESC.folios(filas);
  const ciudadPorId = {};
  filas.forEach((r) => { if (r && r.id) ciudadPorId[String(r.id)] = r.ciudad || null; });

  // ── Las fotos de los finalistas, firmadas y EN LOTE ─────────────────────
  // 🔒 SOLO de los miembros de las rondas YA LIBERADAS, solo si se piden, y
  // solo si hay giro. Antes del giro esta function no firma NADA.
  // 🔒 Y solo de quien tiene `foto_estado='aprobada'`, leído VIVO y EN LA
  // CONSULTA: si Memo invalida una foto a media transmisión, deja de salir. La
  // regla de privacidad tiene que poder APRETARSE, nunca aflojarse.
  async function firmarDe(ids) {
    const url = {};
    if (!quiereFotos || !ids.length) return url;
    let regs = [];
    try {
      const rf = await fetch(`${G.SB_URL}/rest/v1/giveaway_registros?slug=eq.${slugQ}`
        + `&foto_estado=eq.aprobada&id=in.(${ids.map(encodeURIComponent).join(',')})`
        + `&select=id,foto_path`, { headers: G.sbHeaders() });
      regs = rf.ok ? (await rf.json().catch(() => [])) : [];
    } catch (e) { return url; }
    const conRuta = (Array.isArray(regs) ? regs : []).filter(r => r && r.foto_path);
    if (!conRuta.length) return url;
    try {
      // Firma en LOTE: 24 firmas sueltas serían 24 viajes dentro de una sola
      // invocación. Si el endpoint plural no existiera, el catch deja las
      // tarjetas con INICIALES — que es degradar, no romper.
      const rs = await fetch(`${G.SB_URL}/storage/v1/object/sign/giveaway-fotos`, {
        method: 'POST', headers: G.sbHeaders(),
        body: JSON.stringify({ expiresIn: 1800, paths: conRuta.map(r => r.foto_path) }),
      });
      const firmas = rs.ok ? (await rs.json().catch(() => [])) : [];
      const porRuta = {};
      (Array.isArray(firmas) ? firmas : []).forEach(f => {
        if (f && f.path && f.signedURL) porRuta[f.path] = `${G.SB_URL}/storage/v1${f.signedURL}`;
      });
      conRuta.forEach(r => { if (porRuta[r.foto_path]) url[String(r.id)] = porRuta[r.foto_path]; });
    } catch (e) { /* iniciales: degradar, no romper */ }
    return url;
  }

  // ── El giro vivo, proyectado y GATEADO ──────────────────────────────────
  const crudos = Array.isArray(sorteos) ? sorteos : [];
  // El último giro es el de intento más alto, no "el último de la lista": el
  // orden lo pone la base y prefiero no depender de él para algo que se ve en
  // cámara.
  const ultimoCrudo = crudos.length
    ? crudos.reduce((a, b) => (Number(b.intento) > Number(a.intento) ? b : a)) : null;

  // La escalera puede vivir en el giro ORIGINAL: un re-giro la HEREDA.
  const conEsc = crudos.filter(s => s && s.rondas)
    .sort((a, b) => Number(b.intento) - Number(a.intento))[0] || null;
  const escalones = (conEsc && conEsc.rondas && Array.isArray(conEsc.rondas.escalones))
    ? conEsc.rondas.escalones : [];
  const momentos = TI.momentos(escalones);

  let proy = null;
  if (ultimoCrudo && conEsc) {
    const transcurrido = Date.now() - Date.parse(ultimoCrudo.creado_at || 0);
    // Qué ids están ya liberados: de ahí sale UN solo lote de firmas.
    const idsLiberados = [];
    escalones.forEach((tam, k) => {
      if (transcurrido >= Math.max(0, momentos[k] - TI.T.MARGEN_ADELANTO_MS)) {
        conEsc.rondas.orden.slice(0, tam).forEach(r => {
          if (r && idsLiberados.indexOf(String(r.id)) === -1) idsLiberados.push(String(r.id));
        });
      }
    });
    const fotoUrl = await firmarDe(idsLiberados);
    proy = ESC.proyectarRondas({
      rondas: conEsc.rondas, momentos, margenMs: TI.T.MARGEN_ADELANTO_MS,
      transcurridoMs: transcurrido, fotoDeId: (id) => fotoUrl[String(id)] || null,
      // 🔴 El momento propio del final: de los 3 se apaga UNO y quedan 2. Sale
      // del MISMO archivo que la pantalla, así que no hay un segundo calendario
      // que se pueda desincronizar.
      momentoDosMs: TI.momentoDosMs(escalones),
      ciudadDeId: (id) => ciudadPorId[String(id)] || null,
    });
    // Sin ?fotos=1 la clave se OMITE (no se pone en null): así la página
    // distingue «no me lo dijeron» de «no tiene foto aprobada», y conserva la
    // que ya tenía en vez de dejar tarjetas rotas.
    if (!quiereFotos) proy.rondas.forEach(r => r.miembros.forEach(m => { delete m.foto; }));
  }

  // 🔒 UN GIRO SIN ESCALERA (los dos de Natanael, anteriores a esta tuerca) NO
  // se rompe: no publica rondas y su ganador se revela de inmediato, que es el
  // camino de siempre.
  const revelado = conEsc ? !!(proy && proy.ganador_liberado) : true;

  const pub = (s) => {
    // 🔒 SOLO EL GIRO VIVO SE GATEA. Los anteriores ya se revelaron en cámara,
    // y esconderlos rompería el historial sin proteger nada.
    const ver = (ultimoCrudo && String(s.id) === String(ultimoCrudo.id)) ? revelado : true;
    return {
      id: s.id,
      intento: s.intento,
      // Los dos descartes se ven IGUAL en público; el motivo verdadero viaja
      // solo por `estado_admin`, que exige token.
      resultado: ESC.resultadoPublico(s.resultado, ver),
      nombre: ver ? s.ganador_nombre : null,
      // El folio del ganador, para que el tercer rodillo frene en un número de
      // verdad y no en uno decorativo.
      folio: ver ? (folioPorId[String(s.registro_id)] || null) : null,
      // 🔒 EL PREMIO SE DERIVA DE `_lib`, no se teclea: es `premioPorCiudad` +
      // `PREMIOS`, las MISMAS que usa `estado_admin` y las que cobran en el
      // correo. Y viaja GATEADO como el nombre — antes de la revelación el
      // premio diría de qué ciudad es quien va ganando.
      premio: ver ? (G.PREMIOS[G.premioPorCiudad(ciudadPorId[String(s.registro_id)])] || null) : null,
      // La ciudad del ganador va en la placa, debajo del nombre. Gateada por la
      // misma razón que el premio: antes de la revelación diría de dónde es.
      ciudad: ver ? (ciudadPorId[String(s.registro_id)] || null) : null,
      total_participantes: s.total_participantes,
      creado_at: s.creado_at,
    };
  };

  const giros = crudos.map(pub);

  // Las dos listas de los rodillos, cada una ordenada por su cuenta: quien lea
  // la respuesta ve los nombres y los apellidos inscritos, pero no puede
  // reconstruir quién es quién.
  const partidos = quiereRodillos
    ? filas.map(r => partirNombre(r && r.nombre)).filter(Boolean) : [];
  const nombresRodillo   = [...new Set(partidos.map(p => p.nombre).filter(Boolean))].sort();
  const apellidosRodillo = [...new Set(partidos.map(p => p.apellido).filter(Boolean))].sort();

  const ultimo = ultimoCrudo ? Object.assign(pub(ultimoCrudo), {
    // Para el renglón «24 de N»: los dos números DERIVADOS, nunca tecleados.
    de_cuantos: ultimoCrudo.total_participantes,
    escalones,
    escalon: ultimoCrudo.escalon != null ? ultimoCrudo.escalon : null,
    es_regiro: !!ultimoCrudo.origen_sorteo_id,
    rondas: (proy && proy.rondas) || [],
    // Los DOS folios que llegan a la cuenta final. `null` hasta su momento:
    // saber quiénes son los dos es saber quién NO ganó.
    dos: (proy && proy.dos) || null,
    momento_dos_en_ms: TI.momentoDosMs(escalones),
    momento_finalistas_en_ms: TI.momentoFinalistasMs(escalones),
    rondas_totales: (proy && proy.rondas_totales) || 0,
    // Para que la página programe un latido DIRIGIDO justo después de que se
    // libere la ronda que sigue, en vez de martillar cada segundo.
    siguiente_ronda_en_ms: (proy && proy.siguiente_ronda_en_ms) != null
      ? proy.siguiente_ronda_en_ms : null,
    // 🔒 EL RELOJ DE 10 MINUTOS ARRANCA AQUÍ, no en `creado_at`. Si arrancara
    // en creado_at, el show se comería 2:12 de los diez minutos y Memo tendría
    // 7:43 reales para contactar al ganador. Viene del SERVIDOR para que el
    // gateo y el reloj salgan del MISMO número.
    revelacion_en_ms: momentos.length ? momentos[momentos.length - 1] : 0,
  }) : null;

  return G.json(200, headers, {
    ok: true,
    total: filas.length,
    // Para los rodillos. Listas SEPARADAS y ordenadas: nunca el padrón.
    // Solo cuando se piden con ?rodillos=1.
    rodillos: quiereRodillos
      ? { nombres: nombresRodillo, apellidos: apellidosRodillo, folios: filas.length }
      : undefined,
    // `ahora` viaja para que la página no dependa del reloj del visitante:
    // el contador de 10 minutos y el rótulo de "repetición" se calculan contra
    // ESTE instante, no contra el del celular de quien mira.
    ahora: new Date().toISOString(),
    registro_cerrado: G.registroCerrado(),
    sorteo: G.SORTEO,
    ultimo,
    giros,
    // Qué sorteo se está sirviendo. La página enseña la banda de ENSAYO con
    // esto, y no con lo que ella misma crea que pidió.
    modo: slug === G.SLUG_ENSAYO ? 'ensayo' : 'real',
  });
};

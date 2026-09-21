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

const G = require('./_lib/giveaway');
const ESC = require('./_lib/sorteo-escalera');

// 🔒 EL REQUIRE QUE PUEDE FALLAR, Y FALLA RUIDOSO.
//
// `sorteo-tiempos.js` vive en la RAÍZ (es el publish dir de Netlify) y NINGUNA
// function de este repo requería nada de fuera de su carpeta, así que el
// empaquetado no estaba medido. Va declarado con `included_files` en
// netlify.toml, pero si aun así no llega, esta function contesta 500 NOMBRANDO
// el archivo.
//
// ⚠️ JAMÁS un respaldo silencioso a números tecleados. Un respaldo así es
// exactamente cómo dos runtimes se separan sin que nadie lo note: las cuatro
// constantes de fecha de este mismo módulo se quedaron en el 13-sep de
// Natanael mientras el lib decía 1-oct, y el formulario salía OCULTO el día
// que abría.
let TI = null, ERR_TIEMPOS = null;
try { TI = require('../../sorteo-tiempos.js'); }
catch (e) { ERR_TIEMPOS = (e && e.message) || String(e); }

// El azar y la escalera viven en `_lib/sorteo-escalera`. `alAzar` estaba AQUÍ
// como función local y ningún arnés podía tocarlo; mudarlo no cambió una línea
// de su implementación.

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
  // 🔒 Sin los tiempos NO se gira: el gateo por tiempo de la puerta pública
  // sale de aquí, y girar sin ellos dejaría una escalera que nadie sabe cuándo
  // revelar.
  if (!TI) return G.json(500, headers, { ok: false,
    error: 'No se pudo cargar sorteo-tiempos.js (revisa included_files en netlify.toml): ' + ERR_TIEMPOS });

  // 🔒 DOS VALORES, NUNCA UN SLUG DEL CUERPO (ver `slugDe` en el lib).
  const slug = G.slugDe(body.modo);
  if (slug === null) return G.json(400, headers, { ok: false, error: "modo debe ser 'real' o 'ensayo'" });
  const slugQ = encodeURIComponent(slug);
  const esEnsayo = slug === G.SLUG_ENSAYO;

  // ═══════════════════════════════════════════════════════════════════════
  // [SORTEO-RONDAS-1] EL MODO ENSAYO — y su blindaje EN LOS DOS SENTIDOS
  // ═══════════════════════════════════════════════════════════════════════
  // 🔒 LA MITAD DEL BLINDAJE YA EXISTÍA Y NO LO SABÍAMOS: las SEIS functions
  // del módulo filtran duro por slug, así que giveaway-registro,
  // giveaway-recordatorio, giveaway-consuelo y giveaway-foto NO PUEDEN VER una
  // fila de ensayo. Un slug de ensayo es ESTRUCTURALMENTE INCAPAZ de mandar un
  // correo. Eso no lo agrega esta tuerca; el careo lo AFIRMA, porque un candado
  // que nadie carea es una nota.
  //
  // 🔒 LO QUE SÍ SE AGREGA: que estas tres acciones —que BORRAN y SIEMBRAN— no
  // alcancen el slug real. Y no «validan»: se REHÚSAN. El slug real no es un
  // caso a manejar aquí, es un caso a rechazar.
  const ACCIONES_ENSAYO = ['ensayo_sembrar', 'ensayo_reiniciar', 'ensayo_borrar'];
  if (ACCIONES_ENSAYO.includes(body.accion)) {
    if (slug !== G.SLUG_ENSAYO) {
      return G.json(403, headers, { ok: false,
        error: 'Esta acción es SOLO del modo ensayo: manda modo:"ensayo".' });
    }

    // ── SEMBRAR: 24 participantes ficticios y 24 avatares generados ────────
    if (body.accion === 'ensayo_sembrar') {
      // Idempotente: si ya están los 24, no siembra otra vez.
      const ry = await fetch(`${regBase}?slug=eq.${slugQ}&select=id`, { headers: G.sbHeaders() });
      const ya = ry.ok ? (await ry.json().catch(() => [])) : [];
      if (Array.isArray(ya) && ya.length >= 24) {
        return G.json(200, headers, { ok: true, ensayo: true, sembrados: 0, ya: ya.length,
          nota: 'El ensayo ya tenía 24 o más; usa ensayo_reiniciar para volver a girar.' });
      }

      // 🔒 NOMBRES INVENTADOS, JAMÁS DE GENTE REAL. Y con las cuatro FORMAS
      // duras dentro (dos palabras, partículas, nombre compuesto), para que el
      // ensayo ejercite el partir de nombres y no solo el camino fácil.
      const NOMBRES = [
        'Ana Ruiz', 'José Del Valle Ramos', 'Luz María Sandoval Peña',
        'Beto Cárdenas', 'María de los Angeles Fuentes Ortiz', 'Sofi Lara',
        'Carlos Enrique Villalobos de la Garza', 'Nayeli Ocampo', 'Tavo Meza',
        'Rosa Isela Contreras Duarte', 'Iván Barrón', 'Paty Guzmán Ríos',
        'Memo Salinas', 'Dulce Nayeli Zapata', 'Rafa del Bosque', 'Karina Solís Vega',
        'Chuy Maldonado', 'Fer Escamilla Ruvalcaba', 'Brenda Yáñez', 'Toño Cepeda',
        'Mayra Alejandra Robles', 'Pepe Quintanilla', 'Cinthia de León Marroquín', 'Lalo Tamez',
      ];
      // Ciudades MEZCLADAS: ejercita las DOS ramas del premio (PLUS/CHEAP).
      const CIUDADES = ['Reynosa', 'Reynosa, Tamps.', 'Río Bravo', 'Monterrey', 'McAllen'];

      // Los avatares: iniciales sobre color, generados aquí. 🔒 Nunca una foto
      // de una persona real, ni siquiera de otro slug.
      const COLORES = ['#2b3a1f', '#3a1f2b', '#1f2b3a', '#3a321f', '#2b1f3a', '#1f3a32'];
      const filas = [];
      const subidas = [];
      for (let i = 0; i < 24; i++) {
        const nombre = NOMBRES[i];
        const p = ESC.partirNombre(nombre) || { nombre, apellido: '' };
        const ini = (p.nombre.charAt(0) + (p.apellido.charAt(0) || '')).toUpperCase();
        const col = COLORES[i % COLORES.length];
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480">'
          + '<rect width="480" height="480" fill="' + col + '"/>'
          + '<text x="240" y="300" font-family="Helvetica,Arial" font-size="210" font-weight="bold"'
          + ' fill="#e8ff4c" text-anchor="middle">' + ini + '</text></svg>';
        // 🔴 LA RUTA TIENE QUE PASAR EL REGEX DE `foto_url`:
        // ^[a-z0-9-]+\/[a-f0-9]{12}\/[A-Za-z0-9-]+\.(jpg|png)$ — por eso el
        // slug de ensayo va en minúsculas y el prefijo es de 12 hex. Si no
        // pasara, las fotos del ensayo saldrían EN BLANCO sin un mensaje.
        const pref = 'ee' + String(i).padStart(10, '0');
        const ruta = `${slug}/${pref}/avatar-${i}.png`;
        const r = await fetch(`${G.SB_URL}/storage/v1/object/giveaway-fotos/${encodeURI(ruta)}`, {
          method: 'POST',
          headers: Object.assign({}, G.sbHeaders(), { 'Content-Type': 'image/svg+xml' }),
          body: svg,
        });
        if (r.ok) subidas.push(ruta);
        filas.push({
          slug, nombre, ciudad: CIUDADES[i % CIUDADES.length],
          whatsapp: '8990000' + String(100 + i),
          correo: 'ensayo' + i + '@ensayo.invalid',
          instagram: 'ensayo_' + i,
          foto_path: r.ok ? ruta : null,
          // Mezclado a propósito: así el ensayo ejercita la tarjeta de
          // INICIALES y no solo la de foto.
          foto_estado: (i % 3 === 0) ? 'pendiente' : 'aprobada',
          ip: 'ensayo', user_agent: 'ensayo',
        });
      }
      // Insert directo, sin on_conflict.
      const ri = await fetch(regBase, {
        method: 'POST',
        headers: Object.assign({}, G.sbHeaders(), { Prefer: 'return=representation' }),
        body: JSON.stringify(filas),
      });
      if (!ri.ok) {
        const t = await ri.text().catch(() => '');
        return G.json(502, headers, { ok: false, error: 'No se pudo sembrar el ensayo: ' + t.slice(0, 200) });
      }
      return G.json(200, headers, { ok: true, ensayo: true, sembrados: filas.length,
        avatares: subidas.length });
    }

    // ── REINICIAR: se van los GIROS, se quedan los participantes ──────────
    // Es el botón que se va a picar veinte veces ensayando.
    if (body.accion === 'ensayo_reiniciar') {
      const r = await fetch(`${sorBase}?slug=eq.${slugQ}`,
        { method: 'DELETE', headers: Object.assign({}, G.sbHeaders(), { Prefer: 'return=representation' }) });
      if (!r.ok) return G.json(502, headers, { ok: false, error: 'No se pudo reiniciar el ensayo' });
      const fuera = await r.json().catch(() => []);
      return G.json(200, headers, { ok: true, ensayo: true,
        giros_borrados: Array.isArray(fuera) ? fuera.length : 0 });
    }

    // ── BORRAR: todo, incluidos los archivos del bucket ───────────────────
    if (body.accion === 'ensayo_borrar') {
      await fetch(`${sorBase}?slug=eq.${slugQ}`, { method: 'DELETE', headers: G.sbHeaders() });
      const rp = await fetch(`${regBase}?slug=eq.${slugQ}&select=foto_path`, { headers: G.sbHeaders() });
      const rutas = ((rp.ok ? await rp.json().catch(() => []) : []) || [])
        .map((x) => x && x.foto_path).filter(Boolean);
      await fetch(`${regBase}?slug=eq.${slugQ}`, { method: 'DELETE', headers: G.sbHeaders() });
      let borradas = 0;
      for (let i = 0; i < rutas.length; i += 50) {
        const lote = rutas.slice(i, i + 50);
        // 🔒 EL MISMO CINTURÓN QUE EL BARRIDO: ni un borrado fuera del prefijo.
        const intrusa = lote.find((x) => String(x).indexOf(slug + '/') !== 0);
        if (intrusa) {
          return G.json(409, headers, { ok: false,
            error: 'Una ruta quedó fuera de «' + slug + '/»: ' + intrusa + '. No se borró nada más.' });
        }
        const rd = await fetch(`${G.SB_URL}/storage/v1/object/giveaway-fotos`, {
          method: 'DELETE', headers: G.sbHeaders(), body: JSON.stringify({ prefixes: lote }),
        });
        if (rd.ok) borradas += lote.length;
      }
      return G.json(200, headers, { ok: true, ensayo: true, fotos_borradas: borradas });
    }
  }

  // ── GIRAR ────────────────────────────────────────────────────────────────
  if (body.accion === 'girar') {
    let todos = [], elegibles = [], sorteos = [];
    try {
      const [rt, re, rs] = await Promise.all([
        // (1) TODOS los del slug, SOLO ids: de aquí sale el FOLIO, que es la
        // posición en el orden de registro y CUENTA A LOS ELIMINADOS. Es el
        // mismo folio que publica `giveaway-estado` (misma función,
        // `ESC.folios`); contados distinto, el número del mosaico y el del
        // tercer rodillo dirían cosas diferentes EN CÁMARA.
        fetch(`${regBase}?slug=eq.${slugQ}&select=id&order=creado_at.asc`, { headers: G.sbHeaders() }),
        // (2) LOS ELEGIBLES.
        // [SORTEO-ADMIN-1] `eliminado_at=is.null` va EN LA CONSULTA, no en un
        // filtro de después: así un eliminado no puede entrar a la tómbola por
        // ningún camino, ni aunque alguien toque la lógica de abajo. El candado
        // más barato es el que no deja llegar el dato.
        // [GIVEAWAY-KG-1] Y `foto_estado=neq.invalidada`, por la MISMA razón.
        // ⚠️ `neq` y no `in.(pendiente,aprobada)`: con `neq` una fila cuyo
        // estado sea NULL —las ~600 de melanie y Natanael, nacidas antes de la
        // columna— quedaría FUERA sin que nadie lo decidiera, porque en
        // Postgres `NULL <> 'x'` es NULL y no pasa el filtro. Como esas filas
        // son de OTRO slug aquí no llegan nunca; pero se dice, porque el día
        // que alguien reuse esta consulta sin el `slug` va a morder.
        fetch(`${regBase}?slug=eq.${slugQ}&eliminado_at=is.null&foto_estado=neq.invalidada`
              + `&select=id,nombre,whatsapp&order=creado_at.asc`, { headers: G.sbHeaders() }),
        fetch(`${sorBase}?slug=eq.${slugQ}&select=id,registro_id,resultado,intento,rondas`,
              { headers: G.sbHeaders() }),
      ]);
      if (!rt.ok || !re.ok) throw new Error('registros ' + rt.status + '/' + re.status);
      todos = await rt.json().catch(() => []);
      elegibles = await re.json().catch(() => []);
      sorteos = rs.ok ? (await rs.json().catch(() => [])) : [];
    } catch (e) {
      console.error('[giveaway-sortear] lectura:', e.message);
      return G.json(502, headers, { ok: false, error: 'No se pudo leer el padrón' });
    }

    // ═══ 🔒 UN SORTEO CON GANADOR CONFIRMADO ESTÁ CERRADO ═══════════════════
    //
    // Orden de Memo (21-sep), y va más lejos de meter al ganador a `quemados`:
    // se REHÚSA por completo, cero filas nuevas.
    //
    // 🔴 Y ES UN DEFECTO DE LA VERSIÓN ANTERIOR, no una precaución: `quemados`
    // solo excluía 'no_contesto' y 'pendiente', así que un ganador que YA HABÍA
    // ACEPTADO seguía elegible, y volver a picarle a «Girar» abría un segundo
    // giro que podía sacar a la MISMA persona. Sin esto, «ganador confirmado de
    // forma permanente» no es permanente.
    if ((Array.isArray(sorteos) ? sorteos : []).some(s => s && s.resultado === 'acepto')) {
      return G.json(409, headers, { ok: false,
        error: 'Este sorteo ya tiene ganador confirmado: está cerrado.' });
    }

    const folioPorId = ESC.folios(todos);
    const conFolio = (Array.isArray(elegibles) ? elegibles : []).map(r => ({
      id: r.id, nombre: r.nombre, whatsapp: r.whatsapp, folio: folioPorId[String(r.id)] || null,
    }));
    const total = conFolio.length;
    if (!total) return G.json(409, headers, { ok: false, error: 'Todavía no hay participantes' });

    // ── QUEMADO = dos clases de id, y las DOS tienen que estar ──────────────
    //   (a) quien ya salió y no se resolvió a favor — incluido 'pendiente',
    //       porque hay un giro vivo sin resolver y volver a sacar a la misma
    //       persona mientras se le marca sería absurdo;
    //   (b) 🔒 quien DEJÓ DE SER ELEGIBLE (eliminado o foto invalidada) después
    //       del giro. Sin esto el pozo podría devolver a alguien que ya no
    //       concursa: el insert reventaría por `ganador_whatsapp` nulo — o
    //       peor, saldría EN CÁMARA alguien que el padrón ya dio de baja.
    const vivos = new Set(conFolio.map(r => String(r.id)));
    const quemados = new Set();
    (Array.isArray(sorteos) ? sorteos : []).forEach(s => {
      if (s && s.registro_id
          && (s.resultado === 'no_contesto' || s.resultado === 'no_cumple' || s.resultado === 'pendiente')) {
        quemados.add(String(s.registro_id));
      }
    });
    (Array.isArray(todos) ? todos : []).forEach(r => {
      if (r && r.id && !vivos.has(String(r.id))) quemados.add(String(r.id));
    });

    // 🔒 LA ESCALERA SE SORTEA UNA VEZ POR SLUG. Si ya hay un giro con
    // `rondas`, esto es un RE-GIRO que la HEREDA — nunca una escalera nueva,
    // que sería volver a sortear a media cadena y romper la promesa de que las
    // rondas son inmutables.
    const conEscalera = (Array.isArray(sorteos) ? sorteos : [])
      .filter(s => s && s.rondas)
      .sort((a, b) => Number(b.intento) - Number(a.intento))[0] || null;

    let nueva;
    if (!conEscalera) {
      const escalones = TI.escalonesPara(total);
      const rondas = ESC.construirEscalera(conFolio, escalones);
      if (!rondas) return G.json(409, headers, { ok: false, error: 'Todavía no hay participantes' });
      const g = conFolio.find(r => String(r.id) === String(rondas.orden[0].id));
      nueva = {
        slug, registro_id: g.id, ganador_nombre: g.nombre, ganador_whatsapp: g.whatsapp,
        intento: 1, resultado: 'pendiente', total_participantes: total,
        // 🔒 EN EL MISMO INSERT QUE CREA EL GIRO. Dos escrituras podrían dejar
        // un giro SIN escalera si la segunda falla, y entonces la inmutabilidad
        // saldría de una promesa en vez de salir de que nadie la toca nunca.
        rondas,
      };
    } else {
      const p = ESC.pozoDeReGiro(conEscalera.rondas, quemados, conFolio);
      if (!p.pozo.length) {
        return G.json(409, headers, { ok: false, error: 'Ya se giró a todos los participantes' });
      }
      const pick = p.pozo[ESC.alAzar(p.pozo.length)];
      const g = conFolio.find(r => String(r.id) === String(pick.id));
      // No debería poder pasar (el pozo ya filtra por `quemados`, que incluye a
      // los no elegibles), pero si pasa se DICE en vez de insertar una fila con
      // el teléfono en nulo.
      if (!g) return G.json(502, headers, { ok: false,
        error: 'El pozo devolvió a alguien que ya no es elegible' });
      nueva = {
        slug, registro_id: g.id, ganador_nombre: g.nombre, ganador_whatsapp: g.whatsapp,
        intento: (Array.isArray(sorteos) ? sorteos.length : 0) + 1,
        resultado: 'pendiente', total_participantes: total,
        origen_sorteo_id: conEscalera.id, escalon: p.escalon,
      };
    }

    // Insert directo, SIN on_conflict (revienta 42P10 con índices únicos).
    let creado = null;
    try {
      const r = await fetch(sorBase, {
        method: 'POST',
        headers: Object.assign({}, G.sbHeaders(), { Prefer: 'return=representation' }),
        body: JSON.stringify(nueva),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        // 🔒 EL 23505 ES EL CASO ESPERADO, y se CONFIRMA por su código —no se
        // adivina por el status—: es el único de (slug, intento) cazando dos
        // clics casi juntos. Sin ese índice las dos filas entrarían y la cadena
        // quedaría ambigua, y de la cadena se deriva quién hereda la escalera.
        if (/23505/.test(txt)) {
          return G.json(409, headers, { ok: false,
            error: 'Ya se está girando en este momento: espera un segundo e intenta de nuevo' });
        }
        throw new Error('insert ' + r.status + ' ' + txt.slice(0, 200));
      }
      const filas = await r.json().catch(() => []);
      creado = Array.isArray(filas) ? filas[0] : null;
    } catch (e) {
      console.error('[giveaway-sortear] insert:', e.message);
      return G.json(502, headers, { ok: false, error: 'No se pudo registrar el giro' });
    }

    return G.json(200, headers, {
      ok: true,
      sorteo_id: creado && creado.id,
      intento: nueva.intento,
      total_participantes: total,
      escalon: nueva.escalon != null ? nueva.escalon : null,
      es_regiro: !!conEscalera,
      ensayo: esEnsayo,
      // Esta puerta EXIGE token y Memo necesita prepararse para contactar al
      // ganador. La página los guarda en memoria y NO los pinta hasta la
      // revelación; lo que el gateo cierra es la puerta PÚBLICA
      // (`giveaway-estado`), no la vista del admin con su propia llave.
      nombre: nueva.ganador_nombre,
      whatsapp: nueva.ganador_whatsapp,
    });
  }

  // ── RESOLVER ─────────────────────────────────────────────────────────────
  // La lista blanca del motivo vive AQUÍ **y** en el CHECK de la base: un typo
  // que no truena es un dato que nadie puede leer después ('no_sige' se vería
  // igual de verde, y el día que alguien filtre por 'no_sigue' esa fila no
  // aparecería). Es la misma razón por la que `foto_estado` tiene su CHECK.
  const MOTIVOS_DESCARTE = ['no_sigue', 'otro'];

  if (body.accion === 'resolver') {
    const id = String(body.sorteo_id || '').trim();
    const resultado = String(body.resultado || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return G.json(400, headers, { ok: false, error: 'sorteo_id inválido' });
    }
    // Cuatro valores. `pendiente` es el DESHACER, no un estado que la pantalla
    // pida por su cuenta.
    if (!['pendiente', 'acepto', 'no_contesto', 'no_cumple'].includes(resultado)) {
      return G.json(400, headers, { ok: false,
        error: "resultado debe ser 'pendiente', 'acepto', 'no_contesto' o 'no_cumple'" });
    }

    // 🔒 EL MOTIVO NACE VACÍO y es obligatorio para `no_cumple`. Un default
    // escribiría en el acta un motivo que NADIE eligió — el defecto de
    // `kmt-prov`, que mandó tres compras a «Hotel» por un selector que elegía
    // solo. Aquí quedaría por escrito para siempre en `descarte_motivo`.
    let descarte = null;
    if (resultado === 'no_cumple') {
      const m = String(body.motivo || '').trim();
      if (!MOTIVOS_DESCARTE.includes(m)) {
        return G.json(400, headers, { ok: false,
          error: 'Elige un motivo: ' + MOTIVOS_DESCARTE.join(', ') });
      }
      const det = String(body.motivo_detalle || '').trim().slice(0, 200);
      if (m === 'otro' && det.length < 3) {
        return G.json(400, headers, { ok: false, error: 'Con «otro» hace falta escribir el motivo' });
      }
      descarte = (m === 'otro') ? ('otro: ' + det) : m;
    }

    // LA CADENA COMPLETA: de ella salen las dos reglas de abajo. Se lee del
    // slug resuelto, así que un token en modo ensayo ve la cadena del ensayo.
    let cadena = [];
    try {
      const rs = await fetch(`${sorBase}?slug=eq.${slugQ}&select=id,intento,resultado,descarte_motivo`,
        { headers: G.sbHeaders() });
      if (!rs.ok) throw new Error('lectura ' + rs.status);
      cadena = await rs.json().catch(() => []);
    } catch (e) {
      console.error('[giveaway-sortear] resolver/cadena:', e.message);
      return G.json(502, headers, { ok: false, error: 'No se pudo leer el estado del sorteo' });
    }
    const lista = Array.isArray(cadena) ? cadena : [];
    const fila = lista.find(x => x && String(x.id) === id);
    // 🔒 El éxito vacío también habla: si no está en ESTE slug, no existe para
    // esta petición — y decirlo es mejor que un ok sobre cero filas.
    if (!fila) return G.json(404, headers, { ok: false, error: 'Ese giro no existe' });

    // La IDEMPOTENCIA va ANTES de los candados: volver a picarle al mismo botón
    // es un dedazo inofensivo, no un error que merezca un rojo en pantalla
    // —y con `acepto` el candado de abajo lo trataría como intento de cambio.
    if (fila.resultado === resultado && (fila.descarte_motivo || null) === descarte) {
      return G.json(200, headers, { ok: true, resultado, sin_cambio: true });
    }

    // 🔒 `acepto` ES PERMANENTE. Antes de esto un PATCH podía regresarlo a
    // `no_contesto`: un sorteo con ganador confirmado dejaba de estar cerrado,
    // y «de forma permanente» era una promesa de la pantalla, no del servidor.
    if (fila.resultado === 'acepto') {
      return G.json(409, headers, { ok: false,
        error: 'Ese giro se cerró con ganador confirmado: no se puede cambiar.' });
    }

    // 🔒 UN DESCARTE SE DESHACE MIENTRAS NO HAYA GIRO POSTERIOR. Orden de Memo:
    // un dedazo no puede quemar al ganador legítimo. En cuanto hay re-giro queda
    // fijo, porque deshacerlo entonces dejaría DOS ganadores vivos en la cadena.
    if (fila.resultado !== 'pendiente') {
      const hayPosterior = lista.some(x => x && Number(x.intento) > Number(fila.intento));
      if (hayPosterior) {
        return G.json(409, headers, { ok: false,
          error: 'Ya se volvió a girar después de este: su resultado queda fijo.' });
      }
    }

    try {
      // 🔒 `descarte_motivo` se BORRA cuando la fila deja de ser un descarte: un
      // motivo colgando de algo que ya no lo es es un dato que miente.
      // 🔒 Y el filtro lleva `slug`: sin él, un token en modo ensayo podría
      // resolver un giro REAL pasándole su id.
      const r = await fetch(`${sorBase}?id=eq.${encodeURIComponent(id)}&slug=eq.${slugQ}`, {
        method: 'PATCH',
        headers: Object.assign({}, G.sbHeaders(), { Prefer: 'return=representation' }),
        body: JSON.stringify({ resultado, descarte_motivo: resultado === 'no_cumple' ? descarte : null }),
      });
      if (!r.ok) throw new Error('patch ' + r.status);
      const filas = await r.json().catch(() => []);
      if (!Array.isArray(filas) || !filas.length) {
        return G.json(409, headers, { ok: false, error: 'Ese giro no se pudo actualizar (¿es de este sorteo?)' });
      }
      return G.json(200, headers, { ok: true, resultado,
        descarte_motivo: resultado === 'no_cumple' ? descarte : null });
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
      const rs = await fetch(
        `${sorBase}?slug=eq.${slugQ}&select=id,intento,resultado,descarte_motivo,ganador_nombre,`
        + 'ganador_whatsapp,registro_id,creado_at,escalon,origen_sorteo_id&order=intento.asc',
        { headers: G.sbHeaders() });
      if (!rs.ok) throw new Error('lectura ' + rs.status);
      const filas = await rs.json().catch(() => []);
      const lista = Array.isArray(filas) ? filas : [];

      // ═══ 🔒 EL MOTIVO DE UN RE-GIRO NO SE GUARDA: SE DERIVA ═════════════
      //
      // Un re-giro existe porque el intento ANTERIOR se descartó, así que su
      // motivo es un HECHO DE ESA OTRA FILA. Guardarlo sería una copia, y una
      // copia es cómo los letreros se quedan viejos: `flash_promo` era una
      // copia escrita al encenderla que nunca se re-sincronizaba, el chip de
      // PROMO-DERIVA-1 igual, y las cuatro constantes de fecha de este módulo
      // se quedaron en el 13-sep de Natanael.
      //
      // Lo que vuelve inequívoco «el anterior» es el único de (slug, intento):
      // sin él, dos clics juntos darían dos filas con el mismo intento y la
      // cadena no tendría un orden que leer.
      const cadena = lista.map((s, i) => ({
        sorteo_id: s.id,
        intento: s.intento,
        resultado: s.resultado,
        descarte_motivo: s.descarte_motivo || null,
        motivo_derivado: i > 0 ? lista[i - 1].resultado : null,
        escalon: s.escalon != null ? s.escalon : null,
        nombre: s.ganador_nombre,
        creado_at: s.creado_at,
      }));

      const u = lista.length ? lista[lista.length - 1] : null;
      let extra = {};
      if (u && u.registro_id) {
        // 🔒 `instagram` y `ciudad` viajan SOLO por aquí: ésta es la puerta CON
        // token. Las públicas no los piden ni los pueden pedir — su whitelist
        // no los nombra.
        const rr = await fetch(`${regBase}?id=eq.${encodeURIComponent(u.registro_id)}&slug=eq.${slugQ}`
          + '&select=id,ciudad,instagram,foto_path,foto_estado', { headers: G.sbHeaders() });
        const filasR = rr.ok ? (await rr.json().catch(() => [])) : [];
        const rf = Array.isArray(filasR) ? filasR[0] : null;
        if (rf) extra = {
          registro_id: rf.id,
          ciudad: rf.ciudad || null,
          instagram: rf.instagram || null,
          foto_estado: rf.foto_estado || 'pendiente',
          tiene_foto: !!rf.foto_path,
          // 🔒 El premio y su TEXTO se DERIVAN con la regla de la casa: la
          // pantalla no vuelve a decidirlo (sería la segunda definición de
          // quién gana qué) ni lo teclea (sería el letrero que se queda viejo).
          premio: G.premioPorCiudad(rf.ciudad),
          premio_texto: G.PREMIOS[G.premioPorCiudad(rf.ciudad)],
        };
      }

      return G.json(200, headers, {
        ok: true, ensayo: esEnsayo, cadena,
        ultimo: u ? Object.assign({
          sorteo_id: u.id, intento: u.intento, resultado: u.resultado,
          descarte_motivo: u.descarte_motivo || null,
          nombre: u.ganador_nombre, whatsapp: u.ganador_whatsapp, creado_at: u.creado_at,
          escalon: u.escalon != null ? u.escalon : null,
          es_regiro: !!u.origen_sorteo_id,
        }, extra) : null,
      });
    } catch (e) {
      console.error('[giveaway-sortear] estado_admin:', e.message);
      return G.json(502, headers, { ok: false, error: 'No se pudo leer el estado' });
    }
  }

  // ── LA FOTO COMO data: URI — para el canvas de la story (PR B) ────────────
  //
  // 🔒 POR QUÉ NO UNA URL FIRMADA: una imagen de otro dominio ENSUCIA el canvas
  // y `toBlob` truena con SecurityError. Medí que el Storage del Portal manda
  // `access-control-allow-origin: *`, así que `crossOrigin="anonymous"`
  // probablemente funcionaría — pero el día que ese header no venga la imagen
  // NO CARGA EN ABSOLUTO y la story sale sin cara. Un `data:` URI no depende
  // de un header ajeno y nunca ensucia el canvas; el CSP ya permite `data:` en
  // `img-src`. Es admin: el peso no importa.
  if (body.accion === 'foto_datauri') {
    const rid = String(body.registro_id || '').trim();
    if (!rid) return G.json(400, headers, { ok: false, error: 'Falta el participante' });
    // 🔒 Acotado por SLUG: un token en modo ensayo no puede sacar la foto de
    // alguien del sorteo REAL.
    const rr = await fetch(`${regBase}?id=eq.${encodeURIComponent(rid)}&slug=eq.${slugQ}`
      + '&select=foto_path,foto_estado', { headers: G.sbHeaders() });
    const filasR = rr.ok ? (await rr.json().catch(() => [])) : [];
    const f = Array.isArray(filasR) ? filasR[0] : null;
    if (!f || !f.foto_path) return G.json(404, headers, { ok: false, error: 'Ese registro no tiene foto' });
    let buf;
    try {
      const r = await fetch(`${G.SB_URL}/storage/v1/object/giveaway-fotos/${encodeURI(f.foto_path)}`,
        { headers: G.sbHeaders() });
      if (!r.ok) throw new Error('storage ' + r.status);
      buf = Buffer.from(await r.arrayBuffer());
    } catch (e) {
      return G.json(502, headers, { ok: false, error: 'No se pudo leer la foto' });
    }
    const tipo = /\.png$/i.test(f.foto_path) ? 'image/png' : 'image/jpeg';
    return G.json(200, headers, { ok: true, foto_estado: f.foto_estado || 'pendiente',
      datauri: 'data:' + tipo + ';base64,' + buf.toString('base64') });
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
        body: JSON.stringify({ prefix: `${slug}/`, limit: 1000 }),
      });
      const carpetas = rr.ok ? (await rr.json().catch(() => [])) : [];
      for (const c of (Array.isArray(carpetas) ? carpetas : [])) {
        if (!c || !c.name) continue;
        const r2 = await fetch(`${G.SB_URL}/storage/v1/object/list/${BUCKET}`, {
          method: 'POST', headers: G.sbHeaders(),
          body: JSON.stringify({ prefix: `${slug}/${c.name}/`, limit: 1000 }),
        });
        const objs = r2.ok ? (await r2.json().catch(() => [])) : [];
        for (const o of (Array.isArray(objs) ? objs : [])) {
          if (!o || !o.name) continue;
          enBucket.push({ path: `${slug}/${c.name}/${o.name}`, creado: Date.parse(o.created_at || o.updated_at || '') });
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
      // ═══ 🔒 SEGUNDO CANDADO, ANTES DE BORRAR ═══════════════════════════
      //
      // El PRIMERO es la DIAGONAL del prefijo al listar, y es una certeza, no
      // una suposición: `karolg-bbva-2026-ensayo/…` NO empieza por
      // `karolg-bbva-2026/` —en la posición 16 el prefijo tiene `/` y el
      // candidato tiene `-`—, así que los avatares del ensayo quedan fuera
      // bajo las DOS semánticas posibles del `object/list` de Supabase.
      //
      // Éste vuelve a comprobar cada ruta del lote contra el prefijo exacto y
      // REHÚSA EL LOTE ENTERO nombrando la intrusa. El candado más barato es
      // el que no deja llegar el dato; el segundo más barato es no borrar lo
      // que no pediste.
      const intrusa = lote.find((x) => String(x).indexOf(slug + '/') !== 0);
      if (intrusa) {
        return G.json(409, headers, { ok: false,
          error: 'El barrido encontró una ruta fuera de «' + slug + '/»: ' + intrusa
               + '. No se borró nada.' });
      }
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

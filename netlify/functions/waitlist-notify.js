// netlify/functions/waitlist-notify.js
//
// El VIGILANTE de la lista de espera. Desde WL-1 no manda correos por su cuenta:
// el correo, el ritmo y el marcado viven en `_lib/waitlist-core`, que comparte
// con el botón de Kamehouse y con el publicar de Esferas. Aquí sólo se decide
// A QUIÉN toca avisarle.
//
//  (1) AUTO (cron diario): lee el catálogo YA DESPLEGADO con _lib/catalogo-index
//      y lo compara contra eventos_estado_snapshot. Dispara en la transición
//      'proximamente' → a la venta. Lo que no conocía se SIEMBRA CALLADO
//      (GR-8) — ver el bloque de abajo: eso no se toca.
//      Además SANA HUÉRFANOS: filas que quedaron pendientes de un evento al que
//      ya se le avisó (un corte por presupuesto al publicar, un 429 terco,
//      alguien que se suscribió tarde). Un evento sembrado en silencio NUNCA
//      es huérfano: no tiene ni una fila notificada.
//
// Los otros dos disparos NO viven aquí, y los tres usan el MISMO núcleo:
//
//  (2) MANUAL (botón "Notificar ahora" de Kamehouse): vive en
//      `admin-waitlist-notify`, que es una función NORMAL. Aquí tuvo una rama
//      `?force=true` desde el 15-may-2026 (2396a2f) que WL-2 RETIRÓ: nació en el
//      mismo commit que el `schedule` de abajo, y Netlify bloquea el HTTP de una
//      función programada antes de que el handler corra. Era una puerta pintada
//      sobre un muro — el botón devolvía 403 de plataforma. Si vuelve a hacer
//      falta un disparo manual, va allá, no aquí.
//
//  (3) AL PUBLICAR: vive en esferas-publicar, que es quien sabe que el dueño
//      acaba de publicar y con qué datos. Ver la nota de WL-1 allá.
//
// Configurado como cron diario en netlify.toml a las 14:00 UTC (8 AM CDMX).

const { fetchCatalogo } = require('./_lib/catalogo-index');
const {
  sb, notificarEvento, eventosHuerfanos, upsertSnapshot, PRESUPUESTO_CRON_MS,
} = require('./_lib/waitlist-core');

const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

function ok(b)  { return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }; }
function bad(c,m){ return { statusCode: c, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok:false, error:m }) }; }

exports.handler = async function (event) {
  if (!SB_KEY) return bad(500, "SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado");

  // ── AUTO MODE (cron): el catálogo desplegado + el snapshot ──
  // [GR-8] El catálogo sale de _lib/catalogo-index — la MISMA autoridad que ya
  // usan bodega, contratos, cobranza y transporte. Antes esta función tenía su
  // propio extractor de regex y veía 18 de 94 eventos: su patrón
  // /\{[^{}]*id:'…'[^{}]*\}/ prohíbe llaves anidadas, y casi todo evento trae
  // zonas:[{…}] o flashPromo:{…}. Resultado medido: de los 54 eventos A LA
  // VENTA no veía NINGUNO, y como la transición que dispara es
  // "proximamente → a la venta", la lista de espera no podía avisar jamás.
  const catalogo = await fetchCatalogo();
  if (!catalogo) return bad(502, "No se pudo leer el catálogo");
  const eventos = Object.keys(catalogo).map(id => ({
    id,
    st: catalogo[id].st || "",
    a:  catalogo[id].nombre || id,
    f:  catalogo[id].fecha  || "",
    v:  catalogo[id].venue  || "",
  }));
  if (!eventos.length) return bad(500, "El catálogo vino vacío");
  console.log(`[waitlist-notify] eventos del catálogo: ${eventos.length}`);

  let snapshot = [];
  try { snapshot = await sb(`eventos_estado_snapshot?select=evento_id,estado`); }
  catch (e) { console.error("[waitlist-notify] snapshot fetch:", e.message); }
  const prev = {};
  for (const s of (snapshot || [])) prev[s.evento_id] = s.estado;

  // ═══ LA SIEMBRA ══════════════════════════════════════════════════════════
  // El snapshot se escribió durante meses con la lista CIEGA de 18 eventos, así
  // que los ~76 que entran hoy son desconocidos para él. Un evento desconocido
  // NO es una transición: lleva a saber cuánto a la venta, y avisarle hoy a su
  // lista de espera sería mandar "¡ya está disponible!" por algo que abrió hace
  // meses — a toda la lista, de golpe.
  //
  // Regla: solo se compara contra un estado que el snapshot YA conocía. Lo
  // desconocido se SIEMBRA callado (lo escribe upsertSnapshot al final, como
  // siempre) y queda listo para comparar en la siguiente corrida.
  //
  // Es por evento, no por corrida: un evento nuevo del catálogo se siembra sin
  // ruido sin bloquear la transición real de otro que sí venía observado.
  //
  // WL-1: esta regla sigue siendo SÓLO del vigilante. Cuando el dueño PUBLICA,
  // el aviso sale aunque el evento nazca directo a la venta — publicar es un
  // acto deliberado suyo, no un descubrimiento del vigilante. Lo que el cron
  // encuentra por su cuenta se sigue sembrando callado, igual que hoy.
  let sembrados = 0;
  let totalSent = 0, totalNotif = 0, eventosDisparados = 0;
  // Reloj de la corrida completa: cada evento gasta del mismo presupuesto, y lo
  // que no alcance queda pendiente para la siguiente (nadie se pierde ni repite).
  const finCorrida = Date.now() + PRESUPUESTO_CRON_MS;
  const queda = () => Math.max(0, finCorrida - Date.now());

  for (const ev of eventos) {
    const conocido = Object.prototype.hasOwnProperty.call(prev, ev.id);
    if (!conocido) { sembrados++; continue; }   // primera vez que lo vemos → solo se siembra
    const before = prev[ev.id];
    // Transición proximamente -> a la venta (st vacío).
    if (before === "proximamente" && ev.st === "") {
      eventosDisparados++;
      try {
        const r = await notificarEvento({
          evento_id: ev.id, nombre: ev.a, fecha: ev.f, venue: ev.v, presupuestoMs: queda(),
        });
        totalSent += r.enviados; totalNotif += r.total;
        console.log(`[waitlist-notify] ${ev.id}: ${r.enviados}/${r.total} enviados`
          + (r.restantes ? ` · ${r.restantes} quedan para la próxima` : ''));
      } catch (e) { console.error(`[waitlist-notify] ${ev.id} falló:`, e.message); }
    }
  }
  if (sembrados) console.log(`[waitlist-notify] sembrados sin avisar: ${sembrados}`);

  // ═══ LOS HUÉRFANOS ═══════════════════════════════════════════════════════
  // Filas pendientes de eventos a los que YA se les avisó: el resto de un corte
  // por presupuesto (al publicar o en una corrida anterior), un 429 que ni con
  // reintento salió, o alguien que se suscribió después del aviso. Se sanan con
  // el mismo núcleo y el mismo ritmo. Un evento sembrado en silencio no tiene
  // ninguna fila notificada, así que NO aparece aquí: GR-8 intacto.
  let huerfanosSanados = 0, huerfanosEventos = 0;
  try {
    for (const h of await eventosHuerfanos()) {
      if (queda() <= 0) break;
      const cat = catalogo[h.evento_id] || {};
      huerfanosEventos++;
      const r = await notificarEvento({
        evento_id: h.evento_id,
        nombre: cat.nombre || h.evento_nombre,
        fecha: cat.fecha || "", venue: cat.venue || "",
        presupuestoMs: queda(),
      });
      huerfanosSanados += r.enviados;
      if (r.enviados || r.restantes) {
        console.log(`[waitlist-notify] huérfanos ${h.evento_id}: ${r.enviados} sanados`
          + (r.restantes ? `, ${r.restantes} quedan` : ''));
      }
    }
  } catch (e) { console.error("[waitlist-notify] huérfanos:", e.message); }

  // Actualiza snapshot con los estados actuales (insert + update).
  let escritura = null;
  try {
    escritura = await upsertSnapshot(eventos);
    console.log(`[waitlist-notify] snapshot: +${escritura.insertadas} nuevas, `
      + `~${escritura.actualizadas} cambiadas, ${escritura.sin_cambio} sin tocar`);
  } catch (e) { console.error("[waitlist-notify] upsert snapshot:", e.message); }

  return ok({ ok: true, mode: "auto", eventos: eventos.length, sembrados, snapshot: escritura,
    disparados: eventosDisparados, encolados: totalNotif, enviados: totalSent,
    huerfanos_eventos: huerfanosEventos, huerfanos_sanados: huerfanosSanados });
};

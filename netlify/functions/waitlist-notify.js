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
//  (2) FORCE (botón "Notificar a todos" en Kamehouse):
//      ?force=true&evento_id=X — manda a la lista de ese evento sin mirar el
//      snapshot, y lo deja sellado para que el cron no repita.
//
// El tercer disparo —AL PUBLICAR— no vive aquí: vive en esferas-publicar, que
// es quien sabe que el dueño acaba de publicar y con qué datos. Usa el MISMO
// núcleo. Ver la nota de WL-1 allá.
//
// Configurado como cron diario en netlify.toml a las 14:00 UTC (8 AM CDMX).

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { fetchCatalogo } = require('./_lib/catalogo-index');
const {
  sb, notificarEvento, eventosHuerfanos, upsertSnapshot, PRESUPUESTO_CRON_MS,
} = require('./_lib/waitlist-core');

const SB_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;

function ok(b)  { return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }; }
function bad(c,m){ return { statusCode: c, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok:false, error:m }) }; }

exports.handler = async function (event) {
  if (!SB_KEY) return bad(500, "SUPABASE_SERVICE_KEY_KAMEHOUSE no configurado");

  const qs = event.queryStringParameters || {};
  const force = qs.force === "true";
  const forceId = qs.evento_id;

  // Código de descuento opcional (force mode). El admin lo configura desde el
  // modal de Kamehouse → Lista de espera → Notificar. Si llegan los 3 campos,
  // el email incluye el bloque amarillo destacado; si no, va el correo normal.
  const codigo = (qs.codigo || "").trim().toUpperCase().slice(0, 24);
  const descuento = parseInt(qs.descuento, 10);
  const horas = parseInt(qs.horas, 10);
  const promo = (codigo && /^[A-Z0-9_-]{2,24}$/.test(codigo)
                 && Number.isFinite(descuento) && descuento > 0 && descuento < 100
                 && Number.isFinite(horas) && horas > 0 && horas <= 168)
    ? { codigo, descuento, horas } : null;

  // ── FORCE MODE: notificar a una lista específica desde kamehouse ──
  if (force && forceId) {
    // Candado: el modo force dispara emails masivos desde kamehouse, así que
    // exige admin. El cron AUTO entra por el camino de abajo (sin querystring,
    // sin Authorization) y NO pasa por aquí — este guard no lo afecta.
    const __origin = corsCheck(event);
    if (!__origin) return bad(403, "Origen no permitido");
    const auth = await verifyAdminAuthLive(event, ['maestro_roshi','bulma','milk']);
    if (!auth.valid) return bad(auth.status, auth.error);

    // Necesitamos el nombre/fecha/venue. Los traemos del primer registro
    // de la waitlist (evento_nombre quedó guardado al subscribirse).
    let row;
    try {
      const rs = await sb(`eventos_waitlist?evento_id=eq.${encodeURIComponent(forceId)}&select=evento_nombre&limit=1`);
      row = rs && rs[0];
    } catch (e) { return bad(500, "SB error: " + e.message); }
    if (!row) return ok({ ok: true, sent: 0, total: 0, note: "Lista vacía" });

    const r = await notificarEvento({
      evento_id: forceId, nombre: row.evento_nombre, fecha: "", venue: "", promo,
      presupuestoMs: PRESUPUESTO_CRON_MS,
    });
    // Marca el evento como activo en snapshot para que el cron no vuelva a disparar.
    try {
      // [GR-9] Mismo patrón de la casa que upsertSnapshot: sin merge-duplicates.
      await upsertSnapshot([{ id: forceId, st: "" }]);
    } catch {}
    // `sent`/`total` se conservan con su nombre viejo: los lee el modal de Kamehouse.
    return ok({ ok: true, mode: "force", evento_id: forceId,
      sent: r.enviados, total: r.total, fallidos: r.fallidos, restantes: r.restantes });
  }

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

// =============================================================================
// _lib/preventa-aplicar.js — [PREVENTA-AUTO-1] EL DUEÑO de «sacar a alguien de
// la PREVENTA A CIEGAS y ponerle su paquete real». (10-nov-2026)
//
// Nació dentro de `viajero_elegir_paquete` (admin-coordi-asignaciones,
// PREVENTA-ELEGIR-1). Al volverse DOS lectores —el botón 🎟 de Capsule y el
// wizard del Portal, que hoy aplica SOLO (palabra de Memo, 10-nov: «ella haga
// todo automático y ya le llegue su confirmación»)— se MUDÓ aquí. Dos copias
// serían dos listas de candados que todavía no divergen.
//
// Lo que hace, igual que antes:
//   · exige que la fila SIGA en preventa (CHEAP + zona vacía o «Preventa a ciegas»)
//   · la zona pasa por LA PUERTA de la ficha (puertaZona)
//   · el inventario: con pedido cargado y sin lugar → 409; sin pedido → pasa con aviso
//   · PATCH con valor esperado (paquete, zona y total tal como se leyeron)
//   · sello «[PREVENTA→PAQUETE fecha] …» ANEXADO en notas
//   · emite su contrato con el anexo de preventa
// 🔒 El dinero abonado NO se toca: sus $300 siguen como abono.
// =============================================================================
const { puertaZona } = require('./zona-ficha');
const { cargarDisponibilidad, evaluarZona } = require('./disponibilidad');

const PAQUETES = ['plus', 'ride', 'stay', 'cheap'];
const ZONA_PREVENTA_RE = /^preventa a ciegas$/i;
const UUID_RE = /^[0-9a-f-]{36}$/i;

function _hotelTipo(raw) {
  const h = String(raw || '').trim().toLowerCase();
  if (h.startsWith('compartida')) return 'Compartida';
  if (h.startsWith('doble')) return 'Doble';
  if (h.startsWith('triple')) return 'Triple';
  if (h.startsWith('individual')) return 'Individual';
  return null;
}

// → { status, body }  (body.error cuando status ≠ 200)
async function aplicarPaquetePreventa({ id, paquete, zona, total, hotel, quien, contratoSinCorreo, creado_por, KH_URL, KH_KEY, PORTAL_URL, PORTAL_KEY }) {
  const sbHeaders = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY, 'Content-Type': 'application/json' };
  const baseVE = `${KH_URL}/rest/v1/viajeros_evento`;
  const bad = (error, extra) => ({ status: 400, body: Object.assign({ error }, extra || {}) });
  id = String(id || '').trim();
  if (!UUID_RE.test(id)) return bad('id inválido');
  paquete = String(paquete || '').trim().toLowerCase();
  if (!PAQUETES.includes(paquete)) return bad(`tipo_paquete inválido: se espera uno de ${PAQUETES.join(', ')}`);
  zona = String(zona || '').trim();
  const rideSinZona = paquete === 'ride' && !zona;
  if (!zona && !rideSinZona) return bad('la zona del boleto es obligatoria');
  if (ZONA_PREVENTA_RE.test(zona)) return bad('elige la zona REAL, no «Preventa a ciegas»');
  total = Number(total);
  if (!Number.isFinite(total) || total <= 0) return bad('el costo del paquete es obligatorio y debe ser mayor que cero');
  total = Math.round(total * 100) / 100;

  const pre = await fetch(`${baseVE}?id=eq.${id}&select=id,evento_id,nombre,tipo_paquete,zona_boleto,total_contrato,boletos,notas&limit=1`, { headers: sbHeaders });
  if (!pre.ok) return { status: 502, body: { error: 'KH rechazó la consulta', detail: await pre.text() } };
  const v = (await pre.json())[0];
  if (!v) return bad('ese viajero no existe');
  const zonaAct = String(v.zona_boleto || '').trim();
  const enPreventa = String(v.tipo_paquete || '').toLowerCase() === 'cheap' && (!zonaAct || ZONA_PREVENTA_RE.test(zonaAct));
  if (!enPreventa) return { status: 409, body: { error: 'Este viajero ya no está en preventa (ya tiene paquete y zona). Si hay que cambiarlo, es un cambio manual aparte.', ya: true } };

  let zonaAviso = null, stockAviso = null;
  if (!rideSinZona) {
    const vz = await puertaZona(v.evento_id, zona);
    if (vz.estado === 'desconocida') {
      const lista = (vz.canonicas || []).join(' · ');
      return bad(`La zona «${zona}» no existe en la ficha. ` + (lista ? `Las de la ficha: ${lista}.` : ''));
    }
    if (vz.estado === 'canonizada') { zonaAviso = `Zona corregida a «${vz.zona}»`; zona = vz.zona; }
    else if (vz.estado === 'sin-catalogo' || vz.estado === 'sin-evento') zonaAviso = 'La zona se guardó sin validar contra la ficha (catálogo ilegible).';
    // El inventario: con pedido cargado y sin lugar NO se vende (palabra de
    // Memo). Sin pedido cargado pasa CON aviso.
    if (paquete !== 'ride' && PORTAL_URL && PORTAL_KEY) {
      try {
        const disp = await cargarDisponibilidad({ khUrl: KH_URL, khKey: KH_KEY, portalUrl: PORTAL_URL, portalKey: PORTAL_KEY, evento_id: v.evento_id });
        if (!disp.error) {
          const ez = evaluarZona(disp, zona, Number(v.boletos) || 1);
          if (ez.gestionada && ez.sinCupo) {
            return { status: 409, body: { error: `«${zona}» ya no tiene lugar (quedan ${ez.restante}). Elige otra zona.`, agotada: true, restante: ez.restante } };
          }
          if (!ez.gestionada) stockAviso = `«${zona}» todavía no tiene pedido cargado en Kamisama: no se pudo confirmar que haya lugar.`;
        }
      } catch (_) { stockAviso = 'No se pudo medir el inventario; revisa la zona en Kamisama.'; }
    }
  }

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });
  const sello = `[PREVENTA→PAQUETE ${hoy}] de PREVENTA A CIEGAS $${Number(v.total_contrato) || 0} a ${paquete.toUpperCase()}${zona ? ' · ' + zona : ''}${hotel ? ' · ' + hotel : ''} · total $${total} · capturó ${quien || 'panel'}`;
  const notas = v.notas ? `${v.notas} · ${sello}` : sello;
  const cambios = { tipo_paquete: paquete, zona_boleto: zona || null, total_contrato: total, notas };
  const ht = _hotelTipo(hotel);
  if (ht && paquete !== 'cheap') cambios.hotel_tipo = ht;
  const filtroZona = v.zona_boleto == null ? 'zona_boleto=is.null' : `zona_boleto=eq.${encodeURIComponent(v.zona_boleto)}`;
  const filtroTot = v.total_contrato == null ? 'total_contrato=is.null' : `total_contrato=eq.${v.total_contrato}`;
  const r = await fetch(`${baseVE}?id=eq.${id}&tipo_paquete=eq.${encodeURIComponent(v.tipo_paquete)}&${filtroZona}&${filtroTot}`, {
    method: 'PATCH',
    headers: Object.assign({}, sbHeaders, { Prefer: 'return=representation' }),
    body: JSON.stringify(cambios),
  });
  if (!r.ok) return { status: 502, body: { error: 'KH rechazó el update', detail: await r.text() } };
  const filas = await r.json();
  if (!filas.length) return { status: 409, body: { error: 'Alguien ya cambió a este viajero mientras tanto. Recarga la lista.', ya: true } };
  // [CONTRATO-CLIENTE-1] Con paquete REAL nace su contrato, con el anexo de
  // preventa. Jamás deshace el cambio de paquete.
  const { emitirContratos } = require('./contrato-cliente');
  const contrato = await emitirContratos({ viajeroIds: [filas[0].id], preventa: true, enviar: contratoSinCorreo !== true, creado_por: creado_por || null, KH_URL, KH_KEY });
  return { status: 200, body: { viajero: filas[0], zona_aviso: zonaAviso, stock_aviso: stockAviso, contrato } };
}

module.exports = { aplicarPaquetePreventa };

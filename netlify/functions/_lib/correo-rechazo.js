// ════════════════════════════════════════════════════════════════════════════
// [RECHAZO-AVISO-1] EL AVISO DE QUE NO SE PUDO · 28-oct-2026
//
// Palabra de Memo: «si dale al correo primero que nada y que tengan esa info ya
// establecida para futuros rechazos en todos los eventos, eso es urgente».
//
// MEDIDO ANTES DE ESCRIBIR ESTO: la acción `rechazar` solo hacía un PATCH.
// Cero correos, cero WhatsApp. El motivo que escribía Bulma —y los escribía
// BIEN, con la intención de rescatar la venta: «¿gustas cambiar de fecha?»,
// «¿cambiamos a la del 12?»— se guardaba en una columna que no lee nadie más.
// Cuatro personas de Fuerza Regida habían transferido ya (separos de $300 a
// $1,000) y fueron rechazadas el 27 y 28 de octubre sin un solo aviso.
//
// LAS TRES DECISIONES DE MEMO, firmadas el 28-oct:
//   1. EL DINERO QUEDA A FAVOR. El correo NO ofrece reembolso de entrada: dice
//      que su pago está apartado para la zona o fecha que elija, sin volver a
//      pagar, y que si prefiere que se lo regresen lo pida. Es lo que sus
//      propios motivos ya intentaban hacer a mano.
//   2. SALE SOLO AL RECHAZAR. No hay un segundo botón que se pueda olvidar —
//      que es exactamente lo que pasó con estos cuatro. Pero la bandeja enseña
//      el correo EXACTO antes de apretar: no se manda nada a ciegas.
//   3. CINCO MOTIVOS PRELLENADOS Y EDITABLES («dame las 5 opciones y con opción
//      a editar esos mismos manualmente»). Quien rechaza elige uno, el texto se
//      llena solo, y puede corregirlo antes de mandar.
//
// 🔒 EL TEXTO QUE VIAJA ES EL QUE SE EDITÓ, NO LA PLANTILLA. Por eso
//    `motivo_rechazo` guarda lo que el cliente LEYÓ, palabra por palabra, y
//    `motivo_clave` guarda solo cuál botón se tocó. Si algún día alguien
//    pregunta «¿qué le dijimos a Jose?», la respuesta está escrita.
// ════════════════════════════════════════════════════════════════════════════

// 🔴 `llaveCorreo` SOLO normaliza (minúsculas + trim): NO valida. El validador
//    es `esCorreoUsable`, que además caza el «gmail.con» — el dedazo que tiene
//    formato bueno y correo inexistente. Cazado por el careo: con llaveCorreo a
//    secas, «no-es-correo» pasaba el render y el rebote llegaba hasta Resend.
const { llaveCorreo, esCorreoUsable } = require('./correo-forma');

const FROM = 'Conecta Reynosa <admin@conectareynosa.mx>';
const SITIO = 'https://conectareynosa.mx';
const WA_RESERVAS = '528119771072';

// ── EL CATÁLOGO ─────────────────────────────────────────────────────────────
// 🔒 `avisa:false` NO es un detalle: «ya te contactamos por WhatsApp» es un
//    CIERRE INTERNO, no un rechazo del cliente. Mandarle un correo a alguien
//    con quien ya estás hablando es contradecirte solo. Es el único de los
//    seis que se calla, y se calla a propósito.
// ⚠️ Esta lista la repite el CHECK de la base (acta RECHAZO-AVISO-1). Son dos
//    listas; el careo las carea en el bloque [M] para que no diverjan.
const MOTIVOS = [
  { clave: 'zona_agotada',  avisa: true,  etiqueta: '🎫 Ya no hay lugar en esa zona',
    texto: 'Ya no tenemos lugares disponibles en la zona que elegiste.' },
  { clave: 'fecha_agotada', avisa: true,  etiqueta: '📅 Ya no hay lugar en esa fecha',
    texto: 'Ya no tenemos lugares disponibles para esa fecha.' },
  { clave: 'comprobante',   avisa: true,  etiqueta: '🧾 El comprobante no se ve o el monto no coincide',
    texto: 'No pudimos confirmar tu pago con el comprobante que nos mandaste.' },
  { clave: 'datos',         avisa: true,  etiqueta: '📝 Faltan o no coinciden tus datos',
    texto: 'Nos faltan datos tuyos para poder apartar tu lugar.' },
  { clave: 'whatsapp',      avisa: false, etiqueta: '💬 Ya te contactamos por WhatsApp',
    texto: 'Resuelto por WhatsApp. (Cierre interno: a esta persona NO le llega correo.)' },
  { clave: 'otro',          avisa: true,  etiqueta: '✍️ Otro (lo escribo yo)',
    texto: '' },
];
const CLAVES = MOTIVOS.map((m) => m.clave);
function motivoDe(clave) { return MOTIVOS.find((m) => m.clave === String(clave || '')) || null; }
// Sin clave (una fila vieja, o el front de antes) se trata como `otro`: avisa.
// 🔒 El lado seguro es AVISAR: callarse es el defecto que vinimos a curar.
function avisaCon(clave) { const m = motivoDe(clave); return m ? m.avisa : true; }

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function baseSlug(id) { return String(id || '').split('#')[0]; }
const PAQ = { plus: 'PLUS', stay: 'STAY', ride: 'RIDE', cheap: 'CHEAP' };

// ── EL CORREO ───────────────────────────────────────────────────────────────
// Devuelve { subject, html, to } | { error }.
//
// 🔒 FAIL-SOFT CON EL CATÁLOGO, y aquí SÍ corresponde (a diferencia de
//    CONSUELO-VERDAD, donde el correo PROMETÍA un código y su vigencia). Este
//    correo no promete nada derivado: dice que no se pudo, que su pago queda a
//    favor y cómo contactarnos. El nombre del evento ya viaja GUARDADO en la
//    fila (`evento_nombre`, desde REQ-B1). El catálogo solo agrega la fecha, el
//    venue y el link — y si no se puede leer, se omiten esos tres y el aviso
//    sale igual. Frenar un aviso urgente por un adorno sería el error contrario.
//
// 🔒 EL MONTO NO SE DICE, y es deliberado. `separo_sistema` es lo que el sitio
//    COTIZÓ, no lo que la persona de verdad transfirió — eso solo lo sabe quien
//    abre el comprobante, y al rechazar nadie lo teclea. «Tu pago queda a tu
//    favor» es cierto siempre; «tus $600 quedan a tu favor» puede no serlo, y
//    un número equivocado en un correo de dinero se cobra caro. Si quien
//    rechaza quiere decir el monto, lo escribe en su nota.
function renderRechazo({ correo, nombre, folio, evento_id, evento_nombre, ev, paquete, zona, personas, pago, motivo_texto }) {
  if (!esCorreoUsable(correo)) return { error: 'no dejó un correo usable' };
  const to = llaveCorreo(correo);
  const porque = String(motivo_texto || '').trim();
  if (porque.length < 3) return { error: 'sin motivo no se manda: el cliente lo va a preguntar' };

  const artista = String((ev && ev.a) || evento_nombre || '').trim();
  if (!artista) return { error: 'no se pudo saber de qué viaje es: no se manda un correo que no diga a qué evento' };
  const detalle = ev ? [String(ev.f || '').trim(), String(ev.v || '').trim()].filter(Boolean).join(' · ') : '';
  const primer = (String(nombre || '').trim().split(/\s+/)[0]) || 'Hola';
  const n = Math.max(1, parseInt(personas, 10) || 1);

  const fila = (a, b) => `<tr><td style="padding:5px 0;color:#b3b3b3;font-size:13px">${a}</td>`
    + `<td style="padding:5px 0;text-align:right;color:#ffffff;font-weight:700;font-size:13px">${b}</td></tr>`;
  const pedido = '<table style="width:100%;border-collapse:collapse;margin:0 0 18px">'
    + fila('Evento', esc(artista))
    + (detalle ? fila('Cuándo', esc(detalle)) : '')
    + (paquete ? fila('Paquete', esc(PAQ[String(paquete).toLowerCase()] || String(paquete).toUpperCase())) : '')
    + (zona ? fila('Zona', esc(zona)) : '')
    + fila('Lugares', String(n))
    + fila('Folio', esc(folio || '—'))
    + '</table>';

  // El bloque del dinero SOLO si de verdad mandó comprobante. Decirle «tu pago
  // queda a favor» a quien no pagó lo deja esperando un dinero que no existe.
  const bloquePago = pago ? `
          <div style="margin:0 0 20px;padding:16px;border:1px solid #88ea4e;border-radius:10px;background:#0f1a12">
            <p style="margin:0 0 8px;color:#88ea4e;font-weight:800;font-size:15px">Tu pago queda a tu favor</p>
            <p style="margin:0;font-size:14px;color:#d9d9d9;line-height:1.6">Lo tenemos apartado para ti. En cuanto nos digas qué zona o qué fecha prefieres, lo aplicamos ahí y <b style="color:#ffffff">no tienes que volver a pagar</b>. Si prefieres que te lo regresemos, nada más dinos y lo hacemos.</p>
          </div>` : '';

  const waTxt = encodeURIComponent(`Hola, soy ${String(nombre || '').trim()}`
    + (folio ? ` (folio ${folio})` : '') + `. Me avisaron que no se pudo mi lugar para ${artista} y quiero ver otra opción.`);
  const linkEv = ev && ev.id ? `${SITIO}/${baseSlug(evento_id) || ev.id}` : '';
  const botonEv = linkEv ? `
            <a href="${esc(linkEv)}" style="display:inline-block;background:#e8ff4c;color:#000;font-weight:800;text-decoration:none;padding:13px 24px;border-radius:8px;font-size:15px;margin:4px">Ver otras zonas y fechas →</a>` : '';

  const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#000;color:#fff">
        <div style="background:#e8ff4c;color:#000;padding:18px 22px;border-bottom:4px solid #ff283b">
          <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Conecta Reynosa · ${esc(artista)}</div>
          <div style="font-size:22px;font-weight:900;margin-top:4px">${esc(primer)}, no pudimos apartarte ese lugar</div>
        </div>
        <div style="padding:24px 22px;background:#0a0a0a;font-size:15px;line-height:1.6;color:rgba(255,255,255,.9)">
          <p style="margin:0 0 16px">Revisamos tu solicitud y <b style="color:#ffffff">no la pudimos confirmar</b>. Te decimos por qué y qué sigue.</p>
          ${pedido}
          <div style="margin:0 0 18px;padding:14px 16px;border-left:3px solid #ff283b;background:#140a0c">
            <p style="margin:0 0 4px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#ff8891">Por qué no se pudo</p>
            <p style="margin:0;color:#ffffff;font-size:15px">${esc(porque)}</p>
          </div>
          ${bloquePago}
          <p style="margin:0 0 8px">Escríbenos y te ayudamos a encontrar otro lugar — casi siempre hay opción en otra zona o en otra fecha.</p>
          <p style="margin:0 0 20px;text-align:center">
            <a href="https://wa.me/${WA_RESERVAS}?text=${waTxt}" style="display:inline-block;background:#25d366;color:#000;font-weight:800;text-decoration:none;padding:13px 24px;border-radius:8px;font-size:15px;margin:4px">Escribirnos por WhatsApp →</a>${botonEv}
          </p>
          <p style="margin:0;font-size:13px;color:rgba(255,255,255,.55)">Si tienes cualquier duda, estamos en el 81 1977 1072. Perdón por la vuelta.</p>
        </div>
      </div>`;

  return { subject: `Sobre tu lugar para ${artista}${folio ? ' · folio ' + folio : ''}`, html, to };
}

// ── ARMAR EL CORREO DE UNA REQUISICIÓN ──────────────────────────────────────
// Separado del ENVÍO a propósito: la bandeja lo usa para la VISTA PREVIA (cero
// escrituras, cero correos) y el rechazo lo usa para mandarlo. Si fueran la
// misma función, enseñar sería mandar.
async function armarRechazo({ req, motivo_clave, motivo_texto }) {
  if (!avisaCon(motivo_clave)) {
    return { avisa: false, razon: 'Ese motivo es un cierre interno: al cliente no le llega correo.' };
  }
  // 🔴 Elegir un motivo PRELLENA su texto. Sin esta caída, la vista previa del
  //    primer clic llegaba con el texto vacío y contestaba «sin motivo no se
  //    manda» sobre un motivo recién elegido — cazado por el careo. El orden es
  //    el de la verdad: lo que se escribió a mano gana, luego la plantilla del
  //    motivo, luego lo que ya estaba guardado en la fila.
  const m = motivoDe(motivo_clave);
  let texto = String(motivo_texto == null ? '' : motivo_texto).trim();
  if (!texto && m && m.texto) texto = m.texto;
  if (!texto) texto = String(req.motivo_rechazo || '');
  let ev = null;
  try {
    const { fetchEventosRaw } = require('./catalogo-index');
    const EV = await fetchEventosRaw();
    ev = (Array.isArray(EV) ? EV : []).find((e) => e && e.id === baseSlug(req.evento_id)) || null;
  } catch (_) { ev = null; }   // fail-soft: el aviso sale sin fecha ni link
  const r = renderRechazo({
    correo: req.correo, nombre: req.nombre, folio: req.folio,
    evento_id: req.evento_id, evento_nombre: req.evento_nombre, ev,
    paquete: req.paquete, zona: req.zona, personas: req.num_personas,
    pago: !!req.comprobante_path,
    motivo_texto: texto,
  });
  if (r.error) return { avisa: true, razon: r.error, error: r.error, catalogo_ok: !!ev };
  return { avisa: true, catalogo_ok: !!ev, subject: r.subject, html: r.html, to: r.to };
}

// ── EL ENVÍO ────────────────────────────────────────────────────────────────
// 🔒 JAMÁS LANZA. El rechazo ya ocurrió cuando esto corre: si el correo falla,
//    la bandeja lo DICE y la solicitud queda rechazada igual. Un aviso que se
//    cae no puede deshacer una decisión que ya se tomó.
// 🔒 El sello va DESPUÉS del envío (`aviso_at`, `aviso_email_id`). Sellar antes
//    dejaría a alguien marcado como avisado sin haber recibido nada.
async function avisarRechazo({ req, motivo_clave, motivo_texto, KH_URL, KH_KEY }) {
  const armado = await armarRechazo({ req, motivo_clave, motivo_texto });
  if (!armado.avisa) return { avisado: false, razon: armado.razon };
  if (armado.error) {
    // Sin correo usable el aviso igual tiene que poder darse: se devuelve el
    // link de WhatsApp para que quien rechaza lo mande a mano.
    return { avisado: false, razon: armado.razon, wa: waDe(req) };
  }
  let email_id = null;
  try {
    const { aplicarModoPrueba } = require('./correo-guard');
    const mp = aplicarModoPrueba({ to: [armado.to], subject: armado.subject });
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: mp.to, subject: mp.subject, html: armado.html }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { avisado: false, razon: 'Resend rebotó el correo', detail: String(data && data.message || resp.status).slice(0, 200), wa: waDe(req) };
    email_id = data && data.id ? String(data.id) : null;
  } catch (e) {
    return { avisado: false, razon: 'No se pudo mandar el correo', detail: String(e.message).slice(0, 200), wa: waDe(req) };
  }
  let sello_ok = true;
  try {
    const r = await fetch(`${KH_URL}/rest/v1/requisiciones?id=eq.${req.id}`, {
      method: 'PATCH',
      headers: { apikey: KH_KEY, Authorization: `Bearer ${KH_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ aviso_at: new Date().toISOString(), aviso_email_id: email_id }),
    });
    sello_ok = r.ok;
  } catch (_) { sello_ok = false; }
  return { avisado: true, to: armado.to, email_id, sello_ok, catalogo_ok: armado.catalogo_ok };
}

// El link de WhatsApp para cuando el correo no se pudo (o no hay correo):
// quien rechaza igual tiene por dónde avisarle, en un clic.
function waDe(req) {
  const cel = String(req && req.celular || '').replace(/\D/g, '');
  if (cel.length !== 10) return null;
  const artista = String((req && req.evento_nombre) || 'tu evento').trim();
  const txt = encodeURIComponent(`Hola ${String(req.nombre || '').trim().split(/\s+/)[0] || ''}, te escribimos de Conecta Reynosa`
    + (req.folio ? ` por tu solicitud ${req.folio}` : '') + ` de ${artista}. `
    + (req.motivo_rechazo ? String(req.motivo_rechazo) : 'No pudimos confirmar tu lugar.')
    + ' Tu pago queda a tu favor: dinos qué zona o fecha prefieres y lo aplicamos ahí.');
  return `https://wa.me/52${cel}?text=${txt}`;
}

module.exports = { MOTIVOS, CLAVES, motivoDe, avisaCon, renderRechazo, armarRechazo, avisarRechazo, waDe, FROM, SITIO };

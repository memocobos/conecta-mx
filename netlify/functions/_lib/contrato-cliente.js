// =============================================================================
// _lib/contrato-cliente — CONTRATO-CLIENTE-1 (27-oct-2026): EL CONTRATO DEL
// CLIENTE, por viajero.
// =============================================================================
// Palabra de Memo: «el contrato es ya de una vez para que ya les esté llegando
// a todos los que separen por la página o que Bulma o Milk metan manualmente…
// ya es FUNDAMENTAL». Texto con punto final de Memo el mismo día
// (CONTRATO-CLIENTE-BORRADOR.md, privado): posposición sin reembolso (solo
// traspaso) · cláusula del viaje se queda · menores: firma mamá, papá o tutor ·
// anexo de preventa tal cual.
//
// Este lib es el DUEÑO de tres cosas:
//   1. EL TEXTO (`clausulas`/`renderContratoHTML`): vive aquí y SOLO aquí; la
//      página de firma lo pide al servidor — una segunda copia en el HTML sería
//      la lista que todavía no diverge.
//   2. LA FOTO de lo que se firma (`armarDatos`): nombre, evento, paquete,
//      zona, total, pagado (lo cuenta `saldoMigrado`, el dueño del dinero).
//   3. LA EMISIÓN (`emitirContratos`): crea o refresca el contrato vivo del
//      viajero y manda UN correo por dirección con el/los link(s) de firma.
//
// 🔒 Jamás lanza: devuelve un resumen. El contrato es consecuencia del dinero,
//    nunca su condición (la ley del correo único).
// 🔒 No nace para: staff/creadoras (tipo_viajero ≠ cliente), filas sin total,
//    ni la PREVENTA A CIEGAS (zona «Preventa a ciegas»: decisión B de Memo del
//    20-oct — el contrato nace cuando hay paquete real; ahí llega por «Elegir
//    paquete»).
// 🔒 Firmado no se toca: si el total cambió después de firmar, se DICE
//    (aviso) y no se reescribe un documento firmado.
// =============================================================================

const crypto = require('crypto');

// 🔒 [CONTRATO-CLIENTE-1b] INTERRUPTOR — APAGADO (27-oct-2026). Palabra de
// Memo: con un selector «¿quién firma?» cualquiera dice «soy su mamá» y nos
// falsifican. La firma se muda al PORTAL: edad del perfil (fecha de nacimiento
// obligatoria) decide titular vs tutor, con INE obligatoria. Mientras eso no
// exista, NO nace ni sale ningún contrato. Medido al apagar: 0 filas en
// contratos_cliente (ninguno salió).
// ⚠️ La variable CONTRATO_CLIENTE_ARNES existe SOLO para que el careo mida el
// camino encendido; producción jamás la define (verlo en Netlify si hay duda).
const CONTRATO_CLIENTE_VIVO = process.env.CONTRATO_CLIENTE_ARNES === '1';
const VERSION_TEXTO = 'CC-2 · 27-oct-2026';
const FROM = 'Conecta Reynosa <admin@conectareynosa.mx>';
const SITIO = 'https://conectareynosa.mx';
// [CONTRATO-CLIENTE-2] La firma vive en el Portal: el link lleva ahí, no a una
// página pública con token (esa se retiró — ver portal-contrato).
const PORTAL_FIRMA = SITIO + '/portal';
const ZONA_PREVENTA = 'preventa a ciegas';
const PAQ_TXT = { plus: 'PLUS', stay: 'STAY', ride: 'RIDE', cheap: 'CHEAP' };

const baseSlug = (id) => String(id || '').split('#')[0];
const mxn = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const llaveCorreo = (c) => {
  const k = String(c || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(k) ? k : null;
};
const nuevoToken = () => crypto.randomBytes(24).toString('hex'); // 48 hex — el CHECK de la tabla

// ── PURO: años cumplidos en `hoyISO` (fechas YYYY-MM-DD, sin husos: se
// comparan como texto de calendario). null si no hay fecha.
function edadEn(fechaNac, hoyISO) {
  const m = String(fechaNac || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const n = String(hoyISO || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || !n) return null;
  let e = +n[1] - +m[1];
  if (n[2] + n[3] < m[2] + m[3]) e--;
  return e;
}

// ¿Esta fila puede tener contrato de cliente? (razón en texto si no)
function motivoSinContrato(v) {
  if (!v) return 'viajero no encontrado';
  const tipo = String(v.tipo_viajero || '').toLowerCase();
  if (tipo && tipo !== 'cliente') return 'no es cliente (' + tipo + ')';
  if (!(Number(v.total_contrato) > 0)) return 'sin total de contrato';
  const z = String(v.zona_boleto || '').trim().toLowerCase();
  if (z === ZONA_PREVENTA) return 'preventa a ciegas: el contrato nace al elegir paquete';
  if (Number(v.boletos) === 0 && !v.zona_boleto && String(v.tipo_paquete || '').toLowerCase() !== 'ride') return 'baja (sin boletos)';
  return null;
}

// «Qué incluye»: la MISMA regla que pinta la ficha del sitio (index, selPaquete).
function incluyeDe(ev, paq) {
  const inc = Array.isArray(ev && ev.inc) ? ev.inc.slice() : [];
  const l = (s) => String(s).toLowerCase();
  if (inc.length) {
    if (paq === 'ride') return ev.noHotel ? inc.filter((i) => l(i).indexOf('hospedaje') < 0 && l(i).indexOf('hotel') < 0) : inc.filter((i) => l(i).indexOf('boleto') < 0);
    if (paq === 'stay') return inc.filter((i) => l(i).indexOf('transporte') < 0 && l(i).indexOf('traslado') < 0);
    if (paq === 'cheap') return inc.filter((i) => l(i).indexOf('transporte') < 0 && l(i).indexOf('traslado') < 0 && l(i).indexOf('hospedaje') < 0 && l(i).indexOf('hotel') < 0);
    return inc;
  }
  if (paq === 'plus') return ['Transporte', 'Hospedaje', 'Boleto zona elegida', 'Kit Conecta'];
  if (paq === 'ride') return ['Transporte', 'Hospedaje', 'Kit Conecta (sin boleto)'];
  if (paq === 'stay') return ['Hospedaje', 'Boleto zona elegida', 'Kit Conecta'];
  return ['Boleto zona elegida', 'Kit Conecta'];
}

// Fecha legible de la fecha del viajero (multifecha slug#N → su lbl).
function fechaDe(ev, evento_id) {
  const m = String(evento_id || '').match(/#(\d+)$/);
  if (m && Array.isArray(ev.multifecha) && ev.multifecha[+m[1]]) {
    const f = ev.multifecha[+m[1]];
    return [f.lbl, String(ev.f || '').match(/\d{4}/) ? String(ev.f).match(/\d{4}/)[0] : ''].filter(Boolean).join(' ');
  }
  return String(ev.f || '').trim();
}

// ── PURO: la foto de lo que se firma ─────────────────────────────────────────
function armarDatos(v, ev, abonos, opts) {
  const { saldoMigrado } = require('./cuenta-evento');
  const s = saldoMigrado(v, abonos || []) || { total: Number(v.total_contrato) || 0, abonado: 0, resta: Number(v.total_contrato) || 0 };
  const paq = String(v.tipo_paquete || '').toLowerCase();
  return {
    nombre: String(v.nombre || '').trim(),
    correo: llaveCorreo(v.correo),
    celular: v.celular || null,
    evento: String(ev.a || ev.id),
    fecha: fechaDe(ev, v.evento_id),
    venue: String(ev.v || '').trim(),
    paquete: paq,
    paquete_txt: PAQ_TXT[paq] || paq.toUpperCase(),
    zona: v.zona_boleto || null,
    boletos: Number(v.boletos) || 1,
    total: s.total,
    pagado: s.abonado,
    saldo: s.resta,
    incluye: incluyeDe(ev, paq),
    con_transporte: paq === 'plus' || paq === 'ride',
    preventa: !!(opts && opts.preventa),
    folio: String(v.id || '').slice(0, 8).toUpperCase(),
  };
}

// ── PURO: EL TEXTO (punto final de Memo, 27-oct) ─────────────────────────────
function clausulas(d) {
  const c = [];
  c.push({ t: 'Qué incluye tu paquete', items: [
    'Tu paquete ' + d.paquete_txt + ' incluye: <b>' + (d.incluye || []).map(esc).join(' · ') + '</b>.',
    'Lo que no esté listado aquí no forma parte del servicio.',
  ] });
  c.push({ t: 'Pagos', items: [
    'El saldo se cubre en abonos. <b>Quince días antes del evento el total debe estar liquidado</b>' + (d.paquete === 'plus' ? ' (en PLUS, a 15 días el separo equivale al 50% del total)' : '') + '.',
    'Con <b>2 quincenas vencidas</b> tu lugar queda <b>congelado y en riesgo de baja</b>. Con <b>3 o más</b>, queda <b>en proceso de baja</b>: el lugar se libera y los abonos no son reembolsables, salvo cancelación del evento.',
  ] });
  c.push({ t: 'Cancelaciones y posposiciones', items: [
    '<b>Si tú cancelas o dejas de pagar: no hay reembolso.</b>',
    '<b>Si el evento se cancela oficialmente, te devolvemos todo lo que pagaste del viaje</b> — separo y abonos completos — pero no el cargo de tarjeta u OXXO, porque ese cobro es de la empresa que procesa el pago, no de Conecta.',
    'Si el evento se <b>pospone</b>, tu lugar y tus pagos se mueven a la fecha nueva <b>y no hay reembolso</b>. Si no puedes ir en la fecha nueva, tu única opción es <b>transferir tu lugar</b> a otra persona (cláusula de cambios). El único caso con reembolso es la cancelación oficial del evento.',
  ] });
  c.push({ t: 'Menores de edad', items: [
    'Si el viajero es menor de edad, este contrato lo firma su <b>mamá, papá o tutor</b>, con su INE, y acepta todas sus cláusulas en nombre del menor. Quién firma lo determina la fecha de nacimiento del viajero.',
  ] });
  c.push({ t: 'Cambios y transferencias', items: [
    'No se puede cambiar de paquete ni de tour una vez reservado.',
    'Tu lugar es <b>transferible a otra persona sin costo hasta 6 días antes</b> del evento. Del día 5 en adelante aplica un cargo por servicio de $350.',
  ] });
  c.push({ t: 'Cargos al pagar', items: [
    'Al pagar en línea se suma <b>4% con débito u OXXO y 5% con crédito</b>: ese cobro es del procesador de pago, no de Conecta, y <b>no es reembolsable</b>.',
    'Un <b>error en depósito</b> (cuenta o referencia equivocada) genera un cargo de $350.',
  ] });
  const bol = d.paquete === 'cheap' ? 'Tu boleto se entrega <b>en la semana previa</b> al evento.'
    : d.paquete === 'ride' ? 'Tu paquete RIDE <b>no incluye boleto</b>.'
      : 'Tu boleto se entrega según el itinerario del evento.';
  c.push({ t: 'Tu boleto', items: [bol] });
  const viaje = [];
  if (d.con_transporte) viaje.push('Preséntate en el punto de reunión a la hora del itinerario publicado. El transporte no espera a quien no llega.');
  viaje.push('Conecta no se hace responsable de objetos personales durante el viaje ni dentro del evento.');
  c.push({ t: 'El viaje', items: viaje });
  c.push({ t: 'Tus datos', items: [
    'Los datos que nos diste (nombre, contacto, talla, contacto de emergencia) se usan solo para operar tu viaje.',
  ] });
  if (d.preventa) {
    c.push({ t: 'Anexo · Preventa a ciegas', anexo: true, items: [
      'Tu separo de <b>$300</b> de la preventa <b>cuenta como abono</b> a este contrato.',
      'Como beneficio de la preventa tienes <b>$300 de descuento para una segunda persona en el mismo viaje, o para otro tour de 2027</b>.',
      'Elegiste tu zona con prioridad; si la zona que pediste ya no tiene lugar al cargar el pedido, te ofrecemos otra zona del mismo precio o una distinta con su diferencia.',
    ] });
  }
  return c;
}

// HTML del cuerpo del contrato (lo pinta la página de firma tal cual).
function renderContratoHTML(d) {
  const fila = (a, b) => `<div class="meta-row"><span class="lbl">${esc(a)}</span><span class="val">${b}</span></div>`;
  const meta = '<div class="doc-meta">'
    + fila('Cliente', esc(d.nombre) + (d.celular ? ' · ' + esc(d.celular) : '') + (d.correo ? ' · ' + esc(d.correo) : ''))
    + fila('Evento', esc([d.evento, d.fecha, d.venue].filter(Boolean).join(' · ')))
    + fila('Paquete', esc(d.paquete_txt) + (d.zona ? ' · Zona ' + esc(d.zona) : '') + (d.boletos > 1 ? ' · ' + d.boletos + ' lugares' : ''))
    + fila('Total', '<b>' + mxn(d.total) + ' MXN</b> · Pagado ' + mxn(d.pagado) + ' · Saldo ' + mxn(Math.max(0, d.saldo)))
    + fila('Folio', esc(d.folio))
    + '</div>';
  let n = 0;
  const cuerpo = clausulas(d).map((cl) => {
    const num = cl.anexo ? 'A' : String(++n);
    return `<section class="clausula${cl.anexo ? ' anexo' : ''}"><h2><span class="num">${num}</span>${esc(cl.t)}</h2>`
      + cl.items.map((p) => `<p>${p}</p>`).join('') + '</section>';
  }).join('');
  return meta + cuerpo;
}

// ── EL CORREO (uno por dirección, con todos sus links) ───────────────────────
function renderCorreo({ correo, ev, contratos, recordatorio }) {
  const artista = String(ev.a || ev.id);
  const primer = (String((contratos[0] && contratos[0].nombre) || '').trim().split(/\s+/)[0]) || 'Hola';
  const varios = contratos.length > 1;
  // [CTR-RECUERDA-1] El recordatorio es el MISMO correo con otro arranque: el
  // camino (Portal + fecha + INE) no cambia, solo se dice que falta.
  const subject = recordatorio ? `Recordatorio: te falta firmar tu contrato · ${artista}` : `Firma tu contrato de viaje · ${artista}`;
  const titulo = recordatorio ? `${esc(primer)}, te falta firmar tu contrato` : `${esc(primer)}, firma tu contrato de viaje`;
  const arranque = recordatorio
    ? `Te recordamos que tu contrato para <b style="color:#e8ff4c">${esc(artista)}</b>${ev.f ? ' (' + esc(ev.f) + ')' : ''} <b>sigue sin firmar</b>. Se firma dentro de tu <b>Portal</b>: entra (o regístrate) con <b>este mismo correo</b> (<span style="color:#e8ff4c">${esc(correo)}</span>).`
    : `Tu contrato para <b style="color:#e8ff4c">${esc(artista)}</b>${ev.f ? ' (' + esc(ev.f) + ')' : ''} ya está listo. Se firma dentro de tu <b>Portal</b>: entra (o regístrate) con <b>este mismo correo</b> (<span style="color:#e8ff4c">${esc(correo)}</span>).`;
  const quienes = varios ? `<p style="margin:0 0 14px;color:#ffffff">Contratos por firmar: <b>${contratos.map((c) => esc(c.nombre)).join(', ')}</b>.</p>` : '';
  const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#000000;color:#ffffff">
        <div style="background:#e8ff4c;color:#000000;padding:18px 22px;border-bottom:4px solid #ff283b">
          <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#000000">Conecta Reynosa · ${esc(artista)}</div>
          <div style="font-size:24px;font-weight:900;margin-top:4px;color:#000000">${titulo}</div>
        </div>
        <div style="padding:22px;font-size:15px;line-height:1.6;color:#ffffff">
          <p style="margin:0 0 14px;color:#ffffff">${arranque}</p>
          ${quienes}
          <p style="margin:0 0 20px;color:#ffffff">Para firmar vas a necesitar la <b>fecha de nacimiento</b> del viajero y una foto de la <b>INE</b> (frente y reverso) de quien firma. Si el viajero es menor de edad, firma su mamá, papá o tutor con su propia INE.</p>
          <p style="margin:0 0 12px;text-align:center"><a href="${PORTAL_FIRMA}" style="display:inline-block;background:#e8ff4c;color:#000000;font-weight:800;text-decoration:none;padding:14px 26px;border-radius:8px;font-size:15px">Entrar a mi Portal y firmar →</a></p>
          <p style="margin:18px 0 0;font-size:13px;color:#b3b3b3">¿Dudas? Escríbenos por WhatsApp al 81 1977 1072.</p>
        </div>
      </div>`;
  return { to: correo, subject, html };
}

// ── LA EMISIÓN ───────────────────────────────────────────────────────────────
// viajeroIds: a quién. opts.preventa: viene de «Elegir paquete». opts.enviar:
// false = solo crear/refrescar sin correo. opts.reenviar: manda aunque ya se haya
// enviado antes. Devuelve { ok, creados, refrescados, ya_firmados, enviados,
// sin_correo, saltados:[{id,motivo}], links:[{id,nombre,url}], errores, aviso }.
async function emitirContratos({ viajeroIds, creado_por, preventa, enviar = true, reenviar = false, recordatorio = false, KH_URL, KH_KEY }) {
  const out = { ok: true, creados: 0, refrescados: 0, ya_firmados: 0, enviados: [], sin_correo: [], saltados: [], links: [], errores: [], aviso: null };
  if (!CONTRATO_CLIENTE_VIVO) return Object.assign(out, { apagado: true });
  try {
    const ids = (viajeroIds || []).filter((x) => /^[0-9a-f-]{36}$/i.test(String(x)));
    if (!ids.length) return Object.assign(out, { ok: false, aviso: 'sin viajeros' });
    if (!KH_URL || !KH_KEY) return Object.assign(out, { ok: false, aviso: 'faltan llaves de KameHouse' });
    const h = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
    const hj = Object.assign({}, h, { 'Content-Type': 'application/json', Prefer: 'return=representation' });
    const lista = ids.map((x) => '"' + x + '"').join(',');
    const vR = await fetch(`${KH_URL}/rest/v1/viajeros_evento?id=in.(${encodeURIComponent(lista)})&select=id,evento_id,nombre,correo,celular,tipo_paquete,tipo_viajero,zona_boleto,boletos,total_contrato,abonado_previo`, { headers: h });
    if (!vR.ok) return Object.assign(out, { ok: false, aviso: 'no pude leer los viajeros: el contrato no se emitió' });
    const vs = await vR.json();
    const aR = await fetch(`${KH_URL}/rest/v1/abonos_viajero?viajero_id=in.(${encodeURIComponent(lista)})&select=viajero_id,monto&limit=5000`, { headers: h });
    if (!aR.ok) return Object.assign(out, { ok: false, aviso: 'no pude leer los abonos: el contrato no se emitió' });
    const porV = {};
    (await aR.json()).forEach((a) => { (porV[a.viajero_id] = porV[a.viajero_id] || []).push(a); });
    const cR = await fetch(`${KH_URL}/rest/v1/contratos_cliente?viajero_id=in.(${encodeURIComponent(lista)})&estado=neq.anulado&select=id,viajero_id,token,estado,datos,envios`, { headers: h });
    if (!cR.ok) return Object.assign(out, { ok: false, aviso: 'no pude leer la tabla de contratos (¿falta el acta CONTRATO-CLIENTE-1?)' });
    const vivos = {};
    (await cR.json()).forEach((c) => { vivos[c.viajero_id] = c; });
    const { fetchEventosRaw } = require('./catalogo-index');
    const EV = await fetchEventosRaw();
    if (!Array.isArray(EV)) return Object.assign(out, { ok: false, aviso: 'no pude leer el catálogo: no se emite un contrato sin decir a qué viaje' });

    const porCorreo = new Map(); // correo → { ev, contratos:[{id,token,nombre}] }
    for (const v of vs) {
      const mot = motivoSinContrato(v);
      if (mot) { out.saltados.push({ id: v.id, nombre: v.nombre, motivo: mot }); continue; }
      const ev = EV.find((e) => e && e.id === baseSlug(v.evento_id));
      if (!ev) { out.saltados.push({ id: v.id, nombre: v.nombre, motivo: 'evento no está en el catálogo' }); continue; }
      const previo = vivos[v.id];
      const datos = armarDatos(v, ev, porV[v.id], { preventa: preventa || (previo && previo.datos && previo.datos.preventa) });
      let fila = previo;
      if (previo && previo.estado === 'firmado') {
        out.ya_firmados++;
        if (Number(previo.datos && previo.datos.total) !== Number(datos.total)) {
          out.errores.push({ id: v.id, nombre: v.nombre, aviso: `ya FIRMÓ con total ${mxn(previo.datos.total)} y hoy el total es ${mxn(datos.total)}: un contrato firmado no se reescribe — si el cambio es real, anula y emite uno nuevo` });
        }
        out.links.push({ id: v.id, nombre: v.nombre, url: PORTAL_FIRMA, estado: 'firmado' });
        continue;
      } else if (previo) {
        const pR = await fetch(`${KH_URL}/rest/v1/contratos_cliente?id=eq.${previo.id}&estado=eq.pendiente`, {
          method: 'PATCH', headers: hj, body: JSON.stringify({ datos, version_texto: VERSION_TEXTO, correo: datos.correo }) });
        const pa = pR.ok ? await pR.json().catch(() => []) : [];
        if (!pR.ok || !pa.length) { out.errores.push({ id: v.id, nombre: v.nombre, aviso: 'no pude refrescar su contrato pendiente' }); continue; }
        fila = pa[0]; out.refrescados++;
      } else {
        const iR = await fetch(`${KH_URL}/rest/v1/contratos_cliente`, {
          method: 'POST', headers: hj,
          body: JSON.stringify({ viajero_id: v.id, evento_id: v.evento_id, token: nuevoToken(), estado: 'pendiente', version_texto: VERSION_TEXTO, datos, correo: datos.correo, creado_por: creado_por || null }) });
        const ia = iR.ok ? await iR.json().catch(() => []) : [];
        if (!iR.ok || !ia.length) { out.errores.push({ id: v.id, nombre: v.nombre, aviso: 'no pude crear su contrato (' + iR.status + ')' }); continue; }
        fila = ia[0]; out.creados++;
      }
      const url = PORTAL_FIRMA;
      out.links.push({ id: v.id, nombre: v.nombre, url, estado: 'pendiente' });
      const yaEnviado = Number(fila.envios || (previo && previo.envios) || 0) > 0;
      if (!enviar || (yaEnviado && !reenviar)) continue;
      if (!datos.correo) { out.sin_correo.push({ id: v.id, nombre: v.nombre, url }); continue; }
      if (!porCorreo.has(datos.correo)) porCorreo.set(datos.correo, { ev, contratos: [] });
      porCorreo.get(datos.correo).contratos.push({ id: fila.id, token: fila.token, nombre: v.nombre, envios: Number(fila.envios || 0) });
    }

    if (porCorreo.size) {
      const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
      if (!RESEND_KEY) {
        out.aviso = 'Falta RESEND_API_KEY: los contratos quedaron creados pero NO se mandó correo (comparte el link por WhatsApp).';
      } else {
        const { aplicarModoPrueba } = require('./correo-guard');
        for (const [correo, g] of porCorreo) {
          const r = renderCorreo({ correo, ev: g.ev, contratos: g.contratos, recordatorio });
          const mp = aplicarModoPrueba({ to: [r.to], subject: r.subject });
          let resp, data = {};
          try {
            resp = await fetch('https://api.resend.com/emails', {
              method: 'POST', headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({ from: FROM, to: mp.to, subject: mp.subject, html: r.html }) });
            data = await resp.json().catch(() => ({}));
          } catch (e) { out.errores.push({ correo, aviso: 'el correo no salió: ' + e.message }); continue; }
          if (!resp.ok) { out.errores.push({ correo, aviso: 'Resend rechazó el correo (' + resp.status + ')' }); continue; }
          // Sello DESPUÉS del envío (si el sello falla, el correo ya salió y se dice).
          for (const c of g.contratos) {
            const sR = await fetch(`${KH_URL}/rest/v1/contratos_cliente?id=eq.${c.id}`, {
              method: 'PATCH', headers: hj, body: JSON.stringify({ enviado_at: new Date().toISOString(), envios: c.envios + 1 }) });
            if (!sR.ok) out.errores.push({ correo, aviso: 'el correo SÍ salió pero no quedó sellado como enviado' });
          }
          out.enviados.push(correo);
        }
      }
    }
    out.ok = out.errores.length === 0;
    return out;
  } catch (e) {
    return Object.assign(out, { ok: false, aviso: 'El contrato falló: ' + e.message + ' — el dinero SÍ quedó registrado.' });
  }
}

// ── [CTR-RECUERDA-1 · 27-oct-2026] EL RECORDATORIO DE FIRMA ─────────────────
// Palabra de Memo: «los que faltan por firmar para estarles recordando cada
// cierto tiempo» → «así ármalo». UN dueño de «¿a éste le toca recordatorio?»,
// lo preguntan el botón de KameHouse y el cron. Nada sale con el contrato
// apagado (CONTRATO_CLIENTE_VIVO) y el cron además tiene su PROPIO interruptor.
// ⏳ Cadencia y tope son PROPUESTA (3 días · 5 avisos en total): los firma Memo
// al encender, igual que el texto (se ve en el ensayo en seco).
const RECORDATORIO_CADA_DIAS = 3;
const RECORDATORIO_TOPE = 5;          // avisos TOTALES (el primero cuenta)
const RECORDATORIO_MANUAL_HORAS = 20; // el botón: anti doble clic, no cadencia
const RECORDATORIO_AUTO_VIVO = false; // el cron · ENCENDER = palabra de Memo

const hoyReynosa = (ms) => new Date(ms == null ? Date.now() : ms).toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });

// La fecha (YYYY-MM-DD) del viaje de ESA fila: la de su fecha en multifecha,
// si no la del evento. null si el catálogo no la dice.
function dsDeViajero(ev, evento_id) {
  if (!ev) return null;
  const m = String(evento_id || '').match(/#(\d+)$/);
  const f = m && Array.isArray(ev.multifecha) ? ev.multifecha[+m[1]] : null;
  const ds = String((f && f.ds) || ev.ds || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ds) ? ds : null;
}

// PURO. null = le toca; si no, el MOTIVO en palabras (se enseña tal cual).
// modo 'auto' (cron): cadencia + tope. modo 'manual' (botón): solo el freno de
// horas — quien aprieta decide, pero un 2º clic no manda dos correos.
function motivoNoRecordar(c, ds, ahoraMs, modo) {
  if (!c) return 'sin contrato';
  if (c.estado !== 'pendiente') return c.estado === 'firmado' ? 'ya firmó' : 'contrato ' + c.estado;
  const hoy = hoyReynosa(ahoraMs);
  if (ds && ds < hoy) return 'el evento ya pasó';
  const envios = Number(c.envios) || 0;
  if (!envios) return 'nunca se le mandó el contrato: usa «Enviar», no recordatorio';
  const desde = Date.parse(c.enviado_at || '') || 0;
  const horas = desde ? (ahoraMs - desde) / 36e5 : Infinity;
  if (modo === 'auto') {
    if (envios >= RECORDATORIO_TOPE) return `ya lleva ${envios} avisos (tope ${RECORDATORIO_TOPE}): toca WhatsApp`;
    if (horas < RECORDATORIO_CADA_DIAS * 24) return `se le avisó hace menos de ${RECORDATORIO_CADA_DIAS} días`;
  } else if (horas < RECORDATORIO_MANUAL_HORAS) {
    return `se le avisó hace ${Math.max(0, Math.round(horas))} h`;
  }
  return null;
}

module.exports = {
  RECORDATORIO_CADA_DIAS, RECORDATORIO_TOPE, RECORDATORIO_MANUAL_HORAS, RECORDATORIO_AUTO_VIVO,
  motivoNoRecordar, dsDeViajero, hoyReynosa,
  emitirContratos, armarDatos, clausulas, renderContratoHTML, renderCorreo, motivoSinContrato, incluyeDe,
  VERSION_TEXTO, ZONA_PREVENTA, SITIO, PORTAL_FIRMA, CONTRATO_CLIENTE_VIVO, edadEn, _esc: esc,
};

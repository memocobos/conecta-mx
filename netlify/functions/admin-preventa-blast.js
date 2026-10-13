// =============================================================================
// admin-preventa-blast — PN27 · EL BLAST DE LA PREVENTA A CIEGAS (14-oct-2026)
//
// Palabra de Memo: «quiero usar TODOS los correos que tengamos… atacar con
// todo» + «tú me vas diciendo cada tanto para ir enviando». Eso es: el censo
// vive en la tabla `preventa_blast` de KH (sembrada por Jane con acta en
// migraciones/PN27-BLAST.sql: viajeros + waitlist-no-palnorte; el giveaway lo
// siembra la acción de aquí porque vive en la OTRA base), y el envío sale POR
// TANDAS desde la herramienta del Palacio — un humano aprieta, nada automático.
//
// 🔒 LAS CUATRO PUERTAS (la forma de MIG-1d-ii, que es la ley del correo real):
//   1. SOLO maestro_roshi. CORREOS_MODO está en 'real': el primer clic escribe
//      a gente de verdad. Esta pluma es de Memo.
//   2. `enviar` exige confirmar:true — sin él, 400 con cero envíos.
//   3. TOPE por llamada (≤30) + presupuesto de reloj (8 s): una function de
//      Netlify no vive para siempre; la pantalla orquesta las tandas en bucle
//      (la forma de khExcelRecorrer) y la BITÁCORA evita repetir.
//   4. EL CORREO NO SALE SI EL SITIO NO HONRA LA PROMESA (la ley de
//      CONSUELO-VERDAD-1): antes de ensayar o mandar se lee el catálogo
//      SERVIDO y se exige palnorte VIVO con «Preventa a ciegas» a $300 y
//      f:'Por confirmar'. Si el publish no ha pasado → 409 que lo dice.
//
// 🔒 La bitácora se asienta DESPUÉS de cada envío, fila por fila (asentar
//    antes marcaría como enviado a quien no recibió nada; si el asiento falla
//    se REPORTA, porque el correo ya salió y el siguiente clic lo repetiría).
// 🔒 La fecha del festival JAMÁS va en el correo: el render ni siquiera la
//    conoce — deriva el nombre del evento del catálogo y el resto es el copy
//    firmado de Memo («Aparta tu lugar en menos de 60 segundos», su cambio).
// 🔒 Línea de BAJA al pie: a esta escala (~2,000) es higiene de dominio — el
//    mismo dominio manda la cobranza, y quemarlo cuesta dinero de verdad.
//
// Body JSON: { accion, ... }
//   - 'estado'            → conteos por fuente/caliente/enviado + pendientes.
//   - 'sembrar_giveaway'  { confirmar:true } → trae del PORTAL los correos del
//                           giveaway (vivos) + melanie (bkp) que falten. Re-corrible.
//   - 'seco'              → { html, asunto, pendientes, muestra } — NO manda.
//   - 'enviar'            { tope?≤30, confirmar:true } → manda la siguiente
//                           rebanada (calientes primero), marca bitácora,
//                           contesta { enviados, errores, restantes }.
//
// Env (todas existen ya): SUPABASE_URL_KAMEHOUSE, SUPABASE_SERVICE_KEY_KAMEHOUSE,
// PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_KEY, RESEND_API_KEY|RESEND_KEY,
// RESEND_FROM_ROL, JWT_SECRET. Cero variables nuevas.
// =============================================================================

const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { aplicarModoPrueba } = require('./_lib/correo-guard');

const ROLES = ['maestro_roshi'];
const CAMPANA = 'pn27';
const TOPE_MAX = 30;
const PAUSA_MS = 550;            // el ritmo de Resend (mismo que waitlist-core)
const ESPERA_429_MS = PAUSA_MS * 4;
const PRESUPUESTO_MS = 8000;     // la function de Netlify vive 10 s

const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
const FROM = process.env.RESEND_FROM_ROL || 'Conecta Reynosa <admin@conectareynosa.mx>';
const LINK = 'https://www.conectareynosa.mx/palnorte27';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ── El candado del sitio servido (CONSUELO-VERDAD): la promesa, verificada ──
async function sitioHonraLaPreventa() {
  const { fetchEventosRaw } = require('./_lib/catalogo-index');
  const EV = await fetchEventosRaw();
  const ev = Array.isArray(EV) ? EV.find((x) => x && x.id === 'palnorte') : null;
  if (!ev) return { ok: false, motivo: 'palnorte no está en el catálogo servido' };
  if (ev.st) return { ok: false, motivo: `palnorte sigue en '${ev.st}' en el sitio — falta el publish desde Esferas` };
  const zonas = [].concat(ev.zonas || [], ev.cheapZonas || []);
  const z = zonas.find((x) => x && x.n === 'Preventa a ciegas');
  if (!z || Number(z.p) !== 300 || z.ag) return { ok: false, motivo: 'el sitio servido no vende «Preventa a ciegas» a $300 — publica desde Esferas antes de mandar' };
  if (ev.f !== 'Por confirmar') return { ok: false, motivo: `la tarjeta anuncia '${ev.f}' — el correo no sale mientras el sitio diga una fecha que no se puede publicar` };
  return { ok: true, nombre: ev.a || 'Tecate Pa´l Norte 2027' };
}

// ── El correo: el COPY DE MEMO, copiado — con su cambio firmado («Aparta…») ──
function renderCorreo(nombre, eventoNombre) {
  const hola = nombre ? `¡Hola ${esc(String(nombre).split(' ')[0])}!` : '¡Hola!';
  const beneficios = [
    ['🎟️', 'Costo preferencial en nuestra fase más baja'],
    ['🧢', 'Gorra conmemorativa Pa’l Norte x Conecta MX'],
    ['🎫', 'Gafete + boleto laminado conmemorativo'],
    ['📅', 'Prioridad para elegir viaje de 1, 2 o 3 días'],
    ['🔥', 'Descuento especial para una segunda persona o para otro tour durante 2027'],
  ].map(([e, t]) => `<tr><td style="padding:4px 8px 4px 0;font-size:16px">${e}</td><td style="padding:4px 0;font-size:14px;color:#fff;line-height:1.5">${esc(t)}</td></tr>`).join('');
  return `
  <div style="background:#000;padding:28px 16px;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#0d0d0d;border:1px solid #222;border-radius:14px;padding:26px 22px">
      <div style="font-size:13px;color:#e8ff4c;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">Preventa a ciegas</div>
      <div style="font-size:24px;font-weight:900;color:#fff;line-height:1.2;margin-bottom:14px">🔥 PA’L NORTE 2027<br>EMPIEZA DESDE HOY.</div>
      <div style="font-size:14px;color:rgba(255,255,255,.85);line-height:1.6;margin-bottom:6px">${hola}</div>
      <div style="font-size:14px;color:rgba(255,255,255,.85);line-height:1.6;margin-bottom:14px">
        Arranca nuestra <b style="color:#fff">PREVENTA A CIEGAS</b> para <b style="color:#fff">${esc(eventoNombre)}</b>.<br>
        Separa tu paquete con solo <b style="color:#e8ff4c;font-size:17px">$300</b>.
      </div>
      <div style="font-size:12px;color:#e8ff4c;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">Beneficios especiales</div>
      <table style="border-collapse:collapse;margin-bottom:16px">${beneficios}</table>
      <div style="font-size:14px;color:rgba(255,255,255,.85);line-height:1.6;margin-bottom:18px">
        No sabemos todavía quién va a tocar…<br>
        pero sí sabemos dónde vamos a estar cuando vuelva a rugir el león. 🦁🔥
      </div>
      <a href="${LINK}" style="display:block;text-align:center;background:#e8ff4c;color:#000;font-weight:900;font-size:15px;letter-spacing:.05em;text-transform:uppercase;padding:14px;border-radius:10px;text-decoration:none;margin-bottom:10px">Aparta tu lugar en menos de 60 segundos</a>
      <div style="text-align:center;font-size:12px;color:rgba(255,255,255,.6);margin-bottom:18px">${LINK.replace('https://', '')}</div>
      <div style="font-size:13px;color:rgba(255,255,255,.75);text-align:center;margin-bottom:16px">¡Ya te la sabes! <b>#ViajaConExpertos</b></div>
      <div style="border-top:1px solid #222;padding-top:12px;font-size:11px;color:rgba(255,255,255,.4);line-height:1.5">
        Recibes este correo porque has viajado con Conecta Reynosa o te registraste en nuestras dinámicas.
        ¿No quieres recibir promociones? Responde <b>BAJA</b> a este correo y te quitamos de la lista.
      </div>
    </div>
  </div>`;
}
const ASUNTO = '🔥 PA’L NORTE 2027 empieza desde HOY — aparta tu lugar con $300';
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

async function enviarCorreo(to, subject, html) {
  if (!RESEND_KEY) return { ok: false, status: 0, error: 'RESEND no configurado' };
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  const pegar = () => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  let res = await pegar();
  if (res.status === 429) { await dormir(ESPERA_429_MS); res = await pegar(); }
  return { ok: res.ok, status: res.status };
}

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin', 'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return j(405, headers, { error: 'Method not allowed' });
  if (!__origin) return j(403, headers, { error: 'Origen no permitido' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return j(400, headers, { error: 'JSON inválido' }); }
  const accion = String(body.accion || '');
  if (!['estado', 'sembrar_giveaway', 'seco', 'enviar'].includes(accion)) return j(400, headers, { error: 'accion inválida' });

  const auth = await verifyAdminAuthLive(event, ROLES);
  if (!auth.valid) return j(auth.status, headers, { error: auth.error });

  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_URL || !KH_KEY) return j(500, headers, { error: 'Faltan env vars de KH' });
  const khH = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY, 'Content-Type': 'application/json' };
  const BL = `${KH_URL}/rest/v1/preventa_blast`;

  // 🔒 SIN BITÁCORA NO SE MANDA NADA (la ley de MIG-1d-ii): si la tabla no
  // existe, 502 con instrucción — «no sé a quién ya le mandé» no es «a nadie».
  const sonda = await fetch(`${BL}?select=id&limit=1`, { headers: khH });
  if (!sonda.ok) return j(502, headers, { error: 'La bitácora preventa_blast no contesta — ver migraciones/PN27-BLAST.sql', detail: await sonda.text() });

  try {
    // ── estado ────────────────────────────────────────────────────────────
    if (accion === 'estado') {
      const r = await fetch(`${BL}?select=fuente,caliente,enviado_at,error&campana=eq.${CAMPANA}&limit=10000`, { headers: khH });
      if (!r.ok) return j(502, headers, { error: 'KH rechazó la lectura', detail: await r.text() });
      const filas = await r.json();
      const t = { total: filas.length, enviados: 0, errores: 0, pendientes: 0, calientes_pendientes: 0, por_fuente: {} };
      for (const f of filas) {
        t.por_fuente[f.fuente] = (t.por_fuente[f.fuente] || 0) + 1;
        if (f.enviado_at) t.enviados++;
        else if (f.error) t.errores++;
        else { t.pendientes++; if (f.caliente) t.calientes_pendientes++; }
      }
      return j(200, headers, { ok: true, ...t });
    }

    // ── sembrar_giveaway (Portal → KH, re-corrible, dedup en memoria) ──────
    if (accion === 'sembrar_giveaway') {
      if (body.confirmar !== true) return j(400, headers, { error: 'La siembra pide confirmar:true' });
      const P_URL = process.env.PORTAL_SUPABASE_URL;
      const P_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;
      if (!P_URL || !P_KEY) return j(500, headers, { error: 'Faltan env vars del Portal' });
      const pH = { apikey: P_KEY, Authorization: 'Bearer ' + P_KEY };

      const [rG, rM, rEx, rWL, rStaff] = await Promise.all([
        fetch(`${P_URL}/rest/v1/giveaway_registros?select=correo,nombre&eliminado_at=is.null&limit=5000`, { headers: pH }),
        fetch(`${P_URL}/rest/v1/bkp_mel_giveaway_registros?select=correo,nombre&limit=5000`, { headers: pH }),
        fetch(`${BL}?select=correo&campana=eq.${CAMPANA}&limit=20000`, { headers: khH }),
        fetch(`${KH_URL}/rest/v1/eventos_waitlist?select=email&evento_id=like.palnorte*&limit=5000`, { headers: khH }),
        fetch(`${KH_URL}/rest/v1/usuarios?select=correo&limit=500`, { headers: khH }),
      ]);
      if (!rG.ok || !rM.ok || !rEx.ok || !rWL.ok || !rStaff.ok) return j(502, headers, { error: 'una de las lecturas de la siembra falló' });
      const ya = new Set((await rEx.json()).map((x) => x.correo));
      for (const w of await rWL.json()) if (w.email) ya.add(String(w.email).trim().toLowerCase()); // palnorte-waitlist: su canal es el aviso del publish
      for (const u of await rStaff.json()) if (u.correo) ya.add(String(u.correo).trim().toLowerCase());
      const nuevos = [];
      const meter = (lista, fuente) => {
        for (const g of lista) {
          const c = String(g.correo || '').trim().toLowerCase();
          if (!c || c.indexOf('@') < 1 || /\s/.test(c) || ya.has(c)) continue;
          ya.add(c);
          nuevos.push({ campana: CAMPANA, correo: c, nombre: g.nombre || null, fuente, caliente: false });
        }
      };
      meter(await rG.json(), 'giveaway');
      meter(await rM.json(), 'melanie');
      let insertados = 0;
      for (let i = 0; i < nuevos.length; i += 200) {
        const lote = nuevos.slice(i, i + 200);
        const r = await fetch(BL, { method: 'POST', headers: { ...khH, Prefer: 'return=minimal' }, body: JSON.stringify(lote) });
        if (!r.ok) return j(502, headers, { error: 'KH rechazó un lote de la siembra', detail: await r.text(), insertados });
        insertados += lote.length;
      }
      return j(200, headers, { ok: true, insertados, nota: insertados === 0 ? 'nada nuevo que sembrar (idempotente)' : undefined });
    }

    // ── seco / enviar comparten el candado del sitio ───────────────────────
    const sitio = await sitioHonraLaPreventa();
    if (!sitio.ok) return j(409, headers, { error: 'EL SITIO NO HONRA LA PROMESA TODAVÍA: ' + sitio.motivo });

    if (accion === 'seco') {
      const r = await fetch(`${BL}?select=correo,nombre,caliente&campana=eq.${CAMPANA}&enviado_at=is.null&error=is.null&order=caliente.desc,creado_at.asc&limit=3`, { headers: khH });
      const muestra = r.ok ? await r.json() : [];
      const quien = muestra[0] || { nombre: 'Lucero' };
      return j(200, headers, {
        ok: true, seco: true, asunto: ASUNTO,
        html: renderCorreo(quien.nombre, sitio.nombre),
        siguientes: muestra.map((m) => ({ correo: enmascarar(m.correo), caliente: m.caliente })),
      });
    }

    if (accion === 'enviar') {
      // 🔒 Dos gestos: sin confirmar:true no sale un correo (el peor caso de
      // un olvido es ver este 400, no un envío).
      if (body.confirmar !== true) return j(400, headers, { error: 'Enviar pide confirmar:true' });
      const tope = Math.min(Math.max(1, Math.floor(Number(body.tope || TOPE_MAX))), TOPE_MAX);
      const r = await fetch(`${BL}?select=id,correo,nombre,caliente&campana=eq.${CAMPANA}&enviado_at=is.null&error=is.null&order=caliente.desc,creado_at.asc&limit=${tope}`, { headers: khH });
      if (!r.ok) return j(502, headers, { error: 'KH rechazó la lectura de pendientes', detail: await r.text() });
      const cola = await r.json();
      const fin = Date.now() + PRESUPUESTO_MS;
      let enviados = 0, errores = 0; const avisos = [];
      for (const p of cola) {
        if (Date.now() > fin) break; // el presupuesto manda; la pantalla re-llama
        const res = await enviarCorreo(p.correo, ASUNTO, renderCorreo(p.nombre, sitio.nombre));
        // La bitácora DESPUÉS del envío, fila por fila (la ley de MIG-1d-ii).
        const marca = res.ok
          ? { enviado_at: new Date().toISOString(), resend_status: res.status }
          : { error: 'resend ' + (res.status || res.error || '?'), resend_status: res.status || null };
        const up = await fetch(`${BL}?id=eq.${p.id}`, { method: 'PATCH', headers: { ...khH, Prefer: 'return=minimal' }, body: JSON.stringify(marca) });
        if (!up.ok) avisos.push(`el asiento de ${enmascarar(p.correo)} falló — ese correo YA salió y el próximo clic lo repetiría`);
        if (res.ok) enviados++; else errores++;
        await dormir(PAUSA_MS);
      }
      const rr = await fetch(`${BL}?select=id&campana=eq.${CAMPANA}&enviado_at=is.null&error=is.null&limit=1&prefer=count=exact`, { headers: { ...khH, Prefer: 'count=exact' } });
      const restantes = rr.ok ? Number((rr.headers.get('content-range') || '/0').split('/')[1] || 0) : null;
      return j(200, headers, { ok: true, enviados, errores, restantes, avisos: avisos.length ? avisos : undefined });
    }

    return j(400, headers, { error: 'accion inválida' });
  } catch (e) {
    return j(500, headers, { error: 'Error interno', detail: e.message });
  }
};

function enmascarar(c) { const [u, d] = String(c || '').split('@'); return (u || '').slice(0, 3) + '…@' + (d || ''); }
function j(statusCode, headers, obj) { return { statusCode, headers, body: JSON.stringify(obj) }; }

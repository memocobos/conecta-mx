// =============================================================================
// admin-genkidama — GENKIDAMA-1 (13-oct-2026). El concentrado de correos y las
// campañas por tandas. Evolución del blast de PN27 (admin-preventa-blast): las
// mismas cuatro puertas, generalizadas a cualquier evento y cuatro plantillas.
//
// 🔒 LAS PUERTAS:
//   1. SOLO maestro_roshi (CORREOS_MODO 'real': la pluma es de Memo).
//   2. Toda escritura pide confirmar:true; ensayar (`seco`) no escribe nada.
//   3. ENERGÍA: el servidor no manda más que el límite diario (Genkidama +
//      blast PN27 suman, el dominio es uno). Tope 25 por llamada + 8 s de reloj.
//   4. EL SITIO HONRA LA PROMESA (CONSUELO-VERDAD): crear y CADA tanda vuelven
//      a leer el index servido — evento a la venta, código vivo y válido para
//      ese evento, slogan sin un monto distinto al del código. Si dejó de ser
//      cierto a media campaña, la tanda se rehúsa (409) y lo dice.
// 🔒 Un correo por persona por día: quien ya recibió un correo masivo HOY
//    (de cualquier campaña o del blast) espera a mañana.
// 🔒 Bitácora DESPUÉS de cada envío; nada se borra; la BAJA es baja_at.
//
// Body { accion, ... }:
//   estado · sembrar{confirmar} · bajas{correos[],confirmar} · energia{limite,confirmar}
//   seco{tipo,evento_id,fecha_idx,codigo,slogan} · crear{…,confirmar}
//   enviar{campana_id,tope,confirmar}
// =============================================================================
const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const { aplicarModoPrueba } = require('./_lib/correo-guard');
const G = require('./_lib/genkidama');

const ROLES = ['maestro_roshi'];
const TOPE_MAX = 25;
const PAUSA_MS = 550;
const PRESUPUESTO_MS = 8000;
const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
const FROM = process.env.RESEND_FROM_ROL || 'Conecta Reynosa <admin@conectareynosa.mx>';
const PRIORIDAD = { viajeros: 1, requisiciones: 1, 'preventa-blast': 2, waitlist: 2, portal: 2, giveaway: 3, melanie: 3 };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const limpio = (c) => { const s = String(c || '').trim().toLowerCase(); return (s.indexOf('@') > 0 && !/\s/.test(s) && /\.[a-z]{2,}$/.test(s)) ? s : null; };
function enmascarar(c) { const [u, d] = String(c || '').split('@'); return (u || '').slice(0, 3) + '…@' + (d || ''); }
function j(statusCode, headers, obj) { return { statusCode, headers, body: JSON.stringify(obj) }; }

async function enviarCorreo(to, subject, html) {
  if (!RESEND_KEY) return { ok: false, status: 0 };
  ({ to, subject } = aplicarModoPrueba({ to, subject }));
  const pegar = () => fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  let res = await pegar();
  if (res.status === 429) { await dormir(PAUSA_MS * 4); res = await pegar(); }
  return { ok: res.ok, status: res.status };
}

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = { 'Access-Control-Allow-Origin': __origin || 'null', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return j(405, headers, { error: 'Method not allowed' });
  if (!__origin) return j(403, headers, { error: 'Origen no permitido' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return j(400, headers, { error: 'JSON inválido' }); }
  const accion = String(body.accion || '');
  if (!['estado', 'sembrar', 'bajas', 'energia', 'seco', 'crear', 'enviar'].includes(accion)) return j(400, headers, { error: 'accion inválida' });
  const auth = await verifyAdminAuthLive(event, ROLES);
  if (!auth.valid) return j(auth.status, headers, { error: auth.error });
  const quien = (auth.user && (auth.user.correo || auth.user.nombre)) || null;

  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_URL || !KH_KEY) return j(500, headers, { error: 'Faltan env vars de KH' });
  const h = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY, 'Content-Type': 'application/json' };
  const R = (t) => `${KH_URL}/rest/v1/${t}`;
  const leer = async (url) => { const r = await fetch(url, { headers: h }); if (!r.ok) throw new Error('KH rechazó una lectura: ' + (await r.text()).slice(0, 160)); return r.json(); };

  try {
    // ── estado ───────────────────────────────────────────────────────────────
    if (accion === 'estado') {
      const [contactos, campanas, energia] = await Promise.all([
        leer(R('genkidama_contactos') + '?select=fuente,baja_at&limit=50000'),
        leer(R('genkidama_campanas') + '?select=id,tipo,evento_id,fecha_idx,codigo,slogan,asunto,audiencia,creado_at&order=creado_at.desc&limit=12'),
        G.energia({ KH_URL, KH_KEY }),
      ]);
      const por_fuente = {}; let bajas = 0;
      contactos.forEach((c) => { if (c.baja_at) bajas++; else por_fuente[c.fuente] = (por_fuente[c.fuente] || 0) + 1; });
      // Avance por campaña (una lectura liviana por las 12 más nuevas).
      const ids = campanas.map((c) => '"' + c.id + '"').join(',');
      const envs = ids ? await leer(R('genkidama_envios') + `?select=campana_id,enviado_at,error&campana_id=in.(${encodeURIComponent(ids)})&limit=100000`) : [];
      const av = {};
      envs.forEach((e) => { const a = av[e.campana_id] = av[e.campana_id] || { enviados: 0, errores: 0, pendientes: 0 }; if (e.enviado_at) a.enviados++; else if (e.error) a.errores++; else a.pendientes++; });
      let wizard = null, aviso_sitio = null;
      try { const s = await G.leerSitio(); wizard = { eventos: G.eventosParaWizard(s.EV), codigos: G.promosVivas(s.PROMOS) }; }
      catch (e) { aviso_sitio = 'No pude leer el sitio servido (' + e.message + '): el wizard no puede ofrecer eventos ni códigos ahora.'; }
      return j(200, headers, {
        ok: true, energia,
        concentrado: { total: contactos.length - bajas, bajas, por_fuente },
        campanas: campanas.map((c) => ({ ...c, ...(av[c.id] || { enviados: 0, errores: 0, pendientes: 0 }) })),
        wizard, aviso_sitio, tipos: G.TIPOS,
      });
    }

    // ── sembrar: el concentrado de TODAS las fuentes, sin repetidos ─────────
    if (accion === 'sembrar') {
      if (body.confirmar !== true) return j(400, headers, { error: 'Sembrar pide confirmar:true' });
      const P_URL = process.env.PORTAL_SUPABASE_URL, P_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;
      const pH = P_URL && P_KEY ? { apikey: P_KEY, Authorization: 'Bearer ' + P_KEY } : null;
      const leerP = async (url) => { if (!pH) return []; const r = await fetch(url, { headers: pH }); return r.ok ? r.json() : []; };
      const [ya, staff, vj, wl, rq, pb, cl, gw, ml] = await Promise.all([
        leer(R('genkidama_contactos') + '?select=correo&limit=50000'),
        leer(R('usuarios') + '?select=correo&limit=1000'),
        leer(R('viajeros_evento') + '?select=correo,nombre&correo=not.is.null&limit=50000'),
        leer(R('eventos_waitlist') + '?select=email,nombre&limit=50000'),
        leer(R('requisiciones') + '?select=correo,nombre&correo=not.is.null&limit=50000'),
        leer(R('preventa_blast') + '?select=correo,nombre&limit=50000').catch(() => []),
        leerP(`${P_URL}/rest/v1/clientes?select=correo,nombre_completo&limit=50000`),
        leerP(`${P_URL}/rest/v1/giveaway_registros?select=correo,nombre&eliminado_at=is.null&limit=50000`),
        leerP(`${P_URL}/rest/v1/bkp_mel_giveaway_registros?select=correo,nombre&limit=50000`),
      ]);
      const vistos = new Set(ya.map((x) => x.correo));
      const fuera = new Set(staff.map((x) => limpio(x.correo)).filter(Boolean));
      const nuevos = []; const conteo = {};
      const meter = (lista, fuente, campo, campoNom) => {
        for (const x of lista || []) {
          const c = limpio(x[campo]);
          if (!c || vistos.has(c) || fuera.has(c)) continue;
          vistos.add(c); conteo[fuente] = (conteo[fuente] || 0) + 1;
          nuevos.push({ correo: c, nombre: x[campoNom] ? String(x[campoNom]).slice(0, 120) : null, fuente, prioridad: PRIORIDAD[fuente] || 3 });
        }
      };
      // El orden es la prioridad: quien ya viajó entra primero con su fuente.
      meter(vj, 'viajeros', 'correo', 'nombre'); meter(rq, 'requisiciones', 'correo', 'nombre');
      meter(wl, 'waitlist', 'email', 'nombre'); meter(cl, 'portal', 'correo', 'nombre_completo');
      meter(pb, 'preventa-blast', 'correo', 'nombre'); meter(gw, 'giveaway', 'correo', 'nombre'); meter(ml, 'melanie', 'correo', 'nombre');
      let insertados = 0;
      for (let i = 0; i < nuevos.length; i += 500) {
        const lote = nuevos.slice(i, i + 500);
        const r = await fetch(R('genkidama_contactos'), { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(lote) });
        if (!r.ok) return j(502, headers, { error: 'KH rechazó un lote de la siembra', detail: (await r.text()).slice(0, 200), insertados });
        insertados += lote.length;
      }
      return j(200, headers, { ok: true, insertados, por_fuente: conteo, portal_leido: !!pH, nota: insertados ? undefined : 'nada nuevo: el concentrado ya tenía todos (sin repetidos)' });
    }

    // ── bajas: quien respondió BAJA no vuelve a recibir nada ────────────────
    if (accion === 'bajas') {
      if (body.confirmar !== true) return j(400, headers, { error: 'Dar de baja pide confirmar:true' });
      const lista = [...new Set((Array.isArray(body.correos) ? body.correos : String(body.correos || '').split(/[\s,;]+/)).map(limpio).filter(Boolean))].slice(0, 500);
      if (!lista.length) return j(400, headers, { error: 'Pega al menos un correo válido' });
      const inn = lista.map((c) => '"' + c + '"').join(',');
      const r = await fetch(R('genkidama_contactos') + `?correo=in.(${encodeURIComponent(inn)})&baja_at=is.null`, { method: 'PATCH', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify({ baja_at: new Date().toISOString() }) });
      if (!r.ok) return j(502, headers, { error: 'KH rechazó la baja', detail: (await r.text()).slice(0, 200) });
      const hechos = (await r.json()).map((x) => x.correo);
      // Quien no estaba en el concentrado nace dado de baja (así ninguna siembra lo revive).
      const faltan = lista.filter((c) => !hechos.includes(c));
      if (faltan.length) {
        const ex = await leer(R('genkidama_contactos') + `?select=correo&correo=in.(${encodeURIComponent(faltan.map((c) => '"' + c + '"').join(','))})`);
        const yaEstaban = new Set(ex.map((x) => x.correo));
        const nacen = faltan.filter((c) => !yaEstaban.has(c)).map((c) => ({ correo: c, fuente: 'baja-manual', prioridad: 9, baja_at: new Date().toISOString() }));
        if (nacen.length) await fetch(R('genkidama_contactos'), { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(nacen) });
      }
      return j(200, headers, { ok: true, dados_de_baja: lista.length });
    }

    // ── energia: el límite diario lo fija Memo ───────────────────────────────
    if (accion === 'energia') {
      if (body.confirmar !== true) return j(400, headers, { error: 'Cambiar la energía pide confirmar:true' });
      const lim = Math.floor(Number(body.limite));
      if (!Number.isFinite(lim) || lim < 0 || lim > 5000) return j(400, headers, { error: 'El límite diario va de 0 a 5,000' });
      const r = await fetch(R('genkidama_config') + '?id=eq.1', { method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ limite_diario: lim, actualizado_por: quien, updated_at: new Date().toISOString() }) });
      if (!r.ok) return j(502, headers, { error: 'KH rechazó el cambio', detail: (await r.text()).slice(0, 200) });
      return j(200, headers, { ok: true, energia: await G.energia({ KH_URL, KH_KEY }) });
    }

    // ── seco / crear: la promesa se valida contra el sitio servido ──────────
    if (accion === 'seco' || accion === 'crear') {
      const sitio = await G.leerSitio();
      const v = G.validarCampana(sitio, body);
      if (!v.ok) return j(409, headers, { error: 'EL SITIO NO HONRA ESTE CORREO: ' + v.error });
      // Audiencia: el concentrado vivo MENOS quien ya va a ese evento.
      const [contactos, yaVan] = await Promise.all([
        leer(R('genkidama_contactos') + '?select=correo,nombre,prioridad&baja_at=is.null&order=prioridad.asc,creado_at.asc&limit=50000'),
        leer(R('viajeros_evento') + `?select=correo&evento_id=like.${encodeURIComponent(G.baseSlug(v.ev.id))}*&limit=50000`),
      ]);
      const van = new Set(yaVan.map((x) => limpio(x.correo)).filter(Boolean));
      const audiencia = contactos.filter((c) => !van.has(c.correo));
      const asunto = G.asuntoDe(v);
      if (accion === 'seco') {
        return j(200, headers, { ok: true, seco: true, asunto, html: G.renderGenkidama(v, (audiencia[0] || {}).nombre || 'Lucero'), audiencia: audiencia.length, excluidos_ya_van: contactos.length - audiencia.length, energia: await G.energia({ KH_URL, KH_KEY }) });
      }
      if (body.confirmar !== true) return j(400, headers, { error: 'Crear la campaña pide confirmar:true' });
      if (!audiencia.length) return j(409, headers, { error: 'La audiencia está vacía: siembra el concentrado primero' });
      const rc = await fetch(R('genkidama_campanas'), { method: 'POST', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify({ tipo: v.tipo, evento_id: v.ev.id, fecha_idx: v.idx, codigo: v.promo ? v.promo.codigo : null, slogan: v.slogan, asunto, audiencia: audiencia.length, creado_por: quien }) });
      if (!rc.ok) return j(502, headers, { error: 'KH rechazó la campaña', detail: (await rc.text()).slice(0, 200) });
      const camp = (await rc.json())[0];
      for (let i = 0; i < audiencia.length; i += 500) {
        const lote = audiencia.slice(i, i + 500).map((c) => ({ campana_id: camp.id, correo: c.correo, nombre: c.nombre, prioridad: c.prioridad }));
        const r = await fetch(R('genkidama_envios'), { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(lote) });
        if (!r.ok) return j(502, headers, { error: 'La campaña nació pero su lista quedó a medias — vuelve a intentar crear (no se mandó nada)', detail: (await r.text()).slice(0, 200), campana_id: camp.id });
      }
      return j(200, headers, { ok: true, campana: { ...camp, pendientes: audiencia.length } });
    }

    // ── enviar: una tanda, dentro de la energía del día ──────────────────────
    if (accion === 'enviar') {
      if (body.confirmar !== true) return j(400, headers, { error: 'Enviar pide confirmar:true' });
      const cid = String(body.campana_id || '');
      if (!/^[0-9a-f-]{36}$/i.test(cid)) return j(400, headers, { error: 'campana_id inválido' });
      const camp = (await leer(R('genkidama_campanas') + `?id=eq.${cid}&select=*`))[0];
      if (!camp) return j(404, headers, { error: 'Esa campaña no existe' });
      const en = await G.energia({ KH_URL, KH_KEY });
      if (en.restante <= 0) return j(429, headers, { error: `Sin energía por hoy: ya salieron ${en.enviados_hoy} de ${en.limite}. Mañana se recarga (o súbele el límite).`, energia: en });
      // 🔒 Cada tanda vuelve a preguntarle al sitio: si el código venció o el
      // evento se agotó a media campaña, ya no se manda.
      const sitio = await G.leerSitio();
      const v = G.validarCampana(sitio, camp);
      if (!v.ok) return j(409, headers, { error: 'EL SITIO YA NO HONRA ESTA CAMPAÑA: ' + v.error + ' — la campaña queda pausada.' });
      const tope = Math.min(Math.max(1, Math.floor(Number(body.tope || TOPE_MAX))), TOPE_MAX, en.restante);
      const desde = encodeURIComponent(G.inicioDiaReynosa());
      const [cola, hoyG, hoyB] = await Promise.all([
        leer(R('genkidama_envios') + `?select=id,correo,nombre&campana_id=eq.${cid}&enviado_at=is.null&error=is.null&order=prioridad.asc,id.asc&limit=10000`),  // toda la cola (≤ unos miles): filtrar en memoria evita que los saltados atoren la tanda
        leer(R('genkidama_envios') + `?select=correo&enviado_at=gte.${desde}&limit=20000`),
        leer(R('preventa_blast') + `?select=correo&enviado_at=gte.${desde}&limit=20000`).catch(() => []),
      ]);
      const yaHoy = new Set(hoyG.concat(hoyB).map((x) => x.correo));
      const bajas = new Set((await leer(R('genkidama_contactos') + '?select=correo&baja_at=not.is.null&limit=20000')).map((x) => x.correo));
      const fin = Date.now() + PRESUPUESTO_MS;
      let enviados = 0, errores = 0, saltados_hoy = 0, saltados_baja = 0; const avisos = [];
      for (const p of cola) {
        if (enviados + errores >= tope || Date.now() > fin) break;
        if (bajas.has(p.correo)) {
          saltados_baja++;
          await fetch(R('genkidama_envios') + `?id=eq.${p.id}&enviado_at=is.null`, { method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ error: 'baja' }) });
          continue;
        }
        if (yaHoy.has(p.correo)) { saltados_hoy++; continue; } // queda pendiente para mañana
        const res = await enviarCorreo(p.correo, camp.asunto, G.renderGenkidama(v, p.nombre));
        const marca = res.ok ? { enviado_at: new Date().toISOString(), resend_status: res.status } : { error: 'resend ' + (res.status || '?'), resend_status: res.status || null };
        const up = await fetch(R('genkidama_envios') + `?id=eq.${p.id}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(marca) });
        if (!up.ok) avisos.push(`el asiento de ${enmascarar(p.correo)} falló — ese correo YA salió y el próximo clic lo repetiría`);
        if (res.ok) { enviados++; yaHoy.add(p.correo); } else errores++;
        await dormir(PAUSA_MS);
      }
      const rr = await fetch(R('genkidama_envios') + `?select=id&campana_id=eq.${cid}&enviado_at=is.null&error=is.null`, { headers: { ...h, Prefer: 'count=exact', Range: '0-0' } });
      const restantes = rr.ok ? Number(String(rr.headers.get('content-range') || '/0').split('/')[1] || 0) : null;
      return j(200, headers, { ok: true, enviados, errores, saltados_hoy, saltados_baja, restantes, energia: await G.energia({ KH_URL, KH_KEY }), avisos: avisos.length ? avisos : undefined });
    }
    return j(400, headers, { error: 'accion inválida' });
  } catch (e) {
    return j(500, headers, { error: 'Error interno', detail: e.message });
  }
};

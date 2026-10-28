// =============================================================================
// admin-portal-revision — [PORTAL-SOLO-1] la bandeja «Portal» de KameHouse
// (27-oct-2026)
//
// Palabra de Memo, citada: «antes que se registrara bulma milk o yo podamos
// revisar su caso para darle la información correcta de su tour … lo que se
// guarde en la revisión manual tú la puedes utilizar para saber qué onda con esa
// persona con sus números».
//
// Acciones (maestro_roshi · bulma · milk):
//   · listar     → revisiones pendientes con TODO junto: sus filas, abonos y
//                  saldo; para «ligar», los candidatos del evento por nombre
//                  parecido / mismo WhatsApp. + la bitácora reciente.
//   · excel      → lo que dice el Excel de esa persona en ese evento (corre el
//                  careo del evento y busca su nombre — solo lee).
//   · ligar      → «Es esta persona»: escribe el correo de su cuenta en ESA
//                  fila. 🔒 Un correo distinto NO se pisa sin `reemplazar:true`.
//   · publicar   → sella las filas sin revisar de ese correo, guarda ANTES y
//                  DESPUÉS + la nota, y le avisa «ya puedes ver tu viaje».
//   · rechazar   → «No procede» con motivo (le llega TAL CUAL por correo y
//                  en su Portal).
//   · adelanto   → revisar por adelantado filas elegidas en la lista del evento
//                  (sin correo al cliente: aún no ha entrado).
//
// 🔒 El dinero no se corrige AQUÍ: se corrige con lo que ya existe (➕ Abono,
// editar contrato) y aquí se revisa y se publica. Una sola puerta por dato.
// 🔒 Reclamo con valor esperado (estado=eq.pendiente): el 2º clic es 409.
// =============================================================================
const { verifyAdminAuthLive, corsCheck } = require('./_lib/verify-admin');
const PR = require('./_lib/portal-revision');

const ROLES = ['maestro_roshi', 'bulma', 'milk'];
const ACCIONES = ['listar', 'excel', 'ligar', 'publicar', 'rechazar', 'adelanto', 'fila_editar', 'fila_publicar', 'fila_no_procede'];
// [PRV-FILA-1] Palabra de Memo (27-oct): «no puedo editar nada de lo que dice
// ella … estaría bueno poder editar e ir aceptando uno por uno, no tener que
// revisar todas de golpe». Cada viaje de la revisión se EDITA, se PUBLICA o se
// marca «no procede» por separado; cuando ya no queda ninguno, la revisión se
// cierra sola y sale UN correo con lo publicado (y lo que no procedió).
const PAQ = ['plus', 'stay', 'cheap', 'ride'];
const { puertaZona } = require('./_lib/zona-ficha');
const numDinero = (x) => { if (x == null) return null; const s = String(x).replace(/[$\s,]/g, ''); if (s === '') return null; const n = Number(s); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function j(status, headers, body) { return { statusCode: status, headers, body: JSON.stringify(body) }; }
// El nombre del evento SIN pisar el nombre de la persona (las dos se llaman `nombre`).
const evDe = (EVx, id) => { const n = PR.nombreEvento(EVx, id); return { evento_nombre: n.nombre, evento_fecha: n.fecha, evento_ds: n.ds }; };
const tok = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t.length >= 3);

// Candidatos para «ligar»: mismo WhatsApp gana; si no, nombre parecido (el
// primer nombre + otra palabra, la forma de CREA-3), ordenados por coincidencias.
function candidatos(filas, nombreDado, celular) {
  const td = tok(nombreDado);
  const cel = String(celular || '').replace(/\D/g, '').slice(-10);
  return (filas || []).map((v) => {
    const tv = new Set(tok(v.nombre));
    const comun = td.filter((t) => tv.has(t)).length;
    const mismoCel = !!(cel && String(v.celular || '').replace(/\D/g, '').slice(-10) === cel);
    const primero = td.length && tv.has(td[0]);
    const score = (mismoCel ? 10 : 0) + comun + (primero ? 1 : 0);
    return { v, score, mismoCel, comun };
  }).filter((x) => x.mismoCel || x.comun >= 2 || (x.comun >= 1 && td.length === 1))
    .sort((a, b) => b.score - a.score).slice(0, 8);
}

exports.handler = async (event) => {
  const __origin = corsCheck(event);
  const headers = {
    'Access-Control-Allow-Origin': __origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return j(405, headers, { error: 'Solo POST' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return j(400, headers, { error: 'Cuerpo inválido' }); }
  const accion = String(body.accion || '');
  if (!ACCIONES.includes(accion)) return j(400, headers, { error: 'Acción desconocida: ' + accion });

  const auth = await verifyAdminAuthLive(event, ROLES);
  if (!auth.valid) return j(auth.status, headers, { error: auth.error });
  const quien = (auth.user && (auth.user.nombre || auth.user.username || auth.user.correo)) || (auth.user && (auth.user.id || auth.user.sub)) || 'panel';

  const KH_URL = process.env.SUPABASE_URL_KAMEHOUSE;
  const KH_KEY = process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE;
  if (!KH_URL || !KH_KEY) return j(500, headers, { error: 'Faltan credenciales de KameHouse' });
  const KH = { KH_URL, KH_KEY };
  const h = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY };
  const hw = (extra) => Object.assign({}, h, { 'Content-Type': 'application/json' }, extra || {});
  const T = `${KH_URL}/rest/v1/${PR.TABLA}`;
  const VE = `${KH_URL}/rest/v1/viajeros_evento`;
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Matamoros' });

  let EV = null;
  const catalogo = async () => { if (EV) return EV; try { EV = await require('./_lib/catalogo-index').fetchEventosRaw(); } catch (_) { EV = []; } return EV; };
  const leerRev = async (id) => {
    if (!UUID_RE.test(String(id || ''))) return null;
    const r = await fetch(`${T}?id=eq.${id}&select=*&limit=1`, { headers: h });
    if (!r.ok) throw new Error('no pude leer la solicitud');
    return (await r.json())[0] || null;
  };
  // [PRV-FILA-1] Los viajes que ya alguien marcó «no procede» (por viaje o la
  // revisión entera): viajero_id → motivo. pedirRevision ya los trata como
  // cubiertos, así que no reabren solos.
  const noProcedenDe = async (correo) => {
    const r = await fetch(`${T}?correo=eq.${encodeURIComponent(correo)}&tipo=eq.revisar&estado=eq.rechazada&select=viajero_ids,motivo&limit=300`, { headers: h });
    if (!r.ok) throw new Error('no pude leer los «no procede» de ese correo');
    const m = new Map();
    (await r.json()).forEach((x) => (x.viajero_ids || []).forEach((id) => m.set(String(id), x.motivo || '')));
    return m;
  };
  // La fila tiene que ser de ESE correo (la autoridad es la igualdad exacta).
  const filaDeRev = async (rev, vid) => {
    if (!UUID_RE.test(String(vid || ''))) return { error: 'Viajero inválido', status: 400 };
    const r = await fetch(`${VE}?id=eq.${vid}&select=${PR.VSEL}&limit=1`, { headers: h });
    if (!r.ok) return { error: 'No pude leer esa fila', status: 502 };
    const v = (await r.json())[0];
    if (!v || PR.normCorreo(v.correo) !== rev.correo) return { error: 'Esa fila no es de esta persona (o cambió de correo): recarga', status: 409 };
    return { v };
  };
  // Cuando ya no queda ningún viaje sin decidir, la revisión se cierra SOLA y
  // sale UN correo: lo publicado (y, aparte, lo que no procedió con su motivo).
  const cerrarSiTermino = async (rev) => {
    const filas = await PR.filasDeCorreo(rev.correo, KH);
    const np = await noProcedenDe(rev.correo);
    const restantes = filas.filter((v) => !PR.revisada(v) && !np.has(String(v.id)));
    if (restantes.length) return { cerrada: false, restantes: restantes.length };
    const publicadas = filas.filter(PR.revisada);
    const rechazadas = filas.filter((v) => !PR.revisada(v) && np.has(String(v.id)));
    const ab = await PR.abonosDe(filas.map((v) => v.id), KH);
    const resumen = `por viaje: ${publicadas.length} publicado${publicadas.length === 1 ? '' : 's'} · ${rechazadas.length} no procede${rechazadas.length === 1 ? '' : 'n'}`;
    const rc = await fetch(`${T}?id=eq.${rev.id}&estado=eq.pendiente`, { method: 'PATCH', headers: hw({ Prefer: 'return=representation' }),
      body: JSON.stringify({ estado: 'publicada', atendida_at: new Date().toISOString(), atendida_por: quien,
        nota_staff: ((rev.nota_staff ? rev.nota_staff + ' · ' : '') + resumen).slice(0, 1000),
        despues: PR.foto(publicadas, ab), viajero_ids: [...new Set([...(rev.viajero_ids || []), ...filas.map((v) => v.id)])] }) });
    if (!rc.ok || !(await rc.json()).length) return { cerrada: false, ya: true };
    const EVx = await catalogo();
    const conEv = (f) => { const n = PR.nombreEvento(EVx, f.evento_id); return Object.assign({}, f, { evento: n.nombre, fecha: n.fecha }); };
    const viajes = PR.foto(publicadas, ab).map(conEv);
    const noProceden = rechazadas.map((v) => ({ evento: conEv(v).evento, motivo: np.get(String(v.id)) || '' }));
    const nombre = (filas[0] && filas[0].nombre) || rev.nombre_dado;
    const correo = viajes.length
      ? await PR.avisarRevision({ rev: Object.assign({}, rev, { estado: 'publicada' }), viajes, nombre, noProceden })
      : await PR.avisarRevision({ rev: Object.assign({}, rev, { estado: 'rechazada', motivo: noProceden.map((x) => `${x.evento}: ${x.motivo}`).join(' · ') }), viajes: [], nombre });
    if (correo.ok) await fetch(`${T}?id=eq.${rev.id}`, { method: 'PATCH', headers: hw(), body: JSON.stringify({ correo_enviado_at: new Date().toISOString() }) });
    return { cerrada: true, publicadas: publicadas.length, no_proceden: rechazadas.length, correo };
  };

  try {
    // ── listar ──────────────────────────────────────────────────────────────
    if (accion === 'listar') {
      const [rp, rr] = await Promise.all([
        fetch(`${T}?estado=eq.pendiente&tipo=in.(revisar,ligar)&select=*&order=creado_en.asc&limit=100`, { headers: h }),
        fetch(`${T}?estado=in.(publicada,rechazada)&select=id,tipo,estado,correo,evento_id,nombre_dado,motivo,nota_staff,antes,despues,atendida_at,atendida_por,correo_enviado_at&order=atendida_at.desc.nullslast&limit=30`, { headers: h }),
      ]);
      if (!rp.ok) return j(502, headers, { error: 'No pude leer las revisiones del Portal', detail: (await rp.text()).slice(0, 200) });
      const pend = await rp.json();
      const recientes = rr.ok ? await rr.json() : [];
      const EVx = await catalogo();
      const out = [];
      for (const rev of pend) {
        const filas = await PR.filasDeCorreo(rev.correo, KH);
        const ab = await PR.abonosDe(filas.map((v) => v.id), KH);
        const np = await noProcedenDe(rev.correo);
        const conNombre = (v) => {
          const e = evDe(EVx, v.evento_id);
          return Object.assign({}, v, e, { cuenta: PR.foto([v], ab)[0], abonos_lista: (ab[v.id] || []).map((a) => ({ monto: Number(a.monto) || 0, fecha: a.fecha, nota: a.nota || null })),
            no_procede: np.has(String(v.id)) ? (np.get(String(v.id)) || 'no procede') : null,
            evento_pasado: !!(e.evento_ds && e.evento_ds < hoy) });
        };
        // Primero lo que falta decidir, luego lo publicado y lo que no procedió;
        // dentro, por fecha del evento (lo que viene primero arriba).
        const orden = (v) => (PR.revisada(v) ? 2 : (np.has(String(v.id)) ? 3 : (v.evento_pasado ? 1 : 0)));
        const filasOut = filas.map(conNombre).sort((a, b) => (orden(a) - orden(b)) || String(a.evento_ds || '').localeCompare(String(b.evento_ds || '')));
        const item = Object.assign({}, rev, {
          evento: rev.evento_id ? PR.nombreEvento(EVx, rev.evento_id) : null,
          filas: filasOut,
          sin_revisar: filas.filter((v) => !PR.revisada(v) && !np.has(String(v.id))).length,
        });
        if (rev.tipo === 'ligar' && rev.evento_id) {
          const base = rev.evento_id.split('#')[0];
          const rf = await fetch(`${VE}?evento_id=like.${encodeURIComponent(base)}*&select=${PR.VSEL}&limit=3000`, { headers: h });
          const delEvento = rf.ok ? (await rf.json()).filter((v) => v.evento_id === base || v.evento_id.startsWith(base + '#')) : [];
          const cands = candidatos(delEvento, rev.nombre_dado, rev.celular);
          const abC = await PR.abonosDe(cands.map((c) => c.v.id), KH);
          item.candidatos = cands.map((c) => Object.assign({}, c.v, evDe(EVx, c.v.evento_id), {
            mismo_celular: c.mismoCel, coincidencias: c.comun, cuenta: PR.foto([c.v], abC)[0],
            ya_es_suyo: PR.normCorreo(c.v.correo) === rev.correo,
          }));
          item.candidatos_error = rf.ok ? null : 'no pude leer la lista del evento';
        }
        out.push(item);
      }
      return j(200, headers, { ok: true, pendientes: out, total: out.length, recientes });
    }

    // ── excel: lo que dice el Excel de esa persona (solo LEE) ───────────────
    if (accion === 'excel') {
      const evento_id = String(body.evento_id || '');
      const nombre = String(body.nombre || '');
      if (!evento_id || !nombre) return j(400, headers, { error: 'Falta evento o nombre' });
      const { correrCareo } = require('./_lib/excel-careo-correr');
      const c = await correrCareo(evento_id);
      if (!c || c.error) return j(200, headers, { ok: false, motivo: (c && c.error && (c.error.mensaje || c.error.codigo)) || 'el careo no contestó' });
      const tn = tok(nombre);
      const hits = (c.personas || []).filter((p) => {
        const tp = new Set(tok(p.nombre));
        const comun = tn.filter((t) => tp.has(t)).length;
        return comun >= 2 || (comun >= 1 && tn.length === 1);
      }).map((p) => ({ nombre: p.nombre, total: p.total == null ? null : p.total, abonado: p.abonado == null ? null : p.abonado,
        filas: p.filas || null, zonas: p.zonas || null, paquete: p.paquete || null, roja: !!p.roja, fuentes: p.fuentes || null,
        pestanas: p.pestanas || null }));
      return j(200, headers, { ok: true, personas: hits });
    }

    // ── ligar: «Es esta persona» ────────────────────────────────────────────
    if (accion === 'ligar') {
      const rev = await leerRev(body.id);
      if (!rev || rev.estado !== 'pendiente' || rev.tipo !== 'ligar') return j(409, headers, { error: 'Esa solicitud ya no está pendiente' });
      const vid = String(body.viajero_id || '');
      if (!UUID_RE.test(vid)) return j(400, headers, { error: 'Viajero inválido' });
      const rv = await fetch(`${VE}?id=eq.${vid}&select=${PR.VSEL}&limit=1`, { headers: h });
      const v = rv.ok ? (await rv.json())[0] : null;
      const base = String(rev.evento_id || '').split('#')[0];
      if (!v || !(v.evento_id === base || String(v.evento_id).startsWith(base + '#'))) return j(400, headers, { error: 'Esa fila no es de ese evento' });
      const actual = PR.normCorreo(v.correo);
      if (actual && actual !== rev.correo && body.reemplazar !== true) {
        return j(409, headers, { error: `Esa fila ya trae otro correo (${v.correo}). Si es la misma persona y cambió de correo, confirma para reemplazarlo.`, correo_actual: v.correo, pide_reemplazar: true });
      }
      if (actual !== rev.correo) {
        const nota = `PORTAL-SOLO-1 ${hoy}: correo ligado a su cuenta del Portal por ${quien}` + (actual ? ` (antes: ${v.correo})` : '');
        // 🔒 Valor esperado: el correo que había al leer (vacío o el que se confirmó reemplazar).
        const filtro = v.correo == null ? 'correo=is.null' : `correo=eq.${encodeURIComponent(v.correo)}`;
        const rp = await fetch(`${VE}?id=eq.${vid}&${filtro}`, { method: 'PATCH', headers: hw({ Prefer: 'return=representation' }),
          body: JSON.stringify({ correo: rev.correo, notas: ((v.notas ? v.notas + ' · ' : '') + nota).slice(0, 4000) }) });
        if (!rp.ok) return j(502, headers, { error: 'No pude ligar la fila', detail: (await rp.text()).slice(0, 200) });
        if (!(await rp.json()).length) return j(409, headers, { error: 'La fila cambió mientras la ligabas: recarga y vuelve a intentar' });
      }
      const ids = [...new Set([...(rev.viajero_ids || []), vid])];
      await fetch(`${T}?id=eq.${rev.id}&estado=eq.pendiente`, { method: 'PATCH', headers: hw(), body: JSON.stringify({ viajero_ids: ids }) });
      return j(200, headers, { ok: true, ligado: vid, sellada: PR.revisada(v) });
    }

    // ── publicar ────────────────────────────────────────────────────────────
    if (accion === 'publicar') {
      const rev = await leerRev(body.id);
      if (!rev || rev.estado !== 'pendiente') return j(409, headers, { error: 'Esa solicitud ya no está pendiente' });
      const nota = String(body.nota || '').trim().slice(0, 1000) || null;
      const filas = await PR.filasDeCorreo(rev.correo, KH);
      // [PRV-FILA-1] Lo que ya se marcó «no procede» por viaje NO se publica de golpe.
      const npG = await noProcedenDe(rev.correo);
      const sinSello = filas.filter((v) => !PR.revisada(v) && !npG.has(String(v.id)));
      if (!filas.length) return j(409, headers, { error: rev.tipo === 'ligar' ? 'Todavía no ligas ninguna fila: elige «Es esta persona» primero' : 'Ese correo ya no tiene filas en KameHouse' });
      const ab = await PR.abonosDe(filas.map((v) => v.id), KH);
      const antes = rev.antes || PR.foto(sinSello, ab);
      // 1 · Reclamo con valor esperado.
      const rc = await fetch(`${T}?id=eq.${rev.id}&estado=eq.pendiente`, { method: 'PATCH', headers: hw({ Prefer: 'return=representation' }),
        body: JSON.stringify({ estado: 'publicada', atendida_at: new Date().toISOString(), atendida_por: quien, nota_staff: nota,
          antes, despues: PR.foto(sinSello.length ? sinSello : filas, ab), viajero_ids: (sinSello.length ? sinSello : filas).map((v) => v.id) }) });
      if (!rc.ok) return j(502, headers, { error: 'No pude cerrar la revisión', detail: (await rc.text()).slice(0, 200) });
      if (!(await rc.json()).length) return j(409, headers, { error: 'Alguien más ya la atendió' });
      // 2 · El sello (solo donde aún no hay: valor esperado is.null).
      if (sinSello.length) {
        const ids = sinSello.map((v) => v.id).join(',');
        const rs = await fetch(`${VE}?id=in.(${ids})&portal_revisado_at=is.null`, { method: 'PATCH', headers: hw(),
          body: JSON.stringify({ portal_revisado_at: new Date().toISOString(), portal_revisado_por: quien + (nota ? ' · ' + nota.slice(0, 200) : '') }) });
        if (!rs.ok) {
          // Sin sello, la revisión no puede decir «publicada»: se revierte.
          await fetch(`${T}?id=eq.${rev.id}&estado=eq.publicada`, { method: 'PATCH', headers: hw(), body: JSON.stringify({ estado: 'pendiente', atendida_at: null, atendida_por: null }) });
          return j(502, headers, { error: 'No pude publicar las filas; la solicitud sigue pendiente', detail: (await rs.text()).slice(0, 200) });
        }
      }
      // 3 · El correo: lo que verá en su Portal (todas sus filas ya revisadas).
      const EVx = await catalogo();
      const visibles = filas.filter((v) => PR.revisada(v) || sinSello.some((s) => s.id === v.id));
      const viajes = PR.foto(visibles, ab).map((f) => { const n = PR.nombreEvento(EVx, f.evento_id); return Object.assign({}, f, { evento: n.nombre, fecha: n.fecha }); });
      const correo = await PR.avisarRevision({ rev: Object.assign({}, rev, { estado: 'publicada' }), viajes, nombre: (filas[0] && filas[0].nombre) || rev.nombre_dado });
      if (correo.ok) await fetch(`${T}?id=eq.${rev.id}`, { method: 'PATCH', headers: hw(), body: JSON.stringify({ correo_enviado_at: new Date().toISOString() }) });
      return j(200, headers, { ok: true, publicadas: sinSello.length, correo });
    }

    // ── rechazar ────────────────────────────────────────────────────────────
    if (accion === 'rechazar') {
      const rev = await leerRev(body.id);
      if (!rev || rev.estado !== 'pendiente') return j(409, headers, { error: 'Esa solicitud ya no está pendiente' });
      const motivo = String(body.motivo || '').trim().slice(0, 500);
      if (motivo.length < 3) return j(400, headers, { error: 'Escribe el motivo: le llega tal cual al cliente' });
      const rc = await fetch(`${T}?id=eq.${rev.id}&estado=eq.pendiente`, { method: 'PATCH', headers: hw({ Prefer: 'return=representation' }),
        body: JSON.stringify({ estado: 'rechazada', motivo, atendida_at: new Date().toISOString(), atendida_por: quien }) });
      if (!rc.ok) return j(502, headers, { error: 'No pude cerrar la solicitud', detail: (await rc.text()).slice(0, 200) });
      const cerrada = (await rc.json())[0];
      if (!cerrada) return j(409, headers, { error: 'Alguien más ya la atendió' });
      const correo = await PR.avisarRevision({ rev: cerrada, viajes: [], nombre: rev.nombre_dado });
      if (correo.ok) await fetch(`${T}?id=eq.${rev.id}`, { method: 'PATCH', headers: hw(), body: JSON.stringify({ correo_enviado_at: new Date().toISOString() }) });
      return j(200, headers, { ok: true, correo });
    }

    // ── [PRV-FILA-1] fila_editar: corregir UN viaje antes de publicarlo ──────
    // Lo que se puede corregir aquí: nombre, paquete, zona (por LA PUERTA de la
    // ficha), lugares, total del contrato y lo pagado ANTES del sistema
    // (abonado_previo, el número del Excel). Los pagos NUEVOS no se teclean aquí:
    // son abonos (➕ Abono), con su fecha. 🔒 Valor esperado: si alguien cambió
    // la fila mientras tanto, 409. Cada cambio queda ANEXADO en sus notas.
    if (accion === 'fila_editar') {
      const rev = await leerRev(body.id);
      if (!rev || rev.estado !== 'pendiente') return j(409, headers, { error: 'Esa revisión ya no está pendiente' });
      const fr = await filaDeRev(rev, body.viajero_id);
      if (fr.error) return j(fr.status, headers, { error: fr.error });
      const v = fr.v;
      if (PR.revisada(v)) return j(409, headers, { error: 'Ese viaje ya está publicado' });
      const c = (body.campos && typeof body.campos === 'object') ? body.campos : {};
      const patch = {}, cambios = [];
      let zonaAviso = null;
      const igual = (a, b) => String(a == null ? '' : a) === String(b == null ? '' : b);
      if ('nombre' in c) {
        const n = String(c.nombre || '').trim().replace(/\s+/g, ' ');
        if (n.length < 2 || n.length > 120) return j(400, headers, { error: 'Nombre inválido' });
        if (!igual(n, v.nombre)) { patch.nombre = n; cambios.push(`nombre «${v.nombre || ''}»→«${n}»`); }
      }
      let paqFinal = String(v.tipo_paquete || '').toLowerCase();
      if ('tipo_paquete' in c) {
        const p = String(c.tipo_paquete || '').trim().toLowerCase();
        if (!PAQ.includes(p)) return j(400, headers, { error: 'Paquete inválido (PLUS, STAY, CHEAP o RIDE)' });
        // Se respeta cómo escribe la base esa fila (hay PLUS y plus): mayúsculas si no hay.
        const cur = String(v.tipo_paquete || '');
        const val = cur && cur === cur.toLowerCase() ? p : p.toUpperCase();
        paqFinal = p;
        if (p !== cur.toLowerCase()) { patch.tipo_paquete = val; cambios.push(`paquete ${cur || '—'}→${val}`); }
      }
      if ('zona_boleto' in c) {
        let z = String(c.zona_boleto || '').trim();
        if (!z) {
          if (paqFinal !== 'ride') return j(400, headers, { error: 'La zona es obligatoria (solo RIDE va sin zona)' });
        } else {
          const pz = await puertaZona(v.evento_id, z);
          if (pz.estado === 'desconocida') return j(400, headers, { error: `«${z}» no es zona de ese evento. Zonas: ${(pz.canonicas || []).join(', ')}` });
          if (pz.estado === 'canonizada') { zonaAviso = `Zona escrita como en la ficha: «${pz.zona}»`; z = pz.zona; }
        }
        if (!igual(z || null, v.zona_boleto)) { patch.zona_boleto = z || null; cambios.push(`zona «${v.zona_boleto || '—'}»→«${z || '—'}»`); }
      }
      if ('boletos' in c) {
        const b = Number(c.boletos);
        if (!Number.isInteger(b) || b < 1 || b > 20) return j(400, headers, { error: 'Lugares inválidos (1 a 20)' });
        if (b !== (Number(v.boletos) || 1)) { patch.boletos = b; cambios.push(`lugares ${v.boletos || 1}→${b}`); }
      }
      for (const k of ['total_contrato', 'abonado_previo']) {
        if (!(k in c)) continue;
        const nv = numDinero(c[k]);
        if (Number.isNaN(nv) || (nv != null && (nv < 0 || nv > 2000000))) return j(400, headers, { error: (k === 'total_contrato' ? 'Total' : 'Pagado antes') + ' inválido' });
        if (k === 'total_contrato' && nv == null) return j(400, headers, { error: 'El total no puede quedar vacío' });
        const cur = v[k] == null ? null : Number(v[k]);
        if (nv !== cur) { patch[k] = nv; cambios.push(`${k === 'total_contrato' ? 'total' : 'pagado antes'} ${cur == null ? '—' : '$' + cur}→$${nv == null ? 0 : nv}`); }
      }
      if (!cambios.length) return j(400, headers, { error: 'No cambiaste nada' });
      patch.notas = ((v.notas ? v.notas + ' · ' : '') + `[PORTAL-REV ${hoy}] ${cambios.join('; ')} · ${quien}`).slice(0, 4000);
      // Valor esperado: cada campo que cambia, tal como se leyó.
      const filtro = Object.keys(patch).filter((k) => k !== 'notas').map((k) => (v[k] == null ? `${k}=is.null` : `${k}=eq.${encodeURIComponent(v[k])}`)).join('&');
      const rp = await fetch(`${VE}?id=eq.${v.id}&portal_revisado_at=is.null&${filtro}`, { method: 'PATCH', headers: hw({ Prefer: 'return=representation' }), body: JSON.stringify(patch) });
      if (!rp.ok) return j(502, headers, { error: 'No pude guardar el cambio', detail: (await rp.text()).slice(0, 200) });
      const nueva = (await rp.json())[0];
      if (!nueva) return j(409, headers, { error: 'La fila cambió mientras la editabas: recarga y vuelve a intentar' });
      return j(200, headers, { ok: true, cambios, zona_aviso: zonaAviso });
    }

    // ── [PRV-FILA-1] fila_publicar: UN viaje queda visible en su Portal ──────
    if (accion === 'fila_publicar') {
      const rev = await leerRev(body.id);
      if (!rev || rev.estado !== 'pendiente') return j(409, headers, { error: 'Esa revisión ya no está pendiente' });
      const fr = await filaDeRev(rev, body.viajero_id);
      if (fr.error) return j(fr.status, headers, { error: fr.error });
      const v = fr.v;
      if (PR.revisada(v)) return j(409, headers, { error: 'Ese viaje ya estaba publicado' });
      const np = await noProcedenDe(rev.correo);
      if (np.has(String(v.id))) return j(409, headers, { error: 'Ese viaje ya está marcado «no procede»' });
      const nota = String(body.nota || '').trim().slice(0, 300);
      const rs = await fetch(`${VE}?id=eq.${v.id}&portal_revisado_at=is.null`, { method: 'PATCH', headers: hw({ Prefer: 'return=representation' }),
        body: JSON.stringify({ portal_revisado_at: new Date().toISOString(), portal_revisado_por: quien + ' (por viaje)' + (nota ? ' · ' + nota : '') }) });
      if (!rs.ok) return j(502, headers, { error: 'No pude publicar ese viaje', detail: (await rs.text()).slice(0, 200) });
      if (!(await rs.json()).length) return j(409, headers, { error: 'Alguien más ya lo publicó' });
      await fetch(`${T}?id=eq.${rev.id}&estado=eq.pendiente`, { method: 'PATCH', headers: hw(), body: JSON.stringify({ viajero_ids: [...new Set([...(rev.viajero_ids || []), v.id])] }) });
      const cierre = await cerrarSiTermino(rev);
      return j(200, headers, { ok: true, publicada: v.id, cierre });
    }

    // ── [PRV-FILA-1] fila_no_procede: UN viaje no se publica (con motivo) ────
    // Queda como su propia fila «rechazada» en la bitácora: así el Portal le
    // dice el motivo de ESE viaje y la revisión no se vuelve a abrir por él.
    if (accion === 'fila_no_procede') {
      const rev = await leerRev(body.id);
      if (!rev || rev.estado !== 'pendiente') return j(409, headers, { error: 'Esa revisión ya no está pendiente' });
      const motivo = String(body.motivo || '').trim().slice(0, 500);
      if (motivo.length < 3) return j(400, headers, { error: 'Escribe el motivo: lo verá el cliente en su Portal' });
      const fr = await filaDeRev(rev, body.viajero_id);
      if (fr.error) return j(fr.status, headers, { error: fr.error });
      const v = fr.v;
      if (PR.revisada(v)) return j(409, headers, { error: 'Ese viaje ya está publicado' });
      const np = await noProcedenDe(rev.correo);
      if (np.has(String(v.id))) return j(409, headers, { error: 'Ese viaje ya estaba marcado «no procede»' });
      const ab = await PR.abonosDe([v.id], KH);
      const ri = await fetch(T, { method: 'POST', headers: hw({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ tipo: 'revisar', estado: 'rechazada', correo: rev.correo, evento_id: v.evento_id, viajero_ids: [v.id],
          antes: PR.foto([v], ab), motivo, nota_staff: 'no procede por viaje', atendida_at: new Date().toISOString(), atendida_por: quien }) });
      if (!ri.ok) return j(502, headers, { error: 'No pude guardarlo', detail: (await ri.text()).slice(0, 200) });
      const cierre = await cerrarSiTermino(rev);
      return j(200, headers, { ok: true, no_procede: v.id, cierre });
    }

    // ── adelanto: revisar por adelantado desde la lista del evento ──────────
    if (accion === 'adelanto') {
      const ids = (Array.isArray(body.viajero_ids) ? body.viajero_ids : []).map(String).filter((x) => UUID_RE.test(x));
      if (!ids.length) return j(400, headers, { error: 'Marca al menos una persona' });
      if (ids.length > 200) return j(400, headers, { error: 'Máximo 200 por clic' });
      const nota = String(body.nota || '').trim().slice(0, 1000) || null;
      const rv = await fetch(`${VE}?id=in.(${ids.join(',')})&select=${PR.VSEL}`, { headers: h });
      if (!rv.ok) return j(502, headers, { error: 'No pude leer esas filas' });
      const filas = (await rv.json()).filter((v) => !PR.revisada(v));
      if (!filas.length) return j(200, headers, { ok: true, publicadas: 0, ya: true });
      const ab = await PR.abonosDe(filas.map((v) => v.id), KH);
      const rs = await fetch(`${VE}?id=in.(${filas.map((v) => v.id).join(',')})&portal_revisado_at=is.null`, { method: 'PATCH', headers: hw({ Prefer: 'return=representation' }),
        body: JSON.stringify({ portal_revisado_at: new Date().toISOString(), portal_revisado_por: quien + ' (por adelantado)' + (nota ? ' · ' + nota.slice(0, 200) : '') }) });
      if (!rs.ok) return j(502, headers, { error: 'No pude marcarlas como revisadas', detail: (await rs.text()).slice(0, 200) });
      const selladas = await rs.json();
      // La bitácora: una fila por correo (sin correo → 'sin-correo').
      const porCorreo = {};
      selladas.forEach((v) => { const c = PR.normCorreo(v.correo) || 'sin-correo'; (porCorreo[c] = porCorreo[c] || []).push(v); });
      const ahora = new Date().toISOString();
      const bit = Object.entries(porCorreo).map(([c, vs]) => {
        const f = PR.foto(vs, ab);
        return { tipo: 'adelanto', estado: 'publicada', correo: c, evento_id: vs[0].evento_id, viajero_ids: vs.map((v) => v.id), antes: f, despues: f, nota_staff: nota, atendida_at: ahora, atendida_por: quien };
      });
      const rb = await fetch(T, { method: 'POST', headers: hw({ Prefer: 'return=minimal' }), body: JSON.stringify(bit) });
      return j(200, headers, { ok: true, publicadas: selladas.length, bitacora: rb.ok ? bit.length : 0, bitacora_error: rb.ok ? null : 'no se pudo asentar la bitácora (las filas sí quedaron revisadas)' });
    }
  } catch (e) {
    return j(502, headers, { error: 'Error en la revisión del Portal', detail: e && e.message });
  }
  return j(400, headers, { error: 'Acción desconocida' });
};

module.exports._candidatos = candidatos;

// =============================================================================
// _lib/perfil-giveaway  —  Candado de PERFIL DEL PORTAL para giveaways (tuerca C)
//
// Decisión de Memo: el ganador de un giveaway crea su cuenta en el Portal antes
// de firmar — entra al ecosistema, conoce la marca, ve los demás eventos; y su
// contrato jala fecha de nacimiento y emergencia de su perfil (como coordis/team).
//
// 🔑 LA LLAVE ES EL CORREO: el match es contratos_creadores.creador_email ↔
// Portal clientes.correo (cross-project por service_role, server-side, patrón
// de la casa). Al crear el contrato giveaway, el correo capturado DEBE ser el
// real del ganador — si no, el candado le pedirá una cuenta que no va a casar.
//
// consultarPerfilGiveaway(correo) → { estado, perfil? }
//   · 'sin_cuenta'    Portal respondió: no hay clientes con ese correo.
//   · 'incompleto'    hay cuenta pero falta fecha_nacimiento o emergencia
//                     (nombre + teléfono) en su perfil.
//   · 'completo'      perfil listo → perfil = { fecha_nacimiento,
//                     emergencia: { nombre, telefono, parentesco } }.
//   · 'no_verificado' el Portal NO respondió con certeza (env faltante, red,
//                     5xx). BEST-EFFORT CON MATIZ DE CANDADO: jamás dejar a un
//                     ganador atorado por un 502 ajeno — la firma procede con
//                     líneas en blanco y datos.perfil_no_verificado:true para
//                     que Memo lo vea en admin. El candado SOLO aplica cuando
//                     el Portal respondió con certeza.
//
// fusionarPerfilGiveaway(datos, perfil): fusión pre-firma patrón #308 — lo
// manual ya presente en `datos` SIEMPRE gana sobre el perfil.
//
// Env: PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_KEY.
// =============================================================================

async function consultarPerfilGiveaway(correo) {
  const mail = String(correo || '').trim().toLowerCase();
  if (!mail) return { estado: 'no_verificado' };
  const P_URL = process.env.PORTAL_SUPABASE_URL;
  const P_KEY = process.env.PORTAL_SUPABASE_SERVICE_KEY;
  if (!P_URL || !P_KEY) return { estado: 'no_verificado' };
  try {
    const r = await fetch(
      `${P_URL}/rest/v1/clientes?correo=eq.${encodeURIComponent(mail)}` +
      `&select=fecha_nacimiento,contacto_emergencia_nombre,contacto_emergencia_telefono,contacto_emergencia_relacion&limit=1`,
      { headers: { apikey: P_KEY, Authorization: `Bearer ${P_KEY}` } }
    );
    if (!r.ok) return { estado: 'no_verificado' };
    const rows = await r.json().catch(() => null);
    if (!Array.isArray(rows)) return { estado: 'no_verificado' };
    if (!rows.length) return { estado: 'sin_cuenta' };
    const c = rows[0] || {};
    const fnac = String(c.fecha_nacimiento || '').trim();
    const emNom = String(c.contacto_emergencia_nombre || '').trim();
    const emTel = String(c.contacto_emergencia_telefono || '').trim();
    if (!fnac || !emNom || !emTel) return { estado: 'incompleto' };
    const parentesco = String(c.contacto_emergencia_relacion || '').trim();
    return {
      estado: 'completo',
      perfil: {
        fecha_nacimiento: fnac,
        emergencia: { nombre: emNom, telefono: emTel, ...(parentesco ? { parentesco } : {}) },
      },
    };
  } catch (e) {
    return { estado: 'no_verificado' };
  }
}

// Fusión pre-firma (patrón #308): lo capturado a mano en `datos` SIEMPRE gana.
function fusionarPerfilGiveaway(datos, perfil) {
  if (!perfil) return datos;
  const d = { ...(datos || {}) };
  const em = (d.emergencia && typeof d.emergencia === 'object') ? { ...d.emergencia } : {};
  if (!d.fecha_nacimiento && perfil.fecha_nacimiento) d.fecha_nacimiento = perfil.fecha_nacimiento;
  const pe = perfil.emergencia || {};
  if (!em.nombre && pe.nombre) em.nombre = pe.nombre;
  if (!em.telefono && pe.telefono) em.telefono = pe.telefono;
  if (!em.parentesco && pe.parentesco) em.parentesco = pe.parentesco;
  if (Object.keys(em).length) d.emergencia = em;
  return Object.keys(d).length ? d : datos;
}

module.exports = { consultarPerfilGiveaway, fusionarPerfilGiveaway };

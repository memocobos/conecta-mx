// =============================================================================
// _lib/contratos-viajeros  (Contratos F2a — motor de generación)
//
// Un contrato por LUGAR en la tabla `contratos_viajeros` (Portal). Índice parcial
// contratos_viajeros_lugar_uq (lugar_id) WHERE estado<>'anulado' → un solo
// contrato VIVO por lugar. REGLA DE ORO (lección 42P10/23505 de transporte):
// INSERT DIRECTO SIEMPRE, JAMÁS on_conflict/upsert; 23505 = ya existía → se
// ignora (idempotencia honesta).
//
// Recibe (portalUrl, portalHeaders) ya armados por el caller (REST directo con
// service_role, mismo patrón que portal-lugares). No manda correos: eso lo hace
// el caller (admin-solicitud-update-estado).
// =============================================================================

// < 18 años cumplidos HOY. Réplica exacta de _esMenor (portal.html) / _rgEsMenor
// (kamehouse) — misma detección del chip MENOR. Falso si no hay fecha.
function esMenor(fnac) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fnac || '').slice(0, 10));
  if (!m) return false;
  const hoy = new Date();
  let edad = hoy.getFullYear() - Number(m[1]);
  const mm = hoy.getMonth() + 1, dd = hoy.getDate();
  if (mm < Number(m[2]) || (mm === Number(m[2]) && dd < Number(m[3]))) edad--;
  return edad < 18;
}

// Inserta un contrato 'pendiente' para un lugar. INSERT DIRECTO (nunca
// on_conflict). Devuelve:
//   { created:true, id, token, tipo }   si lo creó,
//   { created:false, existed:true }     si ya había uno vivo (23505 → idempotente).
// Lanza solo en errores REALES (no 23505).
async function crearContratoParaLugar({ portalUrl, portalHeaders, lugar, solicitud }) {
  const tipo = esMenor(lugar && lugar.fecha_nacimiento) ? 'menor' : 'adulto';
  const row = {
    lugar_id:     lugar.id,
    solicitud_id: solicitud.id,
    evento_id:    solicitud.evento_id,
    tipo,
    // estado ('pendiente'), token, version_texto ('v3.1') los pone el default de la tabla.
  };
  const r = await fetch(`${portalUrl}/rest/v1/contratos_viajeros`, {
    method: 'POST',
    headers: { ...portalHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (r.ok) {
    const arr = await r.json().catch(() => []);
    const c = Array.isArray(arr) ? arr[0] : arr;
    return { created: true, id: c && c.id, token: c && c.token, tipo };
  }
  const detail = await r.text().catch(() => '');
  // 23505 unique_violation (índice parcial lugar_uq) → ya existía un contrato vivo.
  if (r.status === 409 || /23505|duplicate key|contratos_viajeros_lugar_uq/i.test(detail)) {
    return { created: false, existed: true };
  }
  throw new Error('contrato insert falló (' + r.status + '): ' + detail.slice(0, 200));
}

// Token del contrato VIVO de un lugar (para armar el link del correo cuando el
// contrato ya existía y el INSERT no nos devolvió token).
async function tokenContratoLugar({ portalUrl, portalHeaders, lugarId }) {
  const r = await fetch(
    `${portalUrl}/rest/v1/contratos_viajeros?lugar_id=eq.${encodeURIComponent(lugarId)}`
    + `&estado=neq.anulado&select=token&limit=1`,
    { headers: portalHeaders }
  );
  if (!r.ok) return null;
  const arr = await r.json().catch(() => []);
  return (Array.isArray(arr) && arr[0]) ? arr[0].token : null;
}

// Genera un contrato por CADA lugar activo de una solicitud. Best-effort por
// lugar (un fallo suelto se loguea, no aborta el resto). Devuelve
// { creados, total, titularToken } donde titularToken = token del contrato del
// lugar #1 (para el correo al titular).
async function generarContratosDeSolicitud({ portalUrl, portalHeaders, solicitud }) {
  const lr = await fetch(
    `${portalUrl}/rest/v1/lugares?solicitud_id=eq.${encodeURIComponent(solicitud.id)}`
    + `&estado=eq.activo&select=id,numero,fecha_nacimiento&order=numero.asc`,
    { headers: portalHeaders }
  );
  if (!lr.ok) throw new Error('no se pudieron leer los lugares');
  const lugares = await lr.json().catch(() => []);
  let creados = 0, titularToken = null;
  for (const lugar of (Array.isArray(lugares) ? lugares : [])) {
    try {
      const res = await crearContratoParaLugar({ portalUrl, portalHeaders, lugar, solicitud });
      if (res.created) creados++;
      if (Number(lugar.numero) === 1) {
        titularToken = res.token || await tokenContratoLugar({ portalUrl, portalHeaders, lugarId: lugar.id });
      }
    } catch (e) {
      console.warn('[contratos-viajeros] lugar ' + (lugar && lugar.id) + ':', e.message);
    }
  }
  return { creados, total: Array.isArray(lugares) ? lugares.length : 0, titularToken };
}

module.exports = { esMenor, crearContratoParaLugar, tokenContratoLugar, generarContratosDeSolicitud };

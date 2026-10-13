// =============================================================================
// _lib/puente-portal — EL PUENTE al Portal, con UN dueño (ACOMP-1, 13-oct-2026).
//
// Nació dentro de admin-portal-puente (MIG-1d-i) y se mudó aquí TAL CUAL para
// que la bandeja de requisiciones (al aprobar) use EXACTAMENTE el mismo código
// que el botón del puente: dar de alta el walk-in en `clientes` del Portal y
// escribir `portal_cliente_id` en TODAS las filas de esa persona. Dos copias de
// «cómo entra alguien al Portal» serían dos listas que todavía no divergen.
//
// 🔒 CERO ESCRITURAS DE DINERO (la regla de MIG-1d-i, intacta): el dinero
//    migrado lo cuenta `saldoMigrado`; copiarlo al Portal lo contaría dos veces.
//
// puentearViajeros({ viajeros, KH_URL, KH_KEY, PT_URL, PT_KEY, ejecutar })
//   viajeros: filas de viajeros_evento con
//     id,nombre,correo,celular,talla_playera,emergencia_nombre,num_emergencia,portal_cliente_id
//   evento_id: solo viaja al resumen (rótulo)
//   → { resumen, nuevos, yaTenian, yaPuenteados, saltados, creados?, errores? }
//   → { error, detail } si el Portal no se pudo leer.
// =============================================================================

const { llaveCorreo, esCorreoUsable, tallaNormalizada } = require('./correo-forma');

async function puentearViajeros({ evento_id, viajeros, KH_URL, KH_KEY, PT_URL, PT_KEY, ejecutar }) {
  const hKH = { apikey: KH_KEY, Authorization: 'Bearer ' + KH_KEY, 'Content-Type': 'application/json' };
  const hPT = { apikey: PT_KEY, Authorization: 'Bearer ' + PT_KEY, 'Content-Type': 'application/json' };
  // 2. Agrupados POR CORREO, no por fila. Una persona con dos filas es UNA
  //    cuenta — y las DOS filas se marcan. La lección del consuelo.
  const grupos = new Map();
  const saltados = [];
  for (const v of viajeros) {
    const k = llaveCorreo(v.correo);
    if (!k) { saltados.push({ nombre: v.nombre, motivo: 'sin correo en su fila' }); continue; }
    if (!esCorreoUsable(v.correo)) { saltados.push({ nombre: v.nombre, correo: v.correo, motivo: 'el correo no tiene forma de correo' }); continue; }
    if (!grupos.has(k)) grupos.set(k, { correo: k, nombre: v.nombre, filas: [] });
    grupos.get(k).filas.push(v);
  }

  // 3. Quién ya existe en el Portal. Se pregunta por los correos EN JUEGO, no
  //    se trae la tabla entera: traerla y filtrar aquí sería la segunda fuente.
  const correos = [...grupos.keys()];
  const yaEnPortal = new Map();
  for (let i = 0; i < correos.length; i += 100) {
    const lote = correos.slice(i, i + 100);
    const inList = lote.map((c) => '"' + c.replace(/"/g, '\\"') + '"').join(',');
    const cR = await fetch(`${PT_URL}/rest/v1/clientes?correo=in.(${encodeURIComponent(inList)})&select=id,correo,auth_user_id&limit=200`, { headers: hPT });
    if (!cR.ok) return { error: 'No pude leer los clientes del Portal', detail: await cR.text() };
    (await cR.json()).forEach((c) => yaEnPortal.set(llaveCorreo(c.correo), c));
  }

  // 4. La lista, con nombres y motivo. Esto es lo que Memo confirma.
  const nuevos = [], yaTenian = [], yaPuenteados = [];
  for (const g of grupos.values()) {
    const cli = yaEnPortal.get(g.correo);
    const yaMarcado = g.filas.every((f) => f.portal_cliente_id);
    const fila = { nombre: g.nombre, correo: g.correo, filas: g.filas.length, cliente_id: cli ? cli.id : null };
    if (cli && yaMarcado) yaPuenteados.push({ ...fila, motivo: 'ya tiene cuenta y ya está enlazado' });
    else if (cli) yaTenian.push({ ...fila, motivo: cli.auth_user_id ? 'ya tiene cuenta del Portal' : 'ya existe como walk-in' });
    else nuevos.push(fila);
  }

  const resumen = {
    evento_id,
    viajeros: viajeros.length,
    personas: grupos.size,
    reciben_cuenta_nueva: nuevos.length,
    ya_existian_en_portal: yaTenian.length,
    ya_puenteados: yaPuenteados.length,
    saltados: saltados.length,
  };

  if (!ejecutar) return { resumen, nuevos, yaTenian, yaPuenteados, saltados };

  // 5. EJECUTAR. Alta en el Portal + enlace en KameHouse. Nada más.
  const creados = [], errores = [];
  for (const g of nuevos) {
    const filas = grupos.get(g.correo).filas;
    const base = filas.find((f) => f.celular) || filas[0];
    // `numero_cliente` NO se manda: lo asigna el trigger
    // `clientes_before_insert` con nextval('numero_cliente_seq') cuando llega
    // null. Calcularlo aquí sería una segunda fuente para una llave UNIQUE.
    const nuevo = {
      correo: g.correo,
      nombre_completo: g.nombre,
      celular: base.celular || null,
      talla_playera: tallaNormalizada(base.talla_playera),   // o null: el CHECK de la base solo acepta XS…XXL
      contacto_emergencia_nombre: base.emergencia_nombre || null,
      contacto_emergencia_telefono: base.num_emergencia || null,
      creado_por_admin: true,
    };
    const iR = await fetch(`${PT_URL}/rest/v1/clientes`, {
      method: 'POST', headers: { ...hPT, Prefer: 'return=representation' }, body: JSON.stringify(nuevo),
    });
    if (!iR.ok) { errores.push({ correo: g.correo, paso: 'alta en el Portal', detail: await iR.text() }); continue; }
    const fila = (await iR.json())[0];
    creados.push({ correo: g.correo, cliente_id: fila.id, numero_cliente: fila.numero_cliente });
    yaEnPortal.set(g.correo, fila);
  }

  // 6. El enlace, en TODAS las filas de esa persona.
  let filasEnlazadas = 0;
  for (const g of grupos.values()) {
    const cli = yaEnPortal.get(g.correo);
    if (!cli) continue;
    const pendientes = g.filas.filter((f) => f.portal_cliente_id !== cli.id);
    if (!pendientes.length) continue;
    const ids = pendientes.map((f) => '"' + f.id + '"').join(',');
    const uR = await fetch(`${KH_URL}/rest/v1/viajeros_evento?id=in.(${encodeURIComponent(ids)})`, {
      method: 'PATCH', headers: hKH, body: JSON.stringify({ portal_cliente_id: cli.id }),
    });
    if (!uR.ok) { errores.push({ correo: g.correo, paso: 'enlace en KameHouse', detail: await uR.text() }); continue; }
    filasEnlazadas += pendientes.length;
  }

  return {
    resumen: { ...resumen, cuentas_creadas: creados.length, filas_enlazadas: filasEnlazadas, errores: errores.length },
    creados, errores, saltados, nuevos, yaTenian, yaPuenteados,
  };
}

module.exports = { puentearViajeros };

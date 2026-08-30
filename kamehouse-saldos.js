// =============================================================================
// kamehouse-saldos.js — los saldos, sacados del tronco (MONO-15)
// =============================================================================
// Mismas reglas de la serie: SOLO funciones, en el MISMO ORDEN, con su
// comentario pegado, y cero código de nivel superior.
//
// Careo de RECONSTRUCCIÓN: re-intercalar estos bloques devuelve el
// `kamehouse.js` de su commit BYTE A BYTE.
// =============================================================================

async function loadSaldos() {
 const el = document.getElementById('saldos-content');
 if (!el) return;
 _saldoDetalleActivo = null;
 const panel = document.getElementById('saldo-detalle-panel');
 if (panel) { panel.style.display = 'none'; panel.innerHTML = ''; }
 el.innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando…</div>';
 try {
 const r = await khAdminFetch('/.netlify/functions/admin-saldos', {
 method: 'POST',
 headers: _spAdminHeaders(),
 body: JSON.stringify({}),
 });
 const d = await r.json();
 if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los saldos');
 _saldosData = d;
 _renderSaldos(d);
 } catch(e) {
 el.innerHTML = `<div class="alert alert-error">${_spEscape(e.message)}</div>`;
 }
}
function _renderSaldos(d) {
 const el = document.getElementById('saldos-content');
 if (!el) return;
 const cuentas = d.cuentas || {};
 const orden = ['BBVA', 'Banamex', 'Efectivo'];
 const cards = orden.map(nombre => {
   const c = cuentas[nombre] || { entradas: 0, salidas: 0, saldo: 0 };
   const saldoColor = (Number(c.saldo) >= 0) ? 'var(--green)' : 'var(--red)';
   return `<div class="card saldo-card" style="cursor:pointer" onclick="_toggleSaldoDetalle('${nombre}')">
     <div style="display:flex;justify-content:space-between;align-items:center">
       <div style="font-weight:700;letter-spacing:.04em">${_esfEsc(nombre)}</div>
       <span style="font-size:11px;color:var(--ts)">ver detalle ▾</span>
     </div>
     <div style="font-size:28px;font-weight:800;color:${saldoColor};margin:10px 0 6px">${_spFmtMxn(c.saldo)}</div>
     <div style="font-size:12px;color:var(--ts)">Entradas ${_spFmtMxn(c.entradas)} · Salidas ${_spFmtMxn(c.salidas)}</div>
   </div>`;
 }).join('');
 const grid = `<div class="metrics-grid">${cards}</div>`;

 let pie = '';
 if (Number(d.otros_total || 0) !== 0) {
   pie = `<div style="font-size:12px;color:var(--ts);margin-top:12px">${_spFmtMxn(d.otros_total)} en Otro/sin cuenta (no mostrado en las tarjetas).</div>`;
 }

 // [SAL-1] DOS LETREROS QUE NO SE PUEDEN CALLAR.
 //
 // (1) Si el dinero migrado no se pudo leer, estas tarjetas están incompletas —
 //     y una tarjeta incompleta que se presenta como completa es exactamente el
 //     bug de esta tuerca. Se dice.
 // (2) Lo que no se pudo repartir a una cuenta NO se reparte a ciegas: se
 //     imprime, con su monto, sus filas y el motivo. Si algún día deja de valer
 //     $0, se ve — que es lo contrario de desaparecer.
 const m = d.migrados;
 if (d.migrados_error) {
   pie += `<div class="sal1-aviso">No pude leer el dinero de los migrados del Excel, así que estos saldos están <b>incompletos</b> (solo el Portal).</div>`;
 } else if (m && m.ve_migrados) {
   const sc = m.sin_clasificar || {};
   if (Number(sc.monto || 0) !== 0 || Number(sc.filas || 0) !== 0) {
     pie += `<div class="sal1-aviso"><b>${_spFmtMxn(sc.monto || 0)}</b> de migrados sin cuenta identificada
       (${sc.filas} ${sc.filas === 1 ? 'viajero' : 'viajeros'}) — <b>no</b> están repartidos en las tarjetas de arriba.
       ${(sc.motivos || []).length ? 'Motivo: ' + _esfEsc(sc.motivos.join(' · ')) : ''}</div>`;
   }
   if (Number(m.total || 0) !== 0) {
     pie += `<div style="font-size:12px;color:var(--ts);margin-top:8px">Incluye <b>${_spFmtMxn(m.total)}</b> cobrado a migrados del Excel, repartido por paquete (CHEAP a Banamex, los demás al banco del evento).</div>`;
   }
 }
 const stamp = d.generado_at ? `<div style="font-size:11px;color:var(--ts);margin-top:6px">Actualizado: ${_spFmtFechaAbs(d.generado_at)}</div>` : '';
 el.innerHTML = grid + pie + stamp;
}
// Abre/cierra el panel de detalle (compartido, debajo de las tarjetas) para una cuenta.
function _toggleSaldoDetalle(nombre) {
 const panel = document.getElementById('saldo-detalle-panel');
 if (!panel || !_saldosData) return;
 if (_saldoDetalleActivo === nombre) {   // clic en la misma → cerrar
   panel.style.display = 'none';
   panel.innerHTML = '';
   _saldoDetalleActivo = null;
   return;
 }
 const c = (_saldosData.cuentas || {})[nombre];
 if (!c) return;
 _saldoDetalleActivo = nombre;
 panel.innerHTML = `<div style="font-weight:700;margin-bottom:12px">Detalle · ${_esfEsc(nombre)}</div>` + _renderSaldoDetalle(c);
 panel.style.display = '';
}
function _renderSaldoDetalle(c) {
 const linea = (izq, monto, color) =>
   `<div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;padding:3px 0">
      <span>${izq}</span><span style="color:${color};white-space:nowrap">${monto}</span>
    </div>`;
 const seccion = (titulo, subtotal, color, filas) =>
   `<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-weight:600;font-size:13px;margin-bottom:4px">
        <span>${_esfEsc(titulo)}</span><span style="color:${color}">${subtotal}</span>
      </div>${filas}
    </div>`;

 const pagosFilas = (c.pagos || []).length
   ? c.pagos.map(p => linea(`${fmtFecha(p.fecha)} · ${_spEscape(p.cliente || '—')}${p.evento ? (' · ' + _spEscape(p.evento)) : ''}`, _spFmtMxn(p.monto), 'var(--green)')).join('')
   : '<div style="font-size:12px;color:var(--ts)">Sin pagos cobrados</div>';
 const ingFilas = (c.ingresos || []).length
   ? c.ingresos.map(i => linea(`${fmtFecha(i.fecha)} · ${_spEscape(i.concepto || '—')}`, _spFmtMxn(i.monto), 'var(--green)')).join('')
   : '<div style="font-size:12px;color:var(--ts)">Sin ingresos sueltos</div>';
 const gasFilas = (c.gastos || []).length
   ? c.gastos.map(g => linea(`${fmtFecha(g.fecha)} · ${_spEscape(g.concepto || '—')}`, '−' + _spFmtMxn(g.monto), 'var(--red)')).join('')
   : '<div style="font-size:12px;color:var(--ts)">Sin gastos</div>';

 // [SAL-1] Los migrados NO traen renglones: `abonos_viajero` no guarda la cuenta,
 // así que el reparto se DEDUCE del paquete de cada viajero. Se dice de dónde
 // sale en vez de inventar un detalle fila por fila que no existe. La sección
 // solo aparece cuando hay dinero migrado en ESTA cuenta: sin migrados, el panel
 // queda exactamente como estaba.
 const mig = Number(c.entradas_migrados || 0);
 const migSeccion = mig
   ? seccion('+ Cobrado a migrados del Excel', _spFmtMxn(mig), 'var(--green)',
       '<div style="font-size:12px;color:var(--ts)">Repartido por paquete: CHEAP a Banamex, los demás al banco del evento. El detalle por viajero vive en <b>Por evento</b>.</div>')
   : '';

 return seccion('+ Pagos cobrados', _spFmtMxn(c.entradas_pagos), 'var(--green)', pagosFilas)
   + seccion('+ Ingresos sueltos', _spFmtMxn(c.entradas_ingresos), 'var(--green)', ingFilas)
   + migSeccion
   + seccion('− Gastos', '−' + _spFmtMxn(c.salidas_gastos), 'var(--red)', gasFilas)
   + `<div style="display:flex;justify-content:space-between;font-weight:800;font-size:15px;border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
        <span>= Saldo</span><span style="color:${Number(c.saldo) >= 0 ? 'var(--green)' : 'var(--red)'}">${_spFmtMxn(c.saldo)}</span>
      </div>`;
}
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

 // [SALDOS-CAJA-1] EL ANCLA SE DICE, O EL SALDO MIENTE POR OMISIÓN. Estas
 // tarjetas ya no son «toda la historia»: arrancan del saldo real de banco
 // (el ingreso «Saldo inicial» del ancla) y solo suman lo capturado desde
 // entonces. Un número así presentado sin esa palabra se leería como el saldo
 // histórico — que es justo la mentira de millones que esta tuerca retiró.
 // La fecha la dice la FUENTE (`d.ancla`); la pantalla no la inventa: sin
 // ancla en la respuesta, no hay rótulo que afirmar.
 // ⚰️ Aquí vivían los avisos [SAL-1] de migrados (incompletos/sin_clasificar):
 // el handler ya no manda esos campos — el término se retiró con luz verde de
 // Memo (ver admin-saldos.js y _lib/cuentas-dinero.js).
 if (d.ancla) {
   pie += `<div style="font-size:12px;color:var(--ts);margin-top:12px">Caja anclada al banco real: arranca del «Saldo inicial» del <b>${_esfEsc(_saldosFechaAncla(d.ancla))}</b> y solo suma lo capturado desde entonces. Las entradas de clientes posteriores al ancla <b>no</b> entran solas: se capturan como ingreso por cuenta, o se re-ancla contra el banco.</div>`;
 }
 const stamp = d.generado_at ? `<div style="font-size:11px;color:var(--ts);margin-top:6px">Actualizado: ${_spFmtFechaAbs(d.generado_at)}</div>` : '';
 el.innerHTML = grid + pie + stamp;
}
// [SALDOS-CAJA-1] Pinta '2026-10-13' como '13-oct-2026' SIN pasar por `new
// Date`: una fecha `date` por el constructor es medianoche UTC = el día
// ANTERIOR en México (la mordida de `toISOString()`, en espejo).
function _saldosFechaAncla(iso) {
 const p = String(iso || '').split('-');
 const MES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
 if (p.length !== 3) return String(iso || '');
 return `${Number(p[2])}-${MES[Number(p[1])] || p[1]}-${p[0]}`;
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

 // ⚰️ [SALDOS-CAJA-1] Aquí vivía la sección «+ Cobrado a migrados del Excel»
 // (`c.entradas_migrados`). El handler retiró ese término con luz verde de
 // Memo — era una aproximación de millones contra bancos reales de miles — y
 // ya no manda el campo. El arranque de la caja es el renglón «Saldo inicial»
 // que se ve entre los ingresos de cada cuenta.

 return seccion('+ Pagos cobrados', _spFmtMxn(c.entradas_pagos), 'var(--green)', pagosFilas)
   + seccion('+ Ingresos sueltos', _spFmtMxn(c.entradas_ingresos), 'var(--green)', ingFilas)
   + seccion('− Gastos', '−' + _spFmtMxn(c.salidas_gastos), 'var(--red)', gasFilas)
   + `<div style="display:flex;justify-content:space-between;font-weight:800;font-size:15px;border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
        <span>= Saldo</span><span style="color:${Number(c.saldo) >= 0 ? 'var(--green)' : 'var(--red)'}">${_spFmtMxn(c.saldo)}</span>
      </div>`;
}
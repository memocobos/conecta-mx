#!/usr/bin/env node
// mide-wl-dup-1 · WL-DUP-1 (6-nov-2026)
// El «Avísame» de un evento próximamente decía «No pudimos registrarte» a quien
// YA estaba en la lista (Jessica, Ozzfest: 1º intento 200, los 4 siguientes 502).
// Entra por el handler REAL con un fetch falso que modela PostgREST:
//   · insert nuevo → 201
//   · duplicado (evento_id,email) → 409 con el cuerpo real de PostgREST (23505 idx_wl_unique)
//   · otro error → 409 de OTRO índice / 500 → tiene que seguir siendo 502 (no tragárselo)
const path = require('path');
process.env.SUPABASE_SERVICE_KEY_KAMEHOUSE = 'k';
const RAIZ = path.join(__dirname, '..');

let verdes = 0, rojos = 0;
const af = (c, m) => { if (c) { verdes++; console.log('  ✓', m); } else { rojos++; console.log('  ✗', m); } };

const filas = new Set();
let modo = 'real';
global.fetch = async (url, init) => {
  const b = JSON.parse(init.body);
  if (modo === 'otro-indice') return { ok: false, status: 409, text: async () => JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint "otra_cosa"' }) };
  if (modo === 'caida') return { ok: false, status: 500, text: async () => 'boom' };
  const k = b.evento_id + '|' + b.email;
  if (filas.has(k)) return { ok: false, status: 409, text: async () => JSON.stringify({ code: '23505', details: 'Key (evento_id, email)=(ozzfest, x) already exists.', hint: null, message: 'duplicate key value violates unique constraint "idx_wl_unique"' }) };
  filas.add(k);
  return { ok: true, status: 201, text: async () => '', json: async () => [] };
};

const { handler } = require(path.join(RAIZ, 'netlify/functions/waitlist-subscribe.js'));
const ev = (body) => ({ httpMethod: 'POST', headers: { origin: 'https://conectareynosa.mx' }, body: JSON.stringify(body) });
const base = { evento_id: 'ozzfest', evento_nombre: 'Ozzfest 2027', nombre: 'Jessica', email: 'jess@x.com' };

(async () => {
  console.log('[A] primera vez → registrada');
  let r = await handler(ev(base)); let j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.ok && j.new === true && j.already === false, `200 nuevo (${r.statusCode} ${r.body})`);

  console.log('[B] segunda vez (el caso de Jessica) → «ya estás en la lista», no error');
  r = await handler(ev(base)); j = JSON.parse(r.body);
  af(r.statusCode === 200 && j.ok === true && j.already === true, `200 already (${r.statusCode} ${r.body})`);
  af(filas.size === 1, 'sigue habiendo UNA fila');

  console.log('[C] otro evento, mismo correo → registra aparte');
  r = await handler(ev({ ...base, evento_id: 'otro' })); j = JSON.parse(r.body);
  af(j.ok && j.new === true, 'nuevo en el otro evento');

  console.log('[D] un 23505 de OTRO índice NO se disfraza de «ya estás»');
  modo = 'otro-indice';
  r = await handler(ev({ ...base, email: 'z@x.com' }));
  af(r.statusCode === 502, `502 (${r.statusCode})`);

  console.log('[E] base caída → 502, no un éxito falso');
  modo = 'caida';
  r = await handler(ev({ ...base, email: 'y@x.com' }));
  af(r.statusCode === 502, `502 (${r.statusCode})`);

  console.log(`\n${rojos ? '🔴' : '✅'} ${verdes} en verde · ${rojos} en rojo`);
  process.exit(rojos ? 1 : 0);
})();

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * mide-baba-ux-2 — BABA-UX-2 · el desplegable de eventos del código (26-oct-2026)
 *
 * Palabra de Memo: «la parte de seleccionar los tours que quiero que aplique
 * el codigo esta bien dificil de entender, y si quiero quitar algunos eventos
 * del codigo y meter otros y dejar unos no tengo opciones».
 * La causa era el <select multiple> nativo (Cmd/Ctrl + clic): un clic normal
 * BORRABA el resto de la selección. Hoy: desplegable con palomitas + buscador
 * + fichas con ✕, y la verdad vive en un Set — no en el DOM.
 *
 * ⚠️ SIN ANCLA a propósito: carga del ÁRBOL DE TRABAJO (como mide:req-b1).
 * No sufre la trampa del commit; no puede traer control positivo por commit.
 * Sus controles son positivos por construcción (sembrar el caso y verlo caer).
 * Las funciones REALES se rebanan de kamehouse-baba.js y corren en vm con un
 * DOM falso que registra nodos POR ID (los hijos del desplegable nacen por
 * createElement y el código los busca con getElementById).
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(RAIZ, 'kamehouse-baba.js'), 'utf8');

let V = 0, R = 0;
function af(cond, msg) {
  let ok = false;
  try { ok = !!cond; } catch (e) { ok = false; msg = (typeof msg === 'function' ? '?' : msg) + ' · EXCEPCIÓN: ' + e.message; }
  const m = typeof msg === 'function' ? (() => { try { return msg(); } catch (e) { return '? (' + e.message + ')'; } })() : msg;
  if (ok) { V++; console.log('  ✓ ' + m); } else { R++; console.log('  ✗ ' + m); }
}
function ver(fn) { try { return JSON.stringify(fn()); } catch (e) { return '«' + e.message + '»'; } }

// Rebana una función top-level por balance de llaves.
function funcionDe(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let d = 0, fin = -1;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) { fin = k + 1; break; } }
  }
  return fin > 0 ? src.slice(i, fin) : null;
}

(async () => {
  console.log('══ mide-baba-ux-2 · el desplegable de eventos del código ══');

  // ── [A] LAS FUNCIONES EXISTEN Y SE REBANAN ─────────────────────────────────
  console.log('\n[A] rebanado de las funciones reales');
  const FNS = ['_babaEvSt', '_babaEvInit', '_babaEvNombre', 'babaEvToggle', 'babaEvAbrir',
               '_babaEvRotular', '_babaEvPintarLista', '_babaEvPintar', '_babaEventosElegidos',
               'babaTodosEventos'];
  const cuerpos = FNS.map((n) => funcionDe(SRC, n));
  af(cuerpos.every(Boolean), () => 'las 10 funciones del desplegable se rebanan: ' + ver(() => FNS.filter((n, i) => !cuerpos[i])));
  af(!SRC.includes('baba-evento'), 'el select viejo (id baba-evento) murió del módulo entero — cero referencias');
  af(!SRC.includes('selectedOptions'), 'nadie lee selectedOptions: la verdad ya no vive en el DOM');

  // ── DOM falso con registro por id ──────────────────────────────────────────
  function domFalso() {
    const porId = {};
    const mkNodo = () => {
      const hijos = [];
      const n = {
        _id: '', value: '', textContent: '', className: '', type: '', title: '',
        checked: false, disabled: false, onclick: null, oninput: null,
        children: hijos, style: {},
        classList: {
          _s: new Set(),
          toggle(c, f) { f === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (f ? this._s.add(c) : this._s.delete(c)); },
          add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); },
        },
        appendChild(x) { if (x && x._texto !== undefined) { n.textContent += x._texto; } else hijos.push(x); },
        focus() {},
      };
      Object.defineProperty(n, 'id', {
        get() { return n._id; },
        set(v) { n._id = v; porId[v] = n; },
      });
      Object.defineProperty(n, 'innerHTML', {
        get() { return ''; },
        set() { hijos.length = 0; n.textContent = ''; },
      });
      Object.defineProperty(n, 'cssText', { value: '', writable: true });
      return n;
    };
    const dd = mkNodo(); dd.id = 'baba-evdd';
    const todos = mkNodo(); todos.id = 'baba-todos';
    return {
      porId, dd, todos, mkNodo,
      document: {
        getElementById: (id) => porId[id] || null,
        createTextNode: (t) => ({ _texto: String(t) }),
        createElement: () => mkNodo(),
      },
    };
  }

  // ── [B] EL FLUJO: meter, quitar y DEJAR — sin Cmd, sin borrar nada ─────────
  console.log('\n[B] el flujo del dedo (funciones reales en vm)');
  const { porId, todos, document } = domFalso();
  const ctx = vm.createContext({ document, window: {}, String, Set, Array, JSON, console, setTimeout: (f) => f() });
  FNS.forEach((n, i) => vm.runInContext(cuerpos[i], ctx));

  const CATALOGO = [{ id: 'karolg', a: 'Karol G en Monterrey' }, { id: 'omar', a: 'Omar Courtz' }, { id: 'bruno', a: 'Bruno Mars' }];
  // Un código que ya traía DOS eventos: uno vivo y uno que YA NO está en el
  // catálogo (el select viejo lo PERDÍA en silencio: su <option> no existía).
  vm.runInContext('_babaEvInit', ctx)(CATALOGO, { only_events: ['karolg', 'fantasma2025'] });

  const btn = porId['baba-evdd-btn'], lista = porId['baba-ev-lista'], chips = porId['baba-ev-chips'];
  af(btn && lista && chips, 'el esqueleto se armó: botón + lista + fichas');
  const elegidos = () => vm.runInContext('_babaEventosElegidos', ctx)();
  af(JSON.stringify(elegidos()) === JSON.stringify(['karolg', 'fantasma2025']),
     () => '🔒 el id huérfano NO se tira al abrir (el select viejo lo perdía en silencio): ' + ver(elegidos));
  af(/ya no está en el catálogo/.test(btn.textContent) || chips.children.some((c) => /ya no está/.test(c.textContent)),
     () => 'el huérfano se ROTULA, no se disfraza de evento vivo: ' + ver(() => btn.textContent));
  af(lista.children.length === 3, () => 'la lista pinta el catálogo completo (3): ' + ver(() => lista.children.length));

  // Meter uno NUEVO por el dedo: lo demás NO se mueve (el defecto viejo era
  // que el clic normal del select nativo dejaba SOLO el nuevo).
  const optOmar = lista.children.find((b) => b.textContent === 'Omar Courtz');
  optOmar.onclick();
  af(elegidos().length === 3 && elegidos().includes('karolg') && elegidos().includes('fantasma2025') && elegidos().includes('omar'),
     () => '🔴 METER no borra lo demás — karolg y el huérfano siguen (el defecto del select nativo): ' + ver(elegidos));
  af(/3 eventos elegidos/.test(porId['baba-evdd-btn'].textContent),
     () => 'el botón-resumen dice «3 eventos elegidos»: ' + ver(() => porId['baba-evdd-btn'].textContent));

  // QUITAR por la ficha ✕: solo se va ése.
  const fichaKarol = porId['baba-ev-chips'].children.find((c) => /Karol G/.test(c.textContent));
  af(!!fichaKarol, 'Karol G tiene su ficha abajo');
  fichaKarol.children[0].onclick();   // el ✕
  af(elegidos().length === 2 && !elegidos().includes('karolg') && elegidos().includes('omar'),
     () => 'el ✕ QUITA solo a Karol G — omar y el huérfano se quedan: ' + ver(elegidos));

  // El buscador filtra la lista SIN tocar la selección.
  const busca = porId['baba-ev-buscar'];
  busca.value = 'bru'; busca.oninput.call(busca);
  af(porId['baba-ev-lista'].children.length === 1 && porId['baba-ev-lista'].children[0].textContent === 'Bruno Mars',
     () => 'buscar «bru» deja solo a Bruno en la lista: ' + ver(() => porId['baba-ev-lista'].children.map((b) => b.textContent)));
  af(elegidos().length === 2,
     () => '🔒 filtrar NO pierde la selección (un filtro que borra lo elegido sería el defecto con otra cara): ' + ver(elegidos));
  // Y palomear al filtrado SUMA sobre lo que había.
  porId['baba-ev-lista'].children[0].onclick();
  af(elegidos().length === 3 && elegidos().includes('bruno'),
     () => 'elegir con el filtro puesto SUMA (bruno + los 2 de antes): ' + ver(elegidos));

  // «Vale en TODOS»: apaga el botón y CONSERVA el Set.
  todos.checked = true;
  vm.runInContext('babaTodosEventos', ctx)();
  af(porId['baba-evdd-btn'].disabled === true, 'con «todos» el desplegable se apaga');
  af(elegidos().length === 3, '…y la selección se CONSERVA (destildar la recupera)');
  todos.checked = false;
  vm.runInContext('babaTodosEventos', ctx)();
  af(porId['baba-evdd-btn'].disabled === false && elegidos().length === 3,
     'destildado: el desplegable revive con los 3 elegidos intactos');

  // ── [C] EL GUARDADO LEE DEL SET (el cable que viaja al servidor) ──────────
  console.log('\n[C] el cable del guardado');
  af(/only_events:\s*chk\('baba-todos'\)\s*\?\s*\[\]\s*:\s*_babaEventosElegidos\(\)/.test(SRC),
     'babaGuardar sigue mandando only_events desde _babaEventosElegidos (y [] con «todos»)');
  af(/_babaEvSt\(\)\.sel\s*=\s*new Set\(\[p\.evento\]\)/.test(SRC),
     'el prefill del oráculo entra por el Set del desplegable');

  // ── RESULTADO ──────────────────────────────────────────────────────────────
  console.log('\n══ RESULTADO ══');
  if (V === 0) { console.log('⚠️ NADA MEDIDO · esto NO es un verde'); process.exit(1); }
  console.log((R ? '🔴 ROJO' : '✅ VERDE') + ' · ' + V + ' en verde · ' + R + ' en rojo');
  process.exit(R ? 1 : 0);
})();

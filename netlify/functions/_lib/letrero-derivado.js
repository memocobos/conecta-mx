// =============================================================================
// _lib/letrero-derivado.js — el letrero se DERIVA, no se copia (BABA-UX-2)
// =============================================================================
// EL DEFECTO, medido el 30-ago. `esferas_eventos.flash_promo` se escribía AL
// ENCENDER el letrero, con una copia entera del código, y NUNCA se volvía a
// mirar: editar el código en `promos_codigos` no la actualizaba. Un
// `expires_at` corregido a 04:59 seguía diciendo 05:00 en la ficha de juniorh.
// Dos almacenes del mismo dato que ya divergieron — la trampa número uno del
// libro, y la única que hoy puede pintar un número equivocado en el sitio.
//
// Y no es cosmético: el índice usa `flashPromo` para DOS cosas que le hablan al
// cliente — el badge con cronómetro de la tarjeta, y la promesa del onboarding
// («aplícalo antes de cotizar para obtener $X de descuento»). Con la copia
// vieja, esa frase promete una cifra que el cajero no va a dar.
//
// ── LA REGLA ────────────────────────────────────────────────────────────────
// El `flash_promo` guardado deja de ser el dato: pasa a ser LA MARCA DE
// INTENCIÓN. De él solo se lee `code` —qué código es el letrero de este
// evento—; el resto (pct/amount/expiresTs/excludePkg/expiresHours) sale de la
// fila viva de `promos_codigos` en el momento de publicar.
//
// Si el código marcado ya no sirve —no existe, está archivado, no aplica a este
// evento, o ya venció— NO SE EMITE LETRERO, y el publish lo dice por su nombre.
// Ahí muere el caso CAIFAN: un letrero vencido dejaba de anunciarse pero seguía
// escrito, prometiendo lo que ya no vale.
//
// ⚠️ LO QUE NO HACE, Y POR QUÉ. No busca «algún código vivo que aplique» para
// rellenar el hueco. Sería fácil y está mal: un código de `all_events` —hoy GOL—
// le pondría badge a TODOS los eventos de un jalón, sin que nadie lo pidiera. El
// letrero es una decisión por evento y sigue siéndolo; lo que cambia es de dónde
// salen sus números.
// =============================================================================

function _obj(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return Array.isArray(raw) ? null : raw;
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  try { const o = JSON.parse(t); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : null; }
  catch (_) { return null; }
}

// ¿Este código aplica a este evento? Misma regla que usa el cajero: o vale en
// todos, o el evento está en su lista. Se compara contra el slug BASE también,
// porque los códigos se guardan por evento y las fichas multifecha llevan `#n`.
function aplicaAlEvento(fila, slug) {
  if (!fila) return false;
  if (fila.all_events) return true;
  const lista = Array.isArray(fila.only_events) ? fila.only_events : [];
  if (!lista.length) return false;
  const base = String(slug || '').split('#')[0];
  return lista.some((e) => e === slug || e === base);
}

// derivarLetrero(esfera, porCodigo, ahora) →
//   { flash_promo: <objeto|null>, aviso: <string|null> }
// `porCodigo` es un Map de codigo→fila de promos_codigos.
function derivarLetrero(esfera, porCodigo, ahora) {
  const marca = _obj(esfera && esfera.flash_promo);
  const code = marca && typeof marca.code === 'string' ? marca.code.trim() : '';
  if (!code) return { flash_promo: null, aviso: null };   // sin marca no hay letrero, y está bien

  const slug = esfera && esfera.slug;
  const fila = porCodigo.get(code.toUpperCase());
  const dilo = (motivo) => ({ flash_promo: null,
    aviso: `${slug}: el letrero apunta a «${code}» y ${motivo}. No se emitió — enciéndelo de nuevo desde Baba.` });

  if (!fila) return dilo('ese código ya no existe en la casa de Baba');
  if (fila.archivado) return dilo('ese código está archivado');
  if (!aplicaAlEvento(fila, slug)) return dilo('ese código ya no aplica a este evento');
  const ts = fila.expires_at ? Date.parse(fila.expires_at) : NaN;
  if (!Number.isFinite(ts)) return dilo('ese código no tiene vencimiento, y un letrero sin cronómetro no es un letrero');
  if (ts <= (ahora == null ? Date.now() : ahora)) return dilo('ese código YA VENCIÓ');

  // Los números, de la fila viva. `pct` y `amount` son EXCLUYENTES, igual que
  // en el compilador: un porcentaje o unos pesos, nunca los dos.
  const out = { code: fila.codigo, expiresTs: ts };
  if (fila.pct != null && Number(fila.pct) > 0) out.pct = Math.round(Number(fila.pct));
  else if (fila.monto != null && Number(fila.monto) > 0) out.amount = Math.round(Number(fila.monto));
  else return dilo('ese código no trae ni porcentaje ni monto');
  if (Array.isArray(fila.exclude_pkg) && fila.exclude_pkg.length) out.excludePkg = fila.exclude_pkg.slice();
  // `expiresHours` es del letrero, no del código: dice cuántas horas dura el
  // cronómetro visualmente. Se conserva de la marca porque no vive en la tabla.
  const hrs = Number(marca.expiresHours);
  if (Number.isFinite(hrs) && hrs > 0) out.expiresHours = Math.round(hrs);
  return { flash_promo: out, aviso: null };
}

// Aplica la derivación a TODAS las esferas antes de compilar. Devuelve copias:
// no se muta la fila que vino de la base, para que nadie confunda el dato
// guardado con el derivado.
function derivarLetreros(esferas, codigos, ahora) {
  const porCodigo = new Map((codigos || [])
    .filter((c) => c && c.codigo)
    .map((c) => [String(c.codigo).toUpperCase(), c]));
  const avisos = [];
  const derivadas = (esferas || []).map((e) => {
    const r = derivarLetrero(e, porCodigo, ahora);
    if (r.aviso) avisos.push(r.aviso);
    // Se escribe SIEMPRE, incluso `null`: el compilador emite `flashPromo` solo
    // si el objeto está, así que un null es cómo se retira un letrero muerto.
    return { ...e, flash_promo: r.flash_promo };
  });
  return { esferas: derivadas, avisos };
}

// ═══════════════════════════════════════════════════════════════════════════
// [PROMO-DERIVA-1] EL CHIP DE LA CARD — el hermano exacto del letrero
// ═══════════════════════════════════════════════════════════════════════════
// EL DEFECTO, medido el 1-sep: OCHO fichas traían chips de códigos VENCIDOS a
// la vista del cliente — FIN (venció el 31-ago) en juniorh y caifanes, las cinco
// «PROMO DE PAREJA · HASTA EL 24 AGO» (tini, calle24, alejandrosanz, enjambre,
// scorpions) y BADGYAL. Todas prometiendo un descuento que la caja rechaza.
//
// Jane las limpió a mano careando contra `promos_codigos`, y ahí está el punto:
// LA LIMPIEZA MANUAL ES LA FUENTE NÚMERO DOS. La regla que BABA-UX-2 escribió
// para el letrero vale igual para el chip — LETRERO VIVO = CÓDIGO VIVO— y si
// sólo se cumple cuando alguien se acuerda, no es una regla.
//
// ── LA REGLA, IGUAL QUE LA DEL LETRERO ─────────────────────────────────────
// `promo_code` y `promo_label` de la ficha dejan de ser el dato: son LA MARCA
// de qué código le toca a este evento. Al publicar, su vigencia Y SU TEXTO
// salen de la fila viva de `promos_codigos`. Si el código no existe, está
// archivado, no aplica al evento, todavía no empieza o YA VENCIÓ, el chip NO SE
// EMITE y se AVISA por su nombre, en el mismo montón que los letreros.
//
// ⚠️ TRES DIFERENCIAS CON EL LETRERO, y las tres están medidas:
//   1. UN CHIP NO NECESITA `pct` NI `monto`. El letrero los exige porque es un
//      cronómetro con una cifra; el chip es una etiqueta. Las cinco promos de
//      pareja tienen los dos en NULL —su valor vive en `segundo_pax`— y son
//      chips perfectamente legítimos. Exigirlos aquí habría apagado a las cinco
//      por la razón equivocada.
//   2. UN CHIP SIN VENCIMIENTO ES VÁLIDO. El letrero sin `expires_at` no es
//      letrero (no hay cronómetro que correr); un código sin vencer es un código
//      que no vence, y su chip vive mientras el código viva.
//   3. EL TEXTO SE DERIVA de `desc_texto`, y NO hay respaldo a la etiqueta
//      guardada. Ese respaldo sería la copia vieja entrando por la puerta de
//      atrás — y es justo la copia que puso «HASTA EL 24 AGO» en cinco cards
//      una semana después del 24 de agosto.
//
// 🔒 EL `promo` BOOLEANO A SECAS NO SE TOCA: es el tag del filtro «Promos» del
// catálogo, no un chip con código. Son dos cosas con el mismo prefijo.
function derivarChip(esfera, porCodigo, ahora) {
  const code = (esfera && typeof esfera.promo_code === 'string') ? esfera.promo_code.trim() : '';
  if (!code) return { promo_code: null, promo_label: null, aviso: null };  // sin marca no hay chip

  const slug = esfera && esfera.slug;
  const fila = porCodigo.get(code.toUpperCase());
  const dilo = (motivo) => ({ promo_code: null, promo_label: null,
    aviso: `${slug}: el chip de promo apunta a «${code}» y ${motivo}. No se emitió — vuelve a encenderlo desde Baba.` });

  if (!fila) return dilo('ese código ya no existe en la casa de Baba');
  if (fila.archivado) return dilo('ese código está archivado');
  if (!aplicaAlEvento(fila, slug)) return dilo('ese código ya no aplica a este evento');
  const t = (ahora == null) ? Date.now() : ahora;
  const ini = fila.starts_at ? Date.parse(fila.starts_at) : NaN;
  if (Number.isFinite(ini) && ini > t) return dilo('ese código todavía no empieza');
  const fin = fila.expires_at ? Date.parse(fila.expires_at) : NaN;
  if (Number.isFinite(fin) && fin <= t) return dilo('ese código YA VENCIÓ');

  // El texto, de la fila viva. Sin respaldo a la etiqueta guardada: ver la
  // diferencia (3) de arriba.
  const txt = (typeof fila.desc_texto === 'string') ? fila.desc_texto.trim() : '';
  return { promo_code: fila.codigo, promo_label: txt || null, aviso: null };
}

// Aplica la derivación del chip a TODAS las esferas. Gemela de `derivarLetreros`
// y con el mismo contrato: devuelve copias y su montón de avisos.
function derivarChips(esferas, codigos, ahora) {
  const porCodigo = new Map((codigos || [])
    .filter((c) => c && c.codigo)
    .map((c) => [String(c.codigo).toUpperCase(), c]));
  const avisos = [];
  const derivadas = (esferas || []).map((e) => {
    const r = derivarChip(e, porCodigo, ahora);
    if (r.aviso) avisos.push(r.aviso);
    // Se escriben SIEMPRE, incluso `null`: el compilador emite `promoCode` y
    // `promoLabel` sólo si traen texto, así que un null es cómo se retira un
    // chip muerto. `promo` no se menciona: no es de esta pieza.
    return { ...e, promo_code: r.promo_code, promo_label: r.promo_label };
  });
  return { esferas: derivadas, avisos };
}

module.exports = { derivarLetrero, derivarLetreros, derivarChip, derivarChips, aplicaAlEvento, _obj };

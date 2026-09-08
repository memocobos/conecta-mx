// =============================================================================
// _lib/correo-forma — ¿ese correo tiene forma de correo? (MIG-1d-i)
// =============================================================================
// Se extrajo de `admin-invitar-walkin`, donde vivía como dos helpers locales.
// MIG-1d va a invitar por lotes: si el lote valida distinto que el botón de uno
// en uno, son DOS reglas — y "dos listas iguales" no existe, solo "dos listas
// que todavía no divergen".
//
// NO valida que el correo EXISTA (eso solo lo dice el rebote). Ataja lo que se
// puede atajar antes de gastar un envío.
// =============================================================================

// Formato básico: algo@algo.tld con TLD de 2+ letras, sin espacios.
function correoFormatoValido(correo) {
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(String(correo == null ? '' : correo).trim());
}

// TLD claramente mal escrito (típico de ".com" mal tecleado). Atrapa el caso que
// pasó: "gmail.con" tiene formato válido pero el correo no existe.
const _TLD_MALOS = ['con', 'cm', 'comm', 'ocm'];
function tldClaramenteMalo(correo) {
  const c = String(correo == null ? '' : correo).trim().toLowerCase();
  const dot = c.lastIndexOf('.');
  if (dot < 0) return false;
  return _TLD_MALOS.includes(c.slice(dot + 1));
}

// LA LLAVE DEL DEDUP. Minúsculas y sin espacios — y no es una elección de estilo:
// el trigger `clientes_before_insert` de la base del Portal hace
// `new.correo := lower(new.correo)`, y `clientes.correo` es UNIQUE. Normalizar
// distinto aquí insertaría un duplicado que la base rechazaría fila por fila.
function llaveCorreo(correo) {
  return String(correo == null ? '' : correo).trim().toLowerCase();
}

const esCorreoUsable = (c) => !!llaveCorreo(c) && correoFormatoValido(c) && !tldClaramenteMalo(c);

// LAS TALLAS QUE LA BASE ACEPTA. No es documentación: es el CHECK real de
// `clientes`, leído de la base el 7-sep-2026
//   CHECK (talla_playera = ANY (ARRAY['XS','S','M','L','XL','XXL']))
// `viajeros_evento.talla_playera` es texto LIBRE. Una talla que no esté en la
// lista haría que la base rechace ESA FILA sola, y el puente perdería a esa
// persona en silencio. Se normaliza o se manda null: null es «no sé», que es
// verdad; inventar una talla no lo es.
const TALLAS_VALIDAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
function tallaNormalizada(t) {
  const v = String(t == null ? '' : t).trim().toUpperCase().replace(/\s+/g, '');
  return TALLAS_VALIDAS.includes(v) ? v : null;
}

module.exports = { correoFormatoValido, tldClaramenteMalo, llaveCorreo, esCorreoUsable, tallaNormalizada, TALLAS_VALIDAS };

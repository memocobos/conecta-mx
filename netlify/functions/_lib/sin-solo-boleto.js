// =============================================================================
// _lib/sin-solo-boleto.js — [SIN-SOLO-BOLETO-1 · 19-oct-2026]
//
// Palabra de Memo, citada: «EN TODO INDEX EN LOS PAQUETES CHEAP QUITA ESA LEYENDA
// DE SOLO BOLETO POR FAVOR Y JAMAS DEBE DE VOLVER A SALIR EN EL INDEX».
//
// Dueño ÚNICO de la pregunta «¿el index dice “solo boleto” en algún lado que el
// cliente pueda ver?». Lo usan:
//   · esferas-publicar → si el index compilado lo trae, el publish se REHÚSA (409)
//     y no escribe nada (una ficha con `inc` que lo diga no puede colarlo);
//   · scripts/mide-sin-solo-boleto.js → el careo del árbol.
//
// Se quitan COMENTARIOS antes de buscar (los comentarios que explican por qué la
// frase no está la contienen; el cliente no los ve). Lo demás —HTML, cadenas de
// JS, el catálogo EV— cuenta.
// =============================================================================
const FRASE = /solo[\s \-_]*boletos?/gi;

function sinComentarios(txt) {
  return String(txt || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    // `//` de comentario: al inicio de línea o tras un carácter que no sea `:`
    // (así `https://` y similares no se toman por comentario).
    .replace(/(^|[^:\\'"])\/\/[^\n]*/gm, '$1');
}

// Devuelve [{linea, texto}] de cada aparición visible (vacío = limpio).
function apariciones(txt) {
  const limpio = sinComentarios(txt);
  const out = [];
  limpio.split('\n').forEach((l, i) => {
    FRASE.lastIndex = 0;
    if (FRASE.test(l)) out.push({ linea: i + 1, texto: l.trim().slice(0, 160) });
  });
  return out;
}

module.exports = { FRASE, sinComentarios, apariciones };

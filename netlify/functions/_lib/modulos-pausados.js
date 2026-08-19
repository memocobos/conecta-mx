// =============================================================================
// _lib/modulos-pausados  —  [VEN-PAUSA-1] El interruptor del lado servidor
//
// Gemelo del Set `MODULOS_PAUSADOS` de kamehouse.js. Son DOS listas porque son
// dos runtimes que no pueden importarse entre sí (el navegador no lee
// netlify/functions, y las functions no leen kamehouse.js). Dos listas iguales
// no existen —solo listas que todavía no divergen—, así que el arnés de
// VEN-PAUSA-1 las CAREA y truena si dejan de coincidir. Mismo trato que la
// regla de precios, que vive en tres copias con su arnés de equivalencia.
//
// Esconder no es impedir: sin este candado, el módulo estaría pausado solo en
// el navegador y sus 6 endpoints seguirían atendiendo a quien los llamara a
// mano. La pausa que solo se ve no es una pausa.
//
// 🔌 CÓMO REVIVE (3 ediciones): vaciar este Set, vaciar el de kamehouse.js y
//    descomentar [functions."ventas-limite-cron"] en netlify.toml.
// =============================================================================

const MODULOS_PAUSADOS = new Set(['vendedores']);

// 503 y no 403: no es "no tienes permiso" (eso sería del rol), es "esto no está
// disponible ahora mismo". El motivo va en claro para que nadie lo depure a
// ciegas creyendo que se rompió.
function respuestaPausa(modulo) {
  return {
    statusCode: 503,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: false,
      error: 'Módulo en pausa',
      modulo,
      detalle: 'El módulo de vendedores está pausado (VEN-PAUSA-1). Sus datos y '
             + 'pantallas siguen intactos; se replantea después.',
    }),
  };
}

const estaPausado = (modulo) => MODULOS_PAUSADOS.has(modulo);

module.exports = { MODULOS_PAUSADOS, estaPausado, respuestaPausa };

// =============================================================================
// _lib/candado-optimista — «alguien más lo cambió» en vez de «el último gana»
// =============================================================================
// CONC-1. El miedo de Memo es dos personas usándolo a la vez, y la medición le
// dio la razón con nombre de tabla: de 63 endpoints con PATCH, 17 hacen
// leer-modificar-escribir sobre datos que dos personas editan y 14 no llevan
// una sola condición. `lugares` es la peor —la escriben los DOS mundos, 7
// endpoints de admin y 6 del Portal— y el caso clásico es releer `notas`,
// pegarle un renglón y reescribir el campo entero: dos admins a la vez y una
// nota de auditoría desaparece sin ruido.
//
// El candado es OPTIMISTA: no bloquea a nadie, solo se niega a escribir encima
// de algo que cambió desde que se leyó. Tres piezas:
//
//   1. la lectura trae `updated_at` junto con la fila
//   2. el PATCH lo manda de vuelta como CONDICIÓN
//   3. si no alcanzó a ninguna fila → 409 con un mensaje que se pueda obedecer
//
// ⚠️ Depende de que `updated_at` se mueva SIEMPRE. Por eso CONC-1 pone un
// trigger en la base del PORTAL (migraciones/CONC-1-lugares-updated-at.sql):
// dejarlo en manos de cada endpoint es dejarlo ciego en cuanto uno se olvide,
// y son catorce.
//
// ⚠️ BASE: `lugares` vive en el PORTAL (`PORTAL_SUPABASE_URL`), no en
// KameHouse. El inventario se hace POR BASE — la lección de VEN-BORRA.

// La condición para pegarle a la URL del PATCH. Una fila sin `updated_at` se
// compara contra `is.null`: con `eq.` no casaría NUNCA y el guardado se caería
// siempre, que es peor que no tener candado.
function condicionVersion(updatedAt) {
  if (updatedAt === null || updatedAt === undefined || updatedAt === '') return '&updated_at=is.null';
  return '&updated_at=eq.' + encodeURIComponent(String(updatedAt));
}

// ¿El PATCH no alcanzó a nadie? Exige `Prefer: return=representation`: con
// `return=minimal` la respuesta viene vacía SIEMPRE y no se puede distinguir
// «no había fila» de «escribí bien» — un candado que no sabe si mordió.
function noAlcanzo(filas) {
  return !Array.isArray(filas) || filas.length === 0;
}

// El 409 de la casa. Dice QUÉ se topó y qué hacer, no solo que falló: un
// mensaje que no se puede obedecer es un error que se vuelve a intentar igual.
function respuestaChoque(headers, queCosa) {
  return {
    statusCode: 409,
    headers,
    body: JSON.stringify({
      error: 'Alguien más cambió ' + queCosa + ' mientras lo tenías abierto. '
        + 'No se guardó nada para no borrarle su cambio: vuelve a abrirlo y repite lo tuyo.',
      choque: true,
    }),
  };
}

// El encabezado que hace falta para que `noAlcanzo` pueda responder.
const PREFER_VER_FILAS = 'return=representation';

module.exports = { condicionVersion, noAlcanzo, respuestaChoque, PREFER_VER_FILAS };

// =============================================================================
// _lib/invitacion-portal — MIG-1d-ii: QUIÉN recibe la invitación y QUÉ dice
// =============================================================================
// Las dos piezas PURAS de la invitación al Portal, separadas del handler para
// que el arnés ejercite LA REGLA REAL y no una copia. Un arnés que reimplementa
// la elegibilidad mide su propia opinión.
//
// 🔒 EL RENDER SE **DERIVA**, NADA SE TECLEA (doctrina PROMO-DERIVA). El nombre
// del artista, la fecha y el lugar salen del CATÁLOGO; el nombre y el correo, de
// la fila. Un texto tecleado es un letrero que sobrevive a su causa: el día que
// el evento cambie de fecha, el correo seguiría anunciando la vieja y nadie se
// enteraría. Si el catálogo no se puede leer, **no se inventa**: se dice.
//
// 🔒 Y EL CORREO SE MANDA EN MINÚSCULAS, porque es la llave. `portal-reclamar-
// cuenta` enlaza por el correo del JWT en minúsculas y el trigger de `clientes`
// normaliza: una invitación mandada a «Laura@X.com» que luego se busca como
// «laura@x.com» cierra el círculo por suerte, no por diseño. La llave la da
// `llaveCorreo` de `_lib/correo-forma`, que es la MISMA que usa el puente.
// =============================================================================

const { llaveCorreo, esCorreoUsable } = require('./correo-forma');

const PORTAL_URL = 'https://conectareynosa.mx/portal';

// ── QUIÉN RECIBE ─────────────────────────────────────────────────────────────
// Tres condiciones, y las tres salen del brief:
//   · tiene `portal_cliente_id` (el puente ya pasó por él). Sin esto la
//     invitación manda a la gente a un portal que no la reconoce.
//   · su correo tiene forma de correo.
//   · NO está en la bitácora `invitaciones_portal` para ESTE evento.
//
// 🔒 SE AGRUPA POR CORREO, NO POR FILA — la misma regla que el puente, con la
// MISMA función. Una persona con dos filas es UNA invitación: mandarle dos
// correos iguales el mismo día es la lección del consuelo, que mandó el mismo
// aviso dos veces.
//
// ⚠️ `yaInvitados` es un Set de llaves de correo. Si la bitácora no se pudo
// leer, el CALLER tiene que pasar `null` y esta función lo RECHAZA: invitar
// creyendo que nadie fue invitado es exactamente cómo se manda un correo
// repetido a 156 personas. «No sé a quién ya invité» no es «a nadie».
function aQuienInvitar(viajeros, yaInvitados) {
  if (!(yaInvitados instanceof Set)) {
    return { error: 'Sin la bitácora de invitaciones no se puede decidir a quién invitar: '
      + '«no sé a quién ya invité» no es «a nadie», y la diferencia son correos repetidos.' };
  }
  const grupos = new Map();
  const saltados = [];
  for (const v of (Array.isArray(viajeros) ? viajeros : [])) {
    const k = llaveCorreo(v && v.correo);
    if (!k) { saltados.push({ nombre: (v && v.nombre) || null, motivo: 'sin correo en su fila' }); continue; }
    if (!esCorreoUsable(v.correo)) { saltados.push({ nombre: v.nombre, correo: v.correo, motivo: 'el correo no tiene forma de correo' }); continue; }
    if (!v.portal_cliente_id) {
      saltados.push({ nombre: v.nombre, correo: k,
        motivo: 'todavía no pasó el PUENTE (sin portal_cliente_id): invitarlo lo mandaría a un portal que no lo reconoce' });
      continue;
    }
    if (!grupos.has(k)) grupos.set(k, { correo: k, nombre: v.nombre, filas: [], portal_cliente_id: v.portal_cliente_id });
    // ⚠️ EL CRUDO VIAJA AL LADO de la llave: la llave ya está normalizada, así que
    // con ella sola es IMPOSIBLE saber si la fila guardada tiene mayúsculas — y eso
    // es justo lo que decide si su plan va a salir vacío. La misma forma que
    // `boletos_crudo` en el careo: la normalización no puede borrar el único dato
    // que otro lector necesita.
    grupos.get(k).filas.push({ id: v.id, nombre: v.nombre, correoCrudo: v.correo });
  }
  const invitar = [], yaEstaban = [];
  for (const g of grupos.values()) {
    const fila = { correo: g.correo, nombre: g.nombre, filas: g.filas.length, portal_cliente_id: g.portal_cliente_id,
                   // ⚰️ [PLAN-CASE-1, 1-oct] **ESTE AVISO SE RETIRA, NO SE SILENCIA.**
                   // Lo que seguía era cierto cuando se escribió y dejó de serlo el mismo
                   // día: `portal-mi-plan-migrado` ya NO casa con `eq` sensible — estrecha
                   // con `ilike` y la autoridad es su filtro `lower()` de los dos lados.
                   // Esas 285 filas YA NO SON INVISIBLES, así que seguir avisando sería un
                   // letrero que sobrevive a su causa: mandaría a arreglar a mano 244 filas
                   // que ya se leen bien, y el «freno» frenaría el primer envío por nada.
                   // 🔒 Queda `ojo_plan_vacio` SIEMPRE VACÍO y un TESTIGO en el arnés que
                   // exige que el casamiento insensible siga vivo: el día que alguien
                   // revierta el lector, ese testigo cae — y este montón volvería a tener
                   // sentido. Borrarlo entero habría dejado el hoyo sin vigilancia.
                   // El texto original, para que la historia se pueda leer:
                   // «`portal-mi-plan-migrado`
                   // busca el plan con `viajeros_evento?correo=eq.<correo del JWT en
                   // minúsculas>`, y el `eq` de PostgREST es SENSIBLE A MAYÚSCULAS. Una
                   // fila guardada como «Laura@Correo.com» NO se encuentra: la persona se
                   // registra, el Portal la enlaza —`clientes.correo` sí está en
                   // minúsculas, lo normalizó el puente— y su plan sale **VACÍO**.
                   // Invitarla sería mandarle un correo que dice «ya puedes ver tu plan»
                   // hacia una pantalla en blanco.
                   // ⚠️ NO SE SALTA SOLA: se REPORTA, y la decisión es de un humano —
                   // arreglar la fila es un UPDATE a datos de gente y eso no lo hace un
                   // botón de invitar. Lo que esta pieza no puede hacer es callarlo.
                   // ⚰️ Se conserva el CONTEO como dato (cuántas filas traen mayúsculas)
                   // porque sigue siendo verdad y es útil para re-medir el padrón; lo que
                   // se retira es el AVISO, que ya no describe ningún problema.
                   filas_con_mayusculas: g.filas.filter((f) => f.correoCrudo != null
                      && String(f.correoCrudo) !== String(f.correoCrudo).toLowerCase()).map((f) => f.id) };
    // 🔒 SIEMPRE null DESDE PLAN-CASE-1. No se borró el campo para no romper a quien
    // lo lea, y porque un `null` constante con su razón escrita cuenta la historia
    // mejor que un campo desaparecido.
    fila.ojo_plan_vacio = null;
    if (yaInvitados.has(g.correo)) yaEstaban.push({ ...fila, motivo: 'ya se le invitó (está en la bitácora)' });
    else invitar.push(fila);
  }
  return { invitar, ya_invitados: yaEstaban, saltados, personas: grupos.size,
           // ⚰️ VACÍO DESDE PLAN-CASE-1 (1-oct): el lector dejó de ser ciego a las
           // mayúsculas, así que ya no hay nadie a quien la invitación mande a una
           // pantalla en blanco por esta causa. Si este montón vuelve a llenarse, es
           // que alguien revirtió el casamiento insensible del Portal.
           ojo_plan_vacio: invitar.filter((x) => x.ojo_plan_vacio) };
}

// ── EL RENDER ────────────────────────────────────────────────────────────────
// `ev` es la fila del CATÁLOGO (la del index: a/ds/f/v). Si falta, se dice —
// no se rellena con un hueco que el cliente leería como un error nuestro.
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Devuelve { subject, html } | { error } — el error es para que el caller lo
// DIGA, no para que mande un correo a medias.
function renderInvitacion({ nombre, correo, ev }) {
  const k = llaveCorreo(correo);
  if (!k) return { error: 'sin un correo usable no hay invitación que mandar' };
  // 🔒 SIN CATÁLOGO NO SE MANDA. El evento es el ÚNICO motivo por el que esta
  // persona recibe el correo; un «tu viaje» sin decir a qué se lee como spam, y
  // peor: se lee como que no sabemos a quién le escribimos.
  if (!ev || !ev.id) {
    return { error: 'no se pudo leer el evento en el catálogo: la invitación no se manda sin decir a QUÉ viaje '
      + 'se refiere — un «tu viaje» a secas se lee como spam' };
  }
  const artista = String(ev.a || ev.id);
  // La fecha LARGA si el catálogo la trae, y la corta si no. Las dos salen de
  // la ficha: aquí no se formatea una fecha que el catálogo no dio.
  const cuando = String(ev.f || '').trim();
  const donde = String(ev.v || '').trim();
  const primerNombre = String(nombre || '').trim().split(/\s+/)[0] || 'Hola';
  const subject = `Tu plan de ${artista} ya está en línea`;
  const detalle = [cuando, donde].filter(Boolean).join(' · ');
  const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#000;color:#fff">
        <div style="background:#e8ff4c;color:#000;padding:18px 22px;border-bottom:4px solid #ff283b">
          <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Conecta Reynosa · Portal</div>
          <div style="font-size:22px;font-weight:900;margin-top:4px">${escapeHtml(primerNombre)}, ya puedes ver tu plan de ${escapeHtml(artista)}</div>
        </div>
        <div style="padding:24px 22px;background:#0a0a0a;font-size:15px;line-height:1.6;color:rgba(255,255,255,.9)">
          ${detalle ? `<p style="margin:0 0 14px;color:#e8ff4c;font-weight:700">${escapeHtml(detalle)}</p>` : ''}
          <p style="margin:0 0 14px">Tu lugar ya está registrado y tu <b style="color:#e8ff4c">plan de pagos</b> está listo para consultarlo en línea cuando quieras: lo que llevas abonado y lo que falta.</p>
          <p style="margin:0 0 20px">Entra al portal y regístrate con <b>este mismo correo</b> (<span style="color:#e8ff4c">${escapeHtml(k)}</span>) para que reconozcamos tu información:</p>
          <p style="margin:0 0 24px;text-align:center">
            <a href="${PORTAL_URL}" style="display:inline-block;background:#e8ff4c;color:#000;font-weight:800;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px">Ver mi plan de pagos →</a>
          </p>
          <p style="margin:0;font-size:13px;color:rgba(255,255,255,.55)">Importante: usa exactamente <b>${escapeHtml(k)}</b> al registrarte; así te reconocemos automáticamente. Si tienes dudas, escríbenos por WhatsApp.</p>
        </div>
      </div>
    `;
  return { subject, html, to: k };
}

module.exports = { aQuienInvitar, renderInvitacion, escapeHtml, PORTAL_URL };

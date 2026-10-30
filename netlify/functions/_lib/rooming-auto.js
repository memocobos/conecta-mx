// =============================================================================
// _lib/rooming-auto.js — [ROOMING-AUTO-1] (30-oct-2026)
//
// EL ARMADOR DEL ROOMING: convierte a los viajeros que DUERMEN de un evento en
// una PROPUESTA de cuartos. Propone, JAMÁS escribe — el humano (Bulma/Milk)
// revisa la propuesta en pantalla, corrige géneros y aplica. Reglas FIRMADAS
// por Memo (30-oct-2026, citadas en CLAUDE.md · CAPSULE-UX-2):
//   «los grupos siempre juntos; a menos que haya grupos más extensos [que el
//    cuarto] dejar pregunta en rooming para bulma y milk o forma de editar
//    grupos para que puedan acomodarlo; siempre separar por género las
//    Compartidas (hombres con hombres, mujeres con mujeres); excepción:
//    parejas hombre-mujer que se sepa que van juntos pero que no pagaron
//    doble».
//
// LOS INSUMOS, medidos antes de escribir (30-oct, contra la base viva):
//   · En los eventos que VIENEN (karolg 6/7-nov · omar 6/7-nov) CERO viajeros
//     traen hotel_tipo, grupo_viaje o habitacion_id — su verdad vive en la
//     NOTA de migración: «Hab Cuadruple · con Leila Rodríguez» (142 con tipo,
//     40 con «· con »). Por eso el tipo y el compañero se DERIVAN de la nota
//     cuando la columna no habla, ROTULADOS con su origen — derivar no es
//     escribir: hotel_tipo/grupo_viaje no se tocan.
//   · El GÉNERO no era un dato (columna `genero` nace con GENERO-1, CHECK
//     H/M, 0 filas): la inferencia por nombre solo PROPONE (genero_origen
//     'sugerido') y la pantalla la enseña como chip editable — se guarda solo
//     lo que el humano confirma, por `genero_guardar`.
//
// QUIÉN DUERME: `duerme()` de _lib/paquete-viaje (el dueño: plus·ride·stay·
// null). Una BAJA (boletos 0 y zona NULL en paquete con boleto) queda fuera
// y SE DICE — un RIDE con boletos 0/zona null es normal y sí entra.
//
// 🔒 El «con X» de la nota se resuelve contra el padrón del evento con
// `parecido` de _lib/misma-persona (el dueño; no una regex gemela). Un «con X»
// que no casa con nadie NO inventa grupo: sale como pregunta.
// =============================================================================

const { duerme, normPaquete } = require('./paquete-viaje');
const { parecido } = require('./misma-persona');

// Tipo de cuarto (rooming_habitaciones) ↔ capacidad. MISMOS valores que
// CAPACIDAD_HAB del front y de admin-rooming — el careo los carea.
const CAPACIDAD = { individual: 1, doble: 2, triple: 3, cuadruple: 4 };

// hotel_tipo (VJ-HAB-1: Compartida/Doble/Triple/Individual) → tipo de cuarto.
const HOTEL_A_CUARTO = {
  compartida: 'cuadruple', doble: 'doble', triple: 'triple', individual: 'individual',
};

// ── El tipo de cuarto EFECTIVO de un viajero, con su origen rotulado ─────────
// 1º la columna hotel_tipo (el dato); 2º la nota de migración («Hab Cuadruple»,
// «Hab Doble», «Hab Triple», «Hab Individual» — forma medida, 158 filas en
// karolg/omar). Sin ninguna → null (la pantalla lo dice, no se adivina).
function tipoCuartoDe(v) {
  const col = String(v.hotel_tipo || '').trim().toLowerCase();
  if (HOTEL_A_CUARTO[col]) return { tipo: HOTEL_A_CUARTO[col], origen: 'columna' };
  const m = String(v.notas || '').match(/hab\.?\s*(cuadrupl\w*|compartid\w*|doble|triple|individual|sencill\w*)/i);
  if (m) {
    const t = m[1].toLowerCase();
    const tipo = /^cuadrupl|^compartid/.test(t) ? 'cuadruple'
      : t.startsWith('doble') ? 'doble'
      : t.startsWith('triple') ? 'triple'
      : 'individual'; // individual o sencilla
    return { tipo, origen: 'nota' };
  }
  return { tipo: null, origen: null };
}

// ── El «con quién» de la nota: «· con Leila Rodríguez ·» → 'Leila Rodríguez'.
// Corta en el siguiente «·» o al final; descarta colas no-nombre.
function conQuienDe(nota) {
  const m = String(nota || '').match(/·\s*con\s+([^·]+)/i);
  if (!m) return null;
  const n = m[1].trim().replace(/\s+/g, ' ');
  // Un «con el careo», «con valor esperado», etc. no es una persona.
  if (!n || n.length < 3 || /^(el|la|los|las|un|una|valor|careo|nota|fecha)\b/i.test(n)) return null;
  return n.slice(0, 80);
}

// ── Género SUGERIDO por el primer nombre. SOLO PROPONE: la pantalla lo pinta
// como chip editable rotulado «sugerido» y nada se guarda sin confirmación
// humana (regla firmada: una inferencia por nombre solo propone, jamás decide).
// Lista de primeros nombres comunes en el padrón MX — deliberadamente
// conservadora: un nombre que no está (o ambiguo, como Guadalupe) → null.
const NOMBRES_M = new Set(('maria,mariana,marifer,fernanda,sofia,ana,anahi,karla,karen,karina,daniela,danna,dana,paola,andrea,alejandra,valeria,vanessa,victoria,ximena,yamileth,yareli,yaretzi,alondra,abril,america,brenda,briana,camila,carolina,cecilia,cinthia,cynthia,claudia,cristina,kristina,diana,dulce,edith,elena,elisa,elizabeth,erika,erica,esmeralda,estefania,eva,evelyn,frida,gabriela,genesis,gisela,giselle,gloria,griselda,hilda,ilse,irene,iris,isabel,isabella,itzel,jacqueline,jaqueline,jazmin,jessica,jesica,jimena,johana,juana,julia,julieta,katia,leticia,lilia,liliana,linda,lizbeth,lizeth,lourdes,lucero,lucia,luisa,magali,magdalena,marcela,margarita,maribel,maricela,marisol,marlene,martha,mayra,melanie,melissa,micaela,michelle,miroslava,monica,monserrat,montserrat,nancy,natalia,nayeli,nohemi,norma,olga,pamela,patricia,perla,priscila,ramona,raquel,rebeca,regina,reyna,rocio,rosa,rosario,rosie,rubi,ruth,samantha,sandra,sara,sarah,silvia,susana,tania,teresa,valentina,veronica,viridiana,wendy,yadira,yahaira,yesenia,yessica,yolanda,zaira,zayra,alexa,alexia,alicia,amanda,arely,areli,berenice,bianca,blanca,citlali,dayana,delmi,denisse,fatima,flor,ingrid,ivana,ivonne,janet,janeth,jennifer,joselyn,kimberly,larissa,laura,leila,lesly,leslie,mia,mireya,miriam,myrna,paloma,paulina,renata,salma,scarlett,stephanie,tatiana,vianey,zoe,astrid,daisy,mariely,camyla,paolette,genoveva,aurora,beatriz,carmen,celeste,concepcion,consuelo,dolores,elvia,emma,esperanza,estela,eugenia,francisca,graciela,herlinda,hortencia,imelda,irma,josefina,lidia,manuela,mercedes,minerva,ofelia,petra,refugio,sanjuana,socorro,soledad,trinidad,virginia,zulema').split(','));
const NOMBRES_H = new Set(('jose,juan,luis,carlos,jorge,miguel,angel,jesus,antonio,francisco,alejandro,fernando,ricardo,roberto,eduardo,daniel,david,diego,oscar,omar,pablo,pedro,rafael,ramon,raul,rene,rodrigo,ruben,salvador,samuel,saul,sergio,victor,abel,abraham,adan,adrian,alan,allan,alberto,alfonso,alfredo,andres,armando,arturo,axel,benjamin,brandon,brian,bruno,cesar,cristian,christian,cristobal,damian,dario,demian,edgar,edwin,efrain,elias,eliud,emiliano,emilio,emmanuel,enrique,erick,erik,ernesto,ernersto,esteban,ezequiel,fabian,felipe,felix,gabriel,gael,gerardo,german,gilberto,gonzalo,gregorio,guillermo,gustavo,hector,heriberto,hernan,homero,horacio,hugo,humberto,ignacio,iram,isaac,isidro,ismael,ivan,jacobo,jaime,javier,jeremias,joaquin,joel,jonathan,josue,julian,julio,kevin,leonardo,leonel,lorenzo,marco,marcos,marcelo,mario,martin,mateo,matias,mauricio,maximiliano,moises,nestor,nicolas,noe,octavio,orlando,osvaldo,oswaldo,patricio,paulo,ponciano,rainiero,ramiro,raymundo,reynaldo,rigoberto,rogelio,rolando,rommel,santiago,sebastian,simon,tadeo,tomas,ulises,uriel,valentin,vicente,wilbert,xavier,yahir,alexis,johan,jared,mariano,jovani,adalay').split(','));

function generoSugerido(nombre) {
  const primero = String(nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().split(/\s+/)[0] || '';
  if (NOMBRES_M.has(primero)) return 'M';
  if (NOMBRES_H.has(primero)) return 'H';
  return null;
}

// ── ¿Es una BAJA? boletos 0 + zona NULL en un paquete que SÍ consume boleto.
// RIDE no consume boleto: boletos 0 / zona null ahí es su forma normal.
function esBaja(v) {
  const p = normPaquete(v.tipo_paquete);
  if (p === 'ride') return false;
  return Number(v.boletos || 0) === 0 && !v.zona_boleto;
}

// =============================================================================
// armarPropuesta({ viajeros, ocupadosNombres, generoConfirmado })
//   viajeros        : filas de viajeros_evento del evento (id,nombre,
//                     tipo_paquete,boletos,zona_boleto,hotel_tipo,genero,
//                     grupo_viaje,habitacion_id,notas)
//   ocupadosNombres : Set de nombres YA asignados en cuartos existentes
// Devuelve { cuartos, preguntas, sin_tipo, fuera } — y NO escribe nada.
//   cuartos  : [{ tipo, ocupantes:[{id,nombre,genero,genero_origen,tipo_origen}], etiqueta }]
//   preguntas: strings legibles con nombres (lo que Bulma/Milk deciden)
//   sin_tipo : personas que duermen sin tipo de cuarto en ningún lado
//   fuera    : quién quedó fuera y POR QUÉ (baja · ya asignado · no duerme)
// =============================================================================
function armarPropuesta({ viajeros, ocupadosNombres }) {
  const ocupados = ocupadosNombres instanceof Set ? ocupadosNombres : new Set(ocupadosNombres || []);
  const preguntas = [];
  const fuera = [];
  const sinTipo = [];

  // 1 · El universo: duermen, no son baja, no están ya en un cuarto.
  const universo = [];
  for (const v of (viajeros || [])) {
    if (!duerme(v.tipo_paquete)) { fuera.push({ nombre: v.nombre, motivo: 'no duerme: ' + (normPaquete(v.tipo_paquete) || '—') }); continue; }
    if (esBaja(v)) { fuera.push({ nombre: v.nombre, motivo: 'baja (boletos 0, sin zona)' }); continue; }
    if (v.habitacion_id || ocupados.has(v.nombre)) { fuera.push({ nombre: v.nombre, motivo: 'ya tiene cuarto' }); continue; }
    const tc = tipoCuartoDe(v);
    const gen = v.genero || null;
    universo.push({
      id: v.id, nombre: v.nombre,
      tipo: tc.tipo, tipo_origen: tc.origen,
      genero: gen || generoSugerido(v.nombre),
      genero_origen: gen ? 'dato' : (generoSugerido(v.nombre) ? 'sugerido' : null),
      grupo: v.grupo_viaje || null,
      con: conQuienDe(v.notas),
    });
  }

  // 2 · Grupos (union-find): grupo_viaje + lazos «con X» resueltos con
  // `parecido` contra el universo. Un «con X» sin dueño → pregunta, sin grupo.
  const padre = new Map(universo.map((p) => [p.id, p.id]));
  const find = (x) => { while (padre.get(x) !== x) { padre.set(x, padre.get(padre.get(x))); x = padre.get(x); } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) padre.set(ra, rb); };

  const porGrupoViaje = new Map();
  for (const p of universo) {
    if (!p.grupo) continue;
    if (porGrupoViaje.has(p.grupo)) union(p.id, porGrupoViaje.get(p.grupo));
    else porGrupoViaje.set(p.grupo, p.id);
  }
  for (const p of universo) {
    if (!p.con) continue;
    const candidatos = universo.filter((o) => o.id !== p.id && (parecido(p.con, o.nombre) || parecido(o.nombre, p.con)));
    if (candidatos.length === 1) union(p.id, candidatos[0].id);
    else if (candidatos.length > 1) preguntas.push(`${p.nombre}: su nota dice «con ${p.con}» y casa con ${candidatos.length} personas (${candidatos.map((c) => c.nombre).join(' · ')}) — júntalas a mano.`);
    else preguntas.push(`${p.nombre}: su nota dice «con ${p.con}» pero nadie del evento casa con ese nombre — revísalo.`);
  }

  const grupos = new Map();
  for (const p of universo) {
    const r = find(p.id);
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r).push(p);
  }

  // 3 · Cuartos.
  const cuartos = [];
  const sueltosPorTipo = { cuadruple: [], doble: [], triple: [] };

  for (const miembros of grupos.values()) {
    // El tipo del grupo: el que diga la mayoría con dato; sin ninguno → sin_tipo.
    const tipos = miembros.map((m) => m.tipo).filter(Boolean);
    if (!tipos.length) { sinTipo.push(...miembros.map((m) => m.nombre)); continue; }
    const tipo = tipos.sort((a, b) =>
      tipos.filter((t) => t === b).length - tipos.filter((t) => t === a).length)[0];
    if (new Set(tipos).size > 1) {
      preguntas.push(`${miembros.map((m) => m.nombre).join(' · ')}: viajan juntos pero piden cuartos distintos (${[...new Set(tipos)].join(' / ')}) — se propone ${tipo}, corrígelo si no.`);
    }
    const cap = CAPACIDAD[tipo] || 1;

    if (tipo === 'individual') {
      for (const m of miembros) cuartos.push({ tipo, ocupantes: [m], etiqueta: 'individual' });
      continue;
    }
    if (miembros.length > cap) {
      // Regla firmada: grupo más grande que el cuarto → PREGUNTA, no se parte solo.
      preguntas.push(`${miembros.map((m) => m.nombre).join(' · ')}: son ${miembros.length} y el cuarto ${tipo} es de ${cap} — repártelos a mano (la regla es que los grupos van juntos, así que decide tú cómo partirlo).`);
      continue;
    }
    if (miembros.length === cap) {
      // Grupo exacto: cuarto directo. Si es compartida mixta de 2+... un grupo
      // LLENO va junto tal cual (pagaron juntos): la separación por género es
      // para DESCONOCIDOS, no para un grupo que se pidió junto.
      cuartos.push({ tipo, ocupantes: miembros, etiqueta: 'grupo completo' });
      continue;
    }
    // Grupo más chico que el cuarto: en doble/triple se queda su cuarto con
    // hueco (pagaron ese tipo); en compartida el hueco se llena con sueltos
    // del MISMO género — salvo la excepción de la pareja H-M, que va junta y
    // su cuarto se completa a criterio de Bulma/Milk (pregunta).
    if (tipo !== 'cuadruple') {
      // Un GRUPO parcial (2 en triple) se queda su cuarto con hueco: pagaron
      // juntos ese tipo. Un SUELTO (1 persona) va a la bolsa, a juntarse con
      // otro suelto del mismo género que pidió lo mismo.
      if (miembros.length > 1) cuartos.push({ tipo, ocupantes: miembros, etiqueta: 'grupo con lugar libre' });
      else sueltosPorTipo[tipo].push({ bloque: miembros });
      continue;
    }
    const gens = [...new Set(miembros.map((m) => m.genero).filter(Boolean))];
    if (gens.length > 1) {
      const c = { tipo, ocupantes: miembros, etiqueta: 'pareja/grupo mixto — excepción firmada' };
      cuartos.push(c);
      preguntas.push(`${miembros.map((m) => m.nombre).join(' · ')}: grupo mixto H-M en Compartida (la excepción de parejas) — el cuarto queda con ${cap - miembros.length} lugar(es): complétalo a tu criterio.`);
      continue;
    }
    // Grupo chico de un solo género (o sin género): entra a la bolsa de
    // compartidas COMO BLOQUE para completarse con sueltos compatibles.
    sueltosPorTipo.cuadruple.push({ bloque: miembros });
  }

  // 4 · Las compartidas sueltas, por género (H con H, M con M — regla firmada).
  // Dobles/triples sueltos: también por género (al combinar DESCONOCIDOS el
  // lado seguro es no mezclar). Sin género → montón aparte con chip editable.
  for (const tipo of ['cuadruple', 'doble', 'triple']) {
    const cap = CAPACIDAD[tipo];
    // Items = bloques (grupos chicos, NO se parten) y sueltos, por género.
    const porGenero = { H: [], M: [], '?': [] };
    for (const item of sueltosPorTipo[tipo]) {
      const ms = item.bloque || [item];
      const g = ms[0].genero || '?';
      porGenero[g in porGenero ? g : '?'].push(ms);
    }
    for (const g of ['M', 'H']) {
      // First-fit decreciente: el bloque grande primero, los sueltos rellenan.
      const items = porGenero[g].sort((a, b) => b.length - a.length);
      const abiertos = [];
      for (const bloque of items) {
        const hueco = abiertos.find((c) => c.ocupantes.length + bloque.length <= cap);
        if (hueco) hueco.ocupantes.push(...bloque);
        else abiertos.push({ tipo, ocupantes: [...bloque], etiqueta: g === 'M' ? 'mujeres' : 'hombres' });
      }
      for (const c of abiertos) {
        if (c.ocupantes.length < cap) c.etiqueta += ` · ${cap - c.ocupantes.length} lugar(es) libre(s)`;
        cuartos.push(c);
      }
    }
    if (porGenero['?'].length) {
      const nombres = porGenero['?'].flat();
      preguntas.push(`Sin género (confírmalo con los chips): ${nombres.map((m) => m.nombre).join(' · ')} — piden ${tipo} y no se pueden acomodar sin saberlo.`);
      cuartos.push({ tipo, ocupantes: nombres, etiqueta: 'SIN GÉNERO — confirma los chips y re-arma', pendiente: true });
    }
  }

  return { cuartos, preguntas, sin_tipo: sinTipo, fuera };
}

module.exports = { armarPropuesta, tipoCuartoDe, conQuienDe, generoSugerido, esBaja, CAPACIDAD, HOTEL_A_CUARTO };

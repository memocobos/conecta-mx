# 🖥️ AUDITORÍA POR CAPAS — Capa 5: LAS PANTALLAS

> Archivo personal de Memo — NO se commitea. Auditada el 25-jul-2026 (noche) por la sesión Cowork.
> Alcance: kamehouse.js (18,743 líneas), portal.html (4,309), index.html (4,932).

## VEREDICTO: 🟡 UN HALLAZGO REAL A CORREGIR (el más serio de las 5 capas)

---

## 🔴 HALLAZGO CAP5-1: texto de personas pintado SIN escapar en KameHouse
**Qué es:** KameHouse arma sus pantallas pegando texto directo al HTML. Casi siempre lo escapa
(357 usos de escape), pero hay **~50 lugares donde NO** — y varios son campos que **escribe una persona**:
`u.nombre` (12+ casos), `x.nombre`, `datos.nombre`, `r.notas`, `p.nombre`, `t.nombre`.

**Por qué importa (y por qué es serio):** el nombre de un usuario **lo teclea el propio usuario**
(al registrarse por invitación y al editar su perfil — `nombre` está en SELF_FIELDS). Si alguien del equipo
pone como nombre un texto con código en vez de letras, ese código **se ejecuta en el navegador de quien
abra Guerreros Z** — incluido TÚ. Y como corre dentro de tu sesión, puede leer tu pase de Maestro Roshi
y actuar como tú. **Es la única vía que le da la vuelta a todo el candado que blindamos en la Capa 2.**

Requiere: (1) tener cuenta en el sistema, (2) saber cómo, (3) que alguien con más permisos vea la pantalla.
Con el equipo desactivado hoy el riesgo práctico es nulo — pero **la semana que entra re-integras a 6 personas**.

**Casos concretos verificados:**
- `kamehouse.js:7191, 7573` → `<img src="${u.foto_url}" alt="${u.nombre}">` — doble vector: el nombre en un
  atributo y **la URL de la foto también sin escapar**.
- `kamehouse.js:7578, 7959` → nombre pintado como HTML en la tarjeta de Guerreros Z y el perfil.
- `kamehouse.js:7399, 7401` → `onclick="resetearPassword('${userId}','${usuario.nombre.replace(/'/g,"\\'")}')"`
  — solo escapa comillas simples; una comilla **doble** rompe el atributo.
- `r.notas` (reportes de coordinadores), `datos.nombre` (contratos).

**Fix propuesto (tuerca CAP5-1):** pasar todas esas interpolaciones por el escapador que YA existe
(`_esfEsc`), incluyendo `foto_url`, y en los `onclick` usar `data-*` + listener en vez de meter texto
dentro del atributo. Cero cambios visuales.

---

## ✅ LO QUE SALIÓ BIEN
- **portal.html (lo que ve el cliente) está limpio**: `_tourCardHtml` escapa id, nombre del evento, paquete
  y zona; los estados vienen de un enum de la BD. 60 escapes bien puestos.
- **index.html no tiene superficie**: sus 24 `innerHTML` se alimentan del catálogo EV (tu propio dato,
  no entrada de terceros). El único con variable es el código de promo, que también es tuyo.
- **KameHouse escapa en la mayoría** (357 usos): los módulos nuevos (contratos, Torre, vendedores, saludo,
  radio, kardex) usan `_esfEsc` de forma consistente. El problema está concentrado en el módulo más viejo
  (Guerreros Z / perfiles).

## Notas menores (sin acción)
- kamehouse.js tiene 522 `innerHTML`: no es un defecto en sí (es el estilo del proyecto, sin build step),
  pero es el motivo por el que la disciplina de escapar debe ser total.

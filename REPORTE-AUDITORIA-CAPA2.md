# 🔐 AUDITORÍA POR CAPAS — Capa 2: Autenticación, sesión y jerarquía

> Archivo personal de Memo — NO se commitea. Auditada el 25-jul-2026 por la sesión Cowork
> (lectura línea por línea + verificación contra la BD viva). Mentalidad: atacante externo
> (fuerza bruta, robo de sesión) y atacante interno (empleado que quiere más poder del que le toca).

## VEREDICTO GENERAL: 🟢 LA PUERTA ESTÁ BIEN CERRADA
Ninguna vía de escalada de privilegios ni de robo de cuentas. Los hallazgos son endurecimientos, no huecos abiertos.

---

## ✅ auth-login.js (la puerta principal) — SÓLIDO
- **Contraseñas**: SOLO bcrypt (cost 10). Un hash que no empiece con `$2` = login rechazado, sin excepciones. El viejo fallback de texto plano fue eliminado.
- **Fuerza bruta**: 5 intentos / 15 minutos por IP, con reset al entrar bien. Fail-open deliberado (si la tabla falla, no bloquea logins legítimos).
- **Enumeración de usuarios**: el mensaje es siempre "Credenciales inválidas" — no revela si el usuario existe. ✔
- **CSRF/scripts externos**: exige Origin permitido (solo conectareynosa.mx y previews) — curl pelón no pasa.
- **El JWT**: solo lleva id, correo, rol y sub. Ni hashes ni datos sensibles. Expira en 8 horas.
- ⚠️ Endurecimientos para tuerca futura (NO urgentes):
  1. **Rate limit solo por IP**: un atacante con muchas IPs (botnet/VPN rotativa) puede probar más; y al revés, toda tu oficina comparte IP (si 5 personas se equivocan, se bloquean entre sí 15 min). Ideal: contar también por usuario objetivo.
  2. **Sin revocación de sesión**: si un JWT se roba, vale sus 8 horas completas aunque desactives al usuario. Cambiar el rol tampoco surte efecto hasta que el token expire (el token trae el rol viejo).
  3. **Timing**: si el usuario no existe, la respuesta llega más rápido (no se ejecuta bcrypt). Diferencia medible por un atacante paciente. Se arregla comparando contra un hash señuelo.

## ✅ registro-invitado.js (el alta por invitación) — SÓLIDO
- El **id sale del token, JAMÁS del cliente** (línea 141: `id=eq.<id del token>&invite_token=eq.<token>`) → no se puede secuestrar otra cuenta.
- Token UUID validado por formato, uso único (`invite_usado`), expira en 48h, y se **borra** al completar.
- **Sin mass assignment**: solo se escriben campos concretos (nombre, username, password_hash, celular, talla). El invitado NO puede elegir su rol ni tocar strikes/activo.
- Whitelist de respuesta: password_hash e invite_token nunca viajan.
- ⚠️ Menor: contraseña mínima de 6 caracteres (el reset de admin exige 8). Unificar en 8.

## ✅ reset-password.js — SÓLIDO
- Solo roshi y bulma; **protección explícita**: nadie puede resetear a otro admin (solo la propia). Mínimo 8 caracteres, hash server-side, nunca devuelve el hash.
- ⚠️ Menor: si el lookup del rol objetivo falla por red, el PATCH procede igual (fail-open). Ventana teórica minúscula, pero un fail-closed sería más estricto.
- ⚠️ Nota operativa: NO existe "olvidé mi contraseña" para el equipo — solo tú o Bulma resetean. Es una decisión válida (menos superficie), pero debe estar en el manual.

## ✅ admin-usuarios.js (la jerarquía) — SÓLIDO, con una nota
Matriz verificada en código:
- **Crear invitación**: solo roshi/bulma. Roles bulma/milk/roshi: SOLO roshi (arreglado ayer en #338).
- **Editar a otro**: solo roshi/bulma. Si el objetivo es admin (roshi/bulma): SOLO roshi.
- **Cambiar rol propio**: prohibido salvo roshi. **Otorgar rol admin**: solo roshi.
- **Campos**: un no-admin solo toca SELF_FIELDS de su propio perfil (nada de rol/activo/strikes/correo).
- Strikes validados 0-3; whitelist de columnas excluye password_hash e invite_token.
- ⚠️ HALLAZGO MENOR (privacidad interna): la acción **`listar` no exige rol admin** — cualquier usuario logueado (vendedor, cc, coordinador) puede pedir la lista del equipo con nombres, correos, celulares, cumpleaños, contactos de emergencia y strikes. No hay escalada ni fuga hacia afuera (requiere sesión válida), pero un vendedor no tendría por qué ver el teléfono de emergencia de una coordinadora ni los strikes de nadie. **Recomendación**: recortar campos sensibles para no-admins (o exigir admin para el listado completo).
- ⚠️ Menor: `listar` acepta filtro por correo sin validar formato (solo recorta a 160). Sin riesgo real (PostgREST parametriza), pero es higiene.

## ✅ Portal (lo expuesto al público) — SÓLIDO
Verificado en las 9 funciones de cliente: **TODAS validan el JWT del cliente contra Supabase (`/auth/v1/user`)** — ninguna confía en un id que venga en el cuerpo del mensaje. Y todas verifican **pertenencia** antes de leer/escribir (`auth_user_id === user.id` o vía cliente_id).
- **portal-reclamar-cuenta** (la pieza más delicada): solo enlaza si el correo del JWT está **verificado** por el proveedor, solo por correo (nunca por nombre/teléfono), y si hay más de un candidato NO adivina — pide resolución manual. Idempotente. Excelente.
- **portal-lugar-actualizar**: whitelist real de 3 campos (nombre, correo, fecha de nacimiento) — el cliente NO puede tocar precio, estado, paquete ni zona. Sin mass assignment.
- **portal-mis-lugares**: respuesta curada — el acompañante ve SU lugar, nunca el precio total ni los datos del titular.
- **RLS activo** en todas las tablas del Portal (verificado en la BD viva) + tokens `gen_random_bytes(24)`.
- ⚠️ Menor: los tokens de invitación de acompañante no expiran (a diferencia de los del equipo, 48h). Riesgo bajo (link privado por correo, un solo uso efectivo), pero un vencimiento sería más limpio.

---

## Escenarios de ataque probados mentalmente
| Intento | ¿Lo logra? |
|---|---|
| Adivinar contraseñas a lo bruto desde una IP | ❌ bloqueado a los 5 intentos |
| Averiguar qué usuarios existen por el mensaje de error | ❌ mensaje único |
| Llamar la API desde otro sitio / curl sin origen | ❌ Origin exigido |
| Un vendedor se auto-asciende a bulma | ❌ triple candado |
| Bulma crea otra bulma o una milk | ❌ solo roshi |
| Bulma resetea la contraseña de Memo | ❌ rol protegido |
| Un invitado elige rol distinto en su alta | ❌ el rol viene de la invitación |
| Reusar un link de invitación ya usado / viejo | ❌ uso único + 48h |
| Cliente A ve el tour del cliente B | ❌ pertenencia verificada en todas |
| Cliente cambia el precio de su propia reserva | ❌ whitelist de 3 campos |
| Reclamar la cuenta de alguien más sabiendo su correo | ❌ exige correo verificado por el proveedor |
| **Un vendedor ve los datos de contacto y strikes de todo el equipo** | ⚠️ **SÍ** (único hallazgo real, ver arriba) |

## ✅ LAS 3 TUERCAS: CONSTRUIDAS, MERGEADAS Y PROBADAS EN PRODUCCIÓN (25-jul noche)
- **#352 CAP2-1** privacidad del directorio (proyección por rol; strikes solo admins; `cumple_hoy` booleano salva el pastelito sin exponer fechas).
- **#353 CAP2-2** login endurecido (rate limit doble 20/IP + 5/cuenta, hash señuelo con paridad de tiempos 48.4 vs 48.5 ms, upsert encubierto eliminado, contraseña mínima 8 en los 4 puntos).
- **#354 CAP2-3** revocación de sesión (`_lib/sesion-viva` con caché 60s y fail-open en 4 modos + verifyAdminAuthLive en los 92 callers + botón "cerrar sesiones" + interruptor SESION_VIVA_MODO).

### Pruebas EN VIVO en producción (7/7 pasadas, con cuenta conejillo creada y borrada)
1. 8 paneles críticos responden 200 con la sesión de roshi — los 92 endpoints viven.
2. Login del conejillo OK; contraseña mala → 401.
3. Vendedor rebota de admin-conexiones (403 "Rol 'vendedor' sin permiso").
4. Privacidad real: el vendedor NO recibió celular/strikes/fecha_nacimiento ajenos; SÍ `cumple_hoy` y sus propios datos.
5. **Rol vivo manda**: cambio a bulma en BD → su token viejo (que dice vendedor) obtuvo permisos de bulma SIN re-loguear.
6. **Revocación**: botón "cerrar sesiones" → cayó a los **66 s** con "Tu sesión terminó"; re-entrada inmediata OK.
7. **Desactivar**: sesión muerta a los **100 s** + ya no puede loguearse. Marca `sesiones_invalidas_antes` escrita automáticamente.
+ Sesión de Maestro Roshi intacta al final (5 paneles en 200). Rastro borrado (18 usuarios, los de siempre).

## Tuercas originales sugeridas (TODAS EJECUTADAS)
- **CAP2-1 (privacidad)**: recortar campos sensibles del `listar` para no-admins.
- **CAP2-2 (endurecimiento)**: rate limit también por usuario + hash señuelo contra timing + mínimo 8 caracteres en el alta.
- **CAP2-3 (sesión)**: revocación de JWT — lista de sesiones invalidadas o verificación de `activo`/rol contra BD en acciones sensibles (cierra el hueco de "desactivé a alguien pero su token vive 8 horas").

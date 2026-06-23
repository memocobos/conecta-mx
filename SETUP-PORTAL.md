# Setup Portal Conecta MX — Guía Manual Paso a Paso

Esta guía te lleva por el setup manual de **Supabase + Google OAuth + Resend SMTP** antes de empezar a programar el portal de clientes.

**Importante antes de empezar:**
- Vas a crear cuentas y configurar 3 servicios. Calcula ~90 min en total.
- Todo en esta guía es **gratis** salvo que lo digamos explícitamente.
- **Guarda tus secretos en un password manager** (1Password, Bitwarden, Apple Keychain, Notes con candado). NUNCA los pongas en texto plano ni los subas a Git.
- Si algo no funciona, **NO sigas al siguiente paso**. Detente y revisa.

---

## Sección 1: Crear proyecto Supabase

Vamos a crear un **tercer proyecto Supabase** dedicado al portal de clientes, separado de los 2 que ya tienes (para no mezclar datos del sitio público con datos sensibles de clientes).

### 1.1 — Entra al dashboard
1. Abre https://supabase.com/dashboard
2. Login con tu cuenta (la misma de los otros 2 proyectos).
3. Vas a ver tu organización. Si tienes más de una, elige la que usas para Conecta MX.

**Tacha esto si funcionó: [ ]**

### 1.2 — Crear el proyecto nuevo
1. Click en el botón verde **"New project"** (arriba a la derecha).
2. Rellena los campos:
   - **Name**: `conecta-portal`
   - **Database Password**: ⚠️ MUY IMPORTANTE — lee la siguiente subsección antes de elegir.
   - **Region**: `East US (North Virginia)` — es la más cercana a México geográficamente, lo que reduce latencia. Europa o Asia te darían 200-300ms extra por cada query.
   - **Pricing Plan**: deja **Free** (ver explicación abajo).
3. Click en **"Create new project"**.
4. **Espera 2-3 min** mientras se provisiona la base de datos. La página te muestra un loader.

**Tacha esto si funcionó: [ ]**

### 1.3 — Qué password elegir (DB Password)
Esta password es **del Postgres** subyacente. No la vas a usar diariamente, pero **la necesitas si algún día te conectas con SQL client externo (DBeaver, psql)**.

- Mínimo 16 caracteres, con mayúsculas, minúsculas, números y símbolos.
- Usa el botón **"Generate a password"** que Supabase te ofrece.
- **GUÁRDALA INMEDIATAMENTE en tu password manager** con la etiqueta `Supabase DB Password — conecta-portal`.
- ⚠️ **Supabase NO te la vuelve a mostrar después de crear el proyecto**. Si la pierdes, tienes que resetearla (es reversible, pero molesto).

**Tacha esto si funcionó: [ ]**

### 1.4 — Free vs Pro: cuál elegir
| Característica | Free | Pro ($25 USD/mes) |
|---|---|---|
| Proyectos activos | Hasta 2 organizaciones gratis (límite blando, normalmente no chocas) | Sin límite efectivo |
| Pausa automática | Sí, si no hay actividad por 7 días | No se pausa |
| Database size | 500 MB | 8 GB incluidos |
| Bandwidth | 5 GB/mes | 250 GB/mes |
| Auth users | 50,000 MAU | 100,000 MAU |
| Backup | 1 día | 7 días point-in-time |
| Soporte | Comunidad | Email |

**Recomendación**: empieza con **Free**. Con ~150 clientes activos mensuales estás muy lejos de los límites. Si el portal crece o necesitas backups serios, subes a Pro en un click (sin migración, sin downtime).

⚠️ Si pasas a Pro, **es un cargo mensual recurrente** ($25 USD/mes mínimo). Cancelas cuando quieras.

**Tacha esto si funcionó (elegiste Free): [ ]**

### 1.5 — Encontrar URL y API Keys
Una vez creado el proyecto:

1. En el sidebar izquierdo busca el ícono de **engranaje ⚙️ (Project Settings)**.
2. Click en **"API"** dentro del menú de settings.
3. Vas a ver tres datos clave:

| Campo | Dónde está en la página | Para qué sirve |
|---|---|---|
| **Project URL** | Sección "Project URL", formato `https://XXXXXXXXXXXX.supabase.co` | Para conectar tu app. NO es secreto. |
| **anon / public key** | Sección "Project API keys" → fila "anon public" → click ojo 👁️ | Key pública para el cliente (browser). Va en el frontend. Tiene RLS encima, así que es seguro exponerla. |
| **service_role key** | Sección "Project API keys" → fila "service_role secret" | ⚠️ **SUPER SECRETO**. Bypasea Row Level Security. Solo va en backend (Netlify Functions). Si se filtra, alguien puede leer/borrar toda tu DB. |

4. Copia los 3 valores y **guárdalos en tu password manager** con las etiquetas:
   - `Supabase URL — conecta-portal`
   - `Supabase anon key — conecta-portal`
   - `Supabase service_role key — conecta-portal` ⚠️ SECRETO

**Tacha esto si funcionó: [ ]**

### ✅ Checklist Sección 1
- [ ] Proyecto `conecta-portal` creado en región East US
- [ ] Tier Free seleccionado
- [ ] DB password guardada en password manager
- [ ] Project URL copiada y guardada
- [ ] anon key copiada y guardada
- [ ] service_role key copiada y guardada (marcada como SECRETA)

---

## Sección 2: Google OAuth

Vamos a permitir que los clientes se loggeen con su cuenta de Google. Esto evita que tengan que recordar otra contraseña y reduce la fricción de registro enormemente.

### 2.1 — Entrar a Google Cloud Console
1. Abre https://console.cloud.google.com/
2. Login con tu cuenta de Google (puede ser la misma de Gmail personal o una de empresa, no importa para este uso).
3. Si nunca has usado Google Cloud, te va a pedir aceptar Términos de Servicio. Acéptalos.

**Tacha esto si funcionó: [ ]**

### 2.2 — Crear un proyecto en Google Cloud
1. Arriba a la izquierda, junto al logo "Google Cloud", click en el **selector de proyecto** (dice "Select a project" o el nombre de un proyecto previo).
2. En el modal que abre, click en **"NEW PROJECT"** (arriba a la derecha).
3. Llena:
   - **Project name**: `conecta-portal`
   - **Organization**: déjalo en "No organization" si te lo pregunta.
4. Click **"CREATE"**.
5. Espera ~30 segundos. Te llega una notificación cuando termina.
6. **Cambia al proyecto recién creado** usando el selector de arriba.

ℹ️ Google Cloud tiene proyectos gratis. No te van a cobrar nada por OAuth.

**Tacha esto si funcionó: [ ]**

### 2.3 — Habilitar OAuth Consent Screen
Esta es la pantalla que el usuario ve cuando da click en "Login con Google" — "La app conecta-portal quiere acceder a tu cuenta".

1. En el buscador de arriba escribe **"OAuth consent screen"** y entra al primer resultado.
2. Te pregunta el **User Type**:

| Opción | Cuándo usar |
|---|---|
| **Internal** | Solo si tu cuenta de Google es de Google Workspace (empresa con dominio propio en Google) Y solo quieres que se loggeen usuarios de tu dominio. NO es tu caso. |
| **External** | Cualquier usuario con cuenta Google puede loggear. **Esto es lo que quieres** porque tus clientes usan sus Gmails personales. |

3. Selecciona **External** → **CREATE**.

**Tacha esto si funcionó: [ ]**

### 2.4 — Configurar la pantalla de consentimiento
Te lleva a un formulario largo. Llena solo lo esencial:

**Pestaña "OAuth consent screen":**
- **App name**: `Conecta Reynosa`
- **User support email**: `admin@conectareynosa.mx`
- **App logo**: opcional, puedes saltarlo por ahora
- **Application home page**: `https://conectareynosa.mx`
- **Authorized domains**: agrega `conectareynosa.mx` (sin https://, sin /, solo el dominio)
- **Developer contact email**: `admin@conectareynosa.mx`
- Click **"SAVE AND CONTINUE"**

**Pestaña "Scopes":**
- Click **"ADD OR REMOVE SCOPES"**
- Marca solo: `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid`
- Click **"UPDATE"** → **"SAVE AND CONTINUE"**

**Pestaña "Test users":**
- Por ahora puedes saltarte esto. Mientras la app esté en modo "Testing", solo los test users pueden loggearse, pero **veremos cómo publicarla** después.
- Click **"SAVE AND CONTINUE"**

**Pestaña "Summary":**
- Click **"BACK TO DASHBOARD"**

ℹ️ La app va a estar en estado **"Testing"** por default. Esto significa que **solo 100 usuarios pueden loggearse** hasta que la publiques. Cuando estés listo para producción, le das al botón **"PUBLISH APP"** y Google te pedirá verificación (puede tardar días si pides scopes sensibles — los nuestros NO son sensibles, así que será rápido o automático).

**Tacha esto si funcionó: [ ]**

### 2.5 — Crear OAuth Client ID
1. En el buscador escribe **"Credentials"** y entra.
2. Arriba click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**.
3. **Application type**: `Web application`
4. **Name**: `conecta-portal-web`
5. **Authorized JavaScript origins**: agrega 2 entradas:
   - `https://conectareynosa.mx`
   - `http://localhost:8888` (para desarrollo local con Netlify Dev)
6. **Authorized redirect URIs**: agrega 1 entrada (⚠️ usa tu URL real de Supabase del paso 1.5):
   - `https://TU_PROYECTO.supabase.co/auth/v1/callback`
   - Ejemplo: si tu Project URL es `https://abcdefgh123456.supabase.co`, aquí pones `https://abcdefgh123456.supabase.co/auth/v1/callback`
7. Click **"CREATE"**.
8. Aparece un modal con **Client ID** y **Client Secret**.
9. ⚠️ **Copia ambos AHORA y guárdalos en tu password manager**:
   - `Google OAuth Client ID — conecta-portal`
   - `Google OAuth Client Secret — conecta-portal` ⚠️ SECRETO

El Client Secret lo puedes volver a ver después, pero es buena práctica guardarlo inmediatamente.

**Tacha esto si funcionó: [ ]**

### 2.6 — Pegar las llaves en Supabase
1. Vuelve a tu proyecto Supabase (`conecta-portal`).
2. Sidebar izquierdo → **Authentication** (ícono de candado) → **Providers**.
3. Busca **Google** en la lista, click para expandir.
4. Toggle **"Enable Sign in with Google"** → ON.
5. Pega:
   - **Client ID (for OAuth)**: el Client ID de Google
   - **Client Secret (for OAuth)**: el Client Secret de Google
6. Deja el resto en default.
7. Click **"Save"** abajo.

**Tacha esto si funcionó: [ ]**

### ✅ Checklist Sección 2
- [ ] Proyecto Google Cloud `conecta-portal` creado
- [ ] OAuth consent screen configurado como **External**
- [ ] Scopes mínimos agregados (email, profile, openid)
- [ ] OAuth Client ID creado tipo "Web application"
- [ ] Authorized redirect URI apunta a `TU_PROYECTO.supabase.co/auth/v1/callback`
- [ ] Client ID y Client Secret pegados en Supabase → Auth → Providers → Google
- [ ] Google provider está habilitado (toggle ON) y guardado

---

## Sección 3: Custom SMTP con Resend

Por default, los emails de Supabase (confirmación de cuenta, reset de password) salen desde `noreply@mail.app.supabase.io`. Eso se ve poco profesional y suele caer en spam. Vamos a configurarlo para que salgan desde `admin@conectareynosa.mx` usando tu Resend que ya tienes verificado.

### 3.1 — Obtener API key de Resend
1. Abre https://resend.com/api-keys
2. Si ya tienes una API key creada para otros usos (chatbot, etc.) **puedes reutilizarla** o crear una nueva dedicada al portal.
3. Recomendación: crea una nueva con scope mínimo:
   - Click **"+ Create API Key"**
   - **Name**: `conecta-portal-smtp`
   - **Permission**: `Sending access`
   - **Domain**: `conectareynosa.mx`
   - Click **"Add"**.
4. ⚠️ **Copia la key AHORA**. Resend la muestra una sola vez. Formato: `re_xxxxxxxxxxxxxxxxxxxx`.
5. Guárdala en password manager como `Resend API Key — conecta-portal SMTP` ⚠️ SECRETO.

**Tacha esto si funcionó: [ ]**

### 3.2 — Configurar SMTP en Supabase
1. Vuelve al proyecto Supabase `conecta-portal`.
2. Sidebar → **Project Settings** ⚙️ → **Authentication** → busca la sección **"SMTP Settings"** (también podría aparecer como **"Auth → Emails → SMTP Settings"** dependiendo de la versión del dashboard).
3. Toggle **"Enable Custom SMTP"** → ON.
4. Llena los campos exactamente así:

| Campo | Valor |
|---|---|
| **Sender email** | `admin@conectareynosa.mx` |
| **Sender name** | `Conecta Reynosa` |
| **Host** | `smtp.resend.com` |
| **Port** | `465` |
| **Username** | `resend` |
| **Password** | (pega tu Resend API key del paso 3.1, completa con el `re_` adelante) |
| **Minimum interval between emails** | `60` (segundos, default) |

5. Click **"Save"** abajo.

ℹ️ Puerto **465** usa SSL/TLS implícito. Si por alguna razón no funciona, prueba puerto **587** con STARTTLS, pero `465` es lo recomendado por Resend.

**Tacha esto si funcionó: [ ]**

### 3.3 — Probar que funciona
1. En la misma página de SMTP Settings, busca el botón **"Send test email"** (a veces está al final de la sección, a veces arriba).
2. Pon tu propio correo (`admin@conectareynosa.mx`).
3. Click enviar.
4. Revisa tu inbox. Debe llegar en <1 min.
5. Verifica:
   - El "From" dice `Conecta Reynosa <admin@conectareynosa.mx>` ✅
   - NO dice `noreply@mail.app.supabase.io` ❌
   - El email NO está en spam.

**Tacha esto si funcionó: [ ]**

### 3.4 — Qué hacer si los emails caen en spam
Si el email de prueba llegó a spam:

1. **Verifica DNS en Resend**: ve a https://resend.com/domains y confirma que `conectareynosa.mx` tiene **todas las filas en verde** (SPF, DKIM, DMARC). Si alguna está roja, hay un problema de DNS que tienes que arreglar en GoDaddy.
2. **Espera 24 horas**: a veces los proveedores (Gmail, Outlook) son escépticos con dominios nuevos. La reputación se construye con tiempo y volumen.
3. **Marca como "No es spam"** en tu Gmail para enseñarle al filtro.
4. **No envíes en ráfaga**: si mandas 100 emails de prueba seguidos a la misma dirección, los filtros se ponen agresivos. Usa correos diferentes y espacia las pruebas.

Si después de eso sigue cayendo en spam, mándame los headers del email y vemos qué dice el `Authentication-Results`.

**Tacha esto si funcionó (no aplica si llegó al inbox): [ ]**

### ✅ Checklist Sección 3
- [ ] API key de Resend creada con scope "Sending access" en dominio `conectareynosa.mx`
- [ ] API key guardada en password manager (SECRETO)
- [ ] Custom SMTP habilitado en Supabase con `smtp.resend.com:465`
- [ ] Sender email: `admin@conectareynosa.mx`
- [ ] Test email enviado y recibido en inbox (no spam)
- [ ] Email muestra "From" correcto

---

## Sección 4: Variables de entorno en Netlify

Las API keys NO van en Git. Las pones en Netlify como "Environment Variables" para que tu sitio las pueda leer en runtime sin exponerlas en el código.

### 4.1 — Las 3 variables que vas a necesitar

| Variable | Valor (de la Sección 1.5) | Dónde se usa | Sensibilidad |
|---|---|---|---|
| `PORTAL_SUPABASE_URL` | Tu Project URL, ej. `https://abcdefgh123456.supabase.co` | Frontend + Backend | Pública (no es secreto, pero la pones en env para no hardcodearla) |
| `PORTAL_SUPABASE_ANON_KEY` | Tu anon/public key (empieza con `eyJ...`) | Frontend | Pública con RLS encima |
| `PORTAL_SUPABASE_SERVICE_KEY` | Tu service_role key (empieza con `eyJ...`) | ⚠️ SOLO Backend (Netlify Functions) | **SUPER SECRETO** |

### 4.2 — Pegarlas en Netlify
1. Abre https://app.netlify.com/ y entra al sitio de `conectareynosa.mx`.
2. **Site configuration** → **Environment variables** (sidebar izquierdo).
3. Para cada una de las 3 variables:
   - Click **"Add a variable"** → **"Add a single variable"**.
   - **Key**: el nombre exacto de la tabla (ej. `PORTAL_SUPABASE_URL`)
   - **Values**: pega el valor correspondiente
   - **Scopes**: deja **"All scopes"** marcado (funciona en builds, functions, runtime)
   - **Values per deploy context**: deja **"Same value for all deploy contexts"** por ahora
   - Click **"Create variable"**.
4. Cuando termines deberías ver las 3 variables listadas en la página.

**Tacha esto si funcionó: [ ]**

### 4.3 — Cuándo re-deployar
- Las env vars se cargan en **build time** Y en **runtime para Functions**.
- ⚠️ Si las agregaste **después** del último deploy, **necesitas hacer un re-deploy** para que tomen efecto. Las visitas actuales al sitio NO las verán hasta entonces.
- Para re-deployar sin cambios de código: **Deploys** → **Trigger deploy** → **Clear cache and deploy site**.
- Pero como **todavía no has agregado el código del portal**, no es urgente hacer el redeploy ahora. Lo harás en Fase 2.1 cuando empieces a programar.

**Tacha esto si funcionó: [ ]**

### ✅ Checklist Sección 4
- [ ] `PORTAL_SUPABASE_URL` agregada en Netlify
- [ ] `PORTAL_SUPABASE_ANON_KEY` agregada en Netlify
- [ ] `PORTAL_SUPABASE_SERVICE_KEY` agregada en Netlify (marcada como SECRETA)
- [ ] Las 3 variables visibles en `Site configuration → Environment variables`
- [ ] Entiendo que hay que re-deployar para que las vars tomen efecto (lo haré en Fase 2.1)

---

## Sección 5: CSP (Content Security Policy)

### 5.1 — Qué es y por qué hay que tocarlo
El archivo `netlify.toml` en la raíz del repo tiene una directiva **Content-Security-Policy** que le dice al navegador a qué dominios externos puede conectarse tu sitio. Es una capa de seguridad que previene ataques XSS.

**Hoy** la línea `connect-src` ya incluye:
```
connect-src 'self' https://api.anthropic.com https://*.supabase.co wss://*.supabase.co https://lcffgrrwbbbgorooawyd.supabase.co;
```

El wildcard `https://*.supabase.co` ya cubre **cualquier** subdominio de Supabase, incluido tu nuevo proyecto `conecta-portal`. ✅

**Pero** hay un proyecto Supabase hardcodeado al final (`https://lcffgrrwbbbgorooawyd.supabase.co`). Cuando llegue Fase 2.1 vamos a agregar específicamente la URL del nuevo proyecto al lado de ese, así:

```
connect-src 'self' https://api.anthropic.com https://*.supabase.co wss://*.supabase.co https://lcffgrrwbbbgorooawyd.supabase.co https://TU_PROYECTO.supabase.co;
```

(El wildcard ya lo cubriría, pero hardcodear ambos es práctica explícita y deja claro qué proyectos se usan.)

### 5.2 — ⚠️ NO modifiques netlify.toml ahora
Esto es solo informativo. **El cambio al netlify.toml lo hacemos en Fase 2.1** junto con el código del portal. Si lo modificas ahora y deployeas, no rompe nada, pero queremos que cada cambio en Git tenga un commit con propósito claro.

**Tacha esto si entendiste (no hay que hacer nada todavía): [ ]**

### ✅ Checklist Sección 5
- [ ] Entiendo qué hace `connect-src` en el CSP
- [ ] Sé que `https://*.supabase.co` ya cubre el nuevo proyecto
- [ ] NO modifico `netlify.toml` en esta fase

---

## Sección 6: Verificación final

Antes de empezar a programar el portal, vamos a confirmar que todas las piezas funcionan en aislamiento.

### 6.1 — Test 1: Login con Google directamente en Supabase
Supabase tiene una herramienta interna para probar el login sin tener que tener tu frontend listo.

1. En tu proyecto Supabase → **Authentication** → **Users**.
2. Por ahora no hay usuarios. Vamos a crear uno con OAuth para probar.
3. Abre una pestaña nueva con esta URL (reemplaza `TU_PROYECTO`):
   ```
   https://TU_PROYECTO.supabase.co/auth/v1/authorize?provider=google
   ```
4. Esto te debe redirigir a la pantalla de "Login con Google" de Google.
5. Loggéate con `admin@conectareynosa.mx`.
6. Después del login, Google te redirige de vuelta a Supabase y eventualmente a `localhost` o a una página de error de la URL — **eso es esperado por ahora** porque no hemos configurado un Site URL. Lo que nos importa es:
7. Vuelve a Supabase → **Authentication** → **Users**.
8. Deberías ver **1 usuario nuevo** con tu Gmail. ✅

Si NO aparece:
- Revisa que la **Authorized redirect URI** en Google Cloud sea exactamente `https://TU_PROYECTO.supabase.co/auth/v1/callback` (sin slash al final, sin typos).
- Revisa que Google esté habilitado en Supabase → Auth → Providers.

**Tacha esto si funcionó: [ ]**

### 6.2 — Test 2: Email de confirmación
Ya lo probaste en 3.3, pero para asegurar:
1. En Supabase → **Authentication** → **Users**, click **"Invite user"**.
2. Pon tu correo personal (uno DIFERENTE al que usaste arriba, ej. tu correo personal de Gmail si tienes otro).
3. Click **"Send invitation"**.
4. Revisa que el email llegue desde `admin@conectareynosa.mx` y NO de Supabase.

**Tacha esto si funcionó: [ ]**

### 6.3 — Test 3: Variables de entorno en Netlify
1. Abre https://app.netlify.com/ → tu sitio → **Site configuration** → **Environment variables**.
2. Confirma que ves las 3 variables del portal:
   - `PORTAL_SUPABASE_URL` ✅
   - `PORTAL_SUPABASE_ANON_KEY` ✅
   - `PORTAL_SUPABASE_SERVICE_KEY` ✅
3. NO necesitas ver los valores (están ocultos por seguridad).

**Tacha esto si funcionó: [ ]**

### ✅ Checklist consolidado: TODO LISTO PARA CONSTRUIR
- [ ] Proyecto Supabase `conecta-portal` activo en East US, plan Free
- [ ] URL, anon key, service_role key guardadas en password manager
- [ ] Google Cloud proyecto `conecta-portal` creado, OAuth consent screen External configurado
- [ ] OAuth Client ID + Secret pegados en Supabase Auth → Google provider habilitado
- [ ] Test de login con Google funcionó (apareció usuario nuevo en Supabase)
- [ ] Custom SMTP de Resend configurado con `admin@conectareynosa.mx`
- [ ] Test email de Supabase llegó al inbox (no spam) con sender correcto
- [ ] Las 3 env vars (`PORTAL_SUPABASE_URL`, `PORTAL_SUPABASE_ANON_KEY`, `PORTAL_SUPABASE_SERVICE_KEY`) están en Netlify
- [ ] Entiendo que el `netlify.toml` se modifica en Fase 2.1, no ahora

---

## 🎯 Cuando termines este checklist completo, avísame y pasamos a Fase 2.1: programar el portal.

**Cosas importantes que aprendiste de paso:**
- Tu password manager es tu mejor amigo. Todas las keys nuevas van ahí.
- `anon key` = pública (frontend), `service_role key` = secreta (backend). Nunca las confundas.
- CSP existe para protegerte. Cuando agregues servicios nuevos, va a haber que actualizarlo.
- Resend SMTP > email default de Supabase, siempre.

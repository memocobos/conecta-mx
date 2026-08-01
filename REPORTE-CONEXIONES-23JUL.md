# 🔍 REPORTE DE CONEXIONES — Sistema Conecta (23-jul-2026)

> Revisión #5 de la lista maestra: "que todo esté conectado con todo y dónde creo que hay errores".
> Hecha por la sesión Cowork contra el código real de main + las dos bases de Supabase en vivo.
> Archivo personal de Memo — NO se commitea.

## ✅ LO QUE ESTÁ SANO (verificado, no supuesto)

1. **Cada botón tiene su función:** todas las llamadas `/.netlify/functions/...` de las 8 páginas apuntan a archivos que existen. Cero enlaces rotos.
2. **Cada cron tiene su reloj:** los 13 programados en netlify.toml existen como archivo y viceversa.
3. **Cada tabla que el código pide EXISTE y en la base correcta:** ~40 tablas cotejadas contra KameHouse y Portal en vivo. Las funciones cross-mundo (cancelar/posponer evento) usan la base correcta para cada cosa — cero mezclas.
4. **KameHouse ya no toca la base directo:** cero `.from()` con llave anon — todo pasa por funciones con service_role. (El portal sí lee directo, pero por diseño, con RLS.)
5. **Los 2 `on_conflict` viejos que quedan** (reportes de coordis y catálogo de venues) están respaldados por UNIQUE simples reales en la base — funcionan bien; son de la era pre-regla.
6. **Cero trampas uuid-vs-slug** en funciones (la lección del rooming/liquidaciones está limpia en todo el backend).
7. **Las 3 copias de la regla de precios siguen gemelas:** 736 combinaciones comparadas hoy (sitio vs lib vs calculadora del vendedor) → **0 diferencias**.

## ⚠️ HALLAZGOS (dónde huelo problemas — ninguno urgente, todos anotables)

### 1. Siete tablas huérfanas en KameHouse (nadie las usa)
`bodega_piezas`, `bodega_movimientos`, `vendedores`, `costos_evento`, `resumen_global`, `reservaciones`, `gastos_generales` — restos de eras pasadas. No rompen nada, pero confunden (la tabla `vendedores` NO es la del módulo Vendedores, que usa `usuarios`). Sugerencia: podarlas por SQL en una menudencia, o documentarlas como muertas. Nota: `bodega_movimientos` podría revivir si algún día se hace el kardex (O2).

### 2. La selva de nombres de las llaves de Supabase
El código usa **6 nombres distintos** para hablarle a 2 bases: `SUPABASE_URL`, `SUPABASE_URL_KAMEHOUSE`, `SUPABASE_SERVICE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY_KAMEHOUSE`, y un solitario `SUPABASE_KEY` (1 solo uso — candidato a corregir). Funciona porque hay fallbacks, pero es campo minado para un error futuro de "función nueva apunta a la base equivocada". Sugerencia: menudencia de unificación documentada, sin prisa.

### 3. Cotejo de variables contra Netlify — PENDIENTE DE 2 MINUTOS
Tu sesión de Netlify caducó en mi navegador y no pude cotejar la lista completa. El código necesita estas (además de las obvias de Supabase/Resend): `JWT_SECRET`, `GITHUB_TOKEN`, `AZURACAST_API_KEY`, `RESEND_FROM_COBRANZA`, `RESEND_FROM_ROL`, `RESEND_FROM_CONTRATOS`, `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, `META_TEST_EVENT_CODE`, `RADIO_EDITOR_KEY`, `ADMIN_EMAIL`, `CORREOS_MODO`, `CORREOS_PRUEBA_DESTINO`, `CONTRATO_DOMICILIO_EMPRESA` ✓(la puse yo), `SITE_URL`. → Cuando entres a Netlify, palomeamos juntos en 2 minutos.

### 4. Tus datos bancarios viven en VARIOS lugares
`BANCO_DEFAULT`/`BANCO_HEY` (tarjeta, CLABE, titular) están en: index.html, la réplica de `_lib/catalogo-index.js`, y pagos.html. Si un día cambias de cuenta, hay que tocar los 3 (y el lib avisa en su comentario). No es bug — es riesgo de mantenimiento. Anotado como nota permanente.

### 5. 🐌 LA LENTITUD DE KAMEHOUSE — mi diagnóstico (pendiente #10)
- **kamehouse.html pesa 1.4 MB en UN solo archivo** — el navegador lo baja Y lo interpreta completo en cada entrada (en móvil/red lenta, ahí está tu "a veces no carga").
- **`admin-usuarios` listar trae todo de golpe** y varias vistas re-piden datos al entrar.
- Hay cachés internos buenos (274 menciones) pero el arranque dispara muchas cargas.
- **Mi receta para la tuerca de velocidad** (cuando la arranques): (a) partir el CSS y JS a archivos aparte con caché del navegador — la página baja a KB y solo se re-descarga lo que cambió; (b) boot mínimo: cargar solo la pestaña visible (ya hay lazy parcial, completarlo); (c) paginar/limitar usuarios y listas grandes; (d) medir con el panel de Netlify antes/después.
- **¿Contratar algo? Todavía NO.** Hay mucho gratis por exprimir primero. Si tras la dieta sigue lento, lo que valdría dinero sería el plan de pago de Supabase (más músculo de base) — pero dudo que haga falta.

### 6. Menudencia de peso
`imgs/` + `mapas/` + `lineups/` = 22 MB (van por CDN, ok) — pero `machaca.png` pesa 2.6 MB él solito; comprimirlo a webp lo dejaría en ~300 KB.

## 📌 SIGUIENTE PASO SUGERIDO
La tuerca de **velocidad (#10)** con la receta del punto 5 — es el dolor diario. Las podas (tablas huérfanas, SUPABASE_KEY, machaca.png) caben en una menudencia de higiene cuando quieras.

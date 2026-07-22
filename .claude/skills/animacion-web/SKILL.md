---
name: animacion-web
description: Recetas de animación para el sitio y el Portal de Conecta Reynosa en HTML/CSS/JS vainilla, sin build step ni librerías. Úsala al construir o retocar cualquier pantalla con movimiento — reveals al hacer scroll, secuencias de carga, micro-interacciones en hover, contadores de eventos, transiciones entre páginas o estados de carga. Actívala también cuando el prompt diga "que se vea vivo", "que tenga movimiento", "más dinámico", "animar", "transición" o "efecto". NO la uses para decidir paleta, tipografía o layout — eso es de frontend-design.
---

# Animación web — Conecta Reynosa

Stack real: HTML + CSS + JS vainilla servido en Netlify. Sin React, sin Tailwind, sin bundler, sin GSAP. Todo lo de aquí funciona pegándolo tal cual en el archivo. Si una receta necesita instalar algo, no es de aquí.

## Reglas que no se negocian

**1. Solo `transform` y `opacity`.** Son las dos únicas propiedades que el navegador anima en la GPU sin recalcular layout. Animar `width`, `height`, `top`, `left`, `margin` o `padding` obliga a un reflow en cada frame y se siente pegajoso en los celulares de gama media donde la mayoría de los clientes abren el sitio por WhatsApp.

**2. `prefers-reduced-motion` siempre.** No es opcional ni "detalle de accesibilidad": hay gente que se marea con el movimiento. Va al final de cada hoja de estilo:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**3. El contenido nunca depende del JS.** Si el JS falla o tarda, el texto debe verse igual. Por eso los reveals se activan agregando una clase que *muestra*, con el estado visible como default cuando no hay JS (ver la receta 1).

**4. Un momento orquestado, no efectos regados.** Si todo se mueve, nada destaca. Escoge un lugar donde el movimiento cargue el mensaje — normalmente el hero o el momento en que el cliente ve el precio — y deja lo demás quieto.

**5. Duraciones cortas.** 150–250ms para micro-interacciones, 400–600ms para reveals, nunca más de 800ms. Todo lo que pase de ahí se siente lento, no elegante.

**6. Curva de salida, no lineal.** `cubic-bezier(0.16, 1, 0.3, 1)` para reveals (arranca rápido, frena suave) y `ease-out` para hovers. `linear` solo para spinners y barras de progreso.

---

## Receta 1 — Reveal al hacer scroll

El caballito de batalla. Los elementos aparecen conforme el cliente baja.

```css
.reveal {
  opacity: 0;
  transform: translateY(24px);
  transition:
    opacity 500ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 500ms cubic-bezier(0.16, 1, 0.3, 1);
}

.reveal.is-visible {
  opacity: 1;
  transform: none;
}

/* Sin JS, todo visible: el contenido nunca se queda escondido */
.no-js .reveal {
  opacity: 1;
  transform: none;
}
```

```html
<script>
  document.documentElement.classList.remove('no-js');
</script>
```

```js
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target); // una sola vez, no yo-yo
    });
  },
  { threshold: 0.15, rootMargin: '0px 0px -80px 0px' }
);

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
```

`rootMargin` negativo abajo hace que dispare un poco antes de que el elemento toque el borde — se siente más natural que esperar a que entre completo.

**Escalonado (stagger)** para listas de paquetes o tarjetas de eventos:

```html
<div class="reveal" style="--delay: 0ms">…</div>
<div class="reveal" style="--delay: 80ms">…</div>
<div class="reveal" style="--delay: 160ms">…</div>
```

```css
.reveal { transition-delay: var(--delay, 0ms); }
```

Máximo 80–100ms entre elementos y no más de 6 en cadena. Con más, el último tarda tanto que parece bug.

---

## Receta 2 — Secuencia de carga del hero

Se ejecuta una sola vez al abrir. Puro CSS, sin JS.

```css
@keyframes entra {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: none; }
}

.hero > * {
  opacity: 0;
  animation: entra 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  animation-delay: var(--d, 0ms);
}

.hero__eyebrow  { --d: 0ms;   }
.hero__titulo   { --d: 100ms; }
.hero__bajada   { --d: 200ms; }
.hero__cta      { --d: 320ms; }
```

`forwards` es crítico: sin eso el elemento regresa a `opacity: 0` al terminar.

---

## Receta 3 — Micro-interacciones en hover

Botones de "Apartar mi lugar", tarjetas de paquete. Regla: el cambio debe leerse en menos de 200ms.

```css
.btn {
  transition: transform 160ms ease-out, box-shadow 160ms ease-out;
}

.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgb(0 0 0 / 0.18);
}

.btn:active {
  transform: translateY(0);
  transition-duration: 80ms;
}
```

El `:active` que regresa a cero da la sensación física de que el botón se hunde. Vale más que cualquier efecto elaborado.

**En móvil el hover no existe.** Ese `translateY` nunca lo va a ver la mayoría de tus clientes. Protégelo:

```css
@media (hover: hover) {
  .btn:hover { transform: translateY(-2px); }
}
```

Y asegúrate de que el `:focus-visible` tenga su propio estilo, para quien navega con teclado:

```css
.btn:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 3px;
}
```

---

## Receta 4 — Contador regresivo al evento

Directo al negocio: cuántos días faltan para el concierto. Anima solo el dígito que cambia.

```css
.cuenta__num {
  display: inline-block;
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.cuenta__num.tic {
  transform: translateY(-4px) scale(1.04);
}
```

```js
function actualizarCuenta(el, valor) {
  if (el.textContent === String(valor)) return; // no animes lo que no cambió
  el.textContent = valor;
  el.classList.add('tic');
  setTimeout(() => el.classList.remove('tic'), 220);
}
```

El `if` de la primera línea es lo importante: sin él estás animando los segundos y los días al mismo tiempo cada segundo, y se ve nervioso.

---

## Receta 5 — Skeleton mientras carga Supabase

Para las tablas del Portal. Le da al cliente la sensación de que algo está pasando en vez de una pantalla en blanco.

```css
.skeleton {
  background: linear-gradient(
    90deg,
    rgb(0 0 0 / 0.06) 25%,
    rgb(0 0 0 / 0.12) 37%,
    rgb(0 0 0 / 0.06) 63%
  );
  background-size: 400% 100%;
  animation: barrido 1.4s ease infinite;
  border-radius: 4px;
}

@keyframes barrido {
  0%   { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}
```

Dibuja el skeleton con la misma altura y ancho aproximado que el contenido real, para que no brinque el layout cuando lleguen los datos.

---

## Receta 6 — Transición entre páginas (View Transitions)

Mejora progresiva: donde el navegador la soporta se ve suave, donde no, funciona igual de siempre. Requiere que las páginas sean del mismo origen.

```css
@view-transition {
  navigation: auto;
}

::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 260ms;
}
```

Para que un elemento se "traslade" entre dos páginas (por ejemplo la foto del evento del listado al detalle), ponle el mismo nombre en ambas:

```css
.evento__foto { view-transition-name: foto-evento; }
```

Ese nombre debe ser único por página: si hay 10 tarjetas en el listado, asígnalo por JS solo a la que se clickeó.

---

## Antes de dar por terminado

- [ ] ¿Solo animé `transform` y `opacity`?
- [ ] ¿Está el bloque de `prefers-reduced-motion`?
- [ ] ¿Se ve bien el contenido con el JS desactivado?
- [ ] ¿Probé en un ancho de 360px?
- [ ] ¿Los hovers están dentro de `@media (hover: hover)`?
- [ ] ¿Hay `:focus-visible` en todo lo clickeable?
- [ ] ¿Alguna animación pasa de 800ms?
- [ ] ¿Quité un efecto? (si todo se mueve, nada destaca)

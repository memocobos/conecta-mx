# BRIEF · TUERCA N1 — El banner azul es de Memo: noticias manuales + editor en el Palacio
> Escrito por la sesión Cowork (Jane). NO se commitea. Decisión de Memo 26-jul.

CONTEXTO: el banner de noticias vivas de PF-4 (que se arma solo desde EV)
cambia: Memo quiere escribir SUS noticias él mismo (rumores, anuncios, hype).

1. FUENTE MANUAL: la marquesina toma SOLO el arreglo NOTICIAS. El armado
   automático desde el catálogo se apaga (no se borra: queda tras un flag
   apagado, por si Memo cambia de opinión). Si NOTICIAS está vacío → fallback
   al lema estático de siempre (los spans del HTML, como hoy).
2. EDITOR EN EL PALACIO: en el panel Diseño (roshi-only), sección "Noticias
   del banner": lista editable (agregar, borrar, reordenar; texto plano sin
   HTML) + vista previa de la marquesina + botón "Publicar". Publicar usa el
   MISMO mecanismo de github-publish que ya publica eventos al index (mismo
   candado maestro_roshi, mismo endpoint o uno gemelo con el mismo gate
   verifyAdminAuthLive + corsCheck): reescribe el arreglo NOTICIAS en
   index.html → Netlify deploya solo. Memo nunca toca código.
3. SEGURIDAD: las noticias se pintan con textContent (ya es así desde PF-4) y
   el editor rechaza/escapa cualquier intento de markup. El endpoint valida
   largo por noticia (≤120 caracteres) y tope de noticias (10).

ARNÉS: editor agrega/borra/reordena y la vista previa espeja · publicar
escribe el arreglo correcto en index.html (fixture del archivo) sin tocar
NADA más (diff quirúrgico, patrón del publish de eventos) · NOTICIAS vacío →
lema estático · markup en una noticia → no se cuela · endpoint rechaza
no-roshi (403). Regresión del publish de eventos intacta.

Una PR, no mergear, reportar resultado.

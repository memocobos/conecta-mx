# BRIEF · TUERCA PP-2b — 140 saludos vivos para el dashboard del Portal
> Sesión Cowork (Jane), 27-jul. NO se commitea. Idea de Memo: que cada entrada
> al portal se sienta como un mensaje distinto — comunicación viva, no pantalla.

## MECÁNICA
- El saludo del dashboard (PP-2) deja las 2-3 variantes por hora y pasa a este
  POOL: al entrar se elige una al azar, sin repetir las últimas 10 (memoria en
  localStorage, puramente cosmética, fail-quiet como la celebración).
- El nombre sigue presente: "Hola, {nombre}" arriba y el saludo del pool como
  línea de abajo (o integrado si la frase trae {nombre} — ver marcas).
- Frases con `{nombre}` lo insertan; las demás van tal cual. textContent
  SIEMPRE (nada de innerHTML con la frase).
- Bucket opcional por momento: las marcadas [PRE] presuponen viaje próximo —
  solo elegibles si el cliente tiene tour próximo; las [SIN] solo si NO tiene
  tours activos; las neutras siempre. Si el filtro deja pocas, caen las neutras.
- Los textos son la copy aprobada; costura mínima permitida, sentido no.

## EL POOL (140)

### Hype de viaje [PRE]
1. ¿Ya tienes tu outfit listo?
2. ¿Listos para el próximo viaje?
3. Cada día falta menos. Aguanta.
4. Tu asiento ya tiene tu nombre.
5. El camión ya huele a aventura.
6. Falta poco para cantar a gritos.
7. Ve apartando tu mejor pose para las fotos.
8. La playlist del camino se arma sola.
9. Tu kit ya se está imprimiendo.
10. El countdown no perdona: ahí viene.
11. ¿Ya avisaste en el trabajo que ese día no existes?
12. Las mejores historias empiezan en un camión.
13. Tu boleto está más cerca de lo que crees.
14. Se acerca el día de gritar hasta quedarte sin voz.
15. ¿Ya elegiste con quién te vas a sentar?
16. El hotel ya casi tiende tu cama.
17. Ese evento no se va a cantar solo.
18. Prepara garganta: se viene el show.
19. Tu futura foto de perfil está a un viaje de distancia.
20. Los nervios bonitos ya se sienten, ¿verdad?
21. Checa tu plan: cada abono te acerca una rola más.
22. El día del evento vas a agradecer cada quincena.
23. ¿Ya viste quién abre el show?
24. Va a ser un buen día para estar en primera fila.
25. Dicen que ya están probando el sonido.
26. Tu lugar en el camión ya te extraña.
27. Guarda pila para ese día: la vas a necesitar toda.
28. Ya casi es hora de perder la voz con estilo.
29. Advertencia: este viaje causa recuerdos permanentes.
30. Lo que sigue: tú, el show y cero preocupaciones.

### Comunidad / cariño (neutras)
31. Qué gusto verte por aquí, {nombre}.
32. Tu portal, tus viajes, tu música.
33. Aquí siempre hay un lugar para ti.
34. De Reynosa para los escenarios del país.
35. Ya eres parte de la familia Conecta.
36. Trece años llevando gente a cantar.
37. Miles de viajeros, y tú eres de los nuestros.
38. Esto no es una página, es tu puerta al show.
39. Lo tuyo está en buenas manos.
40. Un gusto tenerte de vuelta.
41. ¿Todo bien? Tu WhatsApp de confianza sigue abierto.
42. Aquí no hay letra chica, solo buena música.
43. Viajar en bola siempre es mejor.
44. Tus pagos, tus fechas, todo a la mano.
45. La ruta es larga pero la banda es buena.
46. Bienvenido a tu rincón conectero.
47. Otro día perfecto para planear un concierto.
48. Tu próxima gran noche se cocina aquí.
49. Nos gusta verte por aquí seguido.
50. Todo en orden por acá. Tú tranquilo.
51. Las mejores noches de tu año pasan por aquí.
52. Este portal late al ritmo de tu música.
53. Reynosa presente en cada arena del país.
54. Ya nada más de vernos aquí, sentimos bonito.
55. Como en casa, pero con mejor cartelera.
56. Tu música favorita queda a un camión de distancia.
57. Y pensar que todo empieza con un separo.
58. Lo bueno se paga en quincenas y se vive en segundos.
59. Cada visita tuya nos hace el día.
60. Qué bonito es tener planes.
61. Tú pones las ganas, nosotros el camino.
62. La familia conectera crece cada semana.
63. Se te ve bien ese entusiasmo, {nombre}.
64. Los kilómetros no pesan cuando vas cantando.
65. Nadie se arrepiente de un buen concierto.
66. Hay quien colecciona cosas; tú coleccionas noches épicas.
67. Un concierto al año no hace daño. Dos, tampoco.
68. Las quincenas pasan, los recuerdos se quedan.
69. Tu yo del futuro te agradece este plan.
70. Si la vida se pone seria, agenda un concierto.

### ¿A dónde vamos? (invitan a explorar, neutras)
71. ¿A dónde vamos ahora?
72. ¿Ya viste los eventos nuevos?
73. Tu próximo destino te anda buscando.
74. El catálogo anda que arde. Échale un ojo.
75. Hay fechas nuevas esperándote.
76. ¿Monterrey o CDMX? Tú decides.
77. Siempre hay un show que te queda perfecto.
78. Dale una vuelta al catálogo, algo te va a gustar.
79. ¿Se antoja otro viaje? Aquí andamos.
80. Tu siguiente historia está en la cartelera.
81. Hay boletos que se están dejando querer.
82. Un tour nuevo nunca cae mal.
83. ¿Ya apartaste el que tanto presumes?
84. La lista de espera también cuenta como plan.
85. Alguien tiene que ir a ese concierto. ¿Por qué no tú?
86. Los mejores planes empiezan con "¿y si vamos?".
87. Ese artista que tanto oyes ya tiene fecha.
88. De ver el anuncio a estar ahí: cinco pasos.
89. Un viaje se antoja más cuando ya conoces el camino.
90. El separo de hoy es el grito de mañana.
91. Va de nuevo la pregunta de siempre: ¿a dónde vamos?
92. Tu bucket list musical no se va a tachar sola.
93. Se vale soñar; mejor si es con boleto en mano.
94. Checa las fechas: el año todavía da para más.
95. Los planes con música siempre salen bien.
96. Hoy es buen día para apartar un lugar.
97. Hay un camión que sale pronto. Nomás digo.
98. Las noches épicas se agendan con tiempo.
99. Tu próximo "no lo puedo creer" ya está en catálogo.
100. Vuelve a soñar en grande: hay cartelera nueva.

### Sin tours activos [SIN]
101. Te extrañamos en los camiones, {nombre}.
102. Tu asiento sigue disponible. Solo dilo.
103. El catálogo te espera cuando quieras volver.
104. Hace falta tu voz en el coro del camión.
105. Un viaje nuevo lo arregla casi todo.
106. La familia conectera pregunta por ti.
107. ¿Volvemos a la carretera?
108. Ese antojo de concierto no se va solo.
109. Tu próxima aventura está a un click.
110. Cuando estés listo, aquí seguimos.

### Día del evento / muy cerca [PRE]
111. ¡Es hoy, es hoy, ES HOY!
112. Hoy los nervios son de los buenos.
113. Carga tu pila y tu voz: nos vamos.
114. Hoy se canta hasta el desvelo.
115. El outfit, el ánimo y las ganas: listos.
116. Última llamada: nos vemos en el camión.
117. Hoy no hay pendientes, hay conciertos.
118. Que hoy tu única preocupación sea el setlist.
119. Este es el día que tanto pagaste en quincenas.
120. Hoy se hace historia, conectero.

### Guiños de la casa (neutras)
121. Ponte la del evento: hoy combinamos.
122. La radio Conecta suena mejor con volumen arriba.
123. Dale play a la radio mientras revisas tus pagos.
124. Un vasito del kit y tu música: la oficina perfecta.
125. El kit de tu próximo tour ya quiere conocerte.
126. Se dice pronto: trece años de puros conciertos.
127. Somos de Reynosa y llegamos a donde sea.
128. Aquí hasta los pagos suenan a música.
129. Nuestra oficina es un camión a 100 por la carretera.
130. Detrás de este portal hay gente que ama la música tanto como tú.
131. El separo es chiquito; el recuerdo, gigante.
132. Cada boleto tiene su historia. La tuya sigue.
133. Presume tu tote del kit: ya sabes de dónde es.
134. Ya sabes cómo funciona: tú cantas, nosotros manejamos.
135. La mejor agencia es la que te lleva de regreso a casa cantando.
136. Toda gran noche merece buen transporte.
137. Si suena bien, seguro salió de nuestra cartelera.
138. Nuestro GPS solo conoce rutas a conciertos.
139. Reynosa → tu artista favorito, sin escalas.
140. Gracias por viajar con nosotros. Siempre.

## ARNÉS
- Pool cargado completo (140), sin repetir las últimas 10 (memoria localStorage
  fail-quiet) · [PRE] solo con tour próximo · [SIN] solo sin tours · {nombre}
  se sustituye con textContent y sin romperse con nombres con apóstrofe ·
  largo máximo verificado (no desborda el shell en 390px) · reduced-motion
  irrelevante (es texto) · regresión PP-2 en verde.

# Conecta Reynosa — Contexto Completo para Claude Code

## El Negocio
- Nombre: Conecta Reynosa (sucursal de la franquicia Conecta MX)
- CEO: Memo Cobos (hcgcobos@gmail.com)
- Modelo: Agencia de viajes a conciertos desde Reynosa, Tamaulipas
- Web: conectareynosa.mx (Netlify + GitHub: memocobos/conecta-mx)
- WhatsApp reservas: 528119771072
- WhatsApp vuelos: 528132321405

## Stack Tecnico
- Frontend: HTML/CSS/JS puro en index.html
- Imagenes portadas: imgs.js (STATIC_IMGS)
- Mapas de venues: mapas.js (MAPAS)
- Lineups: lineups.js (LINEUPS)
- Deploy: GitHub -> Netlify automatico
- Chatbot IA: netlify/functions/chat.js (API Anthropic)
- Analytics: Google Analytics G-7JKGFQQQ7W
- Dominio: conectareynosa.mx (GoDaddy -> Netlify DNS)

## Reglas de Negocio — Paquetes
- PLUS: Todo incluido (transporte + hotel + boleto + kit)
- RIDE: Sin boleto (transporte + hotel + kit) — MTY $2,700 / CDMX $2,900
- STAY: Sin transporte (hotel + boleto + kit) — Solo en MTY = PLUS - sep
- CHEAP: Solo boleto — separo siempre $1,000
- Eventos CDMX: NO tienen paquete STAY ni RIDE en algunos casos
- sep = costo del transporte (se resta para calcular STAY)
- Hotel costos son POR PERSONA (hotelPP:true)
- 15 dias antes del evento: separo PLUS = 50% del total
- Autobus CDMX: $2,500 (si faltan +15 dias) / Cotiza por WA (si faltan <=15 dias)
- Vuelos: siempre cotizar al 81 3232 1405

## Reglas de Negocio — Hotel
- MTY estandar: Compartida $0 / Doble $650pp / Triple $250pp / Individual $1,960
- CDMX estandar: Compartida $0 / Doble $725pp / Triple $250pp / Individual $2,175
- Eventos 2 noches (Emblema, Warped): costos x2
- hotelPP:true = costos por persona (multiplicar por viajeros para total)
- hotelOverride:true = usar ev.hotel directo sin fallback global

## Estructura de Eventos (array EV en index.html)
Campos clave por evento:
- id, a (artista), f (fecha texto), ds (fecha ISO), v (venue)
- st: '' | 'ultimos' | 'agotado' | 'proceso' | 'pronto' | 'por-confirmar'
- cdmx:true = evento CDMX (sin STAY, ride=$2,900)
- sep = costo transporte
- ride = precio paquete RIDE
- zonas = array de zonas PLUS [{n, p, vip?, ag?}]
- cheapZonas = array de zonas CHEAP
- hotel = array habitaciones [{n, e}]
- mapa = key en MAPAS{}
- lineup = key en LINEUPS{}
- staticImg = key en STATIC_IMGS{}
- hotelPP:true = precios hotel por persona
- hotelOverride:true = usar ev.hotel directo
- rideOnly:true = solo paquete RIDE (ej: BTS)
- cheapOnly:true = solo paquete CHEAP (ej: Solomun)
- diaFirst:true = flujo especial EDC (Dia->Boleto->Paquete->Hotel)
- waChannel = URL WhatsApp (eventos en proceso)
- _past:true = calculado automaticamente, evento pasado

## Semaforo Automatico
- st:'agotado' o 0% zonas disponibles -> AGOTADO (rojo)
- <40% zonas disponibles -> ULTIMOS LUGARES (naranja)
- 40-60% -> POCA DISPONIBILIDAD
- st:'proceso' -> EN PROCESO (azul)
- st:'pronto' -> PROXIMAMENTE
- st:'por-confirmar' -> POR CONFIRMAR

## Flujo de Trabajo Actual del Cliente
1. Ve post en redes sociales
2. Contacta por WhatsApp o Messenger
3. Recibe info (copy paste con zonas, precios, pagos)
4. Hace separo por transferencia bancaria
5. Manda comprobante a Messenger de Facebook
6. Le piden datos de registro
7. Le dan link del grupo WhatsApp del evento
8. Recibe avisos de pago en el grupo

## Fase 2 — Portal de Clientes (EN CONSTRUCCION)
Stack decidido: Airtable + Softr + Make.com (~$100 USD/mes)
- Airtable: base de datos central (reemplaza Excel)
- Softr: portal web del cliente (app.conectareynosa.mx)
- Make.com: automatizaciones (emails, contratos, recordatorios)
- Excel actual: Conecta_Reynosa_2026.xlsx (58 pestanas, 1 por evento)
- ~150 clientes activos mensuales

## Equipo
- CEO: Memo Cobos
- Auxiliar administrativo: 1 persona
- Coordinadores: 1 por autobus en cada evento
- Vendedores: pendiente configurar accesos

## Branding
- Colores: Negro #000000 / Blanco #ffffff / Azul #0000cd / Rojo #ff283b / Rosa #ff4bd1 / Amarillo #e8ff4c / Verde #88ea4e
- Tipografias: Kaneda Gothic (titulos) / Montserrat Bold (subtitulos) / Montserrat Medium (texto)
- Manual de marca: Manual_De_Marca.pdf en el repo

## Pendientes Importantes
- AC/DC debe aparecer solo en filtro "Pasados", no en "Todos"
- Morat 3 dic: costos pendientes cuando esten disponibles
- Lineups: Warped y EDC pendientes cuando esten completos
- Fase 2: Airtable configuracion pendiente
- Contratos digitales: pendiente implementar

## Datos Bancarios
- Banco: BBVA Bancomer
- Tarjeta: 4152 3139 7573 0487
- CLABE: 012822004639334319
- Titular: Guillermo Alexander Cobos Vizcarra

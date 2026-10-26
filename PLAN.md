# Capo (Cabo) online — plan

Juego de cartas para jugar con amigos, cada uno desde su móvil (iPhone y Android), en el navegador y sin instalar nada. Se puede añadir a la pantalla de inicio como Al Revés.

## Reglas (Cabo, edición actual) — revisar con las de casa

- **Baraja de 52 cartas**: dos 0, cuatro de cada número del 1 al 12 y dos 13.
- **Reparto**: 4 cartas boca abajo a cada jugador en cuadrícula de 2×2. Al empezar, cada uno mira 2 de las suyas en secreto.
- **En tu turno** eliges una:
  1. **Robar del mazo**: miras la carta y la cambias por una tuya (la tuya va al descarte boca arriba) o la tiras directamente. Si la tiras y tiene poder, puedes usarlo:
     - 7 u 8 — **Mirar**: ves una carta tuya.
     - 9 o 10 — **Espiar**: ves una carta de otro jugador.
     - 11 o 12 — **Cambiar**: intercambias, sin mirarlas, una carta tuya por una de otro jugador.
  2. **Coger la carta de arriba del descarte** y cambiarla por una tuya.
  3. **Cantar «¡Cabo!»**: los demás juegan un último turno y se destapan todas las cartas.
- **Descartes iguales**: al cambiar, puedes señalar varias cartas tuyas que creas iguales y tirarlas todas a cambio de la nueva. Si te equivocas, te quedas todas y además robas una de castigo.
- **Puntos de la ronda**: cada uno suma sus cartas. Si quien cantó Cabo tiene la suma más baja (o empata), se apunta 0; si no, se apunta su suma + 10 de castigo.
- **Kamikaze**: si acabas con dos 12 y dos 13, tú te apuntas 0 y todos los demás 50.
- **Fin**: pierde quien pasa de 100. Si alguien llega exactamente a 100, baja a 50 (una vez por partida). Gana quien menos puntos tenga.
- Si se acaba el mazo, la ronda termina sin Cabo.

Como cada grupo juega con sus variantes, al crear la sala habrá **ajustes**: castigo por Cabo fallido (5/10), Kamikaze sí/no, regla del 100→50 sí/no, puntos para perder, y si se puede robar del descarte.

## Cómo funciona el multijugador

| Opción | Cuenta necesaria | Pros | Contras |
|---|---|---|---|
| **Servidor pequeño en Cloudflare (Durable Objects)** — recomendada | Cuenta gratis de Cloudflare | El servidor reparte y guarda las cartas: nadie puede ver las de otro ni hacer trampa. Si a alguien se le bloquea el móvil, vuelve a entrar y sigue donde estaba. Gratis de sobra para un grupo de amigos (100.000 mensajes al día). | Una pieza más que publicar (lo hago yo con la herramienta de Cloudflare) |
| Firebase Realtime Database (Google) | Cuenta de Google (Firebase) | Muy sencillo, sin servidor propio, gratis hasta 100 conexiones a la vez | Las cartas de todos quedan guardadas en la base de datos: un amigo con conocimientos podría mirarlas. Las reglas las comprueba el móvil de cada jugador |
| Conexión directa entre móviles (WebRTC) | Ninguna | Sin cuentas | En algunas redes móviles no conecta; si el anfitrión bloquea el móvil, la partida se corta |

**Conclusión: es viable.** Con Cloudflare la web del juego sigue en GitHub Pages y solo el "árbitro" (quien baraja, reparte y comprueba las jugadas) vive en Cloudflare. Funciona igual en iPhone y Android porque es una web normal.

Limitación del iPhone: si sales de Safari o se bloquea la pantalla, la conexión se corta. El juego reconecta solo al volver y la partida espera. No habrá avisos de "te toca" con el móvil bloqueado (sí con sonido y vibración mientras está abierto).

## Pantallas

1. **Inicio**: tu nombre y avatar (emoji/color), botones «Crear partida» y «Unirse».
2. **Sala de espera**: código de 4 letras y botón «Compartir enlace» (abre WhatsApp, etc.). Lista de jugadores que van entrando, ajustes de reglas (solo el que crea), botón «Empezar». De 2 a 6 jugadores.
3. **Mesa**: tus 4 cartas abajo en grande; los rivales arriba en pequeño; mazo y descarte en el centro. Se resalta de quién es el turno. Botones grandes en la zona del pulgar: «Robar», «Coger descarte», «¡Cabo!». Al usar un poder, se toca la carta objetivo.
4. **Fin de ronda**: se destapan las cartas una a una con animación, sumas, quién cantó y si acertó, marcador acumulado.
5. **Fin de partida**: ganador, clasificación, «Revancha».

## Para que no tenga nada que envidiar a las cartas físicas

- Cartas dibujadas por mí (SVG), con un diseño propio, nítidas en cualquier pantalla, con modo oscuro.
- Animaciones de repartir, robar, voltear y deslizar al descarte; ves en directo lo que hacen los demás (qué carta cambian, a quién espían).
- Sonido de cartas y vibración (Android; en iPhone la vibración de la web es muy limitada).
- Registro corto de jugadas («Lucía espió una carta de Pablo»).
- Reacciones rápidas con emojis 😂😱🔥 para el pique.
- Tutorial de una pantalla y ayuda con las reglas en cualquier momento.
- Si alguien se desconecta, su turno espera; el que creó la sala puede saltarle si tarda mucho.

## Cómo lo construyo

1. **Lógica del juego** (reglas, puntos, turnos) en un archivo aparte y probada con partidas simuladas.
2. **Servidor** en Cloudflare: una "sala" por código de partida, que guarda el estado y solo envía a cada jugador lo que puede ver.
3. **Web** (`index.html`) instalable, publicada en GitHub Pages (`dongumer/capo`).
4. **Pruebas** con varios jugadores simulados en el navegador a la vez (tamaño móvil, modo claro y oscuro). Lo que no puedo probar: tu iPhone y los de tus amigos de verdad; eso lo miramos juntos.

## Lo que necesito de ti

- Confirmar las reglas o decirme vuestras variantes (¿usáis baraja de póker o la de Cabo?, ¿qué cartas tienen poder?).
- Crear una cuenta gratis en Cloudflare (no puedo crear cuentas por ti) y entrar cuando te lo pida.
- El visto bueno para crear el repositorio público `dongumer/capo` (solo el código).

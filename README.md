# Capo

El Cabo con las reglas de casa, para jugar con amigos cada uno desde su móvil.

- `index.html`: la web (GitHub Pages).
- `server/`: el árbitro de las partidas (Cloudflare Workers + Durable Objects).
  - `npm test`: 400 partidas simuladas comprobando reglas y que nadie ve cartas ajenas.
  - `npm run dev`: servidor local en http://127.0.0.1:8787.
  - `node test/net.mjs`: partida completa de 3 bots contra el servidor local.
  - `node test/leave.mjs URL`: jugadores que se van o pierden la conexión (servidor con `--var AWAY_MS:3000`).
  - `node test/consumo.mjs URL`: mide lo que gasta del cupo gratuito una partida de 4 jugadores y 5 rondas.
  - `node test/manos.mjs`: auditoría de las manos; sigue cada carta durante ~170.000 jugadas al azar y comprueba que solo cambia por una acción que lo permita.
  - `node test/bots.mjs CODIGO 3`: 3 bots que se unen a una sala para probar la web.
  - `npm run deploy`: publica el servidor en Cloudflare.

## Reglas de casa

- Baraja española de 40 cartas, de 2 a 8 jugadores. Cada uno recibe 4 boca abajo; tras una cuenta atrás, ve 3 segundos sus dos cartas de abajo.
- El 7 vale −1; el resto, su número (sota 10, caballo 11, rey 12).
- En tu turno: robar del mazo (cambiarla por una tuya o tirarla) o cantar ¡Capo! Del descarte no se coge.
- Al tirar una recién robada: sota = mira una tuya; caballo = cambia una tuya por una de otro sin mirar; rey = mira una tuya y una de otro y, si quieres, cámbialas.
- Cuando cae una carta al descarte, el primero que eche una del mismo número se la quita. Si falla, la carta vuelve y roba una de castigo.
- Puedes mover tus cartas de sitio (los demás lo ven).
- Quien sale de la partida (o pasa 90 s sin conexión) deja de jugar: sus cartas vuelven al mazo. Si solo queda uno, se vuelve a la sala.
- Tras cantar Capo, los demás juegan una vuelta más (quien canta puede seguir echando y le pueden cambiar cartas). Tras el último turno hay 4 s para echar antes de destapar. Quien menos sume gana la ronda (+1). Se juega hasta que queráis; gana quien más rondas haya ganado.

## Probar en casa

Doble clic en `probar-en-casa.bat`: arranca el servidor y la web en este PC. En la sala sale "Añadir jugador de prueba" para jugar contra bots. Desde el móvil, con la misma wifi, abre la dirección que enseña la ventana.

## Cupo gratuito de Cloudflare

Medido el 27-10-2026 con `test/consumo.mjs` contra el servidor publicado: una partida de 4 jugadores y 5 rondas gasta unas 440 escrituras (el límite más ajustado: 100.000 al día), unas 25 peticiones a las salas y 4 al Worker. Da para unas **220 partidas así al día**, entre todos los que jueguen. El cupo se renueva a medianoche UTC; si se acaba, la web enseña «Límite de partidas alcanzado en el servidor».

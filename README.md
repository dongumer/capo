# Capo

El Cabo con las reglas de casa, para jugar con amigos cada uno desde su móvil.

- `index.html`: la web (GitHub Pages).
- `server/`: el árbitro de las partidas (Cloudflare Workers + Durable Objects).
  - `npm test`: 400 partidas simuladas comprobando reglas y que nadie ve cartas ajenas.
  - `npm run dev`: servidor local en http://127.0.0.1:8787.
  - `node test/net.mjs`: partida completa de 3 bots contra el servidor local.
  - `node test/bots.mjs CODIGO 3`: 3 bots que se unen a una sala para probar la web.
  - `npm run deploy`: publica el servidor en Cloudflare.

## Reglas de casa

- Baraja española de 40 cartas. Cada uno recibe 4 boca abajo y mira 2 al empezar.
- El 7 vale −1; el resto, su número (sota 10, caballo 11, rey 12).
- En tu turno: robar del mazo (cambiarla por una tuya o tirarla), coger la del descarte (y cambiarla), o cantar ¡Cabo!
- Al tirar una recién robada: sota = mira una tuya; caballo = cambia una tuya por una de otro sin mirar; rey = mira una tuya y una de otro y, si quieres, cámbialas.
- Cuando cae una carta al descarte, el primero que eche una del mismo número se la quita. Si falla, la carta vuelve y roba una de castigo.
- Puedes mover tus cartas de sitio (los demás lo ven).
- Tras cantar Cabo, los demás juegan un turno más. Cada uno suma sus cartas; quien cantó, si tiene lo mínimo, se apunta 0 y si no, sus puntos + castigo (ajustable). Pierde quien llega al límite (ajustable) y gana quien menos tenga.

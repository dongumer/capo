# Capo

El Cabo con las reglas de casa, para jugar con amigos cada uno desde su móvil.

- `index.html`: la web (GitHub Pages).
- `server/`: el árbitro de las partidas (Cloudflare Workers + Durable Objects).
  - `npm test`: 400 partidas simuladas comprobando reglas y que nadie ve cartas ajenas.
  - `npm run dev`: servidor local en http://127.0.0.1:8787.
  - `node test/net.mjs`: partida completa de 3 bots contra el servidor local.
  - `node test/bots.mjs CODIGO 3`: 3 bots que se unen a una sala para probar la web.
  - `npm run deploy`: publica el servidor en Cloudflare.

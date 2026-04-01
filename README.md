# Online Hangman

Real-time multiplayer Hangman with room creation/joining, host controls, rotating word-setter flow, and Easy/Hard hangman logic.

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run server:
   ```bash
   npm start
   ```
3. Open `http://localhost:3000` on multiple devices/browsers.

## Gameplay features implemented

- Landing page with **Create Room** and **Join Room**.
- Create Room inputs: room name, mode (Easy/Hard), word source (random vs host/setter), room code.
- Join Room by room code.
- Shared hangman state: wrong letters, masked word, single-letter and full-word guessing.
- Host controls:
  - choose next word-setter,
  - start round,
  - broadcast host-only chat announcements.
- Word-setter does not guess during their round.
- Easy mode: extra body parts for more lives.
- Hard mode: classic stick figure only.
- Round ends on full solve or completed hangman, then next player becomes word-setter.

---

## Fully free backend recommendation (not Supabase)

### Recommended: **Cloudflare Workers + Durable Objects + D1 (optional)**

This stack has a permanent free tier and supports real-time multiplayer using WebSockets in Durable Objects.

### Setup steps

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```
2. Create worker project:
   ```bash
   npm create cloudflare@latest online-hangman-worker
   ```
   Choose: **Worker + Durable Object** template.
3. In `wrangler.toml`, define your Durable Object binding (e.g. `ROOM`).
4. Move room/game state from `server.js` map into Durable Object class state.
5. Handle WebSocket upgrade requests in the Worker and route each room code to one Durable Object instance.
6. Host this repo's `public/` files on Cloudflare Pages (also free tier) and point front-end socket endpoint at worker URL.
7. Deploy:
   ```bash
   wrangler deploy
   ```

### Why this is a good fit

- Global low-latency edge runtime.
- Durable Object gives single-room consistency for game state.
- No always-on VM required.
- Free tier is enough for hobby/student multiplayer games.

> Note: all free services still have usage limits; “fully free” means you can run at zero cost while staying within free-tier quotas.

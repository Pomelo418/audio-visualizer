# Audio Visualizer

A vanilla JS music player with real-time, audio-reactive visualizations, backed by a small Node/Express + SQLite API for accounts and playlists.

## Features

- **Search** — searches the iTunes Search API (free, no API key) for tracks and plays their 30–60s preview clips.
- **Two visualizer variants**, sharing one backend and one account system:
  - `index.html` — a particle system driven by the Web Audio API's `AnalyserNode`; particles assemble into the current line of the song's lyrics.
  - `index-images.html` — background photography that crossfades every 5 seconds, picked to match the track's genre.
- **Playback** — play/pause, loop, next, and jump to any track in a playlist. Playlists loop back to the start after the last track.
- **Accounts** — register/log in (JWT + bcrypt-hashed passwords). Logging in on one page logs you in on the other too, since they share a session.
- **Playlists** — create, add tracks (from search results), remove tracks, delete, and play in saved order or shuffled. Adding a track to a playlist that's currently playing splices it into the live queue without needing a refresh.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vanilla HTML/CSS/JS — no framework, no build step |
| Audio | Web Audio API (`AudioContext`, `AnalyserNode`) |
| Backend | Node.js + Express |
| Database | SQLite via Node's built-in `node:sqlite` (no native dependencies) |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |

## Getting started

```bash
npm install
npm start
```

Then open `http://localhost:3000` (redirects to `index.html`), or visit `index-images.html` directly. Set the `PORT` environment variable to run on a different port.

## Project structure

```
server.js               Express app: serves public/ and exposes the REST API
db.js                    SQLite schema + connection (creates data.sqlite on first run)
public/
  index.html               Particle + lyrics visualizer
  index-images.html        Mood-image visualizer
  shared.js                Auth/Playlists API client + shared UI (login modal, playlist panel)
  shared.css               Styles for the shared UI pieces
```

## API

| Route | Description |
|---|---|
| `POST /api/register` | Create an account, returns a JWT |
| `POST /api/login` | Log in, returns a JWT |
| `GET /api/me` | Validate the current session |
| `GET /api/playlists` | List the current user's playlists |
| `POST /api/playlists` | Create a playlist |
| `GET /api/playlists/:id` | Get a playlist and its tracks |
| `DELETE /api/playlists/:id` | Delete a playlist |
| `POST /api/playlists/:id/tracks` | Add a track to a playlist |
| `DELETE /api/playlists/:id/tracks/:trackRowId` | Remove a track from a playlist |

All `/api/playlists*` routes require a `Authorization: Bearer <token>` header and check that the playlist belongs to the requesting user.

## Known limitations

- **Not Creative Commons audio** — iTunes previews are 30–60s clips of real, copyrighted commercial songs. Fine for a personal/local demo, not for redistributing the audio itself.
- **Lyrics aren't time-synced** — previews are arbitrary clips of a full song with no known offset, so the particle visualizer cycles through lyric lines rather than syncing them to the exact words being sung.
- **Mood images depend on a third-party service** (`loremflickr.com`) that is sometimes intermittently unreliable; the app retries with a different keyword on failure.
- **JWT is stored in `localStorage`**, not an `httpOnly` cookie — simpler to implement, but more exposed to XSS than a cookie-based session would be. The JWT secret is also a hardcoded dev value in `server.js`; a real deployment should load it from an environment variable.

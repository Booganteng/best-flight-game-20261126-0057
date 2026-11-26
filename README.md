# best-flight-game-20261126-0057

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Booganteng/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Booganteng/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Sky Harbour — Island Run**: a complete flight game that plays offline in a desktop browser from its own files. A chase-view tourer flies over a seeded island archipelago at dusk: through 8 golden rings, onto 3 island runways, or free across the islands collecting stars. Throttle, pitch and bank all matter — climbing bleeds speed, a steep bank sinks, and fuel and damage turn every sortie into decisions.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 and press 1, 2 or 3 to pick a mission.

## Play

- **Fly:** ↑ ↓ pitch · ← → bank & turn · SHIFT throttle up · CTRL throttle down · hold the mouse to steer · P pause · R restart
- **Missions:** 1 Ring Run (8 rings, then land home) · 2 Island Hop (land on 3 runways in order) · 3 Free Flight (collect 14 stars)
- **Instruments:** altitude, airspeed and heading tapes, a compass strip, an artificial horizon, fuel and throttle gauges — all lit on the HUD
- **Rules that bite:** fuel burns with throttle (rings give some back), hard landings and ring clips damage the airframe, a gentle touchdown on a runway earns the smooth bonus, and ditching or hitting terrain ends the sortie

## Layout

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
- `game/index.html` + `game/src/` — the game itself, plain ES modules, no library, no network:
  - `config.js` — every tunable number; `random.js` — the seeded generator; `terrain.js` — the archipelago, its runways and clouds
  - `aircraft.js` — flight physics; `missions.js` — Ring Run, Island Hop, Free Flight; `input.js` — keyboard and mouse; `audio.js` — the WebAudio synth
  - `render.js` — the chase camera, the islands, the aircraft and the instruments; `shots.js` — the deterministic screenshot scenes; `main.js` — the loop and the screens
- `shots.json` — the four screenshot scenes (`?shot=start|play|rings|end&seed=1`)
- `screenshots/` — four real renders of the game's own code in a desktop browser

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>

# LAST ZONE: COLLAPSE

**The battlefield doesn't shrink. It breaks.**

A mobile-first playable vertical slice for an original tactical survival shooter. The prototype focuses on the match story: deploy into Nova City, recover intel below street level, fight through an evolving field, breach a route, and decide where to extract.

> **Scope note:** This repository is an interactive client-side field-test prototype, not a production multiplayer release. The 20-operator roster is simulated with local AI. There is no dedicated authoritative game server, online matchmaking, account service, real voice chat, production weapon/foley audio, or native iOS/Android package yet. The browser build is useful for validating the core loop and control layout; it should not be presented as a shipped competitive game.

## Run it

Requirements: Node.js 20 or newer. No third-party packages are required.

```bash
npm run dev
```

Open `http://localhost:4173` on desktop or a phone on the same network. The dev server binds to `0.0.0.0` for device/preview access. For a static production bundle:

```bash
npm run build
npm run start
```

`npm run start` serves the generated `dist/` directory. The client also includes an installable PWA manifest and an offline shell cache for supported mobile browsers. Native App Store / Play Store builds still require a native wrapper and platform testing.

## Current vertical slice

- **Command lobby:** Collapse and Black Sector mode selection, solo/duo/squad sizing, profile progression, loadout, operator specialization, contracts, season, cosmetics-only store, local settings and social preview.
- **Playable Nova City test field:** 20 simulated match participants, top-down movement/combat, an evolving breakline, one randomized world event (Blackout, Sandstorm or Flood Alert), loot, armor, three fictional weapons, one frag grenade and one tactical buggy.
- **Different ways to succeed:** Complete the Intel Recovery contract below the city, then hold either the Metro train extraction or surface extraction. Eliminating every hostile is a separate survival result.
- **Tactical world changes:** A weak wall can be shot open to create a route. The connected lower-level transit area has guards, loot and the contract archive.
- **Mobile-first controls:** Left movement stick, right aim stick, fire/ADS/crouch/jump/grenade/interact buttons, editable HUD positions, sensitivity, aim assist and optional device-orientation aiming where the browser permits it.
- **Local persistence:** Callsign progression, cosmetic credits, selected kit, options and touch layout use browser `localStorage`.
- **Audio feedback:** Lightweight generated firing, nearby gunshot direction and surface/underground footstep cues give the slice feedback without shipping borrowed sounds. This is not the final spatial audio mix.

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | WASD / arrows | Left stick |
| Aim | Mouse | Right stick |
| Fire | Hold left mouse | Fire button |
| Aim down sights | Right mouse (where supported) | ADS button |
| Sprint | Hold Shift | Push the move stick |
| Crouch | C | Crouch button |
| Jump / vault | Space | Jump button |
| Interact / hold to extract | Hold E | Context action button |
| Reload | R | Reload button (or smart auto-reload) |
| Switch weapon | Q | Swap button |
| Frag grenade | G | Frag button |
| Break weak wall | Shoot it | Aim and fire at the marked breach panel |

## Production multiplayer is a separate milestone

The current simulation intentionally keeps game state local so the first-playable loop is easy to run and iterate on. Before a competitive release, replace it with a dedicated authoritative session service. Health, movement validation, inventory, damage, contracts, currency, extraction and results must be server-owned. Client interpolation/prediction, lag compensation, reconnect support, regional matchmaking, server telemetry and anti-cheat are not implemented here.

See [`docs/NETWORKING.md`](docs/NETWORKING.md) for the proposed boundary and rollout plan. `npm run check` runs the built-in JavaScript syntax checks.

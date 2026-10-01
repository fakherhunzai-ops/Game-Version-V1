# Multiplayer / trust-boundary plan

This is a **target architecture**, not a claim that online services exist in this prototype. `src/game.js` currently runs a local simulation in the browser. Do not use it as a trusted source for competitive match outcomes or virtual currency.

## Proposed MVP service split

1. **Identity + lobby service** — authenticated player profile, loadout selection, party membership, region/latency preference and reconnect token.
2. **Regional matchmaker** — queues by mode, party size, skill band and measured RTT; protect new accounts; reserve a match on a dedicated server.
3. **Dedicated authoritative match process** — owns the simulation clock, player transform, collision, health, armor, weapons, ammunition, loot, contracts, events, zone, dog tags, extraction and final results. The client sends bounded inputs, never authoritative state.
4. **Client presentation** — input sampling, local prediction for the owning player, remote interpolation, cosmetic state and UI. Reconcile against snapshots from the server.
5. **Account/progression service** — consumes a signed match result from the session service, validates rewards, persists XP/rank/mastery and cosmetic currency. Store purchases are cosmetic entitlement grants only.
6. **Operations** — regional health checks, matchmaking telemetry, crash reports, replayable server event logs, moderation/report flow, data retention and incident controls.

## Authority and validation

- Use a fixed server simulation tick (initially 30 Hz for the MVP; profile CPU and bandwidth before raising it) and sequence-numbered client input frames.
- Validate maximum acceleration/speed, collision, stance transitions, weapon fire cadence, reload state, ammo count, projectile origin and server-side hit geometry.
- Use server timestamps for cooldowns, contract progress, zone damage, extraction holds, dog-tag recovery and result finalization.
- The client may predict movement and render local effects, but the server confirms hits, damage, inventory mutations, eliminations, currency and result placement.
- Apply lag compensation to server-validated hit tests using a bounded history of recent actor transforms. Clamp rewind to the measured RTT budget.
- Rate-limit and schema-validate packets; reject unknown fields, impossible state transitions, stale sequences and oversize payloads. Log suspicious patterns for review instead of trusting a single heuristic as an automatic ban.
- Reconnect uses a short-lived signed session token and a server-owned player slot; it never accepts a client-provided health, position or carried-loot snapshot.

## Match transport

A reliable control channel handles lobby state, squad, reconnect, contract state and match end. A low-latency session channel carries input frames and compact snapshots. Region selection should choose the best healthy region by measured RTT while allowing a manual preference. Candidate launch regions from the product brief are South Asia, Middle East, Europe, North America and Southeast Asia; actual capacity and legal/data-hosting requirements need validation before launch.

## Rollout gates before competitive tests

- Unit/property tests for movement bounds, weapon cadence, damage, inventory, contract and extraction state machines.
- Two-client and four-client soak tests under packet loss, jitter, reconnect and background/resume on representative iOS and Android devices.
- Server load tests for a full 20-player MVP match and worst-case event/destruction interactions.
- Replay-based regression tests for hit validation, exploits and match-result integrity.
- Privacy, voice moderation, reporting, parental controls, retention and regional compliance review.
- Separate ranked rating from account XP and cosmetic progression; never sell power.

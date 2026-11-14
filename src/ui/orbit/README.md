# Orbital operations prototype

Run `npm run dev` in the repository and open the printed local URL.
The default page and `#orbit` show the playable phase 3 prototype;
`#debug` opens the existing debug game. Switching pages keeps both states.

Choose a loadout using its name below the heading, or **Change loadout**:

- **Balanced explorer**: a first mission with medium modules.
- **Downlink bottleneck**: a small antenna demonstrates memory overflow.
- **Power under pressure**: small panels, a small battery and 5% power damage.
  The forecast warns about a storm; safe mode during that orbit can save the mission.

Set the four switches and use **Next orbit** (or N) to advance.
**Undo orbit** returns to the previous planning state. Changing the loadout or
restarting begins a fresh mission. There is no real-time countdown.

The SVG scene is drawn locally; no remote assets or new dependencies are used.
English prototype messages are in `texts.en.json` next to the screen.
Pure simulation, forecasts, sample input adapters and tests live in
`src/core/orbit/`. Both the UI and engine use the existing shared input/output contracts.

This is a standalone prototype initialized after separation using the repository
catalog and flight stub. `src/core/phases.ts` still selects the original orbit stub
for the existing game, balance sweep and old integration tests. Connecting the new
phase to the full run needs a separate integration change, including updated test
expectations for the daylight-only camera and an agreed bot for the balance sweep.

The cold model, event schedule and damage coefficients are provisional gameplay
rules from `docs/ORBIT_TASK.md`, not calibrated spacecraft engineering data.
These files do not deploy to the Pi; normal repository CI/deployment applies
after the team merges the feature branch.

Validation: `npm run typecheck`, `npm test`, `npm run build`.

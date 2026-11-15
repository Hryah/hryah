# Orbital operations prototype

Run `npm run dev` in the repository and open the printed local URL.
Open `#orbit` for the playable phase 3 prototype; `#play` is the full mission
with a separate compact orbit panel, and `#debug` opens the debug game.

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
catalog and flight stub. `src/core/phases.ts` selects the real orbit phase for
the full mission. The #play UI is separate; the balance sweep still uses stubs.

The cold model, event schedule and damage coefficients are provisional gameplay
rules from `docs/ORBIT_TASK.md`, not calibrated spacecraft engineering data.
These files do not deploy to the Pi; normal repository CI/deployment applies
after the team merges the feature branch.

Validation: `npm run typecheck`, `npm test`, `npm run build`.

## Local clarity changes

The existing SVG scene from PR #41 is preserved. Before advancing, the forecast
shows ending and minimum charge, ending and peak memory, downlink, discarded data,
gross energy consumption, available solar energy and elapsed simulation time.
The estimates stop at power failure and come from the same core integration as a tick.

Switches represent saved commands. The separate next-turn status explains SAFE,
cold, damage, missing windows or data, and power loss before operation. Commands
can be edited during SAFE; SAFE still overrides their actual effect until disabled.

After completion, expandable causal paths connect problems to module choices and
commands in effect when an imaging/pass/heating opportunity was missed. Repeated
paths to the same decision are grouped; journal records retain the full history.
These presentation additions are scoped to #orbit. The compact #play OrbitPanel
and the result view in PlayScreen are outside this directory and were not changed.

# HRYAH · 2.5D Asset & Animation Workshop (`tools/asset-workshop`)

Canonical editable sources for the standalone GLB viewer, procedural generator,
clean-scene validator and Three.js import adapter. This workshop is separate from
the game's three mission phases. Its 3D astronaut is a reference asset; the approved
game character is the author's drawn 2D astronaut in a 3D world.

The standalone orbital controls are a development demonstration, not the authoritative
mission simulation. Module IDs and mass/cost are checked against `src/data/catalog.json`.
Read the root AGENTS.md and the scoped AGENTS.md before changing sources.

---

## 1. Quick Start & Commands

Requires Node.js 22.12+ and npm. From a fresh repository clone, one command installs
the locked isolated dependencies, checks types and tests, generates GLBs, compiles
the viewer, creates the complete ZIP, validates archive models and refreshes the
tracked `nikita models/` snapshot:

```bash
node tools/asset-workshop/scripts/reproduce.mjs
```

The pipeline is `src/ + index.html + public-templates/ -> generated/ -> dist/ -> ZIP
-> nikita models/`. No other checkout or local absolute path is needed. The game
package and its dependencies are not used by the build (the catalog fixture is
used by the isolated tests). Workshop package.json and package-lock.json stay together.

After installation, use `npm --prefix tools/asset-workshop run check` for all
checks without refreshing the tracked snapshot; `run snapshot` refreshes it from
the checked `dist/`. `run build` performs generation, Vite compilation and packaging;
`run validate` verifies that output and re-imports the actual GLBs extracted from
its ZIP. `run generate` alone writes models and manifest to ignored
`tools/asset-workshop/generated/assets/workshop/`.

For development use `npm --prefix tools/asset-workshop run dev` (port 5179). Model
downloads generate clean bind-pose GLBs live. The complete viewer ZIP requires a
previous build; it is never synthesized from source HTML or placeholder adapters.
The dev server can preview models before a build, but does not serve the full ZIP.

`dist/` is the independent publishing artifact. To export elsewhere inside the
package, use `npm --prefix tools/asset-workshop run build -- --out-dir exports/release`
and use the same option with `run validate` / `run snapshot`. Only dedicated `dist/`
or `exports/<name>/` directories can be emptied. Neither building nor snapshotting
publishes the public website.

The built viewer and extracted ZIP run with `node serve.mjs` from their output
folder, then http://127.0.0.1:4180/. The repository snapshot runs with
`node "nikita models/serve.mjs"`. HTTP is required; file:// is unsupported. Compiled
dependencies are included; no CDN, API key or package installation is needed by
the downloaded viewer. The ZIP omits itself, so its complete-pack download cannot
work recursively in an extracted offline copy; individual/asset-only downloads do.

Public share controls and responsive layout live in `src/public-preview.*`. Their
CSS follows styles.css in the entry module. Both the HTML download link and runtime
fetch resolve relative to the deployment base, including `/experimental/`. Archive
checks reject missing compiled resources, source HTML, AGENTS, credentials, path
traversal, model/manifest mismatches and recursive archives.
Published text is normalized to LF before packaging; HTML is normalized before
Vite transforms it. ZIP entry timestamps are fixed, so checkout line endings do
not change the output bytes with the same source and toolchain.
Existing animation and
state-machine tests remain intact. Validation checks geometry, materials, sockets,
clip movement, scale and drift; complete visual review and an independent Khronos
validator pass remain separate work.

---

## 2. Coordinate System, Units & Renderer Conversion

- **Units**: `1 unit = 1 meter` (SI meters)
- **Up Axis**: `+Y`
- **Forward Axis**: `+Z`
- **Handedness**: Right-handed (standard glTF 2.0 binary `.glb`)
- **Materials**: Embedded `MeshStandardMaterial` (PBR `baseColorFactor`, `metallicFactor`, `roughnessFactor`, `emissiveFactor`). No external image paths or CDN URLs.
- **Conversion for other renderers**:
  - **Three.js / React Three Fiber**: Native match (`+Y` up, `+Z` forward, meters). Load directly with `GLTFLoader`.
  - **Babylon.js**: Set `scene.useRightHandedSystem = true` for 1:1 socket alignment, or let Babylon's glTF loader insert its default `__root__` Z-inversion node.
  - **Blender / Z-Up Engines**: Standard glTF 2.0 importers convert `+Y` up to `+Z` up automatically (`+90°` around `X`).

---

## 3. Exported Asset Catalog (`dist/assets/workshop/`)

| Asset ID | File Path (`dist/assets/workshop/`) | Category | Clips Baked in GLB | Stationary Sockets / Mounts |
|---|---|---|---|---|
| `astronaut` | `astronaut.glb` | Character (Phase 2) | `idle`, `run`, `float_idle`, `float_move`, `push_off`, `grab_handle`, `task_work`, `switch_on`, `switch_off`, `turn_left`, `turn_right`, `reposition`, `task_success`, `task_error` (14 clips) | `hand_target`, `hand_target_l`, `hand_target_r`, `backpack_mount` |
| `ship-cutaway` | `ship-cutaway.glb` | Ship Hull (Phase 2) | `hatch_open`, `hatch_close`, `docking_approach`, `docking_align`, `docking_latch`, `docking_docked`, `docking_abort`, `satellite_release_latch`, `satellite_depart`, `satellite_drift` (10 clips) | `satellite_release`, `console_interact`, `hand_target`, `mount_console_power`, `mount_console_thermal`, `mount_console_oxygen`, `mount_console_docking`, `mount_console_separation`, `anchor_*` |
| `console-power` | `consoles/console-power.glb` | Console (Phase 2) | `idle`, `switch_on`, `switch_off`, `work_cycle`, `confirm`, `alarm` | `console_interact`, `hand_target` |
| `console-thermal` | `consoles/console-thermal.glb` | Console (Phase 2) | `idle`, `switch_on`, `switch_off`, `work_cycle`, `confirm`, `alarm` | `console_interact`, `hand_target` |
| `console-oxygen` | `consoles/console-oxygen.glb` | Console (Phase 2) | `idle`, `switch_on`, `switch_off`, `work_cycle`, `confirm`, `alarm` | `console_interact`, `hand_target` |
| `console-docking` | `consoles/console-docking.glb` | Console (Phase 2) | `idle`, `switch_on`, `switch_off`, `work_cycle`, `confirm`, `alarm` | `console_interact`, `hand_target` |
| `console-separation` | `consoles/console-separation.glb` | Console (Phase 2) | `idle`, `switch_on`, `switch_off`, `work_cycle`, `confirm`, `alarm` | `console_interact`, `hand_target` |
| `satellite-bus` | `satellite-bus.glb` | Satellite (Phase 3) | `idle`, `safe_enter`, `safe_hold`, `safe_exit`, `heater_on`, `heater_off`, `separation_drift` | `solar_left`, `solar_right`, `antenna_mount`, `camera_mount`, `engine_mount`, `battery_mount`, `satellite_release` |
| `orbital-switches` | `consoles/orbital-switches.glb` | Orbital Panel (Phase 3) | `all_on_nominal`, `camera_on`, `camera_off`, `transmitter_on`, `transmitter_off`, `heater_on`, `heater_off`, `safe_mode_on`, `safe_mode_off` | `console_interact`, `hand_target` |
| `eng-cold` | `modules/eng-cold.glb` | Engine (`catalog.json`) | `idle`, `ignition`, `thrust`, `shutdown` | `engine_mount` |
| `eng-chem` | `modules/eng-chem.glb` | Engine (`catalog.json`) | `idle`, `ignition`, `thrust`, `shutdown` | `engine_mount` |
| `eng-ion` | `modules/eng-ion.glb` | Engine (`catalog.json`) | `idle`, `ignition`, `thrust`, `shutdown` | `engine_mount` |
| `sol-s`, `sol-m`, `sol-l` | `modules/sol-{s,m,l}.glb` | Solar (`catalog.json`) | `deploy`, `track_angle`, `hold`, `stow`, `safe_feather` | `solar_left`, `solar_right` |
| `bat-s`, `bat-m`, `bat-l` | `modules/bat-{s,m,l}.glb` | Battery (`catalog.json`) | `idle`, `charge_pulse`, `discharge_pulse`, `low_charge_warning` | `battery_mount` |
| `ant-s`, `ant-m`, `ant-l` | `modules/ant-{s,m,l}.glb` | Antenna (`catalog.json`) | `deploy`, `aim`, `transmit`, `standby`, `stow` | `antenna_mount` |
| `cam-s`, `cam-m`, `cam-l` | `modules/cam-{s,m,l}.glb` | Instrument (`catalog.json`) | `aim`, `scan`, `park`, `cold_locked` | `camera_mount` |
| `earth` | `environment/earth.glb` | Environment | `rotate_orbit`, `station_pass_ping`, `storm_front` | `ground_station_anchor` |

---

## 4. Optional VFX Layers vs Mechanical Models

Every visual effect is stored as a separate named child node (`vfx_scan_cone`, `vfx_downlink_beam`, `vfx_thruster_plume`, `vfx_heater_glow`, `vfx_cold_frost`, `vfx_storm_particles`) so that hiding or disabling effects leaves the mechanical 3D model 100% intact:

```ts
import { loadWorkshopGlb, attachModuleToSocket, WorkshopAnimationController } from './src/adapter/import-and-animate';

const base = new URL('./assets/workshop/', document.baseURI);
const busGltf = await loadWorkshopGlb(new URL('satellite-bus.glb', base).href);
const camGltf = await loadWorkshopGlb(new URL('modules/cam-m.glb', base).href);

attachModuleToSocket(busGltf.scene, 'camera_mount', camGltf.scene);

const camCtrl = new WorkshopAnimationController(camGltf.scene, camGltf.animations);
camCtrl.playClip('scan', { loop: true, crossFadeDurationS: 0.25 });
// Toggle scan frustum VFX independently of mechanical shutter/gimbal animation:
camCtrl.setVfxLayerVisible('vfx_scan_cone', true);
```

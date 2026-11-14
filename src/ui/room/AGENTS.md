# Flight room presentation

`RoomScreen({ active })` is the isolated Stage 1 room route. It does not advance
the full mission. Import `roomPhase`, state/actions and the collision blueprint
from `src/core/flight/room`; do not implement movement, task tolerances, efficiency
or success conditions in React/Three. English strings live in texts.en.json.

`room-view.ts` maps physical WASD keys through the fixed 45° camera and resolves
assets under Vite BASE_URL. The core normalizes movement. Keep last-facing input
separate until the next positive-delta move; zero-delta moves are deliberately
ignored. Dispatch the core stop action when clearing input on blur/inactivation.

`room-renderer.ts` owns Three objects and reads state. The room/cargo are 3D;
the console uses the canonical published GLB with a visible fallback warning.
The character uses the four static SVG directions from the runtime manifest.
Do not substitute the workshop's 3D astronaut or call these poses run animations.

Translate plane geometry by the manifest pivot and keep the mesh origin at world
feet. The plane stays upright and follows camera yaw only: a pitched card makes
the head lean through far walls. `billboard.ts` compensates local Y by the fixed
camera pitch so the projected artwork retains its original proportions.
Keep alphaTest/depthTest/depthWrite: transparent canvas corners must not hide
equipment, and equipment must occlude the character in front/behind. The contact
shadow stays flat independently. Far walls only; the camera-facing sides are open.

The frame loop advances only while active, visible, focused and graphics-ready.
Clear held keys and the previous timestamp on suspension; do not catch up elapsed
background time or simulate movement while the console is open. A context-loss
latch prevents pending initialization from resurrecting a lost renderer. StrictMode
cleanup must remove listeners/RAF/ResizeObserver and dispose late-loaded textures,
models, geometry, materials and WebGL resources.

Run root types/tests/build plus room-view tests. Browser QA: all four directions,
collision and near-only E, rejected and accepted task with causal links, console
cancel/reopen, route hide/blur/resume, reload/context failure, 1280×720 and 900×800,
transparent cutouts, common feet/scale, original aspect and equipment occlusion.
Keep the controls inside the viewport-aware stage footer. Root AGENTS/ROADMAP/
DEVLOG track handoff and actual publication status.

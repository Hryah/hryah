# Nikita models — HRYAH asset workshop

Ready-built HTML viewer and downloadable models, kept separately from the main game.
No dependency installation is required to view this snapshot.

From the repository root, run:

```sh
node "nikita models/serve.mjs"
```

Open **http://127.0.0.1:4180/**. Stop the server with Ctrl+C.
Use HTTP rather than opening index.html through file://.

Contents:

- `index.html` and `assets/index-*` — bundled interactive 2.5D/3D viewer.
- `assets/workshop/` — 25 GLB models, their materials, mounts and 139 animation clips.
- `assets/workshop/manifest.json` — model metadata and animation names.
- `assets/workshop/hryah-workshop-pack.zip` — downloadable model package.
- `import-and-animate.ts` — example loader, socket and animation adapter for a Three.js renderer.
- `REPORT.md` — verification results and remaining limitations.

Select models from the catalog, rotate/zoom, choose animation clips, or inspect
the camera/transmitter/heater/safe-mode transitions. The download panel exports
individual GLBs and the complete package.

This is a static release snapshot. The ZIP includes model files and source examples;
the complete bundled viewer is the index.html in this folder. The models are not
yet connected to the main game's React screens. No core logic, root dependencies,
CI or deployment configuration is changed by this folder.

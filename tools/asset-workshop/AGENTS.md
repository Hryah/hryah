# Asset workshop: canonical sources

This package owns the procedural 3D asset workshop, not the game's phase rules.
Read the repository AGENTS.md first. Dependencies and lockfile are isolated here;
do not add Three.js or workshop dependencies to the main game package.

Sources flow in one direction:
`src/` + `index.html` + `public-templates/` -> `generated/` GLBs -> Vite `dist/`
-> complete runnable ZIP -> repository `nikita models/` snapshot.
`generated/`, `dist/`, `exports/` and node_modules are disposable and ignored.
Never patch minified JS/CSS or generated GLBs in the snapshot or a published site.
Change sources/templates, rebuild, then refresh the snapshot.

From a fresh clone: `node tools/asset-workshop/scripts/reproduce.mjs`.
This installs exactly package-lock.json, runs types/tests/build/archive and GLB
validation, then refreshes `nikita models/`. Node 22.12+ is required by Vite.
With dependencies installed: `npm --prefix tools/asset-workshop run check`.
`npm run build` generates GLBs, compiles the viewer and packages the ZIP;
`npm run snapshot` copies the sanitized output after validation.

`dist/` is the independent publishing artifact. `npm run build -- --out-dir
exports/release` and the same `--out-dir` for validate/snapshot support an alternate
isolated export. Publishing is a separate action; a local snapshot is not a release.

Public UI fixes belong in `src/public-preview.*`. Import its CSS after styles.css.
Resolve the pack URL relative to document.baseURI, never `/assets/...`; test `/`
and `/experimental/`. The full pack must contain compiled HTML/JS/CSS, models,
manifest, the real adapter, public README/report and serve.mjs. Exclude the ZIP
itself, AGENTS.md, private task/architecture docs, .env and credentials.

Before handoff run types, all existing workshop tests, packaging tests and a full
clean-scene GLB/animation re-import. Open the generated viewer in a browser and
check selection, animation, copying a share link, responsive layout and downloads.
Automated coplanarity checks do not replace visual review. The standalone orbital
demonstration is not the game's authoritative simulation; the 3D astronaut is not
the approved 2D game character. Update root AGENTS/ROADMAP/DEVLOG through the owner.

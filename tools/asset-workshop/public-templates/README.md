# Nikita Models — HRYAH 3D Preview

25 procedural GLB models and 139 embedded animation clips. This is a standalone
asset workshop; it is separate from the playable three-phase game.

Open the public preview: [Nikita Models](https://hryah-nikita-models.racingbadger2.chatgpt.site/).
The contents of this package may be newer than that separately published site.

To view this downloaded folder, use Node.js 22.12+:

```sh
node serve.mjs
```

Then open http://127.0.0.1:4180/. Run the command from this extracted folder.
For the repository snapshot, use `node "nikita models/serve.mjs"` from the repo root.
Use HTTP; opening index.html with file:// is unsupported. No API key, external CDN,
build step, or package installation is required to view the extracted ZIP.

The viewer supports orbit/zoom/pan, model selection, animation clips and states,
clean-scene re-import checks, individual GLB downloads, an asset-only ZIP, and the
complete viewer ZIP. The complete ZIP does not contain a nested copy of itself;
its download link is available on the original hosted viewer. Individual asset
downloads remain available in the extracted offline viewer.

`manifest.json` documents units (+Y up, +Z forward, meters), sockets, material and
triangle counts, animation durations, loop flags and allowed transitions. Model
files are in `assets/workshop/`; compatibility copies at each `manifest.zipPath`
also allow importing assets with the original asset-pack layout.

`examples/import-and-animate.ts` is the real standalone Three.js adapter. It
supports GLTFLoader loading, sockets, clip selection, crossfade, reset and dispose.
Import it into a TypeScript project with Three.js installed. Animation completion
does not determine game success: game rules remain in the game core.

The workshop 3D astronaut is a reference asset. The approved game direction uses
the author's drawn 2D astronaut in a 3D world. The preview's orbital controls are
a separate demonstration, not the authoritative mission simulation.

Editable sources and the locked build process live in the game repository at
`tools/asset-workshop/`. From a new clone, run
`node tools/asset-workshop/scripts/reproduce.mjs` to install locked dependencies,
check, generate, build, validate, and refresh `nikita models/`.

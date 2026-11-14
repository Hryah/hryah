# Model package verification

Generated inventory: 25 GLB models, 139 animation clips, 13,108 triangles in total.
The ZIP contains the compiled viewer, all models, manifest, standalone import
adapter, documentation and Node HTTP helper. No source checkout is required to view it.

The reproducibility command checks types and tests, builds the viewer, verifies
all linked compiled resources at both `/` and `/experimental/`, unpacks the ZIP,
and re-imports all 25 models and their animation clips into clean GLTFLoader scenes.
It also checks dynamic tracks, bind pose, material assignments, scale, sockets,
five-cycle drift and a coplanarity-risk heuristic. `npm run validate` prints the
actual result; a generated inventory alone is not proof that these checks ran.

The heuristic is not a guarantee against every visual artifact. Complete manual
review of every model and animation frame, independent Khronos glTF Validator
verification, and integration into the game's renderer remain separate work.
The preview's orbital state machine and 3D astronaut are development assets;
the game uses its own phase rules and the approved drawn 2D astronaut.

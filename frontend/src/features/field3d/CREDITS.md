# field3d credits

## Wildlife and farmer (scene/wildlife/**)

No third-party 3D models, textures or audio are used. Everything is built in code and rendered live:

- Egrets, mynas, parakeets and the drongo are articulated rigs assembled from primitives (`birdSpecs.ts`) and animated by
  pure, deterministic behaviour functions (`birdBehavior.ts`): wading / stalk / strike / take-off for the egret, head-bob
  and pecking for the myna, flight and perching on ripe grain heads for the parakeet, sallies from a post for the drongo.
- The farmer (`Farmer.tsx`, body in `farmerBody.ts`, path logic in `farmerPath.ts`) is sculpted in code: limbs and
  torso are lofted through anatomical cross-sections, the head is a deformed sphere (jaw, brow, cheekbones, eye
  sockets) with painted skin tones, and the veshti, towels and hands are modelled individually. Procedural walk and
  crouch animation, walking the bund outside the drawn boundary.
- The scarecrow (`scene/scarecrow.ts`) is likewise built from code, with procedural plaid, denim, burlap and straw
  surfaces (`organicMaterial.ts`).
- Butterfly wing patterns are drawn on a canvas at runtime (`insectTextures.ts`).

Species and clothing references are general natural-history / cultural knowledge; no photographs were copied.

Earlier general techniques in this folder (rice geometry, wind shader) are documented in the source files.

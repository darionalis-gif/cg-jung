# Somnium — a theatre for dreams

A single-file web app that performs a dream as a 3D animation. You write the dream as you remember it; Claude, on your own subscription, turns the report into a *stage script* (a JSON scene: world, actors, beats with the dream's own sentences, camera); this page performs the script with three.js — low-poly figures with floating labels, a moving camera, subtitles from the report, a scrubber with one tick per beat. A director chat takes change requests ("make the street darker", "the man should be taller and closer", "add rain") and rewrites the staging.

It was built by repeated rounds of building and independent critique — a technical critic for the animation and a fidelity critic for the match to the dream text — over real dream reports from DreamBank. Each round runs the whole pipeline against live Claude, screenshots every beat, and hands the evidence to two critics who do not fix anything; their blocking findings become the next round's work. Both critics have to say SATISFIED for the loop to end.

## How it runs

- `index.html` is the whole app. The block between `<!-- ARTIFACT-START -->` and `<!-- ARTIFACT-END -->` is what gets published as a Claude artifact with the `sample` capability; the artifact host wraps it in its own document skeleton and grants the page the right to ask Claude on the viewer's account. Outside Claude (a plain browser) the page can still perform the dreams that ship staged inside it and any dream staged earlier in that browser, but cannot stage new ones.
- three.js r160 (UMD) from cdnjs; Google Fonts (Fraunces, Atkinson Hyperlegible, JetBrains Mono). No build step for the viewer.
- Dreams and their scripts are kept in `localStorage`.

## Trying it

The published page is at https://claude.ai/code/artifact/c07ffd71-83a0-4c71-8203-d1ee3dc5628a — open it inside Claude so it can stage new dreams on the viewer's own subscription. Six DreamBank reports ship already staged, so the page performs a real dream on load even in a plain browser.

## The stage script

Claude receives the vocabulary of the stage (`DSL_DOC` in `part_core.js`): ~85 kinds of actor the renderer can build from primitives (person, crowd, animal by species, house, building, room, forest, water, fire, car, helicopter, bed, mirror, tooth, portal…), 27 animation states (walk, run, fly, fall, float, swim, sit, kneel, lie, yell, grieve, throw, push, shake, fold, collapse, melt…), clothing (coat, uniform, dress, hat) and described appearance (skin, hair, size), things a person carries (carriedBy), sky presets, grounds, weather, camera modes (follow, fixed, orbit, pov, wide) and effects (flash, quake, blackout, pulse, blur). It answers with a JSON script of 5–14 beats, each quoting the part of the report it performs. `normalizeScene` repairs whatever comes back (aliases, missing fields, unknown kinds, bad references) so the stage can always play it.

## Sources

- `part_core.js` — vocabulary, prompt, scene normaliser. `part_builders.js` — one procedural builder per kind. `part_stage.js` — renderer, world, timeline evaluation (deterministic for scrubbing), animation, camera, weather, labels. The camera is a small search: for each beat it scores candidate bearings, distances and heights against what the sentence needs on screen — the speaker's face, the camera target, everyone the beat moves or names, nothing large across the lens — and takes the best shot that keeps them. Every candidate goes through the same clamps that are applied to the winner, so the shot that is elected is the shot that is rendered; and after all of them the renderer asks the question the harness's own report asks — is everyone this sentence names actually on screen — and if the answer is no, goes looking for a pose where it is yes. `Stage.debugFrames = true` records every candidate it scored or rejected in `Stage.frameScan`, which is how most of the camera bugs were found. `part_ui.js` — dreams, Claude calls, script pane, transport, director chat, DreamBank examples.
- `node build.mjs` assembles `index.html` from the parts and embeds `harness/examples.json` (real reports) plus `harness/staged.json` (their critic-approved scripts).

## The harness and the critics

`harness/run.mjs` serves the page with a mocked `claude.use('sample')` that routes every prompt to the real Claude through the `claude -p` CLI, drives the page in headless Chromium (Playwright, SwiftShader) over the DreamBank dreams, and records the script, a screenshot per beat, playing frames, a phone layout, frame times, on-screen metrics per actor, a motion measure per beat, console errors and a director-chat round trip. `harness/rerender.mjs` replays a round's saved scripts under the current build, so a renderer fix can be judged without asking Claude again. Both wait for the camera to come to rest before they read the numbers or take the picture, and write down how many frames that took, because a report and a screenshot describing different instants made every diagnosis a ghost chase.

Two critic briefs live in `harness/critics/`; each round the reports are handed to two independent critics, and their findings go into the prompt, the normaliser or the renderer. `harness/smoke.mjs` is the fast check between rounds: it asserts that `normalizeScene` is idempotent — the director chat re-normalises on every edit, so a scene that normalises differently the second time is a scene the chat breaks — and renders two small scenes, one of them a pit with an authored fixed camera, for the crashes that only a below-ground actor finds.

The example dreams are anonymised reports from DreamBank (dreambank.net, UC Santa Cruz), used with attribution as test material.

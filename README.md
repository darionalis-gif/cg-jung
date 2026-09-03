# Tertium Datur

A single-file web app for practising C. G. Jung's method on oneself, built for a phone, as an opus that runs over months and can be carried to the three conjunctions of Dorn as Jung reads them in *Mysterium Coniunctionis*. It was built in a loop of building and independent Jungian critique, classical and alchemical, over several rounds; the analyst inside it was built the same way, against its own critics.

## What it is not

Not treatment, not diagnosis, not for a crisis. A gate before first use names the states in which the descent practices should not be attempted; a Stop button on every session screen leads to a grounding screen with crisis lines; a tripwire on everything written inside an hour closes the imagination for the day, brings the closing step forward, and tells the analyst; the same words written in the Liber lead to the stopping place; the gate is shown again before a deep practice every ninety days. The method text states what a solo opus cannot supply: the confession's hearer, the transference, the partner in whose presence shadow and soul-image become real (CW 9ii §42).

## The practices

Each practice is a guided sequence of movements and steps, rendered by one engine from data (`PRACTICES` in `index.html`). Roman numerals on the home screen follow the suggestion order.

| | Practice | What happens |
|---|---|---|
| I | Confession · *confessio* | The life in ten lines, the house (mother, father, what each wanted, what was never said), the losses, the secret, what brings you here, and a hearer named or why there is none (CW 16 §§123–130). |
| II | The Persona | Roles, the mask fused to the face, its cost, the crack, who one is when nobody needs anything; an act with the mask off, constrained (CW 7 §§254–275). |
| III | The Dream · *somnium* | Exact record, its kind (comment, repetition, body, big dream), dramatic structure (CW 8 §§561–564), associations by circumambulation, objective level before subjective, which level, compensation, prospective reading (CW 8 §§492–493), your sentence before the analyst's; the last reading confirmed, corrected, or ignored by the next dream. |
| IV | The Shadow · *umbra* | Hook, exact quality, the turn ("nowhere" refused; the analyst asked whether the turn was made); once the descent is earned, the shadow given a face and a dialogue; what it wants that was refused; lived or carried (CW 9ii §14). |
| V | The Hour · *circumambulatio* | Mood as object; Jung's association experiment (24 of his 100 words, spoken or typed, previously disturbed words put again, bodily reactions marked, nine complex indicators); the interrogation of each disturbed word; the seed; once earned, the descent, a dialogue with equal rights, two positions held, the third, whether the two are still two, what has to die for it, the vessel closed, form, one act. Before the descent is earned, the word is carried into the week. |
| VI | The Fire · *calcinatio · solutio* | The affect entered rather than reported: at full strength, in the body, the sentence it would say, a minute of burning, what is left in the ash, back into the room. Counts as the day's entry into the imagination. |
| VII | The Soul-Image · *anima · animus* | The carrier of the projection, what is seen in them, possession as opinion and as mood, the figure taken back, dialogue, the figure as guide, the four stages of the anima (CW 16 §361) or of the animus (Emma Jung, 1931), its other face; inflation asked about. |
| VIII | The Mandala | Drawn with the finger; the centre, the four, the disturbance, and whether what is at the centre is the I (CW 14 §778); the analyst shown the drawing and the reading. |
| IX | The Religious Function · *religio* | What one is related to that is larger, what became of the religion one was raised in, where dread or awe appeared, what one would not give up (CW 11 §509, CW 12 §14). |
| X | The Dream Series · *series somniorum* | After five dreams: the last eight read together, the line of development, the motif that will not go away, what the series does that no single dream showed (CW 12 §§44–50). |
| XI | Unio mentalis · *coniunctio I* | Gated on substance and time (twenty hours, four dreams, two shadow hours, one soul-image hour, sixty days, a black hour, a third asked about again, a promise kept even in part). Circumstances asked if missing; the whole file read as someone else's; separatio; the caelum as image, sentence, blood, the analyst's questions, correction; back into the room (CW 14 §§671–695). |
| XII | Union with the body · *coniunctio II* | Seven days after the first: the caelum against the body, in whose presence it is hardest, a daily bodily practice, the body's revolt on return, the moment it was true in the flesh, which can only be written on a return at least a week later, once the practice has been asked about or the revolt written. Stays open until then. |
| — | Unus mundus · *coniunctio III* | Not on the list. Appears by itself when the second conjunction has been closed for three weeks and three coincidences spanning half a year are in the log; the coincidences, the symbol of the whole, what would be lost if this were only psychology, who is owed something by what you now know (CW 8 §432); can return when new coincidences gather. |

## Memory that circles

Every threshold since the first asks about what was left open: the last promise, whether the last third is still alive and whether what had to die has died, whether a held tension released, a gap longer than three weeks, every tenth hour who has been told. Figures return with what they said last. Words disturbed in more than one hour are named. Each hour ends by naming the operations that happened (Edinger's seven) from which the colour follows; rubedo is never chosen, it is reached when a third has survived three days, what had to die has died, the two are still two, and the promise was not broken. Moods separated as not-me are kept as a list. Abandoned drafts are kept as material. The Liber gathers everything, with a tree of the opus in time, circumstances and a typology portrait asked for sideways.

## The analyst

Inside the Claude app or on claude.ai, an optional "analyst" voice (Claude, via the artifact `sample` capability) holds the frame from outside the work. It lives in one standalone module, `analyst.js`, which the page uses everywhere the analyst speaks:

- **In the hours**: it reads the association protocol, holds the frame of an active-imagination dialogue from outside it, amplifies a third, reads a dream and a series after the dreamer has, says whether the shadow's turn was made, looks at the mandala (the drawing itself is sent where the app can send pictures), compares a caelum with the file, and closes an hour.
- **Outside the hours**: from the Liber it reads the whole opus, and from the home screen or the Liber you can speak with it. A conversation stays open for a day and is kept with the hours.

With every question it is handed the same context: the circumstances and portrait, the dossier of the opus (confession, hours, disturbed words, figures and what they last said, thirds and whether they lived, tensions, promises, moods separated as not-me, dreams and their motifs, what was begun and abandoned), the earlier material that bears on the task, the current hour, and whatever the person has given it in the Liber. Everything the person wrote is quoted inside marked material blocks and is never an instruction to it.

**What Claude already knows about you.** The page cannot reach Claude's memory of you by itself. The Liber has a place to paste it: copy what Claude remembers from claude.ai (Settings, then Memory), or ask Claude in a chat to write it out with the prompt the page offers, and paste the answer. A second field takes anything else the analyst should know or should not assume. Both are kept with your hours and handed over as material.

The instruction is written for a current Claude model (the `complex` tier by default, settable): it states who the analyst is, how Jung worked and so how it works, and the frame that never bends, rule 0 first: when the material calls for a person in the room, the method stops. It never interprets before the person has, never supplies material, never speaks inside the imagination, names transference and inflation once when they appear, answers in the language the person writes in, and gives amplification only from sources it can vouch for. The method notes it is drawn from are in `docs/jungian-method.md`.

The analyst is not accepted on the strength of its instruction. It is run against a fixture opus and judged by independent critics (a Jungian expert, the client, safety, context integration, robustness against instructions smuggled into the material, and engineering) until every critic passes every case; `docs/critics.md` has the rubrics and the log of the rounds. It runs on the viewer's own Claude subscription; the app holds no API key.

## Storage

Hours, the draft, the portrait, the synchronicity log, the abandoned list, what Claude remembers and the conversations with the analyst are kept in the artifact's document store (`db` capability, owner-only rules) and cached in `localStorage`. The conversations share one document, so the oldest are dropped once they would exceed about 180 KB together; the journal export carries them out before that. Hours from the first version migrate on load. The journal exports as Markdown, conversations included.

## Files

- `index.html` – the whole app as published (no runtime dependencies beyond Google Fonts). The block between `<!-- ARTIFACT-START -->` and `<!-- ARTIFACT-END -->` is what gets published as a Claude artifact; the artifact host wraps it in its own document skeleton.
- `analyst.js` – the analyst: the standing instruction, the tasks, the budgeted context assembly and the runtime over `sample`. A browser global and a CommonJS module; it knows nothing of the page's state.
- `build.mjs` – inlines `analyst.js` into `index.html` between the `ANALYST-MODULE` markers (`node build.mjs`; `--check` verifies the built page is current). This is the only build step.
- `test/` – `analyst.test.mjs` (the module, `node --test`), `e2e.mjs` (Playwright drives the built page with a fake `sample` and captures the prompts it sends), `fixtures.mjs` (the fictional opus), `critics-bundle.mjs` and `shots.mjs` (material for the critics).
- `docs/` – `jungian-method.md` (the method, with the paragraphs of the Collected Works) and `critics.md` (the critics and their rounds).

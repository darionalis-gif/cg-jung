# Tertium Datur

A single-file web app for practising C. G. Jung's method on oneself, built for a phone, as an opus that runs over months and can be carried to the three conjunctions of Dorn as Jung reads them in *Mysterium Coniunctionis*. It was built in a loop of building and independent Jungian critique (classical and alchemical), three rounds, until the critics found only refinements.

## What it is not

Not treatment, not diagnosis, not for a crisis. A gate before first use names the states in which the descent practices should not be attempted; a Stop button on every session screen leads to a grounding screen with crisis lines; a tripwire on everything written closes the imagination for the hour, brings the closing step forward, and tells the analyst; the gate is shown again before a deep practice every ninety days. The method text states what a solo opus cannot supply: the confession's hearer, the transference, the partner in whose presence shadow and soul-image become real (CW 9ii §42).

## The practices

Each practice is a guided sequence of movements and steps, rendered by one engine from data (`PRACTICES` in `index.html`). Roman numerals on the home screen follow the suggestion order.

| | Practice | What happens |
|---|---|---|
| I | Confession · *confessio* | The life in ten lines, the house (mother, father, what each wanted, what was never said), the losses, the secret, what brings you here, and a hearer named or why there is none (CW 16 §§123–130). |
| II | The Persona | Roles, the mask fused to the face, its cost, the crack, who one is when nobody needs anything; an act with the mask off, constrained (CW 7 §§254–275). |
| III | The Dream · *somnium* | Exact record, its kind (comment, repetition, body, big dream), dramatic structure (CW 8 §§561–564), associations by circumambulation, objective level before subjective, which level, compensation, prospective reading (CW 8 §§492–493), your sentence before the analyst's; the last reading confirmed, corrected, or ignored by the next dream. |
| IV | The Shadow · *umbra* | Hook, exact quality, the turn ("nowhere" refused); once the descent is earned, the shadow given a face and a dialogue; what it wants that was refused; lived or carried (CW 9ii §14). |
| V | The Hour · *circumambulatio* | Mood as object; Jung's association experiment (24 of his 100 words, spoken or typed, previously disturbed words put again, bodily reactions marked, nine complex indicators); the interrogation of each disturbed word; the seed; once earned, the descent, a dialogue with equal rights, two positions held, the third, whether the two are still two, what has to die for it, the vessel closed, form, one act. Before the descent is earned, the word is carried into the week. |
| VI | The Fire · *calcinatio · solutio* | The affect entered rather than reported: at full strength, in the body, the sentence it would say, a minute of burning, what is left in the ash, back into the room. Counts as the day's entry into the imagination. |
| VII | The Soul-Image · *anima · animus* | The carrier of the projection, what is seen in them, possession as opinion and as mood, the figure taken back, dialogue, the figure as guide, the four stages of the anima (CW 16 §361) or of the animus (Emma Jung, 1931), its other face; inflation asked about. |
| VIII | The Mandala | Drawn with the finger; the centre, the four, the disturbance, and whether what is at the centre is the I (CW 14 §778). |
| IX | The Religious Function · *religio* | What one is related to that is larger, what became of the religion one was raised in, where dread or awe appeared, what one would not give up (CW 11 §509, CW 12 §14). |
| X | The Dream Series · *series somniorum* | After five dreams: the last eight read together, the line of development, the motif that will not go away, what the series does that no single dream showed (CW 12 §§44–50). |
| XI | Unio mentalis · *coniunctio I* | Gated on substance and time (twenty hours, four dreams, two shadow hours, one soul-image hour, sixty days, a black hour, a third asked about again, a promise kept even in part). Circumstances asked if missing; the whole file read as someone else's; separatio; the caelum as image, sentence, blood, the analyst's questions, correction; back into the room (CW 14 §§671–695). |
| XII | Union with the body · *coniunctio II* | Seven days after the first: the caelum against the body, in whose presence it is hardest, a daily bodily practice, the body's revolt on return, the moment it was true in the flesh, which can only be written on a return at least a week later, once the practice has been asked about or the revolt written. Stays open until then. |
| — | Unus mundus · *coniunctio III* | Not on the list. Appears by itself when the second conjunction has been closed for three weeks and three coincidences spanning half a year are in the log; the coincidences, the symbol of the whole, what would be lost if this were only psychology, who is owed something by what you now know (CW 8 §432); can return when new coincidences gather. |

## Memory that circles

Every threshold since the first asks about what was left open: the last promise, whether the last third is still alive and whether what had to die has died, whether a held tension released, a gap longer than three weeks, every tenth hour who has been told. Figures return with what they said last. Words disturbed in more than one hour are named. Each hour ends by naming the operations that happened (Edinger's seven) from which the colour follows; rubedo is never chosen, it is reached when a third has survived three days, what had to die has died, the two are still two, and the promise was not broken. Moods separated as not-me are kept as a list. Abandoned drafts are kept as material. The Liber gathers everything, with a tree of the opus in time, circumstances and a typology portrait asked for sideways.

## The analyst

Inside the Claude app or on claude.ai, an optional "analyst" voice (Claude, via the artifact `sample` capability) reads the protocol, holds the frame from outside the dialogue, offers amplification only from sources it can vouch for, reads a dream and a series after the dreamer has, compares a caelum with the file, and closes an hour. It is handed a dossier of the opus and the earlier material relevant to each task. Rule 0 stops the method when the material calls for a person in the room. It runs on the viewer's own Claude subscription at the `complex` tier by default; the app holds no API key.

## Storage

Hours, the draft, the portrait, the synchronicity log and the abandoned list are kept in the artifact's document store (`db` capability, owner-only rules) and cached in `localStorage`. Hours from the first version migrate on load. The journal exports as Markdown.

## Files

- `index.html` – the whole app (no build step, no dependencies beyond Google Fonts).

The block between `<!-- ARTIFACT-START -->` and `<!-- ARTIFACT-END -->` is what gets published as a Claude artifact; the artifact host wraps it in its own document skeleton.

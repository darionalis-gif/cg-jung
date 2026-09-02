# Tertium Datur

A single-file web app for practising C. G. Jung's method on oneself, built for a phone, as an opus that runs over many sessions ("hours") and can be carried to the three conjunctions of Dorn as Jung reads them in *Mysterium Coniunctionis*.

## The practices

Each practice is a guided sequence of movements and steps, rendered by one engine from data (`PRACTICES` in `index.html`).

| | Practice | What happens |
|---|---|---|
| I | The Hour · *circumambulatio* | Mood as object (CW 8 §166); Jung's word-association experiment (24 of his 100 stimulus words, spoken or typed, hidden stopwatch, reproduction test, complex indicators); active imagination on the disturbed word with a dialogue of equal rights; two positions held until a third forms; giving it form by drawing; one act. |
| II | The Dream · *somnium* | Exact record, dramatic structure (exposition, development, peripeteia, lysis), associations by circumambulation per element, subjective level, compensation, the dreamer's reading before the analyst's. Motifs tracked across the series. |
| III | The Persona | Roles, the mask fused to the face, its cost, the crack, who one is when nobody needs anything. |
| IV | The Shadow · *umbra* | The projection hook, the exact quality, the turn ("where is that in you?", with "nowhere" refused), the shadow given a face, dialogue, what it wants that was refused, an act of integration. |
| V | The Soul-Image · *anima/animus* | The carrier of the projection, what is seen in them, withdrawal into a figure, dialogue, the figure as guide, the four stages (CW 16 §361) as reflection. |
| VI | The Mandala | Drawn with the finger; then the centre, the four, the disturbance. |
| VII | Unio mentalis · *coniunctio I* | The whole file laid out and read as someone else's; separatio of the moods that are not oneself; the caelum distilled. |
| VIII | Union with the body · *coniunctio II* | The caelum read against the body; a daily bodily practice; the moment it was true in the flesh. |
| IX | Unus mundus · *coniunctio III* | Synchronicities; the symbol of the whole; what would be lost if it were only psychology. |

## Memory of the opus

Every threshold asks about the last promise (the act) and records what got in the way. Figures return with what they said last. Words disturbed in more than one hour are named as such. Each hour is given a colour (nigredo, albedo, citrinitas, rubedo). The Liber gathers everything: portrait (typology after CW 6), disturbed words, dramatis personae, dreams and motifs, promises, synchronicities, the caelum, all hours. The home screen suggests the next practice from the state of the opus without forcing it. The generative mandala grows one ring per hour.

## The analyst

Where the page is opened inside the Claude app or on claude.ai, an optional "analyst" voice (Claude, via the artifact `sample` capability) can read the protocol, hold the frame in a dialogue, offer amplification, read a dream after the dreamer has, compare a caelum with the file, and close an hour. Every call carries a dossier of the whole opus. It runs on the viewer's own Claude subscription; the app holds no API key. Every call asks for the `complex` model tier by default (settable). It is instructed never to interpret before the user does and never to supply material.

## Storage

Hours and the in-progress hour are kept in the artifact's document store (`db` capability, owner-only rules): one document per hour under `hours/<id>`, the draft under `state/draft` with a revision counter, the portrait and synchronicity log under `state/`. The browser's `localStorage` is a cache so the page opens instantly and keeps working when the store is unreachable. Hours from the first version are migrated on load. The journal can be exported as Markdown.

## Files

- `index.html` – the whole app (no build step, no dependencies beyond Google Fonts).

The block between `<!-- ARTIFACT-START -->` and `<!-- ARTIFACT-END -->` is what gets published as a Claude artifact; the artifact host wraps it in its own document skeleton.

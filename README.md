# Tertium Datur

A single-file web app for practising C. G. Jung's method on oneself, built for a phone.

One "hour" runs through five movements:

| | Movement | What happens |
|---|---|---|
| I | Threshold | Arrive; take the present mood as the object (CW 8 §166). |
| II | Association | Jung's word-association experiment: 24 stimulus words from his list of 100 (English or German), a hidden stopwatch to the first keystroke, then a reproduction test. Complex indicators are computed the way Jung read a protocol: prolonged reaction, no reaction, failed reproduction, several words, echo of the stimulus, perseveration. |
| III | Descent | Active imagination on the disturbed word: image before meaning, a figure, a dialogue with equal rights. |
| IV | The Third | Both positions at full strength, a minute of holding the tension, then whatever forms in it; one act to carry it into life (CW 8 §131–193). |
| V | Return | The hour is set down; a mandala on the home screen grows by one ring per hour. |

Where the page is opened inside Claude, an optional "analyst" voice (Claude, via the artifact `sample` capability) can read the protocol, hold the frame in the dialogue, offer amplification, and close the hour. It is instructed never to interpret before the user does and never to supply material.

All hours are stored in the browser's `localStorage`; the journal can be exported as Markdown.

## Files

- `index.html` – the whole app (no build step, no dependencies beyond Google Fonts).

The block between `<!-- ARTIFACT-START -->` and `<!-- ARTIFACT-END -->` is what gets published as a Claude artifact; the artifact host wraps it in its own document skeleton.

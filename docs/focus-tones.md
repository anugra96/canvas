# Focus Tones and 432 Hz Tuning

Status: Proposed (draft 2026-11-17, not built)
Applies to: the Ambience player (`web/src/atmosphere/ambience/`, `web/src/AmbiencePicker.tsx`)

## Decision

Add an optional **Focus tones** layer to the Ambience player and a **Tuning**
choice for all ambience music. The layer plays a quiet beat tone at an alpha,
beta, or gamma rate, alone or under any ambience. Hearing safety comes before
effect: every sound has a fixed level ceiling, slow fades, and no harsh
frequencies.

```text
Ambience scene (looped buffer) ─┐
                                ├─> playback gain ─> safety limiter ─> speakers
Focus tones (live oscillators) ─┘        ▲
                                  user volume (max 0.18 today)
```

## Evidence, stated honestly

The UI must not make health or performance claims. The evidence is mixed:

| Idea | What research shows | UI wording |
| --- | --- | --- |
| Binaural beats (alpha, beta, gamma) | Meta-analyses report small, inconsistent effects on attention and anxiety; many studies are small. Needs headphones | "Some people find these help them focus. Evidence is mixed." |
| 40 Hz gamma | Studied mainly with 40 Hz light and sound for Alzheimer's research, not for focus | Same line; no medical claim |
| 432 Hz tuning | Very little evidence; one small study reported a slightly lower heart rate. It is a matter of taste | "A slightly lower, warmer tuning." |

## Focus tones

| Setting | Beat | Left carrier | Right carrier | Use |
| --- | --- | --- | --- | --- |
| Off (default) | — | — | — | — |
| Alpha | 10 Hz | A3 | A3 + 10 Hz | Calm focus |
| Beta | 16 Hz | A3 | A3 + 16 Hz | Active focus |
| Gamma | 40 Hz | A4 | A4 + 40 Hz | Intense focus |

- A3 is 220 Hz at standard tuning and 216 Hz at 432 Hz tuning; A4 is 440 or
  432 Hz. Carriers stay between 150 and 500 Hz, so they sit in the comfortable
  mid range and above the master high-pass (58 Hz).
- **Delivery:** `Headphones (binaural)`, the default: left and right sine
  carriers hard-panned. `Speakers (isochronic)`: one carrier at the left
  frequency, with its amplitude shaped by a smooth raised-sine at the beat
  rate (no square edges, no clicks), depth at most 70%.
- A soft pink-noise bed under the carriers (low-pass at 1.5 kHz) masks the
  pure tone and makes it less tiring.
- **Mix:** a separate Focus level slider (default 40%). It is mixed under the
  ambience volume, so it never adds loudness above the existing ceiling.
- Changing setting crossfades over 3 s. Start fades in over 8 s. Stop fades
  out over 2 s.

## Tuning

- `Standard (A = 440 Hz)` (default) or `432 Hz (A = 432 Hz)`.
- Replace the fixed 440 in `midiToHz` with the selected reference so every
  scene and the focus carriers follow it. Changing tuning re-renders the
  current scene (the cache key includes tuning) and crossfades.

## Hearing safety (non-negotiable)

1. **Level ceiling:** the focus layer at 100% peaks at -24 dBFS before the
   playback gain. The existing `MAX_PLAYBACK_GAIN` (0.18) stays the ceiling
   for the whole mix.
2. **Safety limiter:** add one `DynamicsCompressorNode` after the playback
   gain (threshold -6 dB, ratio 20, attack 3 ms, release 250 ms). No sound can
   pass it louder than about -6 dBFS.
3. **No harsh content:** focus layer energy above 1.5 kHz is filtered out.
   No tone below 150 Hz in the focus layer.
4. **No sudden onsets:** every start, change, and stop uses the fades above.
   The player never starts louder than the saved volume.
5. **Session reminder:** after 60 minutes of focus tones, fade them out and
   show "Focus tones paused after 60 minutes" with **Resume**.
6. **Caution text** in the Focus section: "Avoid if you have epilepsy or a
   seizure history. Stop if you feel discomfort." Headphones mode adds "Keep
   the volume low."
7. No visual element pulses at the beat rate (photosensitivity).

## Storage

Viewer preferences in `localStorage`, next to the ambience volume:
`canvas-focus-tone` (`off`, `alpha`, `beta`, `gamma`), `canvas-focus-delivery`,
`canvas-focus-level`, `canvas-ambience-tuning`. Never in canvas JSON.

## Proof

| Risk | Proof seam |
| --- | --- |
| Wrong frequencies | Table-driven test of the pure `focusToneParams(tone, delivery, tuning)`: carriers, beat, depth, and that all carriers are within 150-500 Hz |
| Too loud | Same test: the computed peak gain at 100% focus level and 100% volume is at or below the ceilings; a test that the limiter settings are applied |
| Tuning drift | Table-driven `midiToHz(note, reference)`: A4 = 440 or 432; A3 = 220 or 216 |
| Harsh or clicking audio | Manual listening check by the user on headphones and speakers (no automation can judge this) |
| UI flow | Extend the existing ambience E2E if one exists: choose Alpha, see the caution text, Off stops |

## Non-goals

No new music styles or scenes. No claims of medical or cognitive benefit.
No server-side audio files: everything stays synthesized in the browser.

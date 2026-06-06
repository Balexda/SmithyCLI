---
id: ReadTitle
screens: [Library, Player]
maestro: maestro/flows/ReadTitle.yaml
---

# Flow: ReadTitle

## Intent

Opening a saved title into the player is the core read path — the reason the
library exists at all.

## Guards

- **A title row routes to the player.** Tapping a library row must land on the
  player with the chosen title loaded; the yaml asserts the player surface.

## Entry / Exit

- **Enter from**: Library screen, tap on `library-row-<title-slug>`.
- **Exit on**: Player screen visible with the selected title.

## Coverage Caveat

This flow does not observe TTS auto-advance, locked-screen playback, or
audio-focus handling — those audio-service behaviors live below the UI driver
and need instrumentation-level tests. A green Maestro run is not TTS coverage.

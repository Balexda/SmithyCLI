---
id: AddTitle
composable: app/src/main/kotlin/com/storyspider/ui/addtitle/AddTitleScreen.kt
design_system: story-spider-design
---

# Screen: AddTitle

## Why this screen exists

A focused capture surface for a new title's name and source URL, kept separate
from the library so the add gesture is deliberate.

## Deliberate choices

- **Confirm gated on a valid URL.** A title without a playable source is
  useless; the screen refuses to create one.

## Deferred

- Source autodetection from a pasted link — manual entry first.

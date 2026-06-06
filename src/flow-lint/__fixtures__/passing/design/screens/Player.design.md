---
id: Player
composable: app/src/main/kotlin/com/storyspider/ui/player/PlayerScreen.kt
design_system: story-spider-design
---

# Screen: Player

## Why this screen exists

The player is where reading actually happens — the durable playback surface for
a single title.

## Deliberate choices

- **Single-title focus.** The player shows one title at a time; queue
  management lives upstream in the library.

## Deferred

- Inline speed and voice controls — surfaced once the core read path is solid.

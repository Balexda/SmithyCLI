---
id: ReadTitle
screens: [Library, Player]
maestro: maestro/flows/ReadTitle.yaml
---

# Flow: ReadTitle

## Intent

PLANTED BREAK: `maestro:` points at `maestro/flows/ReadTitle.yaml`, but that
file does not exist in this tree — the test body is severed. flow-lint must
report `flow-maestro-missing` naming that path.

## Guards

- **A title row routes to the player.**

## Entry / Exit

- **Enter from**: Library screen, tap on `library-row-<title-slug>`.
- **Exit on**: Player screen visible.

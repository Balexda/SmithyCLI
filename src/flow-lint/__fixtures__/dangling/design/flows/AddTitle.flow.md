---
id: AddTitle
screens: [Library, AddTitle]
maestro: maestro/flows/AddTitle.yaml
---

# Flow: AddTitle

## Intent

PLANTED BREAK: `screens:` lists `AddTitle`, but there is no
`design/screens/AddTitle.design.md` in this tree — the screen reference is
severed. flow-lint must report `flow-screen-missing` naming that path.

## Guards

- **Confirm is disabled until the URL is valid.**

## Entry / Exit

- **Enter from**: Library screen, tap on `library-fab`.
- **Exit on**: tap `add-title-confirm-button-enabled` → Library list.

---
id: AddTitle
screens: [Library, AddTitle]
maestro: maestro/flows/AddTitle.yaml
---

# Flow: AddTitle

## Intent

Adding a title is the entry point of the entire product — a library with no way
to add to it is dead on arrival. This journey is a durable truth we refuse to
ship a release that breaks.

## Guards

- **Confirm is disabled until the URL is valid.** Prevents half-formed titles
  from entering the library; the yaml asserts the disabled→enabled transition.

## Entry / Exit

- **Enter from**: Library screen, tap on `library-fab`.
- **Exit on**: tap `add-title-confirm-button-enabled` with a valid URL → return
  to Library list, new title visible.

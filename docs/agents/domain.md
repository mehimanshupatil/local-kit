# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root: this repo's glossary (see its "Language" section) and the hard constraint. Use its terms.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

New glossary terms go in `CONTEXT.md` under "Language"; don't create a separate `GLOSSARY.md`.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md          ← glossary + hard constraint
├── docs/adr/
│   ├── 0000-local-only-constraint.md
│   └── …
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0000 (local-only constraint), but worth reopening because…_

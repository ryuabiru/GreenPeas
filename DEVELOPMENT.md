# GreenPeas Development Guide

[日本語版開発ガイド](DEVELOPMENT_ja.md)

GreenPeas is a Tauri desktop application with a React/TypeScript frontend and a
Rust backend. This document is the maintained guide to its architecture,
development workflow, and current backlog.

## Architecture

GreenPeas separates domain operations from display concerns:

- Rust owns file parsing, sequence algorithms, workspace data, cloning logic,
  and persistence.
- TypeScript owns application state, screen layout, interaction state, and
  rendering.
- Tauri commands in `src-tauri/src/commands.rs` and the wrappers in `src/api/`
  form the boundary between them.
- Shared Rust models are exported to `src/bindings/` with `ts-rs`. Generated
  binding files must not be edited manually.

### Frontend

- `src/App.tsx`: connects stores, hooks, layouts, and dialogs.
- `src/store/useSequenceStore.ts`: open sequences, edits, history, saving, and
  alignment state.
- `src/store/useUiStore.ts`: selections, view modes, search, dialogs, and UI
  settings.
- `src/store/useEnzymeStore.ts`: restriction enzymes and enzyme sets.
- `src/hooks/useTauriIntegration.ts`: Tauri events, menus, keyboard shortcuts,
  file opening, and clipboard integration.
- `src/components/`: workspace, sequence, map, alignment, and dialog UI.
- `src/utils/sequenceLayout.ts`: linear sequence row layout.
- `src/workers/rendering.worker.ts`: off-main-thread sequence rendering.

### Rust Backend

- `src-tauri/src/lib.rs`: Tauri initialization, shared state, plugins,
  commands, menus, and multi-window events.
- `src-tauri/src/commands.rs`: frontend-facing sequence commands.
- `src-tauri/src/workspace.rs`: backend sequence workspace.
- `src-tauri/src/models.rs`: shared domain and view models.
- `src-tauri/src/algorithms/`: sequence, alignment, primer, and restriction
  enzyme algorithms.
- `src-tauri/src/parsers/`: FASTA, GenBank, SnapGene, and AB1 parsers.
- `src-tauri/src/domains/cloning/`: fragment handling and ligation logic.
- `src-tauri/src/db.rs`: restriction enzyme SQLite database.

## Design Rules

- Keep sequence-domain calculations and file parsing in Rust.
- Keep pixel coordinates, row wrapping, hit testing, and other display layout
  in TypeScript.
- Prefer shared stores and hooks over placing complex stateful logic directly
  in React components.
- Change Rust model definitions before regenerating `src/bindings/`.
- Keep dependencies and tooling project-local; do not install them globally.
- Keep source releases, binary releases, and license notices consistent with
  `README.md` and `LICENSE_AUDIT.md`.

## Development Commands

```sh
npm install
npm run tauri dev
npm test
npm run build
cd src-tauri && cargo test && cargo check
```

Run checks appropriate to the affected area before merging. Before publishing
a release, regenerate and review `THIRD_PARTY_LICENSES.txt`.

## Implemented Milestones

- Split sequence-domain operations from frontend display layout.
- Added Zustand stores for sequence, UI, and enzyme state.
- Added worker-assisted sequence rendering and virtualized linear viewing.
- Added sequence alignment and coordinate conversion.
- Added cloning fragment handling and Smart Ligation validation.
- Added direct SnapGene primer import.
- Added multi-window sequence opening and cross-window sidebar transfer.
- Added public beta release and third-party license-compliance tooling.

## Backlog

### Editing and Interaction

- Clarify and improve the behavior after creating a new sequence.
- Restore highlighting for newly pasted sequence regions.
- Place the caret at the deletion boundary after deleting a region.
- Make the context menu scrollable on small screens.
- Support interactive annotation range editing and in-place naming.

### Export and Compatibility

- Review whether exports should default to GenBank instead of GP or FASTA.
- Improve robustness for multilingual or unusual GenBank LOCUS dates.
- Expand real-world `.gb`, `.gbk`, `.dna`, and `.gp` compatibility testing.

### Map and Biology Display

- Improve map readability when labels become too small.
- Review map behavior so linear sequences are not always represented as
  circular maps.
- Improve CDS display for partial codons and chimeric protein workflows.
- Add advanced SnapGene compatibility and six-frame translation views.

### Performance and Release

- Monitor memory use for large sequences and consider bounded caches.
- Expand native Apple Silicon release coverage.

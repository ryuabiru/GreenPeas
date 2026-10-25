# GreenPeas License Audit

Audit updated: October 24, 2026

This is an engineering license-compliance audit, not legal advice.

## Project License

GreenPeas source code is distributed under the MIT License. The copyright
holder named in `LICENSE` is Ryuki Abiru.

Project metadata uses the SPDX identifier `MIT` in both `package.json` and
`src-tauri/Cargo.toml`. The application bundle includes the project license and
the generated third-party notices.

## Runtime Dependencies

- No GPL, AGPL, LGPL, SSPL, or BUSL runtime dependency was detected in the
  audited lockfiles.
- npm runtime dependencies use permissive licenses such as MIT, ISC, or
  Apache-2.0/MIT.
- Most Rust runtime dependencies use permissive licenses such as MIT,
  Apache-2.0, BSD, Zlib, Unicode-3.0, BSL-1.0, 0BSD, CC0, or Unlicense.
- Four unmodified Rust dependencies use MPL-2.0. MPL-2.0 is file-level
  copyleft; recipients must retain the applicable notices and be able to
  obtain the covered source.

The generated `THIRD_PARTY_LICENSES.txt` records dependency versions, license
terms, attribution notices, and source locations.

## MPL-2.0 Components

- `cssparser@0.29.6`: https://crates.io/crates/cssparser/0.29.6
- `dtoa-short@0.3.5`: https://crates.io/crates/dtoa-short/0.3.5
- `option-ext@0.2.0`: https://crates.io/crates/option-ext/0.2.0
- `selectors@0.24.0`: https://crates.io/crates/selectors/0.24.0

GreenPeas does not modify these dependencies. Their source locations and
MPL-2.0 status must remain available with public binary distributions.

## Distribution Requirements

Every public source or binary release must include:

1. `LICENSE`, containing the GreenPeas MIT License.
2. `THIRD_PARTY_LICENSES.txt`, generated from the locked runtime dependencies.

Run before every release:

```sh
npm run licenses:generate
npm run release:macos
npm run release:windows # on Windows
```

The generator fails if a runtime dependency has an unknown or unapproved
license expression. Dependency changes require a fresh review of this audit.

## Repository Content

The temporary `enzyme_list_takara.txt` test fixture was removed before the
open-source release because it was unnecessary and did not carry documented
redistribution terms. Any future bundled data or artwork must have documented
provenance and redistribution rights.

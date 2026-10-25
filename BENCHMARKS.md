# GreenPeas benchmarks

The benchmark runner measures the Rust core separately from rendering and the
Tauri development server. It uses deterministic synthetic DNA and performs
correctness checks before reporting timings.

Run the standard benchmark from the repository root:

```sh
npm run benchmark:core
```

Use the quick profile while developing, or the full profile before a release:

```sh
npm run benchmark:core -- --quick
npm run benchmark:core -- --full
```

An actual `.dna`, `.gb`, `.gbk`, or FASTA file can be included in the import
measurement. The file remains local and is not modified:

```sh
npm run benchmark:core -- --quick --input path/to/example.dna
```

The reported median is the primary comparison value. The minimum is included
to help identify noisy runs. Compare results on the same machine, with the same
profile, while other CPU-intensive work is stopped. Absolute timing thresholds
are intentionally not used because developer and CI hardware differ.

For a rough peak-memory measurement on macOS, run the compiled benchmark under
the system `time` command:

```sh
cargo build --release --manifest-path src-tauri/Cargo.toml --example benchmark
/usr/bin/time -l src-tauri/target/release/examples/benchmark --full
```

Record the GreenPeas commit, operating system, CPU architecture, profile, and
median results when publishing or comparing a baseline.

## Working baseline (2026-10-24)

Run on macOS 26.6.2, Apple Silicon arm64, 8 logical CPUs, from commit `b2a47cc`
with the current uncommitted changes. Command:
`/usr/bin/time -l src-tauri/target/release/benchmark --full` (the runner was moved
to `target/release/examples/benchmark` afterward). The deterministic input was 5 Mbp
with 15 iterations. Median times were 33.99 ms for DNA search, 9.02 ms for a
20 bp replacement, 185.59 ms for FASTA export, 140.29 ms for GenBank export,
and 27.75 ms for GenBank import. Peak resident set size was 261,111,808 bytes
(about 249 MiB). Correctness checks passed. This measures the Rust core only;
it does not measure UI responsiveness or long-running memory use.

## P0 recheck (2026-10-25)

macOS 26.6.2, Apple Silicon arm64, 8 logical CPUs, commit `545a58b` plus the
uncommitted P0 changes. The release example was built with the local offline
Cargo cache. Quick (100 kbp, 3 iterations), standard (1 Mbp, 9 iterations),
and full (5 Mbp, 15 iterations) profiles passed correctness checks. The full
profile was run with `/usr/bin/time -l` and compared with the baseline above:

| Core operation, median | Baseline | P0 recheck |
| --- | ---: | ---: |
| DNA search | 33.99 ms | 33.81 ms |
| Replace 20 bp | 9.02 ms | 8.86 ms |
| FASTA export | 185.59 ms | 194.46 ms |
| GenBank export | 140.29 ms | 144.01 ms |
| GenBank import | 27.75 ms | 27.57 ms |
| Peak resident size | 261,111,808 B | 197,853,184 B |

No major core regression was observed. The 5 Mbp synthetic `.gp` file with
10,000 features imported in 17.30 ms, edited in 9.41 ms, and saved in 19.96 ms
(median of 3 iterations). The saved file was reloaded and sequence and feature
coordinates were checked. A 5 Mbp template with a 1 kbp read aligned in
770.36 ms (median of 3) with a process peak resident size of 417,234,944 B.

`npm run benchmark:ui-proxy` renders synthetic Map data in jsdom. With
100 kbp/100 features, 1 Mbp/1,000 features, and 5 Mbp/10,000 features, initial
linear Map render times were 83, 131, and 841 ms; circular overview times were
29, 162, and 1,105 ms. On the largest case, the first linear zoom took 582 ms
and the slowest of four further zooms and ten pans took 259 ms. Feature track
calculation improved from 344 ms to 7 ms on that case after replacing the
quadratic overlap scan. These figures are a repeatable UI proxy, not native
WebView timings. Native window responsiveness, native process memory after long
use, and Windows behavior still require direct measurement.

use greenpeas_lib::algorithms::{
    apply_edit, calculate_gc_content, find_restriction_sites, run_alignment, search_sequence,
    translate_dna, EditOp,
};
use greenpeas_lib::models::{AlignmentMode, SequenceData, Topology};
use greenpeas_lib::parsers::{export_fasta, export_gbk, list_all_sequences_internal};
use greenpeas_lib::utils::{get_reverse_complement, CompiledEnzyme, EnzymeStore};
use std::hint::black_box;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

struct Config {
    sequence_len: usize,
    iterations: usize,
    alignment_template_len: usize,
    alignment_query_len: usize,
    input: Option<PathBuf>,
}

struct Measurement {
    name: String,
    input_bytes: usize,
    median: Duration,
    minimum: Duration,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = parse_args()?;
    let sequence = deterministic_dna(config.sequence_len);
    let query_start = config.sequence_len / 3;
    let query = sequence[query_start..query_start + 24].to_string();
    let enzyme_store = common_enzyme_store();

    println!("GreenPeas core benchmark");
    println!(
        "profile=release target={}-{} logical_cpus={} sequence={} bp iterations={}",
        std::env::consts::OS,
        std::env::consts::ARCH,
        std::thread::available_parallelism().map_or(1, usize::from),
        config.sequence_len,
        config.iterations
    );
    println!(
        "alignment_template={} bp alignment_query={} bp",
        config.alignment_template_len, config.alignment_query_len
    );
    println!("Synthetic inputs use a fixed seed; lower times are better.\n");

    // Untimed checks prevent a fast but incorrect implementation from looking successful.
    assert!((calculate_gc_content(&sequence) - 50.0).abs() < 2.0);
    assert!(!search_sequence(&sequence, &query, true).is_empty());
    assert_eq!(
        get_reverse_complement(&get_reverse_complement(&sequence)),
        sequence
    );

    let mut measurements = Vec::new();
    measurements.push(measure(
        "GC content",
        sequence.len(),
        config.iterations,
        || black_box(calculate_gc_content(black_box(&sequence))),
    ));
    measurements.push(measure(
        "Reverse complement",
        sequence.len(),
        config.iterations,
        || black_box(get_reverse_complement(black_box(&sequence))),
    ));
    measurements.push(measure(
        "DNA search (24 bp, circular)",
        sequence.len(),
        config.iterations,
        || {
            black_box(search_sequence(
                black_box(&sequence),
                black_box(&query),
                true,
            ))
        },
    ));
    measurements.push(measure(
        "DNA translation (one frame)",
        sequence.len(),
        config.iterations,
        || black_box(translate_dna(black_box(&sequence), 0)),
    ));
    measurements.push(measure(
        "Restriction scan (8 enzymes)",
        sequence.len(),
        config.iterations,
        || {
            black_box(find_restriction_sites(
                black_box(&sequence),
                &Topology::Circular,
                None,
                black_box(&enzyme_store),
            ))
        },
    ));

    let edit_data = sequence_data("benchmark", sequence.clone(), Topology::Circular);
    measurements.push(measure(
        "Replace 20 bp (clone + validation)",
        sequence.len(),
        config.iterations,
        || {
            black_box(apply_edit(
                black_box(edit_data.clone()),
                EditOp::Replace {
                    pos: query_start,
                    len: 20,
                    sequence: "ACGTACGTACGTACGTACGT".to_string(),
                },
            ))
        },
    ));

    let alignment_template = deterministic_dna(config.alignment_template_len);
    let mut alignment_query = alignment_template[config.alignment_template_len / 3
        ..config.alignment_template_len / 3 + config.alignment_query_len]
        .to_string();
    alignment_query.replace_range(31..32, "A");
    alignment_query.replace_range(173..174, "T");
    measurements.push(measure(
        "Read alignment",
        alignment_template.len() + alignment_query.len(),
        config.iterations.min(5),
        || {
            black_box(run_alignment(
                black_box(&alignment_template),
                black_box(&alignment_query),
                AlignmentMode::ReadMapping,
            ))
        },
    ));

    let temp = TempBenchmarkDir::new()?;
    let fasta_path = temp.path.join("sequence.fasta");
    let gbk_path = temp.path.join("sequence.gbk");
    let fasta_path_string = path_string(&fasta_path);
    let gbk_path_string = path_string(&gbk_path);

    measurements.push(measure_fallible(
        "FASTA export",
        sequence.len(),
        config.iterations,
        || {
            export_fasta(
                fasta_path_string.clone(),
                "benchmark".to_string(),
                None,
                sequence.clone(),
            )
        },
    )?);
    let fasta_check = list_all_sequences_internal(fasta_path_string.clone())?;
    assert_eq!(fasta_check[0].sequence, sequence);
    measurements.push(measure_fallible(
        "FASTA import",
        sequence.len(),
        config.iterations,
        || list_all_sequences_internal(fasta_path_string.clone()),
    )?);

    measurements.push(measure_fallible(
        "GenBank export",
        sequence.len(),
        config.iterations.min(5),
        || {
            export_gbk(
                gbk_path_string.clone(),
                sequence.clone(),
                Vec::new(),
                Vec::new(),
                Topology::Circular,
            )
        },
    )?);
    let gbk_check = list_all_sequences_internal(gbk_path_string.clone())?;
    assert_eq!(gbk_check[0].sequence, sequence);
    assert_eq!(gbk_check[0].topology, Topology::Circular);
    measurements.push(measure_fallible(
        "GenBank import",
        sequence.len(),
        config.iterations.min(5),
        || list_all_sequences_internal(gbk_path_string.clone()),
    )?);

    if let Some(input) = config.input.as_deref() {
        let input_string = path_string(input);
        let input_bytes = std::fs::metadata(input)?.len() as usize;
        let parsed = list_all_sequences_internal(input_string.clone())?;
        let total_bases: usize = parsed.iter().map(|item| item.sequence.len()).sum();
        println!(
            "Optional input: {} ({} records, {} bp)",
            input.display(),
            parsed.len(),
            total_bases
        );
        measurements.push(measure_fallible(
            &format!("File import ({})", extension_label(input)),
            input_bytes,
            config.iterations.min(5),
            || list_all_sequences_internal(input_string.clone()),
        )?);
        if input.extension().and_then(|extension| extension.to_str()) == Some("gp")
            && parsed.len() == 1
            && parsed[0].sequence.len() >= 20
        {
            let original = &parsed[0];
            let edit_pos = original.sequence.len() / 3;
            let replacement = "ACGTACGTACGTACGTACGT".to_string();
            let edit = || {
                apply_edit(
                    original.clone(),
                    EditOp::Replace {
                        pos: edit_pos,
                        len: 20,
                        sequence: replacement.clone(),
                    },
                )
            };
            let edited = edit()?;
            measurements.push(measure_fallible(
                "GP edit with features",
                original.sequence.len(),
                config.iterations.min(5),
                edit,
            )?);
            let output = temp.path.join("edited.gp");
            let output_string = path_string(&output);
            measurements.push(measure_fallible(
                "GP save",
                edited.sequence.len(),
                config.iterations.min(5),
                || greenpeas_lib::commands::export_gp(output_string.clone(), edited.clone()),
            )?);
            let reloaded = list_all_sequences_internal(output_string)?;
            assert_eq!(reloaded[0].sequence, edited.sequence);
            assert_eq!(reloaded[0].annotations.len(), edited.annotations.len());
            for (actual, expected) in reloaded[0].annotations.iter().zip(&edited.annotations) {
                assert_eq!(
                    (&actual.id, actual.start, actual.end),
                    (&expected.id, expected.start, expected.end)
                );
            }
        }
    }

    print_results(&measurements);
    println!("\nCorrectness checks passed for search and FASTA/GenBank round trips.");
    Ok(())
}

fn parse_args() -> Result<Config, Box<dyn std::error::Error>> {
    let mut config = Config {
        sequence_len: 1_000_000,
        iterations: 9,
        alignment_template_len: 20_000,
        alignment_query_len: 1_000,
        input: None,
    };
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--quick" => {
                config.sequence_len = 100_000;
                config.iterations = 3;
                config.alignment_template_len = 8_000;
                config.alignment_query_len = 500;
            }
            "--full" => {
                config.sequence_len = 5_000_000;
                config.iterations = 15;
                config.alignment_template_len = 100_000;
                config.alignment_query_len = 5_000;
            }
            "--input" => {
                config.input = Some(PathBuf::from(args.next().ok_or("--input requires a path")?));
            }
            "--alignment-template-len" => {
                config.alignment_template_len = args
                    .next()
                    .ok_or("--alignment-template-len requires a value")?
                    .parse()?;
            }
            "--alignment-query-len" => {
                config.alignment_query_len = args
                    .next()
                    .ok_or("--alignment-query-len requires a value")?
                    .parse()?;
            }
            "--help" | "-h" => {
                println!(
                    "Usage: cargo run --release --example benchmark -- [--quick|--full] [--input PATH] [--alignment-template-len N] [--alignment-query-len N]"
                );
                std::process::exit(0);
            }
            _ => return Err(format!("unknown argument: {arg}").into()),
        }
    }
    if config.alignment_query_len >= config.alignment_template_len / 2 {
        return Err("alignment query must be smaller than the template".into());
    }
    Ok(config)
}

fn deterministic_dna(len: usize) -> String {
    let mut state = 0x4d59_5df4_d0f3_3173_u64;
    let mut sequence = String::with_capacity(len);
    for _ in 0..len {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        sequence.push(match state & 3 {
            0 => 'A',
            1 => 'C',
            2 => 'G',
            _ => 'T',
        });
    }
    sequence
}

fn common_enzyme_store() -> EnzymeStore {
    let definitions = [
        ("EcoRI", "GAATTC", 1, 5),
        ("BamHI", "GGATCC", 1, 5),
        ("HindIII", "AAGCTT", 1, 5),
        ("NotI", "GCGGCCGC", 2, 6),
        ("XhoI", "CTCGAG", 1, 5),
        ("PstI", "CTGCAG", 5, 1),
        ("NheI", "GCTAGC", 1, 5),
        ("SmaI", "CCCGGG", 3, 3),
    ];
    EnzymeStore::new(
        definitions
            .into_iter()
            .map(|(name, site, cut_top, cut_bottom)| CompiledEnzyme {
                name: name.to_string(),
                site: site.to_string(),
                cut_top,
                cut_bottom,
                methylation_sensitivity: None,
            })
            .collect(),
    )
}

fn sequence_data(id: &str, sequence: String, topology: Topology) -> SequenceData {
    SequenceData {
        id: id.to_string(),
        description: None,
        sequence,
        annotations: Vec::new(),
        primers: Vec::new(),
        topology,
        trace: None,
        enzymes: None,
        enzyme_settings: None,
        alignment_results: None,
        debug_hex: None,
        file_path: None,
    }
}

fn measure<T, F>(name: &str, input_bytes: usize, iterations: usize, mut operation: F) -> Measurement
where
    F: FnMut() -> T,
{
    black_box(operation());
    let mut samples = Vec::with_capacity(iterations);
    for _ in 0..iterations {
        let started = Instant::now();
        black_box(operation());
        samples.push(started.elapsed());
    }
    summarize(name, input_bytes, samples)
}

fn measure_fallible<T, E, F>(
    name: &str,
    input_bytes: usize,
    iterations: usize,
    mut operation: F,
) -> Result<Measurement, E>
where
    F: FnMut() -> Result<T, E>,
{
    black_box(operation()?);
    let mut samples = Vec::with_capacity(iterations);
    for _ in 0..iterations {
        let started = Instant::now();
        black_box(operation()?);
        samples.push(started.elapsed());
    }
    Ok(summarize(name, input_bytes, samples))
}

fn summarize(name: &str, input_bytes: usize, mut samples: Vec<Duration>) -> Measurement {
    samples.sort_unstable();
    Measurement {
        name: name.to_string(),
        input_bytes,
        median: samples[samples.len() / 2],
        minimum: samples[0],
    }
}

fn print_results(measurements: &[Measurement]) {
    println!(
        "{:<42} {:>12} {:>12} {:>14}",
        "Case", "Median", "Minimum", "Throughput"
    );
    println!("{}", "-".repeat(84));
    for result in measurements {
        let mib_per_second = if result.median.is_zero() {
            0.0
        } else {
            result.input_bytes as f64 / 1_048_576.0 / result.median.as_secs_f64()
        };
        println!(
            "{:<42} {:>12} {:>12} {:>11.1} MiB/s",
            result.name,
            format_duration(result.median),
            format_duration(result.minimum),
            mib_per_second
        );
    }
}

fn format_duration(duration: Duration) -> String {
    if duration.as_secs_f64() >= 1.0 {
        format!("{:.2} s", duration.as_secs_f64())
    } else if duration.as_millis() >= 1 {
        format!("{:.2} ms", duration.as_secs_f64() * 1_000.0)
    } else {
        format!("{:.2} us", duration.as_secs_f64() * 1_000_000.0)
    }
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn extension_label(path: &Path) -> String {
    path.extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("unknown")
        .to_ascii_uppercase()
}

struct TempBenchmarkDir {
    path: PathBuf,
}

impl TempBenchmarkDir {
    fn new() -> std::io::Result<Self> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "greenpeas-benchmark-{}-{timestamp}",
            std::process::id()
        ));
        std::fs::create_dir(&path)?;
        Ok(Self { path })
    }
}

impl Drop for TempBenchmarkDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

use greenpeas_lib::models::{Annotation, DisplayShape, Strand, Topology};
use greenpeas_lib::parsers::{export_gbk, list_all_sequences_internal};
use std::path::PathBuf;

fn fixture_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("greenpeas-corpus-{}-{name}", std::process::id()))
}

fn materialize(name: &str, contents: &str, extension: &str) -> PathBuf {
    let path = fixture_path(&format!("{name}.{extension}"));
    std::fs::write(&path, contents).unwrap();
    path
}

#[test]
fn synthetic_public_compatibility_corpus_has_explicit_expectations() {
    let linear = materialize(
        "linear",
        include_str!("fixtures/linear_features.txt"),
        "gbk",
    );
    let circular = materialize(
        "circular",
        include_str!("fixtures/circular_origin.txt"),
        "gbk",
    );
    let multi_fasta = materialize("multi", include_str!("fixtures/multi_record.txt"), "fasta");
    let empty_fasta = materialize("empty", include_str!("fixtures/empty_record.txt"), "fasta");
    let malformed = materialize(
        "malformed",
        include_str!("fixtures/malformed_location.txt"),
        "gbk",
    );
    let invalid_coordinates = materialize(
        "invalid-coordinates",
        include_str!("fixtures/invalid_coordinates.txt"),
        "gbk",
    );
    let invalid_qualifier = materialize(
        "invalid-qualifier",
        include_str!("fixtures/invalid_qualifier.txt"),
        "gbk",
    );
    let truncated_genbank = materialize(
        "truncated-genbank",
        include_str!("fixtures/truncated_genbank.txt"),
        "gbk",
    );

    let linear_records =
        list_all_sequences_internal(linear.to_string_lossy().into_owned()).unwrap();
    assert_eq!(linear_records.len(), 1);
    let linear_record = &linear_records[0];
    assert_eq!(linear_record.sequence, "ACGTACGTACGT");
    assert_eq!(linear_record.topology, Topology::Linear);
    assert!(linear_record
        .description
        .as_deref()
        .unwrap()
        .contains("模擬配列"));
    let forward = linear_record
        .annotations
        .iter()
        .find(|feature| feature.name == "Forward feature")
        .unwrap();
    assert_eq!(
        (forward.start, forward.end, forward.strand),
        (1, 6, Strand::Forward)
    );
    let reverse = linear_record
        .annotations
        .iter()
        .find(|feature| feature.name == "Reverse CDS")
        .unwrap();
    assert_eq!(
        (reverse.start, reverse.end, reverse.strand),
        (6, 10, Strand::Reverse)
    );
    assert_eq!(linear_record.primers.len(), 1);
    assert_eq!(linear_record.primers[0].name, "Demo primer");
    assert_eq!(linear_record.primers[0].sequence, "AAGT");
    assert_eq!(
        (linear_record.primers[0].start, linear_record.primers[0].end),
        (0, 4)
    );
    assert_eq!(linear_record.primers[0].mismatches, vec![1]);

    let circular_records =
        list_all_sequences_internal(circular.to_string_lossy().into_owned()).unwrap();
    assert_eq!(circular_records.len(), 1);
    assert_eq!(circular_records[0].topology, Topology::Circular);
    for (name, strand) in [
        ("Origin forward", Strand::Forward),
        ("Origin reverse", Strand::Reverse),
    ] {
        let feature = circular_records[0]
            .annotations
            .iter()
            .find(|feature| feature.name == name)
            .unwrap();
        assert_eq!((feature.start, feature.end, feature.strand), (9, 3, strand));
    }

    let fasta_records =
        list_all_sequences_internal(multi_fasta.to_string_lossy().into_owned()).unwrap();
    assert_eq!(fasta_records.len(), 2);
    assert_eq!(fasta_records[0].id, "record_one");
    assert_eq!(
        fasta_records[0].description.as_deref(),
        Some("Synthetic first record")
    );
    assert_eq!(fasta_records[0].sequence, "ACGTACGT");
    assert_eq!(fasta_records[1].id, "record_two");
    assert_eq!(fasta_records[1].sequence, "GGCCTTAA");

    let empty_result = std::panic::catch_unwind(|| {
        list_all_sequences_internal(empty_fasta.to_string_lossy().into_owned())
    });
    assert!(empty_result.is_ok(), "empty FASTA must not panic");
    assert!(
        empty_result.unwrap().is_err(),
        "empty FASTA must return an error"
    );
    for (label, path) in [
        ("malformed feature location", &malformed),
        ("out-of-range feature", &invalid_coordinates),
        ("malformed qualifier", &invalid_qualifier),
        ("truncated GenBank record", &truncated_genbank),
    ] {
        let result = std::panic::catch_unwind(|| {
            list_all_sequences_internal(path.to_string_lossy().into_owned())
        });
        assert!(result.is_ok(), "{label} must not panic");
        assert!(result.unwrap().is_err(), "{label} must return an error");
    }

    // Artificial stress record: 10,000 distinct, valid features on a synthetic sequence.
    let stress_path = fixture_path("many-features.gbk");
    let sequence = "ACGT".repeat(5_000);
    let annotations = (0..10_000)
        .map(|index| Annotation {
            id: format!("synthetic-{index}"),
            name: format!("Synthetic feature {index}"),
            feature_type: "misc_feature".into(),
            start: index * 2,
            end: index * 2 + 1,
            strand: if index % 2 == 0 {
                Strand::Forward
            } else {
                Strand::Reverse
            },
            color: None,
            display_shape: Some(DisplayShape::Rect),
        })
        .collect();
    export_gbk(
        stress_path.to_string_lossy().into_owned(),
        sequence.clone(),
        annotations,
        Vec::new(),
        Topology::Linear,
    )
    .unwrap();
    let stress_records =
        list_all_sequences_internal(stress_path.to_string_lossy().into_owned()).unwrap();
    assert_eq!(stress_records[0].sequence, sequence);
    assert_eq!(stress_records[0].annotations.len(), 10_000);

    for path in [
        linear,
        circular,
        multi_fasta,
        empty_fasta,
        malformed,
        invalid_coordinates,
        invalid_qualifier,
        truncated_genbank,
        stress_path,
    ] {
        let _ = std::fs::remove_file(path);
    }
}

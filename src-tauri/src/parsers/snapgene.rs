//! 学習メモ: SnapGene DNAファイル内のバイナリパケット、feature、primerを解析する。
//! 処理の位置づけ: commandsまたはparsers/mod.rsから呼ばれ、外部ファイルとSequenceDataを相互変換する。

use crate::error::AppError;
use crate::models::{Annotation, DisplayShape, SequenceData, Strand, Topology};
use crate::utils::clean_sequence;
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use std::collections::HashSet;

pub fn parse_snapgene_dna(path: &str, data: Vec<u8>) -> Result<Vec<SequenceData>, AppError> {
    let mut pos = 0;
    let mut sequence = String::new();
    let mut all_annotations = Vec::new();
    let mut all_primers = Vec::new();
    let mut sequence_found = false;
    let mut topology = Topology::Linear;
    let mut enzymes = None;
    let mut enzyme_settings = None;

    while pos + 5 <= data.len() {
        let tag = data[pos];
        let len_bytes = &data[pos + 1..pos + 5];
        let len =
            u32::from_be_bytes([len_bytes[0], len_bytes[1], len_bytes[2], len_bytes[3]]) as usize;
        let next_pos = pos
            .checked_add(5)
            .and_then(|value| value.checked_add(len))
            .ok_or_else(|| AppError::Parser("SnapGene packet length overflow".to_string()))?;

        if next_pos > data.len() {
            break;
        }

        let segment = &data[pos + 5..next_pos];

        match tag {
            0 if !sequence_found => {
                if !segment.is_empty() {
                    topology = if segment[0] & 0x01 != 0 {
                        Topology::Circular
                    } else {
                        Topology::Linear
                    };
                    let raw_seq = String::from_utf8_lossy(&segment[1..]);
                    sequence = clean_sequence(&raw_seq);
                    sequence_found = true;
                }
            }
            3 => {
                let raw_enz = String::from_utf8_lossy(segment);
                let list: Vec<String> = raw_enz
                    .split(',')
                    .map(|s| s.trim_matches(|c: char| !c.is_alphanumeric()).to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                if !list.is_empty() {
                    enzymes = Some(list);
                }
            }
            5 => {
                if segment.starts_with(b"<?xml") || segment.starts_with(b"<Primers") {
                    if let Ok(primers) = parse_snapgene_primers_xml(segment) {
                        all_primers.extend(primers);
                    }
                }
            }
            13 => {
                enzyme_settings = Some(segment.to_vec());
            }
            2 | 6 | 10 => {
                if segment.starts_with(b"<?xml") || segment.starts_with(b"<Features") {
                    if let Ok(anns) = parse_snapgene_features_xml(segment) {
                        all_annotations.extend(anns);
                    }
                }
            }
            _ => {}
        }

        pos = next_pos;
    }

    if sequence.is_empty() {
        return Err(AppError::Parser(
            "No DNA sequence found in .dna file".to_string(),
        ));
    }

    // Deduplicate and process annotations
    let mut seen = HashSet::new();
    let mut unique_annotations = Vec::new();
    for ann in all_annotations {
        if ann.start == 0 && ann.end == 0 {
            continue;
        }
        let key = (ann.name.clone(), ann.start, ann.end, ann.strand);
        if !seen.contains(&key) {
            seen.insert(key);
            unique_annotations.push(ann);
        }
    }

    unique_annotations.sort_by_key(|a| a.start);

    let annotations_output: Vec<Annotation> = unique_annotations
        .into_iter()
        .enumerate()
        .map(|(i, mut ann)| {
            ann.id = format!("sg-{}", i);
            ann
        })
        .collect();

    let file_name = std::path::Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("SnapGene Sequence");

    let mut record = SequenceData {
        id: file_name.to_string(),
        description: Some("Imported from .dna".to_string()),
        sequence,
        annotations: annotations_output,
        primers: all_primers,
        topology,
        trace: None,
        enzymes,
        enzyme_settings,
        alignment_results: None,
        debug_hex: None,
        file_path: Some(path.to_string()),
    };

    // Validate untrusted packet coordinates before primer analysis performs any slicing.
    crate::validation::validate_sequence_data(&record)?;

    // SnapGene stores binding positions, but mismatch indexes are derived data.
    crate::algorithms::primer::reanalyze_all_primers(&record.sequence, &mut record.primers);
    crate::validation::validate_sequence_data(&record)?;

    Ok(vec![record])
}

fn parse_snapgene_features_xml(xml_data: &[u8]) -> Result<Vec<Annotation>, AppError> {
    let mut reader = Reader::from_reader(xml_data);
    let mut annotations = Vec::new();
    let mut current_ann: Option<Annotation> = None;
    let mut buf = Vec::new();

    while let Ok(event) = reader.read_event_into(&mut buf) {
        let is_empty = matches!(event, Event::Empty(_));
        if let Event::Start(ref e) | Event::Empty(ref e) = event {
            let tag_name = e.name();
            match tag_name.as_ref() {
                b"Feature" => {
                    let mut name = "unnamed".to_string();
                    let mut ftype = "misc_feature".to_string();
                    let mut strand = Strand::Forward;
                    for attr in e.attributes().flatten() {
                        match attr.key.as_ref() {
                            b"name" | b"label" => {
                                name = String::from_utf8_lossy(&attr.value).to_string()
                            }
                            b"type" => ftype = String::from_utf8_lossy(&attr.value).to_string(),
                            b"direction" | b"directionality" => {
                                if attr.value.as_ref() == b"reverse" || attr.value.as_ref() == b"2"
                                {
                                    strand = Strand::Reverse;
                                }
                            }
                            _ => {}
                        }
                    }

                    current_ann = Some(Annotation {
                        id: String::new(),
                        name,
                        feature_type: ftype,
                        start: 0,
                        end: 0,
                        strand,
                        color: Some("#8b5cf6".to_string()),
                        display_shape: Some(DisplayShape::Arrow),
                    });

                    if is_empty {
                        if let Some(ann) = current_ann.take() {
                            annotations.push(ann);
                        }
                    }
                }
                b"Segment" => {
                    if let Some(ref mut ann) = current_ann {
                        for attr in e.attributes().flatten() {
                            match attr.key.as_ref() {
                                b"range" | b"rangeString" => {
                                    let range_str = String::from_utf8_lossy(&attr.value);
                                    let parts: Vec<&str> = if range_str.contains('-') {
                                        range_str.split('-').collect()
                                    } else {
                                        range_str.split("..").collect()
                                    };
                                    if parts.len() == 2 {
                                        let mut s = parts[0].parse::<usize>().unwrap_or(1);
                                        let mut e = parts[1].parse::<usize>().unwrap_or(1);
                                        if s > e {
                                            std::mem::swap(&mut s, &mut e);
                                        }
                                        let normalized_start = s.saturating_sub(1);
                                        let normalized_end = e;
                                        if ann.start == 0 && ann.end == 0 {
                                            ann.start = normalized_start;
                                            ann.end = normalized_end;
                                        } else {
                                            ann.start = ann.start.min(normalized_start);
                                            ann.end = ann.end.max(normalized_end);
                                        }
                                    }
                                }
                                b"color" => {
                                    ann.color =
                                        Some(String::from_utf8_lossy(&attr.value).to_string())
                                }
                                _ => {}
                            }
                        }
                    }
                }
                _ => {}
            }
        } else if let Event::End(ref e) = event {
            if e.name().as_ref() == b"Feature" {
                if let Some(ann) = current_ann.take() {
                    annotations.push(ann);
                }
            }
        } else if let Event::Eof = event {
            break;
        }
        buf.clear();
    }
    Ok(annotations)
}

fn parse_snapgene_primers_xml(xml_data: &[u8]) -> Result<Vec<crate::models::Primer>, AppError> {
    let mut reader = Reader::from_reader(xml_data);
    let mut primers = Vec::new();
    let mut current_primer: Option<crate::models::Primer> = None;
    let mut buf = Vec::new();

    while let Ok(event) = reader.read_event_into(&mut buf) {
        if let Event::Start(ref e) | Event::Empty(ref e) = event {
            match e.name().as_ref() {
                b"Primer" => {
                    let mut name = "unnamed".to_string();
                    let mut sequence = String::new();
                    for attr in e.attributes().flatten() {
                        match attr.key.as_ref() {
                            b"name" => name = String::from_utf8_lossy(&attr.value).to_string(),
                            b"sequence" => {
                                sequence = clean_sequence(&String::from_utf8_lossy(&attr.value))
                            }
                            _ => {}
                        }
                    }
                    current_primer = Some(crate::models::Primer {
                        id: String::new(),
                        name,
                        sequence,
                        start: 0,
                        end: 0,
                        strand: Strand::Forward,
                        tail_5: String::new(),
                        tail_3: String::new(),
                        color: Some("#ec4899".to_string()),
                        mismatches: Vec::new(),
                    });
                }
                b"BindingSite" => {
                    if let Some(ref mut p) = current_primer {
                        for attr in e.attributes().flatten() {
                            match attr.key.as_ref() {
                                b"location" => {
                                    let loc = String::from_utf8_lossy(&attr.value);
                                    if let Some((s_str, e_str)) = loc.split_once('-') {
                                        let s = s_str.parse::<usize>().unwrap_or(1);
                                        let e = e_str.parse::<usize>().unwrap_or(1);
                                        p.start = s;
                                        p.end = e + 1;
                                    }
                                }
                                b"boundStrand" => {
                                    if attr.value.as_ref() == b"1" {
                                        p.strand = Strand::Reverse;
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                }
                b"Component" => {
                    if let Some(ref mut p) = current_primer {
                        let mut hybridized = false;
                        let mut bases = String::new();
                        for attr in e.attributes().flatten() {
                            match attr.key.as_ref() {
                                b"hybridizedRange" => hybridized = true,
                                b"bases" => {
                                    bases = String::from_utf8_lossy(&attr.value).to_string()
                                }
                                _ => {}
                            }
                        }
                        if !hybridized && !bases.is_empty() {
                            let clean_bases = clean_sequence(&bases);
                            // This is a tail. Check if it's 5' or 3'.
                            if p.sequence.starts_with(&clean_bases) {
                                p.tail_5 = clean_bases;
                            } else if p.sequence.ends_with(&clean_bases) {
                                p.tail_3 = clean_bases;
                            }
                        }
                    }
                }
                _ => {}
            }
        } else if let Event::End(ref e) = event {
            if e.name().as_ref() == b"Primer" {
                if let Some(mut p) = current_primer.take() {
                    p.id = format!("primer-{}", primers.len());
                    primers.push(p);
                }
            }
        } else if let Event::Eof = event {
            break;
        }
        buf.clear();
    }
    Ok(primers)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn packet(tag: u8, payload: &[u8]) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(payload.len() + 5);
        bytes.push(tag);
        bytes.extend_from_slice(&(payload.len() as u32).to_be_bytes());
        bytes.extend_from_slice(payload);
        bytes
    }

    #[test]
    fn malformed_and_truncated_packets_return_errors_without_panicking() {
        let mut valid = packet(0, b"\x01ACGTACGT");
        valid.extend(packet(
            5,
            br#"<Primers><Primer name="outside" sequence="ACGT"><BindingSite location="20-24"/></Primer></Primers>"#,
        ));

        let invalid_coordinate = std::panic::catch_unwind(|| {
            parse_snapgene_dna("malformed.dna", valid.clone())
        });
        assert!(invalid_coordinate.is_ok());
        assert!(invalid_coordinate.unwrap().is_err());

        for end in 0..valid.len() {
            let truncated = valid[..end].to_vec();
            assert!(
                std::panic::catch_unwind(|| parse_snapgene_dna("truncated.dna", truncated))
                    .is_ok(),
                "parser panicked for a file truncated at byte {end}"
            );
        }
    }

    #[test]
    #[ignore = "requires GREENPEAS_DNA_FIXTURE pointing to a local .dna file"]
    fn audit_local_snapgene_fixture_invariants() {
        let path = std::env::var("GREENPEAS_DNA_FIXTURE")
            .expect("Set GREENPEAS_DNA_FIXTURE to a local .dna file");
        let data = fs::read(&path).expect("Failed to read local .dna fixture");
        let parsed = parse_snapgene_dna(&path, data).expect("Failed to parse local .dna fixture");
        assert_eq!(parsed.len(), 1, "A .dna fixture should contain one sequence");

        let record = &parsed[0];
        let sequence_len = record.sequence.len();
        assert!(sequence_len > 0, "Parsed sequence is empty");
        assert!(
            record.sequence.bytes().all(|base| base.is_ascii_alphabetic()),
            "Parsed sequence contains non-alphabetic characters"
        );

        for annotation in &record.annotations {
            assert!(annotation.start < annotation.end, "Feature has an empty or reversed range: {}", annotation.name);
            assert!(annotation.end <= sequence_len, "Feature is outside the sequence: {}", annotation.name);
        }
        for primer in &record.primers {
            assert!(primer.start < primer.end, "Primer has an empty or reversed range: {}", primer.name);
            assert!(primer.end <= sequence_len, "Primer is outside the sequence: {}", primer.name);
            assert!(!primer.sequence.is_empty(), "Primer has no sequence: {}", primer.name);
            assert!(
                primer.mismatches.iter().all(|&position| position < primer.sequence.len()),
                "Primer mismatch index is outside the primer sequence: {}",
                primer.name
            );
        }

        println!(
            "Local .dna audit passed: length={} features={} primers={} primer_mismatches={} topology={:?}",
            sequence_len,
            record.annotations.len(),
            record.primers.len(),
            record.primers.iter().map(|primer| primer.mismatches.len()).sum::<usize>(),
            record.topology
        );
    }

    #[test]
    fn truncated_snapgene_packets_do_not_panic() {
        let truncated = vec![0, 0, 0, 0, 32, b'A', b'T'];
        let result = parse_snapgene_dna("truncated.dna", truncated);
        assert!(result.is_err());
    }

    #[test]
    fn reads_topology_from_the_dna_packet_flags() {
        fn dna_packet(flags: u8) -> Vec<u8> {
            let payload = [flags, b'A', b'T', b'G', b'C'];
            let mut packet = vec![0];
            packet.extend_from_slice(&(payload.len() as u32).to_be_bytes());
            packet.extend_from_slice(&payload);
            packet
        }

        let circular = parse_snapgene_dna("circular.dna", dna_packet(0x01)).unwrap();
        let linear = parse_snapgene_dna("linear.dna", dna_packet(0x00)).unwrap();
        assert_eq!(circular[0].topology, Topology::Circular);
        assert_eq!(linear[0].topology, Topology::Linear);
    }
}

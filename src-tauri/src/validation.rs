//! Sequence integrity checks shared by import, editing, and export boundaries.

use crate::error::AppError;
use crate::models::{Annotation, Primer, SequenceData, Topology};

pub fn validate_sequence_data(data: &SequenceData) -> Result<(), AppError> {
    validate_sequence_parts(
        &data.sequence,
        &data.annotations,
        &data.primers,
        &data.topology,
    )
}

pub fn validate_sequence_parts(
    sequence: &str,
    annotations: &[Annotation],
    primers: &[Primer],
    topology: &Topology,
) -> Result<(), AppError> {
    validate_dna_sequence(sequence)?;
    let sequence_len = sequence.len();

    for annotation in annotations {
        validate_range(
            "feature",
            &annotation.name,
            annotation.start,
            annotation.end,
            sequence_len,
            topology,
        )?;
    }

    for primer in primers {
        validate_range(
            "primer",
            &primer.name,
            primer.start,
            primer.end,
            sequence_len,
            topology,
        )?;
        validate_dna_sequence(&primer.sequence).map_err(|error| {
            AppError::Parser(format!(
                "Primer '{}' has an invalid sequence: {error}",
                primer.name
            ))
        })?;
        if let Some(position) = primer
            .mismatches
            .iter()
            .find(|&&position| position >= primer.sequence.len())
        {
            return Err(AppError::Parser(format!(
                "Primer '{}' has an out-of-range mismatch index {} for a {} bp sequence",
                primer.name,
                position,
                primer.sequence.len()
            )));
        }
    }

    Ok(())
}

pub fn validate_dna_sequence(sequence: &str) -> Result<(), AppError> {
    if let Some((index, base)) = sequence.char_indices().find(|(_, base)| {
        !matches!(
            base.to_ascii_uppercase(),
            'A' | 'T' | 'C' | 'G' | 'N' | 'R' | 'Y' | 'W' | 'S' | 'K' | 'M' | 'B' | 'D' | 'H' | 'V'
        )
    }) {
        return Err(AppError::Parser(format!(
            "Invalid DNA base '{}' at byte position {}",
            base, index
        )));
    }
    Ok(())
}

fn validate_range(
    kind: &str,
    name: &str,
    start: usize,
    end: usize,
    sequence_len: usize,
    topology: &Topology,
) -> Result<(), AppError> {
    if sequence_len == 0 {
        return Err(AppError::Parser(format!(
            "{} '{}' cannot be placed on an empty sequence",
            kind, name
        )));
    }
    if start >= sequence_len || end > sequence_len {
        return Err(AppError::Parser(format!(
            "{} '{}' range {}..{} is outside the {} bp sequence",
            kind, name, start, end, sequence_len
        )));
    }
    if start == end {
        return Err(AppError::Parser(format!(
            "{} '{}' has an empty range at {}",
            kind, name, start
        )));
    }
    if matches!(topology, Topology::Linear) && start > end {
        return Err(AppError::Parser(format!(
            "Linear {} '{}' has a reversed range {}..{}",
            kind, name, start, end
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{DisplayShape, Strand};

    fn annotation(start: usize, end: usize) -> Annotation {
        Annotation {
            id: "feature-1".to_string(),
            name: "feature".to_string(),
            feature_type: "misc_feature".to_string(),
            start,
            end,
            strand: Strand::Forward,
            color: None,
            display_shape: Some(DisplayShape::Arrow),
        }
    }

    #[test]
    fn accepts_linear_and_origin_spanning_circular_ranges() {
        assert!(
            validate_sequence_parts("ACGTACGT", &[annotation(1, 7)], &[], &Topology::Linear)
                .is_ok()
        );
        assert!(
            validate_sequence_parts("ACGTACGT", &[annotation(6, 2)], &[], &Topology::Circular)
                .is_ok()
        );
    }

    #[test]
    fn rejects_reversed_linear_empty_and_out_of_bounds_ranges() {
        assert!(
            validate_sequence_parts("ACGTACGT", &[annotation(6, 2)], &[], &Topology::Linear)
                .is_err()
        );
        assert!(
            validate_sequence_parts("ACGTACGT", &[annotation(2, 2)], &[], &Topology::Circular)
                .is_err()
        );
        assert!(
            validate_sequence_parts("ACGTACGT", &[annotation(1, 9)], &[], &Topology::Linear)
                .is_err()
        );
    }

    #[test]
    fn rejects_invalid_dna_bases() {
        let error = validate_dna_sequence("ACGT-X").unwrap_err().to_string();
        assert!(error.contains("Invalid DNA base '-'"));
    }
}

These fixtures are synthetic test records written for GreenPeas.
They contain no personal, unpublished, or third-party sequence data.
The .txt suffix keeps the examples visible despite repository-wide ignores
for user GenBank and FASTA files. Tests copy each fixture to a temporary path
with its real extension before parsing it.

cds_fusion_path.gp is a GreenPeas JSON document with proteinA, linker, and tag
annotations in one forward reading frame. Its TAA stop codon is inside the tag.

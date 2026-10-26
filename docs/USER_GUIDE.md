# GreenPeas user guide

[日本語版](USER_GUIDE_ja.md) · [README](../README.md)

GreenPeas is a desktop workspace for viewing and editing DNA sequences, inspecting annotations and restriction sites, comparing sequencing reads, and preparing cloning edits. The controls in the current beta are labeled in English.

## Get started

1. Download the build for your platform from the [official Releases page](https://github.com/ryuabiru/GreenPeas/releases). The Windows `x64` release provides an NSIS `-setup.exe` and an MSI installer. Both install the same app; the setup EXE is the straightforward choice for an individual user.
2. Open GreenPeas. Choose **Open Sequence File** or **Open** in the sidebar to load a file, or choose **New Sequence** / **New** to create one. You can also drop supported files into the window.
3. Choose an entry in the **Sequences** sidebar. Use the **Sequence** and **Map** tabs to inspect it. The **Alignment** tab appears when the current sequence has alignment results.
4. Use **Save** to save the working sequence. A new sequence asks for a file location. Use **Export…** to create a copy in a particular format.

Files stay on your computer; the beta does not upload sequences. Keep a separate copy of important lab data.

## File formats and saving

| Format | Open | Save or export | Notes |
| --- | --- | --- | --- |
| GreenPeas `.gp` | Yes | Yes | Keeps complete GreenPeas workspace data, including alignment and trace data. Best for continued work. |
| GenBank `.gb`, `.gbk` | Yes | Yes | Keeps the sequence, features, primers, and topology. |
| FASTA `.fa`, `.fasta` | Yes | Yes | Sequence only; annotations and primers are not included. |
| SnapGene `.dna` | Yes | No | Open the file, then use **Save As…** or **Export…** to make a GreenPeas or GenBank copy. |
| ABI trace `.ab1` | Yes | No | Trace data can be viewed alongside alignments. Save as `.gp` to retain GreenPeas trace data. |

**Save** keeps the current working file format when it can preserve the data. If the sequence contains data that format cannot hold, GreenPeas asks for a format that can. **Export… → Export GenBank** writes sequence, features, and primers; **Export FASTA** writes sequence only; **Export GreenPeas copy** writes the full GreenPeas data. Exporting a copy does not replace your working file. Avoid saving over the only copy of an imported file.

## Read and edit a sequence

- **Sequence** shows bases with feature, primer, and restriction-site tracks. Select a range to see its position, length, and estimated Tm in the header. Use the toolbar or right-click menu to copy, cut, delete, or reverse-complement a selection.
- **Map** shows a graphical overview with annotations, primers, and restriction sites. Click a feature or primer to select it; double-click to edit it. The map layout follows the **Linear** or **Circular** topology setting above the viewer.
- Use **Topology: Linear / Circular** to change the sequence topology. The **Enzyme Filter** limits visible restriction sites by how often an enzyme cuts.
- Use **Search** or `Ctrl+F` on Windows (`Cmd+F` on macOS) to find DNA or protein sequence. Switch between **DNA** and **Protein**, then use the arrows or Enter to move through matches.
- **Paste** inserts sequence at the current selection. The adjacent menu offers **Paste as RC** for reverse-complement paste. Edits show a confirmation preview; **Undo** and **Redo** are available.

## Annotate and inspect primers

Select bases in **Sequence**, then choose **Add Feature**. Enter a name, coordinates, feature type, strand/shape, and color. Click an existing feature and open its editor to update or delete it. Features are visible in the sequence and map views.

Use **Primers → Register Primer…** or right-click and choose **Register Primer**. Enter the primer name and 5′→3′ sequence, choose forward or reverse, and review the binding preview before saving. The preview reports binding position, mismatches, and tails when available. Double-click a primer in the map to edit it.

## Restriction enzymes and cloning

Open **Enzymes → Manage Enzymes…** to browse the **Master Library**, create **Enzyme Sets**, or use **Register New** for a custom enzyme. The Enzymes menu also has **Import SnapGene List…**. Restriction sites are shown in the sequence and map views; use **Enzyme Filter** to reduce clutter.

For fragment work, start the selection at a restriction-site marker in **Sequence**, extend it to the desired end, then use **Cut** / **Copy DNA**. A selection started at an enzyme marker carries fragment information; an ordinary base selection copies DNA text. When pasting the biological fragment into a target sequence, GreenPeas can show a **Smart Ligation Preview** with the fragment ends and a warning if they are incompatible. Review that preview before choosing **Apply Ligation**. Ordinary sequence paste remains available for text edits. Save a `.gp` copy before an involved cloning workflow so you can preserve GreenPeas-specific data.

## Compare sequencing reads

Open the reference sequence, then choose **Run Alignment** and select one or more sample files. GreenPeas accepts the supported sequence formats listed above, including `.ab1`. Successful matches appear in **Alignment**, where you can inspect differences and AB1 traces. With alignment results open, use **Add Alignment Sample** to add further files. If a sample does not align, GreenPeas reports it rather than adding an empty track. Save as `.gp` to retain the alignment and trace data.

The repository includes [synthetic alignment samples](../test-data/alignment-samples) for trying this workflow.

## Windows shortcuts

| Action | Shortcut |
| --- | --- |
| New / Open / Save | `Ctrl+N` / `Ctrl+O` / `Ctrl+S` |
| Open in a new window | `Ctrl+Shift+O` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Copy / Paste / Paste as reverse complement | `Ctrl+C` / `Ctrl+V` / `Ctrl+Shift+V` |
| Copy selected DNA as amino acids | `Ctrl+Shift+C` |
| Search | `Ctrl+F` |
| Sequence / Map / Alignment | `Ctrl+1` / `Ctrl+2` / `Ctrl+3` |
| Register primer / Manage enzymes | `Ctrl+Shift+P` / `Ctrl+E` |

On macOS, use `Cmd` in place of `Ctrl`. Menus show the shortcuts available on your platform.

## Appearance, help, and feedback

The sun/moon button at the top of the sidebar switches between light and dark themes. The sidebar **Settings** button opens display preferences. **Help → About GreenPeas** shows app information.

To report a problem, use the sidebar bug-report button or [GitHub Issues](https://github.com/ryuabiru/GreenPeas/issues). The app prepares a draft; it does not submit the issue automatically. Review it before posting and remove any DNA sequence, local path, or personal data. Use the [private security reporting instructions](../SECURITY.md) for vulnerabilities.

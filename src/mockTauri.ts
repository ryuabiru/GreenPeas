/**
 * 学習メモ: 通常ブラウザでも画面を試せるように、Tauri invokeコマンドをメモリ上で模擬する。
 * 処理の位置づけ: アプリ内の他モジュールから参照され、担当する値または処理を提供する。
 */

import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { SequenceData, RestrictionSite } from "./types";
import { translateDna } from "./utils/translationUtils";

// In-memory mock database
const mockDatabase: Record<string, SequenceData> = {};
let mockSidebarDrag: { id: string; sourceWindowId: string; path: string; consumed: boolean } | null = null;

const COMMON_ENZYMES = [
    { name: "EcoRI", site: "GAATTC" },
    { name: "BamHI", site: "GGATCC" },
    { name: "HindIII", site: "AAGCTT" }
];

function findRestrictionSitesMock(sequence: string): RestrictionSite[] {
    const sites: RestrictionSite[] = [];
    const seqUpper = sequence.toUpperCase();
    
    for (const enz of COMMON_ENZYMES) {
        let pos = seqUpper.indexOf(enz.site);
        while (pos !== -1) {
            sites.push({
                name: enz.name,
                position: pos,
                site: enz.site,
                cut_after_top: pos + 1,
                cut_after_bottom: pos + 5,
                topCutOffset: 1,
                bottomCutOffset: 5,
                methylation_sensitivity: null
            });
            pos = seqUpper.indexOf(enz.site, pos + 1);
        }
    }
    return sites;
}

export function initializeTauriMocks() {
    console.log("🛠️ Initializing browser-only Tauri mock server...");
    
    mockIPC((cmd, args: any) => {
        console.log(`[Tauri IPC Mock] Command: ${cmd}`, args);
        
        switch (cmd) {
            case "get_pending_files":
                return [];
                
            case "open_sequence_session": {
                // If opening a file in browser mock, create a dummy sequence
                const id = `seq_${Math.random().toString(36).substring(2, 9)}`;
                mockDatabase[id] = {
                    id,
                    sequence: "ATGCGATCGATCGATCGATCGATCGAATTCGGATCCAAGCTTATCGATCGATCGATCGATC",
                    topology: "Linear",
                    annotations: [
                        {
                            id: "ann_1",
                            name: "Mock Gene",
                            type: "CDS",
                            start: 5,
                            end: 25,
                            strand: "Forward",
                            color: "#10b981",
                            display_shape: null
                        }
                    ],
                    primers: [],
                    description: "Loaded via mock browser session",
                    alignmentResults: [],
                    trace: null,
                    enzymes: [],
                    enzymeSettings: [],
                    debug_hex: null,
                    file_path: args.path
                };
                return [id];
            }

            case "open_paths_in_new_window":
                return null;

            case "begin_sidebar_drag":
                mockSidebarDrag = {
                    id: args.id,
                    sourceWindowId: args.sourceWindowId,
                    path: args.path,
                    consumed: false
                };
                return null;

            case "take_sidebar_drag_path":
                if (!mockSidebarDrag) return null;
                if (mockSidebarDrag.sourceWindowId === args.targetWindowId) return null;
                mockSidebarDrag.consumed = true;
                return mockSidebarDrag.path;

            case "finish_sidebar_drag": {
                if (!mockSidebarDrag || mockSidebarDrag.id !== args.id) return false;
                const consumed = mockSidebarDrag.consumed;
                mockSidebarDrag = null;
                return consumed;
            }

            case "drop_sidebar_drag_at_screen_position":
                return false;
                
            case "get_sequence_metadata": {
                const id = args.id;
                return mockDatabase[id] || null;
            }
                
            case "get_sequence_view_data": {
                const { id, start, end } = args;
                const seq = mockDatabase[id];
                if (!seq) return null;
                
                const bases = seq.sequence.substring(start, end);
                const annotations = seq.annotations.filter(ann => {
                    const s = Math.min(ann.start, ann.end);
                    const e = Math.max(ann.start, ann.end);
                    return s < end && e > start;
                });
                
                const enzymes = findRestrictionSitesMock(seq.sequence).filter(site => {
                    return site.position >= start && site.position < end;
                });
                
                const primers = seq.primers.filter(p => {
                    const s = Math.min(p.start, p.end);
                    const e = Math.max(p.start, p.end);
                    return s < end && e > start;
                });
                
                return {
                    bases,
                    annotations,
                    enzymes,
                    primers
                };
            }
                
            case "upsert_sequence": {
                const seq = args.sequence;
                mockDatabase[seq.id] = seq;
                emit("sequence-mutated");
                return seq.id;
            }
                
            case "find_restriction_sites": {
                return findRestrictionSitesMock(args.sequence);
            }
                
            case "search_sequence": {
                const { sequence, query } = args;
                const results = [];
                const seqUpper = sequence.toUpperCase();
                const qUpper = query.toUpperCase();
                if (!qUpper) return [];
                
                let pos = seqUpper.indexOf(qUpper);
                while (pos !== -1) {
                    results.push({
                        start: pos,
                        end: pos + qUpper.length,
                        strand: 1
                    });
                    pos = seqUpper.indexOf(qUpper, pos + 1);
                }
                return results;
            }
                
            case "apply_sequence_edit": {
                const { sequenceId, op } = args;
                const seq = mockDatabase[sequenceId];
                if (!seq) return null;
                
                let nextSeq = seq.sequence;
                if (op.type === "insert") {
                    nextSeq = nextSeq.slice(0, op.pos) + op.sequence + nextSeq.slice(op.pos);
                } else if (op.type === "delete") {
                    nextSeq = nextSeq.slice(0, op.pos) + nextSeq.slice(op.pos + op.len);
                } else if (op.type === "replace") {
                    nextSeq = nextSeq.slice(0, op.pos) + op.sequence + nextSeq.slice(op.pos + op.len);
                }
                
                seq.sequence = nextSeq;
                mockDatabase[sequenceId] = seq;
                emit("sequence-mutated");
                return seq;
            }

            case "translate_annotations": {
                const { sequence, annotations } = args;
                return annotations
                    .filter((ann: any) => ann.type === "CDS")
                    .map((ann: any) => {
                        const s = Math.min(ann.start, ann.end);
                        const e = Math.max(ann.start, ann.end);
                        const subSeq = sequence.substring(s, e);
                        let aa = "";
                        if (ann.strand === "Reverse" || ann.strand === -1) {
                            const COMPLEMENT_MAP: Record<string, string> = {
                                A: 'T', T: 'A', G: 'C', C: 'G', N: 'N',
                                a: 't', t: 'a', g: 'c', c: 'g', n: 'n'
                            };
                            const rc = subSeq.split('').reverse().map((c: string) => COMPLEMENT_MAP[c] || c).join('');
                            aa = translateDna(rc);
                        } else {
                            aa = translateDna(subSeq);
                        }
                        return [ann.id, aa];
                    });
            }

            case "translate_dna": {
                const { sequence, frame } = args;
                let seqToTranslate = sequence;
                if (frame < 0) {
                    const COMPLEMENT_MAP: Record<string, string> = {
                        A: 'T', T: 'A', G: 'C', C: 'G', N: 'N',
                        a: 't', t: 'a', g: 'c', c: 'g', n: 'n'
                    };
                    seqToTranslate = sequence.split('').reverse().map((c: string) => COMPLEMENT_MAP[c] || c).join('');
                }
                const offset = frame >= 0 ? frame : -frame - 1;
                return translateDna(seqToTranslate.substring(offset));
            }

            case "get_reverse_complement": {
                const { sequence } = args;
                const COMPLEMENT_MAP: Record<string, string> = {
                    A: 'T', T: 'A', G: 'C', C: 'G', N: 'N',
                    a: 't', t: 'a', g: 'c', c: 'g', n: 'n'
                };
                return sequence.split('').reverse().map((c: string) => COMPLEMENT_MAP[c] || c).join('');
            }

            case "get_sequence_fragment": {
                const { sequenceId, start, end } = args;
                const seq = mockDatabase[sequenceId];
                if (!seq) return "";
                return seq.sequence.substring(start, end);
            }

            case "analyze_primer": {
                const { primerSequence, start, end, strand } = args;
                return {
                    id: `primer_${Date.now()}`,
                    name: `Primer_${primerSequence.length}`,
                    sequence: primerSequence,
                    start,
                    end,
                    strand: strand === "Reverse" ? -1 : 1,
                    tail5: "",
                    tail3: "",
                    color: "#f43f5e",
                    mismatches: []
                };
            }

            case "reanalyze_primers": {
                const { primers } = args;
                return primers;
            }
            
            case "get_enzymes":
                return [];
            
            case "refresh_enzymes":
                return [];

            default:
                // Handle plugin requests
                if (cmd.startsWith("plugin:clipboard")) {
                    if (cmd.endsWith("write_text")) {
                        navigator.clipboard?.writeText(args.text);
                        return true;
                    }
                    if (cmd.endsWith("read_text")) {
                        return navigator.clipboard?.readText() || "";
                    }
                }
                if (cmd.startsWith("plugin:dialog")) {
                    if (cmd.endsWith("open")) {
                        return ["mock_imported_file.fasta"];
                    }
                    if (cmd.endsWith("save")) {
                        return "mock_saved_file.fasta";
                    }
                }
                return null;
        }
    }, { shouldMockEvents: true });
}

/**
 * 学習メモ: フロントエンド固有の共有型と、配列表示で使う寸法定数をまとめる。
 * 処理の位置づけ: アプリ内の他モジュールから参照され、担当する値または処理を提供する。
 */

// API-Derived Types (Generated)
export type { Annotation } from './bindings/Annotation';
export type { Topology } from './bindings/Topology';
export type { Strand } from './bindings/Strand';
export type { DisplayShape } from './bindings/DisplayShape';
export type { ChromTrace } from './bindings/ChromTrace';
export type { SequenceData } from './bindings/SequenceData';
export type { AlignedSeqResult as AlignmentResult } from './bindings/AlignedSeqResult';
export type { RestrictionSite } from './bindings/RestrictionSite';
export type { AppSettings } from './bindings/AppSettings';
export type { Primer } from './bindings/Primer';
export type { AlignmentMode } from './bindings/AlignmentMode';
export type { SequenceViewData } from './bindings/SequenceViewData';

// UI-Only Types (2D Space)
export interface HitBox {
    x: number;
    y: number;
    w: number;
    h: number;
    target: HitTarget;
}

export type HitTarget = 
    | { "Annotation": string } 
    | { "AnnotationAA": string }
    | { "RestrictionSite": [string, number] } 
    | { "Primer": string } 
    | { "Base": number };

export interface RowMetrics {
    height: number;
    offset: number;
    trackY: Record<string, number>;
    seqY: number;
    hitBoxes: HitBox[];
}

export interface FullLayout {
    rows: RowMetrics[];
    totalHeight: number;
}

export interface Selection {
  start: number;
  end: number;
  isFragment?: boolean;
}

export interface SelectionInfo {
  len: number;
  gc: number;
  start: number;
  end: number;
  tm: number;
  active: boolean;
}

export interface AlignmentTrackSettings {
    visible: boolean;
    expanded: boolean;
    hideSeq: boolean;
}

export type AminoAcidTheme = 'none' | 'chemistry' | 'hydrophobicity' | 'taylor';
export interface PendingEdit {
    type: 'insertion' | 'deletion' | 'substitution';
    start: number;
    length: number;
    oldSeq: string;
    newSeq: string;
}

// Constants
export const ROW_HEIGHT = 280;
export const CHAR_WIDTH = 12;
export const INDEX_COLUMN_WIDTH = 40;

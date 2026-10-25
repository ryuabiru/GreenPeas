import { describe, expect, it } from 'vitest';
import type { Annotation } from '../../types';
import { assignAnnotationTracks } from '../annotationTracks';

function feature(id: string, start: number, end: number): Annotation {
    return { id, name: id, type: 'misc_feature', start, end, strand: 'Forward',
        color: null, display_shape: null };
}

describe('annotation tracks', () => {
    it('reuses a lane for adjacent features and separates overlapping ones', () => {
        const tracks = assignAnnotationTracks([
            feature('first', 0, 10), feature('next', 10, 20), feature('overlap', 5, 15)
        ], 'Linear', 100);
        expect(tracks.first).toBe(tracks.next);
        expect(tracks.overlap).not.toBe(tracks.first);
    });

    it('accounts for both pieces of a circular feature crossing the origin', () => {
        const tracks = assignAnnotationTracks([
            feature('wrap', 90, 10), feature('early', 0, 5), feature('middle', 20, 30)
        ], 'Circular', 100);
        expect(tracks.wrap).not.toBe(tracks.early);
        expect(tracks.middle).toBeDefined();
    });
});

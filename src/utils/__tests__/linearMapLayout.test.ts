import { describe, expect, it } from 'vitest';
import type { Annotation, RestrictionSite } from '../../types';
import { buildLinearMapLayout, zoomMapRange, panMapRange } from '../linearMapLayout';

const annotations: Annotation[] = [
    { id: 'feature', name: 'IRES2', type: 'misc_feature', start: 2500, end: 3500,
        strand: 'Forward', color: null, display_shape: 'Arrow' }
];
const sites: RestrictionSite[] = Array.from({ length: 30 }, (_, index) => ({
    name: index === 0 ? 'UniqueSite' : `Common${index}`,
    position: 2500 + index * 3, site: 'AAAA', cut_after_top: 0,
    cut_after_bottom: 0, topCutOffset: 0, bottomCutOffset: 0,
    methylation_sensitivity: null
}));

describe('linear map viewport and detail levels', () => {
    it('zooms around the cursor and clamps panning to the sequence', () => {
        const whole = { start: 0, end: 6800 };
        const zoomed = zoomMapRange(whole, 6800, 0.75, 0.5);
        expect(zoomed).toEqual({ start: 2550, end: 5950 });
        expect(panMapRange(zoomed, 6800, 10000)).toEqual({ start: 3400, end: 6800 });
    });

    it('holds the same position when zooming past the minimum visible span', () => {
        const nearLimit = { start: 400, end: 430 };
        const limit = zoomMapRange(nearLimit, 1000, 0.8, 0.5);
        expect(limit).toEqual({ start: 408, end: 428 });
        expect(zoomMapRange(limit, 1000, 0.8, 0.5)).toBe(limit);
        expect(zoomMapRange(limit, 1000, 0.2, 0.5)).toBe(limit);
    });

    it('keeps all cut positions but reveals more labels and bases as the range narrows', () => {
        const counts = Object.fromEntries(sites.map(site =>
            [site.name, site.name === 'UniqueSite' ? 1 : 5]));
        const whole = buildLinearMapLayout({ start: 0, end: 6800 }, 56, 800,
            annotations, [], sites, counts);
        const local = buildLinearMapLayout({ start: 2480, end: 2580 }, 56, 800,
            annotations, [], sites, counts);

        expect(whole.sites).toHaveLength(30);
        expect(whole.sites.filter(site => site.labelLane !== null).length).toBe(1);
        expect(local.sites.length).toBeGreaterThan(0);
        expect(local.sites.filter(site => site.labelLane !== null).length).toBeGreaterThan(1);
        expect(whole.pixelsPerBase).toBeLessThan(3);
        expect(local.pixelsPerBase).toBeGreaterThan(3);
        expect(local.features[0].width).toBeGreaterThan(whole.features[0].width);
    });

    it('splits a circular feature that crosses the origin in detail view', () => {
        const crossing: Annotation = {
            ...annotations[0], id: 'crossing', start: 950, end: 30
        };
        const layout = buildLinearMapLayout({ start: 0, end: 1000 }, 56, 800,
            [crossing], [], [], {}, null, 'Circular', 1000);
        expect(layout.features).toHaveLength(2);
        expect(layout.features.map(feature => feature.part)).toEqual([1, 0]);
    });
});

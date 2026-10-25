import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, Primer } from '../../types';
import { MapViewer } from '../MapViewer';

beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
        constructor(private callback: ResizeObserverCallback) {}
        observe() {
            this.callback([{ contentRect: { width: 500, height: 500 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
        disconnect() {}
        unobserve() {}
    });
});

describe('map feature and primer display', () => {
    it.each([
        ['', 'Linear'], ['', 'Circular'], ['A', 'Linear'], ['A', 'Circular']
    ] as const)('renders a %s bp %s map without invalid coordinates', (sequence, topology) => {
        const { container } = render(<MapViewer
            sequence={sequence} topology={topology} annotations={[]}
            primers={[]} restrictionSites={[]} excludedEnzymes={[]}
            enzymeCounts={{}} annotationTracks={{}} selection={null}
            onSelectionChange={vi.fn()}
        />);
        expect(container.querySelector('svg')).toBeInTheDocument();
        expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    });

    it('selects a feature that crosses the circular origin', () => {
        const annotation: Annotation = {
            id: 'origin', name: 'Origin crossing', type: 'misc_feature',
            start: 6, end: 2, strand: 'Forward', color: null, display_shape: 'Arrow'
        };
        const onSelectionChange = vi.fn();
        const onSelectAnnotation = vi.fn();
        const { container } = render(<MapViewer
            sequence="ATGCATGC" topology="Circular" annotations={[annotation]}
            primers={[]} restrictionSites={[]} excludedEnzymes={[]}
            enzymeCounts={{}} annotationTracks={{ origin: 0 }} selection={null}
            onSelectionChange={onSelectionChange}
            onSelectAnnotation={onSelectAnnotation}
        />);
        const feature = [...container.querySelectorAll('title')]
            .find(title => title.textContent?.startsWith('Origin crossing'))!.parentElement!;
        fireEvent.click(feature);
        expect(onSelectionChange).toHaveBeenCalledWith({ start: 6, end: 2 });
        expect(onSelectAnnotation).toHaveBeenCalledWith(annotation);
    });

    it('moves from a circular overview to local detail instead of scaling the ring', async () => {
        const { container } = render(<MapViewer
            sequence={'A'.repeat(1000)} topology="Circular" annotations={[]}
            primers={[]} restrictionSites={[]} excludedEnzymes={[]}
            enzymeCounts={{}} annotationTracks={{}} selection={null}
            onSelectionChange={vi.fn()}
        />);
        const circle = container.querySelector('svg')!;
        vi.spyOn(circle, 'getBoundingClientRect').mockReturnValue({
            left: 0, top: 0, width: 500, height: 500
        } as DOMRect);

        fireEvent.wheel(circle, { deltaY: -100, ctrlKey: true, clientX: 250, clientY: 90 });

        await waitFor(() => expect(container.querySelector('button'))
            .toHaveTextContent('Circle overview'));
        fireEvent.click(container.querySelector('button')!);
        expect(container.querySelector('button')?.textContent).not.toBe('Circle overview');
    });

    it('reveals base letters by narrowing the visible range instead of scaling the SVG', async () => {
        const { container } = render(<MapViewer
            sequence={'A'.repeat(1200)} topology="Linear" annotations={[]}
            primers={[]} restrictionSites={[]} excludedEnzymes={[]}
            enzymeCounts={{}} annotationTracks={{}} selection={null}
            onSelectionChange={vi.fn()}
        />);
        const svg = container.querySelector('svg')!;
        const originalViewBox = svg.getAttribute('viewBox');
        expect(container.querySelectorAll('text[font-family="monospace"]')).toHaveLength(0);

        const zoomIn = container.querySelector('button[aria-label="Zoom in"]')!;
        for (let index = 0; index < 9; index++) fireEvent.click(zoomIn);

        await waitFor(() => expect(container.querySelectorAll('text[font-family="monospace"]').length)
            .toBeGreaterThan(0));
        expect(svg.getAttribute('viewBox')).toBe(originalViewBox);
    });

    it('pans in both directions with scroll and zooms only with a modifier', () => {
        const { container, getByTestId } = render(<MapViewer
            sequence={'A'.repeat(1200)} topology="Linear" annotations={[]}
            primers={[]} restrictionSites={[]} excludedEnzymes={[]}
            enzymeCounts={{}} annotationTracks={{}} selection={null}
            onSelectionChange={vi.fn()}
        />);
        const svg = container.querySelector('svg')!;
        const visibleRange = () => {
            const match = getByTestId('map-visible-range').textContent!.match(/([\d,]+)–([\d,]+)/)!;
            return { start: Number(match[1].replace(/,/g, '')),
                end: Number(match[2].replace(/,/g, '')) };
        };

        fireEvent.click(container.querySelector('button[aria-label="Zoom in"]')!);
        const initial = visibleRange();
        fireEvent.wheel(svg, { deltaY: 100, clientX: 250 });
        const right = visibleRange();
        expect(right.start).toBeGreaterThan(initial.start);
        expect(Math.abs((right.end - right.start) - (initial.end - initial.start)))
            .toBeLessThanOrEqual(1);

        fireEvent.wheel(svg, { deltaY: -100, clientX: 250 });
        expect(visibleRange().start).toBeLessThan(right.start);

        fireEvent.wheel(svg, { deltaX: 100, deltaY: 0, clientX: 250 });
        const horizontalRight = visibleRange();
        expect(horizontalRight.start).toBeGreaterThan(initial.start);
        fireEvent.wheel(svg, { deltaX: -100, deltaY: 0, clientX: 250 });
        expect(visibleRange().start).toBeLessThan(horizontalRight.start);

        fireEvent.wheel(svg, { deltaY: -100, ctrlKey: true, clientX: 250 });
        const zoomed = visibleRange();
        expect(zoomed.end - zoomed.start).toBeLessThan(initial.end - initial.start);
        fireEvent.wheel(svg, { deltaY: 100, ctrlKey: true, clientX: 250 });
        const zoomedOut = visibleRange();
        expect(zoomedOut.end - zoomedOut.start).toBeGreaterThan(zoomed.end - zoomed.start);
    });

    it('does not pan when modified scroll continues past maximum zoom', () => {
        const { container, getByTestId } = render(<MapViewer
            sequence={'A'.repeat(1200)} topology="Linear" annotations={[]}
            primers={[]} restrictionSites={[]} excludedEnzymes={[]}
            enzymeCounts={{}} annotationTracks={{}} selection={null}
            onSelectionChange={vi.fn()}
        />);
        const svg = container.querySelector('svg')!;
        for (let index = 0; index < 30; index++) {
            fireEvent.wheel(svg, { deltaY: -100, metaKey: true, clientX: 250 });
        }
        const atLimit = getByTestId('map-visible-range').textContent;
        fireEvent.wheel(svg, { deltaY: -100, metaKey: true, clientX: 250 });
        expect(getByTestId('map-visible-range').textContent).toBe(atLimit);
    });

    it('keeps short annotated features visible and lets the primer list select a binding site', async () => {
        const annotations: Annotation[] = [
            { id: 'protein', name: 'proteinA', type: 'CDS', start: 0, end: 6,
                strand: 'Forward', color: null, display_shape: 'Arrow' },
            { id: 'tag', name: 'tag', type: 'misc_feature', start: 12, end: 18,
                strand: 'Forward', color: null, display_shape: 'Rect' }
        ];
        const primers: Primer[] = [{
            id: 'reverse-primer', name: 'Tag reverse', sequence: 'TTAAGC',
            start: 12, end: 18, strand: 'Reverse', tail5: '', tail3: '',
            color: null, mismatches: [2]
        }];
        const onSelectionChange = vi.fn();
        const onEditPrimer = vi.fn();
        const onSelectAnnotation = vi.fn();
        const { container } = render(<MapViewer
            sequence="ATGGCTGGTGGTGCTTAA" topology="Linear" annotations={annotations}
            primers={primers} restrictionSites={[]} excludedEnzymes={[]}
            enzymeCounts={{}} annotationTracks={{}} selection={null}
            onSelectionChange={onSelectionChange}
            onSelectAnnotation={onSelectAnnotation}
            onEditPrimer={onEditPrimer}
        />);

        await waitFor(() => expect(container.querySelectorAll('title').length).toBeGreaterThan(0));
        expect([...container.querySelectorAll('title')].some(title =>
            title.textContent?.startsWith('tag (misc_feature)'))).toBe(true);
        const feature = [...container.querySelectorAll('title')].find(title =>
            title.textContent?.startsWith('tag (misc_feature)'))!.parentElement!;
        fireEvent.click(feature);
        expect(onSelectAnnotation).toHaveBeenCalledWith(annotations[1]);
        const primer = [...container.querySelectorAll('title')].find(title =>
            title.textContent?.startsWith('Tag reverse'))!.parentElement!;
        expect(primer.querySelector('polygon')).toBeTruthy();
        fireEvent.click(primer);
        expect(onSelectionChange).toHaveBeenCalledWith({ start: 12, end: 18 });
        fireEvent.doubleClick(primer);
        expect(onEditPrimer).toHaveBeenCalledWith(primers[0]);
    });
});

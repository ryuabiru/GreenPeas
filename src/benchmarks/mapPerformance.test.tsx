import { cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import { describe, it, vi } from 'vitest';
import type { Annotation, SequenceData } from '../types';
import { MapViewer } from '../components/MapViewer';
import { useDerivedSequenceData } from '../hooks/useDerivedSequenceData';

// Run explicitly with GREENPEAS_UI_PERF=1 npx vitest run src/benchmarks/mapPerformance.test.tsx.
// jsdom timings are a rendering proxy; native WebView interaction needs separate measurement.
describe.runIf(process.env.GREENPEAS_UI_PERF === '1')('large map rendering', () => {
    vi.stubGlobal('ResizeObserver', class {
        constructor(private callback: ResizeObserverCallback) {}
        observe() {
            this.callback([{ contentRect: { width: 800, height: 600 } } as ResizeObserverEntry],
                this as unknown as ResizeObserver);
        }
        disconnect() {}
        unobserve() {}
    });

    for (const [length, featureCount] of [[100_000, 100], [1_000_000, 1_000], [5_000_000, 10_000]]) {
        it(`${length} bp and ${featureCount} features`, () => {
            const sequence = 'ATGC'.repeat(length / 4);
            const annotations: Annotation[] = Array.from({ length: featureCount }, (_, index) => {
                const start = Math.floor(index * length / featureCount);
                return {
                    id: `feature-${index}`, name: `feature-${index}`, type: 'misc_feature',
                    start, end: Math.min(length, start + 60), strand: 'Forward',
                    color: null, display_shape: null
                };
            });
            const document: SequenceData = {
                id: 'benchmark', description: null, sequence, annotations, primers: [],
                topology: 'Linear', trace: null, enzymes: null, enzymeSettings: null,
                alignmentResults: null, debug_hex: null, file_path: null
            };
            const derivedStarted = performance.now();
            const derived = renderHook(() => useDerivedSequenceData(document, null, []));
            console.log(JSON.stringify({ length, featureCount, stage: 'derivedData',
                elapsedMs: Math.round(performance.now() - derivedStarted) }));
            derived.unmount();
            for (const topology of ['Linear', 'Circular'] as const) {
                const started = performance.now();
                const { container } = render(<MapViewer
                    sequence={sequence} topology={topology} annotations={annotations}
                    primers={[]} restrictionSites={[]} excludedEnzymes={[]}
                    enzymeCounts={{}} annotationTracks={{}} selection={null}
                    onSelectionChange={vi.fn()}
                />);
                const initialMs = performance.now() - started;
                const svgNodes = container.querySelectorAll('svg *').length;
                let interactionMs = 0;
                let maxNavigationMs = 0;
                if (topology === 'Linear') {
                    const button = container.querySelector('button[aria-label="Zoom in"]')!;
                    const interactionStart = performance.now();
                    fireEvent.click(button);
                    interactionMs = performance.now() - interactionStart;
                    if (length === 5_000_000) {
                        for (let index = 0; index < 4; index++) {
                            const started = performance.now();
                            fireEvent.click(button);
                            maxNavigationMs = Math.max(maxNavigationMs, performance.now() - started);
                        }
                        const svg = container.querySelector('svg')!;
                        for (let index = 0; index < 10; index++) {
                            const started = performance.now();
                            fireEvent.wheel(svg, { deltaY: 100, clientX: 250 });
                            maxNavigationMs = Math.max(maxNavigationMs, performance.now() - started);
                        }
                    }
                }
                console.log(JSON.stringify({ length, featureCount, topology,
                    initialMs: Math.round(initialMs), interactionMs: Math.round(interactionMs),
                    maxNavigationMs: Math.round(maxNavigationMs), svgNodes }));
                cleanup();
            }
        }, 120_000);
    }
});

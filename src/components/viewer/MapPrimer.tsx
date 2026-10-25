import React from 'react';
import type { Primer } from '../../types';
import { describeCircularArc, getCircularCoordinates } from '../../utils/circularLayout';

interface MapPrimerProps {
    primer: Primer;
    sequenceLength: number;
    topology: 'Linear' | 'Circular';
    index: number;
    hovered: boolean;
    onHover: (id: string | null) => void;
    onSelect: (primer: Primer) => void;
    onEdit?: (primer: Primer) => void;
}

function arrowPoints(x: number, y: number, dx: number, dy: number): string {
    const baseX = x - dx * 10;
    const baseY = y - dy * 10;
    return `${x},${y} ${baseX - dy * 5},${baseY + dx * 5} ${baseX + dy * 5},${baseY - dx * 5}`;
}

export const MapPrimer: React.FC<MapPrimerProps> = ({
    primer, sequenceLength, topology, index, hovered, onHover, onSelect, onEdit
}) => {
    const reverse = primer.strand === 'Reverse';
    const color = primer.color || (reverse ? '#f43f5e' : '#10b981');
    const description = `${primer.name} · ${primer.strand} primer · ${primer.start + 1}..${primer.end} · ${primer.mismatches.length} mismatches`;

    if (topology === 'Circular') {
        const radius = 342 + (index % 3) * 12;
        const headPosition = reverse ? primer.start : primer.end;
        const head = getCircularCoordinates(headPosition, sequenceLength, radius, 500, 500);
        const angle = (headPosition / sequenceLength) * Math.PI * 2 - Math.PI / 2;
        const direction = reverse ? -1 : 1;
        const dx = -Math.sin(angle) * direction;
        const dy = Math.cos(angle) * direction;
        const path = describeCircularArc(primer.start, primer.end, sequenceLength, radius, 500, 500, 'Circular');

        return <g cursor="pointer" onMouseEnter={() => onHover(primer.id)}
            onMouseLeave={() => onHover(null)} onClick={(event) => { event.stopPropagation(); onSelect(primer); }}
            onDoubleClick={(event) => { event.stopPropagation(); onEdit?.(primer); }}>
            <title>{description}</title>
            <path d={path} fill="none" stroke={color} strokeWidth={hovered ? 9 : 6} opacity={hovered ? 1 : 0.85} />
            <path d={path} fill="none" stroke="transparent" strokeWidth="18" />
            <polygon points={arrowPoints(head.x, head.y, dx, dy)} fill={color} />
            {hovered && <text x={head.x} y={head.y - 14} textAnchor="middle" fill={color}
                stroke="#fff" strokeWidth="3" paintOrder="stroke" fontSize="12" fontWeight="700">
                {primer.name}
            </text>}
        </g>;
    }

    const bindingStart = 100 + (primer.start / sequenceLength) * 800;
    const bindingEnd = 100 + (primer.end / sequenceLength) * 800;
    const middle = (bindingStart + bindingEnd) / 2;
    const visibleWidth = Math.max(14, bindingEnd - bindingStart);
    const left = middle - visibleWidth / 2;
    const right = middle + visibleWidth / 2;
    const y = 474 - (index % 3) * 14;
    const headX = reverse ? left : right;

    return <g cursor="pointer" onMouseEnter={() => onHover(primer.id)}
        onMouseLeave={() => onHover(null)} onClick={(event) => { event.stopPropagation(); onSelect(primer); }}
        onDoubleClick={(event) => { event.stopPropagation(); onEdit?.(primer); }}>
        <title>{description}</title>
        <line x1={left} y1={y} x2={right} y2={y} stroke={color}
            strokeWidth={hovered ? 7 : 5} strokeLinecap="round" />
        <line x1={left} y1={y} x2={right} y2={y} stroke="transparent" strokeWidth="18" />
        <polygon points={arrowPoints(headX, y, reverse ? -1 : 1, 0)} fill={color} />
        {hovered && <text x={middle} y={y - 11} textAnchor="middle" fill={color}
            stroke="#fff" strokeWidth="3" paintOrder="stroke" fontSize="12" fontWeight="700">
            {primer.name}
        </text>}
    </g>;
};

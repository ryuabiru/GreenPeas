/**
 * 学習メモ: circularLayoutに関する副作用の少ない計算・変換ヘルパーを提供する。
 * 処理の位置づけ: ストアやコンポーネントから呼ばれ、UIに依存しない計算結果を返す。
 */

export const getCircularCoordinates = (index: number, seqLength: number, radius: number, centerX: number, centerY: number) => {
    const angle = (index / seqLength) * 2 * Math.PI - Math.PI / 2;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      angle: angle * (180 / Math.PI),
      angleRad: angle
    };
};

export const describeCircularArc = (startIdx: number, endIdx: number, seqLength: number, radius: number, centerX: number, centerY: number, topology: 'Linear' | 'Circular') => {
    const start = getCircularCoordinates(startIdx, seqLength, radius, centerX, centerY);
    const end = getCircularCoordinates(endIdx, seqLength, radius, centerX, centerY);
    const isCircular = topology === 'Circular';
    
    let angularDiff = (endIdx - startIdx) / seqLength;
    if (isCircular && angularDiff < 0) angularDiff += 1;
    
    if (isCircular && Math.abs(angularDiff - 1.0) < 0.0001) {
        return `M ${centerX} ${centerY - radius} A ${radius} ${radius} 0 1 1 ${centerX} ${centerY + radius} A ${radius} ${radius} 0 1 1 ${centerX} ${centerY - radius}`;
    }

    const largeArcFlag = angularDiff > 0.5 ? "1" : "0";
    return [
      "M", start.x, start.y,
      "A", radius, radius, 0, largeArcFlag, 1, end.x, end.y
    ].join(" ");
};

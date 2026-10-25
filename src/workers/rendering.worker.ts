/**
 * 学習メモ: 重い配列描画をメインUIスレッドから分離して実行するWeb Worker。
 * 処理の位置づけ: アプリ内の他モジュールから参照され、担当する値または処理を提供する。
 */

const COMPLEMENT_MAP: Record<string, string> = {
  'A': 'T', 'T': 'A', 'G': 'C', 'C': 'G',
  'a': 't', 't': 'a', 'g': 'c', 'c': 'g'
};

const COLORS = {
  dark: {
    A: '#4ade80',
    T: '#f87171',
    G: '#ffffff',
    C: '#60a5fa',
    muted: '#94a3b8'
  },
  light: {
    A: '#15803d',
    T: '#be123c',
    G: '#1e293b',
    C: '#1d4ed8',
    muted: '#475569'
  }
};
const canvases: Map<string, OffscreenCanvas> = new Map();
const latestSequences: Map<string, number> = new Map();

self.onmessage = (e: MessageEvent) => {
  const { 
    type,
    id, // For single row (compat)
    canvas,
    dpr,
    width,
    height,
    isDark,
    settings,
    charWidth,
    rows // For viewport rendering: Array<{ y: number, seqY: number, rowStr: string }>
  } = e.data;

  // 1. MUST register canvas if provided
  if (canvas) {
    canvases.set(id || 'viewport', canvas);
  }

  const targetCanvas = canvases.get(id || 'viewport');
  if (!targetCanvas) return;

  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  // Sync size
  const physicalWidth = Math.round(width * dpr);
  const physicalHeight = Math.round(height * dpr);

  if (targetCanvas.width !== physicalWidth || targetCanvas.height !== physicalHeight) {
    targetCanvas.width = physicalWidth;
    targetCanvas.height = physicalHeight;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  try {
    const fontSize = settings.fontSize;
    ctx.font = `500 ${fontSize}px ${settings.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const colors = {
        A: '#4ade80', T: '#fb7185', G: '#fbbf24', C: '#60a5fa', N: '#94a3b8', '-': '#94a3b8'
    };
    const complementMap: Record<string, string> = {
        A: 'T', T: 'A', G: 'C', C: 'G', a: 't', t: 'a', g: 'c', c: 'g', N: 'N', n: 'n', '-': '-'
    };
    const defaultTextColor = isDark ? '#f8fafc' : '#1e293b';
    const INDEX_COLUMN_WIDTH = 40;

    const drawRow = (rowStr: string, y: number) => {
        // Center the two rows (main and complement) as a group around 'y'
        const verticalGap = fontSize * 0.9;
        const mainY = y - verticalGap / 2;
        const compY = y + verticalGap / 2;

        for (let i = 0; i < rowStr.length; i++) {
            const char = rowStr[i];
            const upperChar = char.toUpperCase();
            const color = (colors as any)[upperChar];
            
            const x = (i * charWidth + (charWidth / 2)) + INDEX_COLUMN_WIDTH;
            
            // 1. Draw Main Base
            if (color) {
                let textColor = color;
                if (!isDark) {
                    textColor = color.replace('4ade80', '16a34a').replace('fb7185', 'e11d48').replace('fbbf24', 'd97706').replace('60a5fa', '2563eb');
                }
                ctx.fillStyle = textColor;
            } else {
                ctx.fillStyle = defaultTextColor;
            }
            ctx.fillText(char, x, mainY);

            // 2. Draw Complement
            const comp = complementMap[char] || ' ';
            ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
            ctx.fillText(comp, x, compY);
        }
    };

    if (type === 'VIEWPORT' && rows) {
        rows.forEach((row: any) => {
            drawRow(row.rowStr, row.y + row.seqY);
        });
    } else if (id && e.data.rowStr) {
        // Single row fallback
        drawRow(e.data.rowStr, e.data.seqHeight / 2);
    }
  } catch (err) {
    console.error("Worker render failed:", err);
  }
};

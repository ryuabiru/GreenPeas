/**
 * 学習メモ: Canvas描画Workerへの依頼と応答を管理する。
 * 処理の位置づけ: ストアやコンポーネントから呼ばれ、UIに依存しない計算結果を返す。
 */

import RenderingWorker from '../workers/rendering.worker?worker';

class RenderingManager {
  private worker: Worker;
  private pendingTasks: Map<string, { canvas: OffscreenCanvas | null, data: any }> = new Map();
  private isScheduled = false;

  constructor() {
    this.worker = new RenderingWorker();
  }

  renderRow(id: string, canvas: OffscreenCanvas | null, data: any) {
    this.pendingTasks.set(id, { 
      canvas, 
      data
    });
    this.scheduleFlush();
  }

  renderViewport(canvas: OffscreenCanvas | null, data: {
    width: number,
    height: number,
    dpr: number,
    isDark: boolean,
    settings: any,
    charWidth: number,
    rows: Array<{ y: number, seqY: number, rowStr: string }>
  }) {
    this.worker.postMessage({
        type: 'VIEWPORT',
        canvas,
        ...data
    }, canvas ? [canvas] : []);
  }

  private scheduleFlush() {
    if (this.isScheduled) return;
    this.isScheduled = true;

    requestAnimationFrame(() => {
      this.isScheduled = false;
      this.flush();
    });
  }

  private flush() {
    this.pendingTasks.forEach((task, id) => {
      const { canvas, data } = task;
      if (canvas) {
        this.worker.postMessage({
          id,
          canvas,
          ...data
        }, [canvas]);
      } else {
        this.worker.postMessage({
          id,
          ...data
        });
      }
    });
    this.pendingTasks.clear();
  }
}

export const renderingManager = new RenderingManager();

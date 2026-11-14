// StageCanvas.tsx — React-обгортка: монтує сцену на полотні й передає їй останній вид.
// React тут лише тримає полотно. Кадри малює цикл у stage.ts, а не перемальовування компонента.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Scene } from '../scenes/types';
import type { Filter } from './filters';
import { createStage, type StageOptions, type StageRunner } from './stage';

export interface StageCanvasProps<View> {
  /** Фабрика сцени. Має бути стабільною (функція рівня модуля): нова функція перемонтовує сцену. */
  createScene: () => Scene<View>;
  /** Останній вид. Зміна виду не перемонтовує сцену: вона побачить його в наступному кадрі. */
  view: View;
  /** Що показати, якщо WebGL недоступний. */
  fallback: ReactNode;
  options?: StageOptions;
  /** Візуальні фільтри на весь кадр. Зміна списку не перемонтовує сцену. */
  filters?: readonly Filter[];
  className?: string;
  style?: CSSProperties;
  /** Опис для екранних читачів. */
  label?: string;
}

export function StageCanvas<View>({ createScene, view, fallback, options, filters, className, style, label }: StageCanvasProps<View>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const stageRef = useRef<StageRunner | null>(null);
  const [failed, setFailed] = useState(false);
  const viewHeightUnits = options?.viewHeightUnits;
  const cameraElevationDeg = options?.cameraElevationDeg;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stage: StageRunner;
    try {
      stage = createStage(canvas, {
        ...(viewHeightUnits !== undefined ? { viewHeightUnits } : {}),
        ...(cameraElevationDeg !== undefined ? { cameraElevationDeg } : {}),
      });
    } catch {
      setFailed(true); // WebGL недоступний
      return;
    }
    stageRef.current = stage;
    stage.setFilters(filtersRef.current ?? []);
    const scene = createScene();
    scene.mount(stage);
    stage.start((dtS, timeS) => scene.update(viewRef.current, dtS, timeS));
    return () => {
      stageRef.current = null;
      stage.stop();
      scene.dispose();
      stage.dispose();
    };
  }, [createScene, viewHeightUnits, cameraElevationDeg]);

  useEffect(() => {
    stageRef.current?.setFilters(filters ?? []);
  }, [filters]);

  if (failed) {
    return <div className={className} role="status" style={{ ...style, display: 'grid', placeItems: 'center', padding: 16 }}>{fallback}</div>;
  }
  return (
    <canvas ref={canvasRef} className={className} role="img" aria-label={label}
      style={{ display: 'block', width: '100%', height: '100%', ...style }} />
  );
}

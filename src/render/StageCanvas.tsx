// StageCanvas.tsx — React-обгортка: монтує сцену на полотні й передає їй останній вид.
// React тут лише тримає полотно. Кадри малює цикл у stage.ts, а не перемальовування компонента.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Scene } from '../scenes/types';
import { createStage, type StageOptions, type StageRunner } from './stage';

export interface StageCanvasProps<View> {
  /** Фабрика сцени. Має бути стабільною (функція рівня модуля): нова функція перемонтовує сцену. */
  createScene: () => Scene<View>;
  /** Останній вид. Зміна виду не перемонтовує сцену: вона побачить його в наступному кадрі. */
  view: View;
  /** Що показати, якщо WebGL недоступний. */
  fallback: ReactNode;
  options?: StageOptions;
  className?: string;
  style?: CSSProperties;
  /** Опис для екранних читачів. */
  label?: string;
}

export function StageCanvas<View>({ createScene, view, fallback, options, className, style, label }: StageCanvasProps<View>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
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
    const scene = createScene();
    scene.mount(stage);
    stage.start((dtS, timeS) => scene.update(viewRef.current, dtS, timeS));
    return () => {
      stage.stop();
      scene.dispose();
      stage.dispose();
    };
  }, [createScene, viewHeightUnits, cameraElevationDeg]);

  if (failed) {
    return <div className={className} role="status" style={{ ...style, display: 'grid', placeItems: 'center', padding: 16 }}>{fallback}</div>;
  }
  return (
    <canvas ref={canvasRef} className={className} role="img" aria-label={label}
      style={{ display: 'block', width: '100%', height: '100%', ...style }} />
  );
}

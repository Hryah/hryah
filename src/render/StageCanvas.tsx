// StageCanvas.tsx — React-обгортка: монтує сцену на полотні й передає їй останній вид.
// React тут лише тримає полотно. Кадри малює цикл у stage.ts, а не перемальовування компонента.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Scene } from '../scenes/types';
import type { Filter } from './filters';
import { createSceneSession } from './scene-session';
import { createStage, type StageOptions } from './stage';

export interface StageCanvasProps<View> {
  /** Фабрика сцени. Має бути стабільною (функція рівня модуля): нова функція перемонтовує сцену. */
  createScene: () => Scene<View>;
  /** Останній вид. Зміна виду не перемонтовує сцену: вона побачить його в наступному кадрі. */
  view: View;
  /** Що показати, якщо WebGL недоступний. */
  fallback: ReactNode;
  /** false зупиняє кадри, зберігаючи сцену. WebGL створюється лише при першому true. */
  active?: boolean;
  options?: StageOptions;
  /** Візуальні фільтри на весь кадр. Зміна списку не перемонтовує сцену. */
  filters?: readonly Filter[];
  className?: string;
  style?: CSSProperties;
  /** Опис для екранних читачів. */
  label?: string;
}

export function StageCanvas<View>({ createScene, view, fallback, active = true, options, filters, className, style, label }: StageCanvasProps<View>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const activeRef = useRef(active);
  activeRef.current = active;
  const sessionRef = useRef<ReturnType<typeof createSceneSession<View>> | null>(null);
  const [failed, setFailed] = useState(false);
  const viewHeightUnits = options?.viewHeightUnits;
  const cameraElevationDeg = options?.cameraElevationDeg;
  const shadows = options?.shadows;
  const shadowsOn = Boolean(shadows);
  const toneMapping = options?.toneMapping;
  const exposure = options?.exposure;
  const lighting = options?.lighting;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const session = createSceneSession(
      () => createStage(canvas, {
        ...(viewHeightUnits !== undefined ? { viewHeightUnits } : {}),
        ...(cameraElevationDeg !== undefined ? { cameraElevationDeg } : {}),
        ...(shadowsOn ? { shadows: true } : {}),
        ...(toneMapping !== undefined ? { toneMapping } : {}),
        ...(exposure !== undefined ? { exposure } : {}),
        ...(lighting !== undefined ? { lighting } : {}),
      }),
      createScene,
      () => viewRef.current,
    );
    sessionRef.current = session;
    try {
      session.setFilters(filtersRef.current ?? []);
      session.setActive(activeRef.current);
    } catch {
      setFailed(true);
    }
    return () => {
      sessionRef.current = null;
      session.dispose();
    };
  }, [createScene, viewHeightUnits, cameraElevationDeg, shadowsOn, toneMapping, exposure, lighting]);

  useEffect(() => {
    try {
      sessionRef.current?.setFilters(filters ?? []);
      sessionRef.current?.setActive(active);
    } catch {
      setFailed(true);
    }
  }, [filters, active]);

  if (failed) {
    return <div className={className} role="status" style={{ ...style, display: 'grid', placeItems: 'center', padding: 16 }}>{fallback}</div>;
  }
  return (
    <canvas ref={canvasRef} className={className} role="img" aria-label={label}
      style={{ display: 'block', width: '100%', height: '100%', ...style }} />
  );
}

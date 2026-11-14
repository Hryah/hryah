import { useCallback, useEffect, useRef, useState } from 'react';
import { ROOM_BLUEPRINT, canInteractWithConsole, roomPhase, type RoomAction, type RoomFacing, type RoomState } from '../../core/flight/room';
import { RoomRenderer } from './room-renderer';
import { facingForKey, screenMovement } from './room-view';
import dictionary from './texts.en.json';
import './room.css';

const text = (key: string, params: Record<string, string | number> = {}) => {
  const value = (dictionary as Record<string, string>)[key] ?? key;
  return value.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
};
const initialState = () => roomPhase.init({ log: [] }, 1);
type GraphicsStatus = 'loading' | 'ready' | 'error' | 'contextLost';
const logAnchor = (id: string) => `room-log-${id.replace(/[^\w-]/g, '-')}`;

export function RoomScreen({ active }: { active: boolean }) {
  const [state, setState] = useState<RoomState>(initialState);
  const stateRef = useRef(state);
  const activeRef = useRef(active);
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const loopRef = useRef<{ sync: () => void } | null>(null);
  const heldKeys = useRef(new Set<string>());
  const lastFacing = useRef<RoomFacing>('front');
  const [graphics, setGraphics] = useState<GraphicsStatus>('loading');
  const [consoleFallback, setConsoleFallback] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [retry, setRetry] = useState(0);

  const dispatch = useCallback((action: RoomAction) => {
    const next = roomPhase.step(stateRef.current, action);
    if (next !== stateRef.current) {
      stateRef.current = next;
      setState(next);
    }
  }, []);

  useEffect(() => {
    activeRef.current = active;
    loopRef.current?.sync();
  }, [active]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let alive = true;
    let ready = false;
    let contextLost = false;
    let frame = 0;
    let lastTime = 0;
    let engine: RoomRenderer | null = null;
    const isRunning = () => ready && activeRef.current && document.visibilityState === 'visible' && document.hasFocus();
    const clearKeys = () => {
      heldKeys.current.clear();
      lastTime = 0;
      if (stateRef.current.player.moving) dispatch({ type: 'stop' });
    };
    const animate = (now: number) => {
      frame = 0;
      if (!alive || !isRunning()) { clearKeys(); return; }
      const dtS = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
      lastTime = now;
      if (stateRef.current.console.open || stateRef.current.console.completed) heldKeys.current.clear();
      const movement = screenMovement(heldKeys.current, lastFacing.current);
      if (movement.x !== 0 || movement.z !== 0 || stateRef.current.player.moving) {
        dispatch({ type: 'move', ...movement, dtS });
      }
      engine?.render(stateRef.current, dtS);
      frame = requestAnimationFrame(animate);
    };
    const sync = () => {
      clearKeys();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (!alive) return;
      setSuspended(ready && !isRunning());
      if (isRunning()) frame = requestAnimationFrame(animate);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isRunning() || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.code === 'Escape' && stateRef.current.console.open) {
        event.preventDefault(); clearKeys(); dispatch({ type: 'close_console' }); return;
      }
      if (event.target instanceof HTMLElement && event.target.closest('input,select,textarea,[contenteditable="true"]')) return;
      if (event.code === 'KeyE' && !event.repeat && !stateRef.current.console.open) {
        event.preventDefault(); clearKeys(); dispatch({ type: 'interact' }); return;
      }
      const facing = facingForKey(event.code);
      if (facing && !stateRef.current.console.open && !stateRef.current.console.completed) {
        event.preventDefault();
        heldKeys.current.add(event.code);
        // The core accepts facing only with a positive-delta movement on the next frame.
        lastFacing.current = facing;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => { heldKeys.current.delete(event.code); };
    const onFocus = () => sync();
    const onBlur = () => sync();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    loopRef.current = { sync };
    setGraphics('loading');
    setConsoleFallback(false);
    try {
      engine = new RoomRenderer(host, () => {
        if (!alive) return;
        contextLost = true;
        ready = false;
        setGraphics('contextLost');
        sync();
      });
      engine.render(stateRef.current, 0);
      void engine.initialize().then((result) => {
        if (!alive || contextLost) return;
        ready = true;
        setConsoleFallback(result.consoleFallback);
        setGraphics('ready');
        engine?.render(stateRef.current, 0);
        sync();
      }).catch(() => { if (alive && !contextLost) { setGraphics('error'); ready = false; sync(); } });
    } catch {
      setGraphics('error');
    }
    return () => {
      alive = false;
      ready = false;
      if (frame) cancelAnimationFrame(frame);
      heldKeys.current.clear();
      loopRef.current = null;
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      engine?.dispose();
    };
  }, [dispatch, retry]);

  const restart = () => {
    heldKeys.current.clear();
    const next = initialState();
    lastFacing.current = next.player.facing;
    stateRef.current = next;
    setState(next);
    loopRef.current?.sync();
    stageRef.current?.focus({ preventScroll: true });
  };
  const closeConsole = () => {
    heldKeys.current.clear();
    dispatch({ type: 'close_console' });
    stageRef.current?.focus({ preventScroll: true });
  };
  const nearConsole = canInteractWithConsole(state);
  const failed = state.console.feedback === 'rejected';

  return (
    <section className="room-screen" lang="en" aria-labelledby="room-title">
      <header className="room-heading">
        <div><p className="room-eyebrow">{text('eyebrow')}</p><h2 id="room-title">{text('title')}<span> / {text('subtitle')}</span></h2></div>
        <span className="room-training-badge"><i />{text('training')}</span>
      </header>
      <div className="room-stage" ref={stageRef} tabIndex={0} aria-label={text('sceneLabel')}
        onPointerDown={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest('button,input,a,label')) return;
          stageRef.current?.focus({ preventScroll: true });
          loopRef.current?.sync();
        }}>
        <div className="room-canvas" ref={hostRef} role="img" aria-label={text('sceneLabel')} />
        <div className={`room-objective ${state.console.completed ? 'is-complete' : ''}`} aria-live="polite">
          <span className="room-objective-number">{state.console.completed ? '✓' : '01'}</span>
          <div><span className="room-label">{text(state.console.completed ? 'completed' : 'incomplete')}</span>
            <strong>{text(state.console.completed ? 'objectiveDone' : 'objective')}</strong>
            <p>{text(state.console.completed ? 'objectiveDoneDetail' : 'objectiveDetail')}</p></div>
        </div>
        {graphics === 'ready' && nearConsole && !state.console.open && !state.console.completed &&
          <div className="room-interact" role="status"><kbd>E</kbd><div><strong>{text('consolePrompt')}</strong><span>{text('pressE')}</span></div></div>}
        {graphics === 'ready' && state.console.completed &&
          <div className="room-success-banner" role="status"><span>✓</span><div><strong>{text('taskSuccess')}</strong><p>{text('taskSuccessDetail')}</p></div>
            <button type="button" onClick={restart}>{text('restart')}</button></div>}
        <div className="room-control-strip" aria-label={text('keyboardControls')}>
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> {text('move')}</span>
          <span><kbd>E</kbd> {text('interact')}</span>
          <small>{text('staticPose')}</small>
        </div>
        {consoleFallback && <div className="room-model-notice" role="status">{text('consoleFallback')}</div>}
        {graphics === 'loading' && <div className="room-screen-overlay" role="status"><div className="room-loading-indicator" /><strong>{text('loading')}</strong></div>}
        {(graphics === 'error' || graphics === 'contextLost') && <div className="room-screen-overlay room-error" role="alert">
          <strong>{text(graphics === 'contextLost' ? 'contextLost' : 'error')}</strong><p>{text('errorDetail')}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>{text('retry')}</button></div>}
        {graphics === 'ready' && suspended && !state.console.open && <div className="room-paused" role="status"><strong>{text('paused')}</strong><span>{text('pausedDetail')}</span></div>}
        {graphics === 'ready' && state.console.open &&
          <div className="room-task" role="dialog" aria-modal="false" aria-labelledby="room-task-title">
            <div className="room-task-topline"><span className="room-label">{text('powerSolar')}</span><button type="button" className="room-close" onClick={closeConsole} aria-label={text('cancel')}>×</button></div>
            <h3 id="room-task-title">{text('taskTitle')}</h3><p>{text('taskDescription')}</p>
            <div className="room-angle-readouts"><div><span>{text('target')}</span><strong>{state.console.targetAngleDeg}<small>°</small></strong></div>
              <div><span>{text('command')}</span><strong>{state.console.panelAngleDeg}<small>°</small></strong></div></div>
            <label htmlFor="room-panel-angle">{text('angleLabel')}<output>{state.console.panelAngleDeg}°</output></label>
            <input id="room-panel-angle" type="range" min={ROOM_BLUEPRINT.console.minAngleDeg} max={ROOM_BLUEPRINT.console.maxAngleDeg}
              step={1} value={state.console.panelAngleDeg} onChange={(event) => dispatch({ type: 'set_panel_angle', angleDeg: Number(event.target.value) })} />
            <div className="room-range-ends"><span>{ROOM_BLUEPRINT.console.minAngleDeg}°</span><span>{ROOM_BLUEPRINT.console.maxAngleDeg}°</span></div>
            <div className="room-efficiency"><span>{text('efficiency')}</span><strong>{state.console.efficiencyPct.toFixed(0)}%</strong></div>
            <p className="room-task-hint">{text('taskHint')}</p>
            {failed && <div className="room-task-error" role="alert"><strong>{text('taskError')}</strong><span>{text('taskErrorDetail')}</span></div>}
            <div className="room-task-actions"><button type="button" className="room-primary" onClick={() => {
              heldKeys.current.clear(); dispatch({ type: 'apply_panel_angle' });
            }}>{text('apply')}</button><button type="button" onClick={closeConsole}>{text('cancel')}</button></div>
          </div>}
      </div>
      <div className="room-below-stage">
        <div className="room-mission-note"><span className="room-label">{text('logHint')}</span><p>{text('brief')}</p><small>{text('prototypeNote')}</small>
          <button type="button" className="room-reset" onClick={restart}>{text('restart')}</button></div>
        <section className="room-record" aria-labelledby="room-record-title"><div className="room-record-heading"><h3 id="room-record-title">{text('logTitle')}</h3><span>{String(state.log.length).padStart(2, '0')}</span></div>
          <ol>{state.log.map((entry) => <li id={logAnchor(entry.id)} key={entry.id} className={`room-record-${entry.kind}`}>
            <div><span className="room-record-kind">{text(`kind.${entry.kind}`)}</span><time>{entry.tS.toFixed(1)}s</time></div>
            <p>{text(entry.messageKey, entry.params)}</p>
            {entry.causedBy && entry.causedBy.length > 0 && <small>{text('causedBy')} {entry.causedBy.map((id) =>
              <a key={id} href={`#${logAnchor(id)}`} onClick={(event) => {
                // Keep the app's hash route while navigating a causal link inside the record.
                event.preventDefault(); document.getElementById(logAnchor(id))?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              }}>{text('kind.decision').toLowerCase()} {id.split(':').at(-1)}</a>)}</small>}
          </li>)}</ol>
        </section>
      </div>
    </section>
  );
}

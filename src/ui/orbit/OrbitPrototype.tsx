import { useEffect, useState } from 'react';
import { createDemoOrbit, orbitPhase, orbitView, type OrbitState, type ToggleId } from '../../core/orbit';
import { OrbitScene } from './OrbitScene';
import messages from './texts.en.json';
import sharedMessages from '../../data/texts.en.json';
import './orbit.css';

const copy: Record<string, string> = { ...sharedMessages, ...messages };
const t = (key: string, params: Record<string, string | number> = {}) =>
  (copy[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (name === 'toggle' && typeof value === 'string') return copy[`ui.control.${value}`] ?? value;
    if (name === 'enabled') return copy[value ? 'ui.enabled' : 'ui.off'] ?? String(value);
    if (typeof value === 'number') return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
    return value ?? `{${name}}`;
  });
const number = (n: number, digits = 0) => new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n);
type Preset = 'balanced' | 'comms' | 'power';
type IconName = 'orbit' | 'check' | 'camera' | 'radio' | 'heat' | 'shield' | 'arrow' | 'reset' | 'activity' | 'code' | 'chevron' | 'close' | 'help' | 'sun';
const paths: Record<IconName, string> = {
  orbit: 'M21 12a9 9 0 1 1-9-9m8 0v6m-3-3h6M4 20 20 4M8 8l8 8',
  check: 'm5 12 4 4 10-10', camera: 'M4 7h4l2-3h4l2 3h4v13H4z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  radio: 'M12 13v8m-4 0h8M8 6a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8M5 3a10 10 0 0 0 0 14M19 3a10 10 0 0 1 0 14M12 8v.01',
  heat: 'M8 3c-5 5 5 7 0 12m5-12c-5 5 5 7 0 12m5-12c-5 5 5 7 0 12M4 21h16',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z m-4 9 3 3 5-6',
  arrow: 'M4 12h16m-6-6 6 6-6 6', reset: 'M3 11a9 9 0 1 1 2 7M3 4v7h7',
  activity: 'M2 12h5l3-8 4 16 3-8h5', code: 'm8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18',
  chevron: 'm9 5 7 7-7 7', close: 'm6 6 12 12M6 18 18 6', help: 'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4m0 4v.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
};
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
function Sparkline({ values, max, kind = 'green' }: { values: number[]; max: number; kind?: string }) {
  const data = values.length === 1 ? [values[0] ?? 0, values[0] ?? 0] : values;
  const points = data.map((value, i) => `${i * 220 / Math.max(1, data.length - 1)},${36 - Math.min(1, value / Math.max(1, max)) * 30}`).join(' ');
  return <svg className={`sparkline ${kind}`} viewBox="0 0 220 42" preserveAspectRatio="none" aria-hidden="true"><path d="M0 36H220M0 18H220" className="spark-grid" /><polygon points={`0,42 ${points} 220,42`} /><polyline points={points} /></svg>;
}
function Meter({ value, tone = 'green', label }: { value: number; tone?: string; label: string }) {
  return <div className={`meter ${tone}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

export function OrbitPrototype() {
  const [preset, setPreset] = useState<Preset>('balanced');
  const [history, setHistory] = useState<OrbitState[]>(() => [createDemoOrbit('balanced', 42)]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const state = history[history.length - 1]!;
  const view = orbitView(state);
  const forecast = view.forecast;
  const done = state.status !== 'active';
  const outcome = orbitPhase.finish(state).result;
  const totals = state.input.mission.durationOrbits;
  const currentTurn = Math.min(state.completedOrbits + 1, totals);
  const controls: { id: ToggleId; icon: IconName }[] = [
    { id: 'camera', icon: 'camera' }, { id: 'transmitter', icon: 'radio' },
    { id: 'heater', icon: 'heat' }, { id: 'safeMode', icon: 'shield' },
  ];
  const reset = (nextPreset = preset) => { setPreset(nextPreset); setHistory([createDemoOrbit(nextPreset, 42)]); };
  const advance = () => {
    if (!done) setHistory(previous => [...previous, orbitPhase.step(previous[previous.length - 1]!, { type: 'tick', dtS: state.input.flight.orbit.periodS })]);
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (window.location.hash === '#debug' || helpOpen || setupOpen || event.key.toLowerCase() !== 'n' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName)) return;
      event.preventDefault();
      advance();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const toggle = (id: ToggleId) => setHistory(previous => {
    const active = previous[previous.length - 1]!;
    return [...previous.slice(0, -1), orbitPhase.step(active, { type: 'toggle', id })];
  });
  const visibleLog = [...state.log].reverse().slice(0, done ? 10 : 5);

  return <div className="orbit-app">
    <aside className="mission-sidebar">
      <a className="orbit-brand" href="#orbit" aria-label={t('ui.home')}><span className="brand-symbol"><Icon name="orbit" size={25} /></span>hryah<span className="brand-dot">.</span></a>
      <div className="sidebar-section-label">{t('ui.missionControl')}</div>
      <div className="mission-identity"><span className="mission-number">01</span><div><strong>{t('ui.earthObserver')}</strong><small>{t('ui.lowEarthOrbit')}</small></div></div>
      <nav className="phase-navigation" aria-label={t('ui.missionStages')}>
        {(['design', 'flight', 'orbit', 'debrief'] as const).map((phase, i) => <div key={phase} className={`phase-nav-item ${((i === 2 && !done) || (i === 3 && done)) ? 'current' : ''} ${i < 2 || (done && i === 2) ? 'finished' : ''}`}><span className="phase-step">{i < 2 || (done && i === 2) ? <Icon name="check" size={14} /> : `0${i + 1}`}</span><span>{t(`ui.stage.${phase}`)}</span>{i === 2 && !done && <span className="live-dot" />}</div>)}
      </nav>
      <div className="sidebar-divider" />
      <div className="sidebar-section-label">{t('ui.spacecraft')}</div>
      <div className="craft-name">HRYAH–01 <span>LEO</span></div>
      <dl className="craft-facts"><div><dt>{t('ui.altitude')}</dt><dd>{number(state.input.flight.orbit.altKm)} <span>km</span></dd></div><div><dt>{t('ui.period')}</dt><dd>{number(view.periodMin, 1)} <span>min</span></dd></div><div><dt>{t('ui.resolution')}</dt><dd className={view.resolutionOk ? '' : 'text-amber'}>{number(view.resolutionM, 2)} <span>m</span></dd></div></dl>
      <button className="sidebar-config" onClick={() => setSetupOpen(!setupOpen)}><Icon name="orbit" size={17} />{t('ui.changeLoadout')}<Icon name="chevron" size={14} /></button>
      <div className="sidebar-bottom"><div><span className="live-dot" />{t('ui.systemsOnline')}</div><small>{t('ui.prototypeLabel')}</small><a href="#debug"><Icon name="code" size={15} />{t('ui.openDebug')}</a></div>
    </aside>

    <main className="orbit-main">
      <header className="orbit-topbar"><div className="breadcrumb">{t('ui.missionControl')}<Icon name="chevron" size={12} /><span>{t('ui.stage.orbit')}</span></div><div className="topbar-actions"><span className="local-badge">{t('ui.interactivePrototype')}</span><button className="icon-button" aria-label={t('ui.howToPlay')} onClick={() => setHelpOpen(true)}><Icon name="help" size={19} /></button></div></header>
      <div className="page-heading"><div><div className="eyebrow">{t('ui.phaseThree')}</div><h1>{t('ui.orbitOperations')}</h1><p>{t('ui.tagline')}</p><button className="loadout-chip" onClick={() => setSetupOpen(!setupOpen)}>{t(`ui.preset.${preset}`)}<Icon name="chevron" size={11} /></button></div><button className="quiet-button" onClick={() => reset()}><Icon name="reset" size={16} />{t('ui.restart')}</button></div>

      {setupOpen && <section className="setup-panel" aria-label={t('ui.chooseLoadout')}><div><strong>{t('ui.chooseLoadout')}</strong><p>{t('ui.loadoutHint')}</p></div><div className="preset-options">{(['balanced', 'comms', 'power'] as Preset[]).map(id => <button key={id} className={preset === id ? 'selected' : ''} onClick={() => { reset(id); setSetupOpen(false); }}><strong>{t(`ui.preset.${id}`)}</strong><small>{t(`ui.preset.${id}.description`)}</small></button>)}</div></section>}

      <div className="operation-grid">
        <section className={`orbital-viewport panel ${view.stormNext && !done ? 'storm-active' : ''}`} aria-label={t('ui.orbitalView')}>
          <div className="viewport-header"><span className="panel-kicker"><span className="live-dot" />{done ? t('ui.missionEnded') : t('ui.orbitalView')}</span><span className="orbit-counter">{t('ui.orbit')} <strong>{String(currentTurn).padStart(2, '0')}</strong><span>/ {String(totals).padStart(2, '0')}</span></span></div>
          <div className="scene-context"><span className="scene-coordinate">LEO / {number(state.input.flight.orbit.altKm)} KM</span><span className={`scene-mode ${state.toggles.safeMode ? 'safe' : ''}`}>{t(done ? 'ui.missionEnded' : state.toggles.safeMode ? 'ui.safeModeActive' : view.stormNext ? 'ui.stormApproaching' : 'ui.nominal')}</span></div>
          <OrbitScene turn={state.completedOrbits} totalTurns={totals} storm={view.stormNext && !done} safeMode={state.toggles.safeMode} complete={done} />
          <div className="viewport-caption"><span className="tracking-icon">⌖</span><div><strong>{t('ui.earthObserver')}</strong><small>{t('ui.telemetryLinked')}</small></div><div className="orbit-dots" aria-label={`${state.completedOrbits} / ${totals}`}>{Array.from({ length: totals }, (_, i) => <span key={i} className={i < state.completedOrbits ? 'filled' : i === state.completedOrbits && !done ? 'next' : ''} />)}</div></div>
        </section>

        <section className="telemetry-panel panel" aria-label={t('ui.liveTelemetry')}>
          <div className="panel-title"><h2>{t('ui.liveTelemetry')}</h2><Icon name="activity" size={17} /></div>
          <div className="telemetry-resource"><div className="resource-header"><span>{t('ui.battery')}</span><span className={view.chargePercent < 25 ? 'text-amber' : 'text-green'}>{t(view.chargePercent < 25 ? 'ui.low' : 'ui.nominal')}</span></div><div className="resource-number">{number(state.chargeWh, 1)}<span> / {number(view.capacityWh, 1)} Wh</span></div><Sparkline values={[view.capacityWh, ...state.history.map(h => h.chargeWh)]} max={view.capacityWh} /><div className="resource-scale"><span>{t('ui.chargeHistory')}</span><span>{number(view.chargePercent)}%</span></div></div>
          <div className="telemetry-resource data-resource"><div className="resource-header"><span>{t('ui.dataDelivered')}</span><span className="text-blue">{number(view.dataPercent)}%</span></div><div className="resource-number">{number(state.deliveredMb)}<span> / {number(state.input.mission.requiredDataMb)} Mb</span></div><Meter value={view.dataPercent} tone="blue" label={t('ui.dataDelivered')} /><div className="resource-scale"><span>{t('ui.missionTarget')}</span><span>{t('ui.transmittedToEarth')}</span></div></div>
          <div className="storage-resource"><div className="resource-header"><span>{t('ui.onboardStorage')}</span><span>{number(state.bufferMb)} / {number(view.bufferCapacityMb)} Mb</span></div><Meter value={view.bufferPercent} tone={view.bufferPercent > 75 ? 'amber' : 'muted'} label={t('ui.onboardStorage')} /></div>
          <div className="thermal-line"><span><Icon name="heat" size={16} />{t('ui.thermalStatus')}</span><strong className={state.coldStress > 0 ? 'text-amber' : 'text-green'}>{t(state.coldStress >= 2 ? 'ui.cold' : state.coldStress > 0 ? 'ui.cooling' : 'ui.stable')}</strong></div>
        </section>

        <section className="systems-panel" aria-label={t('ui.spacecraftSystems')}>
          <div className="section-heading"><h2>{t('ui.spacecraftSystems')}</h2><span>{t('ui.systemsHint')}</span></div>
          <div className="system-grid">{controls.map(({ id, icon }, i) => {
            const overridden = state.toggles.safeMode && id !== 'safeMode';
            const enabled = !done && (overridden ? view.activeSystems[id] : state.toggles[id]);
            const unavailable = !done && !overridden && enabled && !view.activeSystems[id];
            return <button key={id} className={`system-card ${enabled ? 'on' : ''} ${id === 'safeMode' ? 'safety' : ''} ${overridden ? 'overridden' : ''} ${unavailable ? 'blocked' : ''}`} role="switch" aria-checked={enabled} aria-label={t(`ui.control.${id}`)} disabled={done || overridden} onClick={() => toggle(id)}><div className="system-card-top"><span className="system-icon"><Icon name={icon} size={21} /></span><span className="toggle-track"><span /></span></div><strong>{t(`ui.control.${id}`)}</strong><small>{t(`ui.control.${id}.description`)}</small><div className="system-footer"><span>{t(unavailable ? 'controls.unavailable' : overridden ? (id === 'heater' ? 'controls.forcedHeater' : 'controls.overridden') : enabled ? 'ui.enabled' : 'ui.off')}</span><span>{i === 0 ? `${number(state.input.spec.instrumentW)} W` : i === 1 ? `${number(state.input.spec.transmitterW)} W` : i === 2 ? `${number(state.input.spec.heaterW)} W` : t('ui.protection')}</span></div></button>;
          })}</div>
        </section>

        <section className={`forecast-panel panel ${forecast.powerFailure ? 'danger' : ''}`} aria-label={t('ui.nextOrbitForecast')}>
          <div className="panel-title"><h2>{t(done ? 'ui.finalTelemetry' : 'ui.nextOrbitForecast')}</h2><span className="small-label">{t(done ? 'ui.confirmed' : 'ui.prediction')}</span></div>
          <div className="forecast-row"><span>{t('ui.endingCharge')}</span><strong className={forecast.powerFailure ? 'text-amber' : ''}>{number(forecast.chargeWh, 1)} Wh</strong></div><div className="forecast-row"><span>{t('ui.dataDownlink')}</span><strong>+{number(forecast.deliveredMb)} Mb</strong></div><div className="forecast-row"><span>{t('ui.dataLoss')}</span><strong className={forecast.lostMb > 0 ? 'text-amber' : ''}>{number(forecast.lostMb)} Mb</strong></div>
          <div className={`forecast-note ${view.stormNext || forecast.powerFailure ? 'warning' : ''}`}><Icon name={view.stormNext ? 'sun' : 'shield'} size={16} /><span>{t(done ? 'forecast.finished' : forecast.powerFailure ? 'ui.powerRisk' : view.stormNext ? 'ui.stormWarning' : view.stormInOrbits !== null && view.stormInOrbits <= 2 ? 'ui.stormSoon' : 'ui.forecastNominal', { turns: view.stormInOrbits ?? 0 })}</span></div>
        </section>
      </div>

      <section className="turn-command panel"><div><div className="eyebrow">{t('ui.nextOrbitSequence')}</div><div className="sequence"><span><span className="sequence-dot sun" />{t('ui.sunlight')}</span><Icon name="chevron" size={12} /><span>{t('ui.imaging')}</span><Icon name="chevron" size={12} /><span>{t('ui.groundPass')}</span><Icon name="chevron" size={12} /><span><span className="sequence-dot shadow" />{t('ui.eclipse')}</span></div></div><div className="command-actions"><button className="undo-button" disabled={history.length < 2} onClick={() => setHistory(previous => previous.slice(0, -1))}>{t('ui.undo')}</button><button className="advance-button" onClick={done ? () => reset() : advance}>{t(done ? 'ui.flyAgain' : 'ui.nextOrbit')}<span>{done ? <Icon name="reset" size={17} /> : <><kbd>N</kbd><Icon name="arrow" size={18} /></>}</span></button></div></section>

      {done && <section className={`mission-outcome panel ${outcome.success ? 'success' : 'failure'}`} aria-live="polite"><span className="outcome-symbol"><Icon name={outcome.success ? 'check' : 'activity'} size={28} /></span><div><div className="eyebrow">{t('ui.missionDebrief')}</div><h2>{t(outcome.success ? 'ui.successTitle' : 'ui.failureTitle')}</h2><p>{t(outcome.success ? 'ui.successDescription' : 'ui.failureDescription', { delivered: number(outcome.deliveredMb), turns: outcome.survivedOrbits, total: totals })}</p></div><div className="outcome-score"><strong>{number(outcome.score)}</strong><span>{t('ui.missionScore')}</span></div></section>}

      <section className="event-log panel"><div className="panel-title"><h2>{t('ui.missionLog')}<span className="log-count">{number(state.log.length)}</span></h2><span className="small-label">{t('ui.latestEvents')}</span></div><div className="log-entries" aria-live="polite">{visibleLog.map(entry => <div className={`log-entry ${entry.kind}`} key={entry.id}><span className="log-time">T+{number(entry.tS / 60, 1)}<small> MIN</small></span><span className="log-marker" /><span className="log-message">{t(entry.messageKey, entry.params)}{entry.kind === 'failure' && entry.causedBy && <small className="cause-detail">{t('ui.causedBy')} {entry.causedBy.map(id => { const cause = [...state.input.log, ...state.log].find(item => item.id === id); return cause ? t(cause.messageKey, cause.params) : id; }).join(' · ')}</small>}</span><span className="log-type">{t(`ui.log.${entry.kind}`)}</span></div>)}</div></section>
      <footer className="orbit-footer"><span>{t('ui.footer')}</span><span>HRYAH–01 <span className="footer-separator">/</span> {t('ui.simulationOnly')}</span></footer>
    </main>

    {helpOpen && <div className="modal-scrim" onClick={() => setHelpOpen(false)} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); setHelpOpen(false); }
      if (event.key === 'Tab') {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
        const first = buttons[0]; const last = buttons[buttons.length - 1];
        if (event.shiftKey && event.target === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && event.target === last) { event.preventDefault(); first?.focus(); }
      }
    }}><section className="help-dialog panel" role="dialog" aria-modal="true" aria-labelledby="orbit-help-title" onClick={event => event.stopPropagation()}><button autoFocus className="icon-button modal-close" aria-label={t('ui.close')} onClick={() => setHelpOpen(false)}><Icon name="close" /></button><div className="eyebrow">{t('ui.flightManual')}</div><h2 id="orbit-help-title">{t('ui.howToPlay')}</h2><p>{t('ui.helpGoal')}</p><ol><li>{t('ui.helpOne')}</li><li>{t('ui.helpTwo')}</li><li>{t('ui.helpThree')}</li></ol><p className="help-footnote">{t('ui.demoDisclaimer')}</p><button className="advance-button" onClick={() => setHelpOpen(false)}>{t('ui.gotIt')}<Icon name="arrow" size={18} /></button></section></div>}
  </div>;
}

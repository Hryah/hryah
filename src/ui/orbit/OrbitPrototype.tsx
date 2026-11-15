import { useEffect, useState, type ReactNode } from 'react';
import { createDemoOrbit, orbitPhase, orbitClarity, orbitDebrief, type OrbitAction, type OrbitState, type ToggleId } from '../../core/orbit';
import { resolveAssetUrl } from '../graphics/registry';
import { OrbitScene } from './OrbitScene';
import { t as translate } from '../text';
import { SAMPLE_CATALOG } from '../../core/stubs';
import type { CauseEntry } from '../../core/contracts';
import { describeEntry } from '../design/cause';
import './orbit.css';

// Записи журналу перекладає спільний describeEntry; тут лише числа екрана з локальним форматуванням.
const t = (key: string, params: Record<string, string | number> = {}) => {
  const formatted: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(params)) formatted[name] = typeof value === 'number' ? number(value, 1) : value;
  return translate(key, formatted);
};
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

// Режим кампанії: стан орбіти веде виконавець місії (дії йдуть у звіт кімнаті), тож пресетів, рестарту й «назад» немає,
// а замість «Fly again» показується footer (кнопка звіту).
export interface OrbitCampaignMode {
  state: OrbitState;
  onAction: (action: OrbitAction) => void;
  footer?: ReactNode;
  windowNumber?: number;   // номер вікна запуску кампанії (у сайдбарі замість «01»)
  craftName?: string;      // назва агенції (замість демо-назви апарата)
  locked?: boolean;        // ліміт дій звіту вичерпано: решту витків дограє автопілот кімнати
}

export function OrbitPrototype({ initialState, campaign }: { initialState?: OrbitState; campaign?: OrbitCampaignMode } = {}) {
  const [preset, setPreset] = useState<Preset>('balanced');
  // У кампанії стан приходить ззовні: демо-орбіту не створюємо.
  const [localHistory, setHistory] = useState<OrbitState[]>(() => (campaign ? [] : [initialState ?? createDemoOrbit('balanced', 42)]));
  const [helpOpen, setHelpOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const history = campaign ? [campaign.state] : localHistory;
  const state = history[history.length - 1]!;
  const { view, systems, risks } = orbitClarity(state);
  const forecast = view.forecast;
  const goalParams = { ...view.goalParams, ...(view.cargoNameKey ? { cargo: t(view.cargoNameKey) } : {}) };
  const done = state.status !== 'active';
  const debrief = done ? orbitDebrief(state) : [];
  const outcome = orbitPhase.finish(state).result;
  const totals = state.input.mission.durationOrbits;
  const currentTurn = Math.min(state.completedOrbits + 1, totals);
  const controls: { id: ToggleId; icon: IconName }[] = [
    { id: 'camera', icon: 'camera' }, { id: 'transmitter', icon: 'radio' },
    { id: 'heater', icon: 'heat' }, { id: 'safeMode', icon: 'shield' },
  ];
  const reset = (nextPreset = preset) => { setPreset(nextPreset); setHistory([createDemoOrbit(nextPreset, 42)]); };
  const advance = () => {
    if (done) return;
    const tick: OrbitAction = { type: 'tick', dtS: state.input.flight.orbit.periodS };
    if (campaign) campaign.onAction(tick);
    else setHistory(previous => [...previous, orbitPhase.step(previous[previous.length - 1]!, tick)]);
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((!campaign && window.location.hash !== '#orbit') || helpOpen || setupOpen || event.key.toLowerCase() !== 'n' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName)) return;
      event.preventDefault();
      advance();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const toggle = (id: ToggleId) => {
    if (campaign) { campaign.onAction({ type: 'toggle', id }); return; }
    setHistory(previous => {
      const active = previous[previous.length - 1]!;
      return [...previous.slice(0, -1), orbitPhase.step(active, { type: 'toggle', id })];
    });
  };
  const visibleLog = [...state.log].reverse().slice(0, done ? 10 : 5);
  const entryText = (entry: CauseEntry) =>
    describeEntry(entry, { mission: state.input.mission, catalog: SAMPLE_CATALOG });

  return <div className={`orbit-app ${campaign ? 'is-campaign' : ''}`}>
    <aside className="mission-sidebar">
      {campaign
        ? <span className="orbit-brand"><span className="brand-symbol"><Icon name="orbit" size={25} /></span>hryah<span className="brand-dot">.</span></span>
        : <a className="orbit-brand" href="#orbit" aria-label={t('ui.home')}><span className="brand-symbol"><Icon name="orbit" size={25} /></span>hryah<span className="brand-dot">.</span></a>}
      <div className="sidebar-section-label">{t('ui.missionControl')}</div>
      <div className="mission-identity"><span className="mission-number">{String(campaign?.windowNumber ?? 1).padStart(2, '0')}</span><div><strong>{t(state.input.mission.titleKey)}</strong><small>{state.input.mission.body.name}</small></div></div>
      <nav className="phase-navigation" aria-label={t('ui.missionStages')}>
        {(['design', 'flight', 'orbit', 'debrief'] as const).map((phase, i) => <div key={phase} className={`phase-nav-item ${((i === 2 && !done) || (i === 3 && done)) ? 'current' : ''} ${i < 2 || (done && i === 2) ? 'finished' : ''}`}><span className="phase-step">{i < 2 || (done && i === 2) ? <Icon name="check" size={14} /> : `0${i + 1}`}</span><span>{t(`ui.stage.${phase}`)}</span>{i === 2 && !done && <span className="live-dot" />}</div>)}
      </nav>
      <div className="sidebar-divider" />
      <div className="sidebar-section-label">{t('ui.spacecraft')}</div>
      <div className="craft-name">{campaign?.craftName ?? 'HRYAH–01'} <span>{state.input.mission.body.name === 'Earth' ? 'LEO' : state.input.mission.body.name}</span></div>
      <dl className="craft-facts"><div><dt>{t('ui.altitude')}</dt><dd>{number(state.input.flight.orbit.altKm)} <span>km</span></dd></div><div><dt>{t('ui.period')}</dt><dd>{number(view.periodMin, 1)} <span>min</span></dd></div><div><dt>{t('ui.resolution')}</dt><dd className={view.resolutionOk ? '' : 'text-amber'}>{number(view.resolutionM, 2)} <span>m</span></dd></div></dl>
      {!campaign && <button className="sidebar-config" onClick={() => setSetupOpen(!setupOpen)}><Icon name="orbit" size={17} />{t('ui.changeLoadout')}<Icon name="chevron" size={14} /></button>}
      <div className="sidebar-bottom"><div><span className="live-dot" />{t('ui.systemsOnline')}</div><small>{t('ui.prototypeLabel')}</small>{!campaign && <a href="#debug"><Icon name="code" size={15} />{t('ui.openDebug')}</a>}</div>
    </aside>

    <main className="orbit-main">
      <div className="forecast-note" data-testid="orbit-objective"><p>{t(view.goalKey, goalParams)}</p><p>{t('orbit.objective.altitude', goalParams)}</p>{view.cargoNameKey && <p>{t('orbit.telemetry.progress', { sent: view.telemetryReportsSent, expected: view.telemetryReportsExpected })} · {t('orbit.telemetry.optional')}</p>}</div>
      <header className="orbit-topbar"><div className="breadcrumb">{t('ui.missionControl')}<Icon name="chevron" size={12} /><span>{t('ui.stage.orbit')}</span></div><div className="topbar-actions">{!campaign && <span className="local-badge">{t('ui.interactivePrototype')}</span>}<button className="icon-button" aria-label={t('ui.howToPlay')} onClick={() => setHelpOpen(true)}><Icon name="help" size={19} /></button></div></header>
      <div className="page-heading"><div><div className="eyebrow">{t('ui.phaseThree')}</div><h1>{t('ui.orbitOperations')}</h1><p>{t('ui.tagline')}</p>{!campaign && <button className="loadout-chip" onClick={() => setSetupOpen(!setupOpen)}>{t(`ui.preset.${preset}`)}<Icon name="chevron" size={11} /></button>}</div>{!campaign && <button className="quiet-button" onClick={() => reset()}><Icon name="reset" size={16} />{t('ui.restart')}</button>}</div>

      {setupOpen && <section className="setup-panel" aria-label={t('ui.chooseLoadout')}><div><strong>{t('ui.chooseLoadout')}</strong><p>{t('ui.loadoutHint')}</p></div><div className="preset-options">{(['balanced', 'comms', 'power'] as Preset[]).map(id => <button key={id} className={preset === id ? 'selected' : ''} onClick={() => { reset(id); setSetupOpen(false); }}><strong>{t(`ui.preset.${id}`)}</strong><small>{t(`ui.preset.${id}.description`)}</small></button>)}</div></section>}

      <div className="operation-grid">
        <section className={`orbital-viewport panel ${view.stormNext && !done ? 'storm-active' : ''}`} aria-label={t('ui.orbitalView')}>
          <div className="viewport-header"><span className="panel-kicker"><span className="live-dot" />{done ? t('ui.missionEnded') : t('ui.orbitalView')}</span><span className="orbit-counter">{t('ui.orbit')} <strong>{String(currentTurn).padStart(2, '0')}</strong><span>/ {String(totals).padStart(2, '0')}</span></span></div>
          <div className="scene-context"><span className="scene-coordinate">{state.input.mission.body.name} / {number(state.input.flight.orbit.altKm)} KM</span><span className={`scene-mode ${state.toggles.safeMode ? 'safe' : ''}`}>{t(done ? 'ui.missionEnded' : state.toggles.safeMode ? 'ui.safeModeActive' : view.stormNext ? 'ui.stormApproaching' : 'ui.nominal')}</span></div>
          <OrbitScene turn={state.completedOrbits} totalTurns={totals} storm={view.stormNext && !done} safeMode={state.toggles.safeMode} complete={done} bodyName={state.input.mission.body.name} />
          <div className="viewport-caption"><span className="tracking-icon"><img src={resolveAssetUrl('assets/icons/ui/satellite-dish.svg')} alt="" width={16} height={16} /></span><div><strong>{t(state.input.mission.titleKey)}</strong><small>{t('ui.telemetryLinked')}</small></div><div className="orbit-dots" aria-label={`${state.completedOrbits} / ${totals}`}>{Array.from({ length: totals }, (_, i) => <span key={i} className={i < state.completedOrbits ? 'filled' : i === state.completedOrbits && !done ? 'next' : ''} />)}</div></div>
        </section>

        <section className="telemetry-panel panel" aria-label={t('ui.liveTelemetry')}>
          <div className="panel-title"><h2>{t('ui.liveTelemetry')}</h2><Icon name="activity" size={17} /></div>
          <div className="telemetry-resource"><div className="resource-header"><span>{t('ui.battery')}</span><span className={view.chargePercent < 25 ? 'text-amber' : 'text-green'}>{t(view.chargePercent < 25 ? 'ui.low' : 'ui.nominal')}</span></div><div className="resource-number">{number(state.chargeWh, 1)}<span> / {number(view.capacityWh, 1)} Wh</span></div><Sparkline values={[view.capacityWh, ...state.history.map(h => h.chargeWh)]} max={view.capacityWh} /><div className="resource-scale"><span>{t('ui.chargeHistory')}</span><span>{number(view.chargePercent)}%</span></div></div>
          <div className="telemetry-resource data-resource"><div className="resource-header"><span>{t(view.dataLabelKey)}</span><span className="text-blue">{view.dataTargetMb !== null && `${number(view.dataPercent)}%`}</span></div><div className="resource-number">{number(state.deliveredMb)}<span>{view.dataTargetMb === null ? '' : ` / ${number(view.dataTargetMb)}`} Mb</span></div>{view.dataTargetMb !== null && <Meter value={view.dataPercent} tone="blue" label={t(view.dataLabelKey)} />}<div className="resource-scale"><span>{view.dataTargetMb !== null && t('ui.missionTarget')}</span><span>{t('ui.transmittedToEarth')}</span></div></div>
          <div className="storage-resource"><div className="resource-header"><span>{t('ui.onboardStorage')}</span><span>{number(state.bufferMb)} / {number(view.bufferCapacityMb)} Mb</span></div><Meter value={view.bufferPercent} tone={view.bufferPercent > 75 ? 'amber' : 'muted'} label={t('ui.onboardStorage')} /></div>
          <div className="thermal-line"><span><Icon name="heat" size={16} />{t('ui.thermalStatus')}</span><strong className={state.coldStress > 0 ? 'text-amber' : 'text-green'}>{t(`ui.${view.thermalState}`)}</strong></div>
        </section>

        <section className="systems-panel" aria-label={t('ui.spacecraftSystems')}>
          <div className="section-heading"><h2>{t('ui.spacecraftSystems')}</h2><span>{t('ui.systemsHint')}</span></div>
          <div className="system-grid">{controls.filter(control => view.controls.includes(control.id)).map(({ id, icon }) => {
            const system = systems[id];
            return <button key={id} className={['system-card', system.commandOn ? 'on' : '', id === 'safeMode' ? 'safety' : '', system.commandOn && !system.effectiveOn ? 'blocked' : ''].join(' ')} role="switch" aria-checked={system.commandOn} aria-label={t('ui.control.' + id)} disabled={done || campaign?.locked} onClick={() => toggle(id)}><div className="system-card-top"><span className="system-icon"><Icon name={icon} size={21} /></span><span className="toggle-track"><span /></span></div><strong>{t('ui.control.' + id)}</strong><small>{t('ui.control.' + id + '.description')}</small><div className="system-footer"><span>{t(system.commandOn ? 'clarity.command.on' : 'clarity.command.off')}</span></div><div className="system-actual"><span>{t(id === 'safeMode' ? system.effectiveOn ? 'clarity.safe.on' : 'clarity.safe.off' : system.effectiveOn ? 'clarity.actual.on' : 'clarity.actual.off')}</span><small>{t(id === 'safeMode' && system.reason === 'ready' ? 'clarity.safe.ready' : 'clarity.reason.' + system.reason)}{system.forcedBySafe && <span> · {t('clarity.forcedHeater')}</span>}</small>{system.effectiveOn && <small>{t(id === 'safeMode' ? 'clarity.safe.duration' : 'clarity.operation', { seconds: system.operationS })}</small>}</div></button>;
          })}</div>
        </section>

        <section className={`forecast-panel panel ${forecast.powerFailure ? 'danger' : ''}`} aria-label={t('ui.nextOrbitForecast')}>
          <div className="panel-title"><h2>{t(done ? 'ui.finalTelemetry' : 'ui.nextOrbitForecast')}</h2><span className="small-label">{t(done ? 'ui.confirmed' : 'ui.prediction')}</span></div>
          <div className="forecast-row"><span>{t('ui.endingCharge')}</span><strong className={forecast.powerFailure ? 'text-amber' : ''}>{number(forecast.chargeWh, 1)} Wh</strong></div>
          {!done && <>
            <div className="forecast-row"><span>{t('clarity.chargeChange')}</span><strong>{number(forecast.chargeDeltaWh, 1)} Wh</strong></div>
            <div className="forecast-row"><span>{t('clarity.minimumCharge')}</span><strong>{number(forecast.cost.minimumChargeWh, 1)} Wh</strong></div>
            <div className="forecast-row"><span>{t('clarity.endingStorage')}</span><strong>{number(forecast.bufferMb)} / {number(view.bufferCapacityMb)} Mb</strong></div>
            <div className="forecast-row"><span>{t('clarity.memoryChange')}</span><strong>{number(forecast.bufferDeltaMb)} Mb</strong></div>
            <div className="forecast-row"><span>{t('clarity.peakStorage')}</span><strong>{number(forecast.cost.peakBufferMb)} Mb</strong></div>
            <div className="forecast-row"><span>{t('ui.dataDownlink')}</span><strong>+{number(forecast.deliveredMb)} Mb</strong></div>
            <div className="forecast-row"><span>{t('ui.dataLoss')}</span><strong className={forecast.lostMb > 0 ? 'text-amber' : ''}>{number(forecast.lostMb)} Mb</strong></div>
            <div className="forecast-row forecast-extra"><span>{t('clarity.turnCost')}</span><strong>{number(forecast.cost.consumedWh, 1)} Wh</strong></div>
            <div className="forecast-row forecast-extra"><span>{t('clarity.generation')}</span><strong>{number(forecast.cost.generatedWh, 1)} Wh</strong></div>
            <div className="forecast-row forecast-extra"><span>{t('clarity.duration')}</span><strong>{number(forecast.cost.elapsedS / 60, 1)} min</strong></div>
            <p className="forecast-note forecast-extra">{t('clarity.costHint')}</p>
          </>}
          {risks.map(key => <div key={key} className="forecast-note warning"><Icon name="activity" size={16} /><span>{t(key, { turns: view.stormInOrbits ?? 0 })}</span></div>)}
          {risks.length === 0 && <div className="forecast-note"><Icon name="shield" size={16} /><span>{t(done ? 'forecast.finished' : 'ui.forecastNominal')}</span></div>}
        </section>
      </div>

      <section className="turn-command panel"><div><div className="eyebrow">{t('ui.nextOrbitSequence')}</div><div className="sequence"><span><span className="sequence-dot sun" />{t('ui.sunlight')}</span><Icon name="chevron" size={12} /><span>{t(view.sequenceKey)}</span><Icon name="chevron" size={12} /><span>{t('ui.groundPass')}</span><Icon name="chevron" size={12} /><span><span className="sequence-dot shadow" />{t('ui.eclipse')}</span></div></div><div className="command-actions">{!campaign && <button className="undo-button" disabled={history.length < 2} onClick={() => setHistory(previous => previous.slice(0, -1))}>{t('ui.undo')}</button>}{campaign && done ? null : <button className="advance-button" disabled={!done && campaign?.locked} onClick={done ? () => reset() : advance}>{t(done ? 'ui.flyAgain' : 'ui.nextOrbit')}<span>{done ? <Icon name="reset" size={17} /> : <><kbd>N</kbd><Icon name="arrow" size={18} /></>}</span></button>}{campaign?.footer}</div></section>

      {done && <section className={`mission-outcome panel ${outcome.success ? 'success' : 'failure'}`} aria-live="polite"><span className="outcome-symbol"><Icon name={outcome.success ? 'check' : 'activity'} size={28} /></span><div><div className="eyebrow">{t('ui.missionDebrief')}</div><h2>{t(outcome.success ? 'ui.successTitle' : 'ui.failureTitle')}</h2><p>{t(outcome.success ? (state.input.mission.orbitObjective?.type === 'cargo' ? 'ui.successDescriptionCargo' : 'ui.successDescription') : 'ui.failureDescription', { delivered: number(outcome.deliveredMb), turns: outcome.survivedOrbits, total: totals })}</p></div><div className="outcome-score"><strong>{number(outcome.score)}</strong><span>{t('ui.missionScore')}</span></div></section>}


      {done && debrief.length > 0 && <section className="event-log panel" aria-label={t('clarity.causeChains')}><div className="panel-title"><h2>{t('clarity.causeChains')}</h2></div><p className="cause-detail">{t('clarity.chainHint')}</p>{debrief.map(problem => <details className="cause-problem" key={problem.failure.id}><summary>{entryText(problem.failure)}</summary>{problem.paths.map((path, index) => <ol className="cause-path" key={index}>{path.map(entry => <li key={entry.id} className={entry.kind === 'decision' ? 'text-green' : ''}>{entryText(entry)} <small>{t('clarity.eventTime', { minutes: entry.tS / 60 })}</small></li>)}</ol>)}</details>)}</section>}

      <section className="event-log panel"><div className="panel-title"><h2>{t('ui.missionLog')}<span className="log-count">{number(state.log.length)}</span></h2><span className="small-label">{t('ui.latestEvents')}</span></div><div className="log-entries" aria-live="polite">{visibleLog.map(entry => <div className={`log-entry ${entry.kind}`} key={entry.id}><span className="log-time">T+{number(entry.tS / 60, 1)}<small> MIN</small></span><span className="log-marker" /><span className="log-message">{entryText(entry)}{entry.kind === 'failure' && entry.causedBy && <small className="cause-detail">{t('ui.causedBy')} {entry.causedBy.map(id => { const cause = [...state.input.log, ...state.log].find(item => item.id === id); return cause ? entryText(cause) : id; }).join(' · ')}</small>}</span><span className="log-type">{t(`ui.log.${entry.kind}`)}</span></div>)}</div></section>
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

// FlightScreen.tsx — Екран Частини 2 (Політ: корабель у розрізі, космонавт у невагомості та пульти).
// Лише читає FlightState і шле FlightAction; усі тексти беруться з src/data/texts.en.json.

import { useEffect, useState } from 'react';
import type { FlightAction, FlightState } from '../../core/flight';
import textsEn from '../../data/texts.en.json';

const TEXTS = textsEn as Record<string, string>;

function t(key: string): string {
  return TEXTS[key] ?? key;
}

export interface FlightScreenProps {
  readonly state: FlightState;
  readonly dispatch: (action: FlightAction) => void;
}

export function FlightScreen({ state, dispatch }: FlightScreenProps) {
  const [autoTick, setAutoTick] = useState(true);
  const [directMode, setDirectMode] = useState(false);

  useEffect(() => {
    if (!autoTick || state.done) return;
    const id = window.setInterval(() => {
      dispatch({ type: 'tick', dtS: 0.2 });
    }, 200);
    return () => window.clearInterval(id);
  }, [autoTick, state.done, dispatch]);

  const { astronaut, nodes, tasks } = state;
  const scaleX = 50; // 12m * 50 = 600px
  const scaleY = 50; // 6m * 50 = 300px

  const targetNode = astronaut.targetNodeId
    ? nodes.find((n) => n.id === astronaut.targetNodeId)
    : undefined;

  const handleNodeClick = (nodeId: string, kind: 'handrail' | 'console') => {
    if (directMode && kind === 'console') {
      dispatch({ type: 'interactConsole', consoleId: nodeId });
    } else {
      dispatch({ type: 'pushOff', targetNodeId: nodeId });
    }
  };

  return (
    <div
      style={{
        background: '#141829',
        borderRadius: 12,
        padding: 16,
        border: '1px solid #2a2f4a',
        display: 'grid',
        gap: 14,
      }}
    >
      {/* Заголовок і панель керування часом та режимом */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <strong style={{ fontSize: 16 }}>🧑‍🚀 {t('flight.title')}</strong>
          <div style={{ fontSize: 12, color: '#8a90a8' }}>{t('flight.subtitle')}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setDirectMode((m) => !m)}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              border: '1px solid #5ca8ff',
              background: directMode ? '#1b2644' : 'transparent',
              color: '#5ca8ff',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {directMode ? t('flight.mode.direct') : t('flight.mode.zeroG')}
          </button>
          <button
            onClick={() => setAutoTick((a) => !a)}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              border: `1px solid ${autoTick ? '#3ddc84' : '#ffa23d'}`,
              background: autoTick ? '#132a24' : 'transparent',
              color: autoTick ? '#3ddc84' : '#ffa23d',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {autoTick ? '⏸ Pause' : '▶ Live Timer'}
          </button>
          <button
            onClick={() => dispatch({ type: 'tick', dtS: 1 })}
            style={{
              padding: '5px 8px',
              borderRadius: 6,
              border: '1px solid #2a2f4a',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            +1s
          </button>
          <span style={{ fontSize: 12, color: '#8a90a8', fontFamily: 'monospace' }}>
            T+{state.elapsedS.toFixed(1)}s / {state.durationS}s
          </span>
        </div>
      </div>

      {/* Інтерактивний розріз корабля з ручками, пультами, ілюмінаторами та космонавтом */}
      <svg
        viewBox="0 0 600 300"
        style={{
          width: '100%',
          height: 'auto',
          background: '#090c15',
          borderRadius: 10,
          border: '1px solid #2a2f4a',
          userSelect: 'none',
        }}
      >
        <defs>
          <pattern id="cabin-grid" width="25" height="25" patternUnits="userSpaceOnUse">
            <path d="M 25 0 L 0 0 0 25" fill="none" stroke="rgba(92,168,255,0.06)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="600" height="300" fill="url(#cabin-grid)" />

        {/* Восьмикутний контур відсіку корабля в розрізі (як на ескізі Vertical) */}
        <polygon
          points="55,25 545,25 580,85 580,215 545,275 55,275 20,215 20,85"
          fill="#101526"
          stroke="#64748b"
          strokeWidth="3"
        />

        {/* Два круглі ілюмінатори на задній стінці відсіку */}
        <g>
          <circle cx="205" cy="150" r="42" fill="#060911" stroke="#475569" strokeWidth="3" />
          <circle cx="205" cy="150" r="36" fill="none" stroke="#38bdf8" strokeWidth="1" opacity="0.35" />
          <circle cx="192" cy="138" r="1.5" fill="#ffffff" />
          <circle cx="218" cy="160" r="1.2" fill="#93c5fd" />

          <circle cx="430" cy="150" r="42" fill="#060911" stroke="#475569" strokeWidth="3" />
          <circle cx="430" cy="150" r="36" fill="none" stroke="#38bdf8" strokeWidth="1" opacity="0.35" />
          <circle cx="418" cy="142" r="1.5" fill="#ffffff" />
          <circle cx="445" cy="162" r="1.2" fill="#fde047" />
        </g>

        {/* Траєкторія польоту космонавта між ручками / пультами */}
        {targetNode && (
          <g>
            <line
              x1={astronaut.xM * scaleX}
              y1={astronaut.yM * scaleY}
              x2={targetNode.xM * scaleX}
              y2={targetNode.yM * scaleY}
              stroke={astronaut.lastHopFast ? '#3ddc84' : '#ffa23d'}
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            <circle
              cx={targetNode.xM * scaleX}
              cy={targetNode.yM * scaleY}
              r="22"
              fill="none"
              stroke={astronaut.lastHopFast ? '#3ddc84' : '#ffa23d'}
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          </g>
        )}

        {/* Ручки (червоні П-подібні скоби) та Пульти керування */}
        {nodes.map((node) => {
          const cx = node.xM * scaleX;
          const cy = node.yM * scaleY;
          const isGrabbed = astronaut.grabbedNodeId === node.id;
          const task = tasks.find((item) => item.consoleId === node.id);
          const isCrisis = task?.status === 'active';
          const isResolved = task?.status === 'resolved';
          const isFailed = task?.status === 'failed';

          if (node.kind === 'handrail') {
            const bracketY = node.wall === 'top' ? -14 : 14;
            return (
              <g
                key={node.id}
                transform={`translate(${cx}, ${cy})`}
                onClick={() => handleNodeClick(node.id, 'handrail')}
                style={{ cursor: 'pointer' }}
              >
                <path
                  d={`M -26,${bracketY} L -26,0 L 26,0 L 26,${bracketY}`}
                  fill="none"
                  stroke={isGrabbed ? '#3ddc84' : '#ef4444'}
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <text
                  x="0"
                  y={node.wall === 'top' ? 18 : -10}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {t(node.titleKey)}
                </text>
              </g>
            );
          }

          // Пульт керування (console)
          const borderColor = isCrisis
            ? '#ff5c7a'
            : isResolved
              ? '#3ddc84'
              : isFailed
                ? '#64748b'
                : '#38bdf8';

          return (
            <g
              key={node.id}
              transform={`translate(${cx}, ${cy})`}
              onClick={() => handleNodeClick(node.id, 'console')}
              style={{ cursor: 'pointer' }}
            >
              {/* Центральний квадратний пульт терморегуляції чи трапецієподібні/бокові пульти як на ескізі */}
              {node.wall === 'center' ? (
                <g>
                  <rect
                    x="-28"
                    y="-26"
                    width="56"
                    height="52"
                    rx="4"
                    fill="#172554"
                    stroke={borderColor}
                    strokeWidth="2.5"
                  />
                  <line x1="-28" y1="-26" x2="-28" y2="26" stroke="#ef4444" strokeWidth="4" />
                  <line x1="28" y1="-26" x2="28" y2="26" stroke="#ef4444" strokeWidth="4" />
                </g>
              ) : node.wall === 'top' ? (
                <polygon
                  points="-34,-18 34,-18 24,14 -24,14"
                  fill="#172554"
                  stroke={borderColor}
                  strokeWidth="2.5"
                />
              ) : (
                <rect
                  x="-18"
                  y="-36"
                  width="36"
                  height="72"
                  rx="4"
                  fill="#1e293b"
                  stroke={borderColor}
                  strokeWidth="2.5"
                />
              )}

              {/* Індикатор таймера або статусу задачі на пульті */}
              {task && (
                <text
                  x="0"
                  y="4"
                  textAnchor="middle"
                  fill={isCrisis ? '#ff5c7a' : isResolved ? '#3ddc84' : '#e2e8f0'}
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {isCrisis ? `${Math.ceil(task.ttlS)}s` : isResolved ? 'OK' : task.status.toUpperCase()}
                </text>
              )}

              <text
                x="0"
                y={node.wall === 'top' ? 28 : 48}
                textAnchor="middle"
                fill="#cbd5e1"
                fontSize="9"
                fontFamily="monospace"
              >
                {t(node.titleKey)}
              </text>
            </g>
          );
        })}

        {/* Космонавт (круглий шолом з візором, ранець PLSS та обертання у невагомості за ескізом) */}
        <g
          transform={`translate(${astronaut.xM * scaleX}, ${astronaut.yM * scaleY}) rotate(${astronaut.angleDeg})`}
        >
          {/* Дуги обертання в невагомості (як на image copy.png) */}
          {astronaut.grabbedNodeId === null && (
            <g opacity="0.75">
              <path
                d="M -26,-16 A 30,30 0 0,1 16,-26"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeDasharray="3 2"
              />
              <path
                d="M 26,16 A 30,30 0 0,1 -16,26"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeDasharray="3 2"
              />
            </g>
          )}
          {/* Ранець життєзабезпечення PLSS */}
          <rect x="-18" y="-12" width="10" height="24" rx="3" fill="#cbd5e1" stroke="#475569" strokeWidth="1.5" />
          {/* Тіло скафандра */}
          <ellipse cx="0" cy="4" rx="13" ry="15" fill="#f8fafc" stroke="#334155" strokeWidth="2" />
          {/* Круглий шолом з візором */}
          <circle cx="2" cy="-12" r="13" fill="#ffffff" stroke="#334155" strokeWidth="2" />
          <ellipse cx="5" cy="-12" rx="9" ry="7" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
          {/* Руки та ноги */}
          <rect x="8" y="-2" width="11" height="6" rx="3" fill="#f8fafc" stroke="#334155" strokeWidth="1.5" />
          <rect x="-7" y="16" width="6" height="10" rx="2" fill="#f8fafc" stroke="#334155" strokeWidth="1.5" />
          <rect x="3" y="16" width="6" height="10" rx="2" fill="#f8fafc" stroke="#334155" strokeWidth="1.5" />
        </g>
      </svg>

      {/* Картки задач на пультах та кнопка відділення супутника */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 10,
        }}
      >
        {tasks.map((task) => {
          const pct = Math.max(0, Math.min(100, (task.ttlS / task.maxTtlS) * 100));
          const isCrisis = task.status === 'active';
          const isResolved = task.status === 'resolved';
          const isFailed = task.status === 'failed';
          const atThisConsole = astronaut.grabbedNodeId === task.consoleId;

          return (
            <div
              key={task.id}
              style={{
                background: '#0e1220',
                borderRadius: 8,
                padding: 10,
                border: `1px solid ${
                  isCrisis ? '#ff5c7a' : isResolved ? '#3ddc84' : isFailed ? '#475569' : '#2a2f4a'
                }`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                <span>{t(task.titleKey)}</span>
                <span
                  style={{
                    color: isCrisis ? '#ff5c7a' : isResolved ? '#3ddc84' : '#8a90a8',
                  }}
                >
                  {isResolved ? '✓ OK' : isFailed ? '✗ FAILED' : `${Math.ceil(task.ttlS)}s`}
                </span>
              </div>

              {/* Шкала таймера задачі */}
              <div
                style={{
                  height: 5,
                  background: '#1e293b',
                  borderRadius: 3,
                  overflow: 'hidden',
                  margin: '6px 0',
                }}
              >
                <div
                  style={{
                    width: `${isResolved ? 100 : pct}%`,
                    height: '100%',
                    background: isResolved ? '#3ddc84' : isCrisis ? '#ff5c7a' : '#5ca8ff',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button
                  disabled={isResolved || isFailed}
                  onClick={() => dispatch({ type: 'pushOff', targetNodeId: task.consoleId })}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    borderRadius: 5,
                    border: '1px solid #2a2f4a',
                    background: atThisConsole ? '#1e293b' : 'transparent',
                    color: 'inherit',
                    cursor: isResolved || isFailed ? 'default' : 'pointer',
                    fontSize: 11,
                    opacity: isResolved || isFailed ? 0.5 : 1,
                  }}
                >
                  {atThisConsole ? '● На пульті' : '→ Летіти'}
                </button>
                <button
                  disabled={isResolved || isFailed}
                  onClick={() => dispatch({ type: 'solveTask', taskId: task.id })}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    borderRadius: 5,
                    border: '1px solid #3ddc84',
                    background: '#132a24',
                    color: '#3ddc84',
                    cursor: isResolved || isFailed ? 'default' : 'pointer',
                    fontSize: 11,
                    opacity: isResolved || isFailed ? 0.5 : 1,
                  }}
                >
                  ⚡ Виконати
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Нижня панель відділення супутника */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: '#8a90a8' }}>
          Статус космонавта:{' '}
          <strong style={{ color: '#e8eaf3' }}>
            {astronaut.grabbedNodeId
              ? `${t('flight.status.grabbed')} (${astronaut.grabbedNodeId})`
              : t('flight.status.floating')}
          </strong>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => dispatch({ type: 'separatePayload' })}
            style={{
              padding: '7px 14px',
              borderRadius: 6,
              border: '1px solid #ffa23d',
              background: 'transparent',
              color: '#ffa23d',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            🚀 {t('flight.task.separation')}
          </button>
        </div>
      </div>
    </div>
  );
}

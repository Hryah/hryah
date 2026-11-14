import { useId } from 'react';
import text from './texts.en.json';

export interface OrbitSceneProps {
  turn: number;
  totalTurns: number;
  storm: boolean;
  safeMode: boolean;
  complete: boolean;
  className?: string;
}

const STARS = [
  [47, 77, 1], [91, 287, 1.3], [142, 131, 1], [187, 359, 1],
  [224, 48, 1.5], [269, 101, 0.8], [307, 366, 1], [351, 52, 0.9],
  [399, 31, 1], [473, 62, 0.8], [552, 39, 1.3], [615, 97, 1],
  [662, 50, 0.8], [723, 139, 1.4], [776, 73, 1], [831, 170, 1],
  [859, 282, 1.2], [786, 338, 0.9], [714, 388, 1.3], [640, 353, 1],
  [543, 398, 0.8], [450, 378, 1], [361, 401, 0.9], [225, 280, 0.8],
  [122, 390, 1.2], [60, 197, 0.8], [815, 399, 1], [884, 51, 0.8],
  [86, 40, 0.8], [201, 196, 0.9], [704, 285, 0.8], [32, 361, 0.9],
] as const;

/** The orbit positions and effects here are visual presentation only. */
export function OrbitScene({
  turn, totalTurns, storm, safeMode, complete, className = '',
}: OrbitSceneProps) {
  const rawId = useId();
  const id = `earth-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const angle = -0.68 + (turn / Math.max(1, totalTurns)) * Math.PI * 2;
  const orbitalX = 310 * Math.cos(angle);
  const orbitalY = 96 * Math.sin(angle);
  const tilt = -18 * Math.PI / 180;
  const satelliteX = 450 + orbitalX * Math.cos(tilt) - orbitalY * Math.sin(tilt);
  const satelliteY = 224 + orbitalX * Math.sin(tilt) + orbitalY * Math.cos(tilt);
  const signalColor = storm ? '#f4b46a' : safeMode ? '#8da4b7' : '#a7e8d3';

  return (
    <svg
      className={`orbit-scene ${className}`}
      viewBox="0 0 900 420"
      role="img"
      aria-labelledby={`${id}-title ${id}-description`}
      style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }}
    >
      <title id={`${id}-title`}>{text['scene.title']}</title>
      <desc id={`${id}-description`}>
        {storm ? text['scene.stormDescription'] : safeMode ? text['scene.safeDescription'] : text['scene.description']}
      </desc>
      <defs>
        <radialGradient id={`${id}-ocean`} cx="32%" cy="28%" r="76%">
          <stop offset="0" stopColor="#2b7b9e" />
          <stop offset="0.45" stopColor="#17536f" />
          <stop offset="0.78" stopColor="#0c2f49" />
          <stop offset="1" stopColor="#071a2b" />
        </radialGradient>
        <radialGradient id={`${id}-atmosphere`}>
          <stop offset="0.88" stopColor="#81c9dd" stopOpacity="0" />
          <stop offset="0.965" stopColor="#81c9dd" stopOpacity="0.08" />
          <stop offset="0.992" stopColor="#81c9dd" stopOpacity="0.32" />
          <stop offset="1" stopColor="#81c9dd" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-land`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#80a291" />
          <stop offset="0.52" stopColor="#73917d" />
          <stop offset="1" stopColor="#b0a37e" />
        </linearGradient>
        <linearGradient id={`${id}-night`} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0.32" stopColor="#030b17" stopOpacity="0" />
          <stop offset="0.57" stopColor="#030b17" stopOpacity="0.04" />
          <stop offset="0.83" stopColor="#030b17" stopOpacity="0.65" />
          <stop offset="1" stopColor="#030b17" stopOpacity="0.93" />
        </linearGradient>
        <linearGradient id={`${id}-storm`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f4b46a" stopOpacity="0" />
          <stop offset="0.5" stopColor="#f4b46a" stopOpacity="0.45" />
          <stop offset="1" stopColor="#f4b46a" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-sphere`}>
          <circle cx="450" cy="224" r="132" />
        </clipPath>
        <pattern id={`${id}-panel`} width="12" height="9" patternUnits="userSpaceOnUse">
          <rect width="12" height="9" fill="#244f70" />
          <path d="M 0 0 H 12 M 0 0 V 9" fill="none" stroke="#89abc5" strokeWidth="0.55" />
        </pattern>
      </defs>
      <style>{`
        .orbit-scene .scene-star { animation: scene-star-pulse 5s ease-in-out infinite alternate; }
        .orbit-scene .scene-signal { animation: scene-signal-flow 3s linear infinite; }
        .orbit-scene .scene-station-ring { transform-origin: 487px 326px; animation: scene-station-pulse 3s ease-out infinite; }
        .orbit-scene .scene-satellite { transition: transform 850ms cubic-bezier(.22,.75,.25,1); }
        @keyframes scene-star-pulse { from { opacity: .22; } to { opacity: .65; } }
        @keyframes scene-signal-flow { to { stroke-dashoffset: -36; } }
        @keyframes scene-station-pulse { from { opacity: .75; transform: scale(.5); } to { opacity: 0; transform: scale(2.5); } }
        @media (prefers-reduced-motion: reduce) {
          .orbit-scene .scene-star, .orbit-scene .scene-signal, .orbit-scene .scene-station-ring { animation: none; }
          .orbit-scene .scene-satellite { transition: none; }
        }
      `}</style>

      <g fill="#b2c7db">
        {STARS.map(([x, y, radius], index) => (
          <circle
            key={index} cx={x} cy={y} r={radius} opacity="0.45"
            className="scene-star" style={{ animationDelay: `${index % 7 * -0.7}s` }}
          />
        ))}
      </g>
      <g stroke="#334558" strokeWidth="0.7" fill="none" opacity="0.35">
        <path d="M 32 114 H 48 M 40 106 V 122 M 804 235 H 820 M 812 227 V 243 M 234 365 H 246 M 240 359 V 371" />
        <path d="M 88 70 H 96 M 92 66 V 74 M 740 365 H 748 M 744 361 V 369" />
      </g>

      <g transform="rotate(-18 450 224)" fill="none">
        <ellipse cx="450" cy="224" rx="322" ry="109" stroke="#34556a" strokeWidth="0.7" opacity="0.45" />
        <ellipse cx="450" cy="224" rx="310" ry="96" stroke="#6c8d9e" strokeWidth="1" strokeDasharray="2 7" opacity="0.7" />
        <ellipse cx="450" cy="224" rx="304" ry="91" stroke="#1c384b" strokeWidth="0.7" opacity="0.5" />
      </g>
      <g stroke="#1f3a4e" strokeWidth="0.7" fill="none" opacity="0.5">
        <circle cx="450" cy="224" r="156" strokeDasharray="1 8" />
        <path d="M 450 58 V 68 M 450 380 V 390 M 284 224 H 294 M 606 224 H 616" />
      </g>

      <circle cx="450" cy="224" r="140" fill={`url(#${id}-atmosphere)`} />
      <circle cx="450" cy="224" r="132" fill={`url(#${id}-ocean)`} stroke="#427a93" strokeWidth="1" />
      <g clipPath={`url(#${id}-sphere)`}>
        <g fill={`url(#${id}-land)`} stroke="#a1b49a" strokeOpacity="0.24" strokeWidth="0.55">
          {/* Stylized geography, kept as vectors so no external assets are required. */}
          <path d="M338 150l14-19 17-10 18-3 8 7-4 10 11 7 1 15-13 8-6 17-13 4-8-11-16-6-9-10z M345 182l15 4 12 13 13 3 7 10-4 10-10-2-7-12-12-5-5-10z" />
          <path d="M389 222l13-5 15 10 2 16-10 12 1 15-9 24-11 17-6-9 1-22-8-14-2-20 6-12z" />
          <path d="M408 106l20-11 14 1 4 10-9 13-18 6-11-9z" fill="#aec0b7" />
          <path d="M443 140l8-13 6 3 2 13-6 12-5 14-7-4z M464 156l8-11 11 5 7-4 10 6 9-4 8 7-8 8-15 3-8 9-11-4-5-9-9 1-5-6z" />
          <path d="M452 175l8-5 7 5-2 8-7 3-3 10-8-5-2-8z M432 170l5-5 3 7-4 9-5-1z M444 195l15-6 17 4 10 12 1 15-9 10-7 20-11 16-8-3-8-21-3-17-9-10-2-11z" />
          <path d="M481 132l11-13 17 0 10-8 18 4 9 13 18 8 13 19 18 12 3 19-7 15-13-1-11 9-15-6-3-10-16-4-12-13-13-3-6-12-12 0-11-12z" />
          <path d="M492 180l13-2 9 6 4 15 10 12-1 18-8 6-7-18-10-13-7-11z M535 203l14 7 8 13-2 13-6 1-7-16z M564 231l9 4 4 13-7-3z" />
          <path d="M551 270l19-7 18 9 9 18-4 16-16 3-13-8-19 3-8-11 5-11z M493 266l5 4-2 16-4 8-4-5 2-12z M593 321l5-2 3 9-7 6-3-4z" />
          <path d="M343 343l36-4 41 6 44-3 41 5 38-1 30-6 19 19-245 12z" fill="#91adaf" />
        </g>
        <g fill="none" stroke="#9bd0d4" strokeWidth="0.5" opacity="0.14">
          <ellipse cx="450" cy="224" rx="132" ry="25" />
          <ellipse cx="450" cy="224" rx="132" ry="71" />
          <ellipse cx="450" cy="224" rx="132" ry="112" />
          <ellipse cx="450" cy="224" rx="42" ry="132" />
          <ellipse cx="450" cy="224" rx="88" ry="132" />
          <path d="M318 224H582 M450 92V356" />
        </g>
        <g fill="none" stroke="#d5e6df" strokeLinecap="round" opacity="0.15">
          <path d="M354 158c18-9 35-5 50-9m2 47c17-4 25 4 36 4m-87 35c18-6 30-1 42 4m12 73c17 7 27 5 37 0" strokeWidth="5" />
          <path d="M473 123c18-5 30 2 45 7m-20 129c15-1 21 3 32 10m-8-75c13-3 22 2 33 8" strokeWidth="4" />
          <path d="M428 113c6-1 12-1 18 0m-79 93 16 2m101 94 17 5" strokeWidth="2" />
        </g>
        <circle cx="450" cy="224" r="132" fill={`url(#${id}-night)`} />
        <g fill="#f5d59b" opacity="0.6">
          <circle cx="501" cy="173" r="1" /><circle cx="505" cy="177" r="0.8" />
          <circle cx="512" cy="171" r="0.8" /><circle cx="520" cy="182" r="1" />
          <circle cx="531" cy="196" r="0.7" /><circle cx="537" cy="201" r="1" />
          <circle cx="518" cy="222" r="0.8" /><circle cx="515" cy="216" r="0.7" />
          <circle cx="553" cy="279" r="0.9" /><circle cx="559" cy="286" r="0.7" />
        </g>
      </g>
      <path d="M 353 135 A 132 132 0 0 1 510 106" stroke="#acd7e0" strokeWidth="1.3" opacity="0.6" fill="none" />

      <g transform="rotate(-18 450 224)" fill="none">
        <path d="M140 224a310 96 0 0 0 620 0" stroke="#7da5b0" strokeWidth="1" strokeDasharray="2 7" opacity="0.7" />
        <path d="M230 292a310 96 0 0 0 195 27" stroke={signalColor} strokeWidth="1.6" opacity="0.75" />
      </g>

      {!safeMode && !complete && (
        <g fill="none" stroke={signalColor}>
          <path
            d={`M${satelliteX},${satelliteY} Q${(satelliteX + 487) / 2 + 28},${(satelliteY + 326) / 2 - 28} 487,326`}
            className="scene-signal" strokeDasharray="3 9" strokeWidth="0.9" opacity="0.35"
          />
          <circle cx="487" cy="326" r="7" strokeWidth="0.7" opacity="0.7" className="scene-station-ring" />
          <circle cx="487" cy="326" r="3" fill={signalColor} strokeWidth="0" />
          <circle cx="487" cy="326" r="7" strokeWidth="0.7" opacity="0.5" />
        </g>
      )}

      {storm && (
        <g fill="none" stroke={`url(#${id}-storm)`} strokeWidth="1.5" opacity="0.65">
          <path d="M90 113c110-31 112 24 181 3s86-20 109-12" />
          <path d="M53 137c110-31 130 24 199 3s83-23 118-14" />
          <path d="M110 161c110-31 105 20 174-1s56-16 72-11" />
        </g>
      )}

      <g className="scene-satellite" transform={`translate(${satelliteX} ${satelliteY})`}>
        <circle r="39" fill="none" stroke={signalColor} strokeWidth="0.6" strokeDasharray="2 6" opacity="0.16" />
        <g transform="rotate(27)">
          <path d="M-62 0H62" stroke="#b8a777" strokeWidth="3" />
          <rect x="-66" y="-18" width="45" height="36" rx="1" fill={`url(#${id}-panel)`} stroke="#9ab6c1" strokeWidth="0.9" />
          <rect x="21" y="-18" width="45" height="36" rx="1" fill={`url(#${id}-panel)`} stroke="#9ab6c1" strokeWidth="0.9" />
          <path d="M-66 -18H-21M21 -18H66" stroke="#c3d3dc" strokeWidth="1.2" />
          <rect x="-15" y="-20" width="30" height="40" rx="3" fill="#b59a5b" stroke="#eed69a" strokeWidth="1" />
          <path d="M-15 -20L-7 -26H18L15 -20Z" fill="#e4ce94" />
          <path d="M15 -20l3-6v36l-3 10z" fill="#776841" />
          <rect x="-10" y="-14" width="20" height="13" rx="1" fill="#d1b77d" stroke="#927b49" strokeWidth="0.6" />
          <path d="M-13 5h26M-13 12h26M0-1v19" stroke="#786741" strokeWidth="0.8" />
          <circle cx="0" cy="6" r="5" fill="#18394f" stroke="#a6c5cb" strokeWidth="1.2" />
          <circle cx="-1" cy="5" r="2.2" fill="#78a7bc" />
          <path d="M0 -26v-8m-8-1q8-8 16 0q-8 8-16 0" fill="#c6d2cf" stroke="#d5e5e2" strokeWidth="0.9" />
        </g>
      </g>
    </svg>
  );
}

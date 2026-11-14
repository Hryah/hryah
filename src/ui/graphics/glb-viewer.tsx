// glb-viewer.tsx — Легковаговий парсер і 3D-рендерер бінарних моделей .glb (glTF 2.0) на чистому Canvas.
// Не потребує зовнішніх бібліотек у package.json (Three.js тощо), працює з будь-якими моделями
// NASA 3D Resources та Kenney Space Kit із папки public/assets/models/.

import { useEffect, useRef, useState } from 'react';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Triangle {
  v0: Vec3;
  v1: Vec3;
  v2: Vec3;
  normal: Vec3;
  color: [number, number, number];
}

interface ParsedMesh {
  triangles: Triangle[];
  vertexCount: number;
  triangleCount: number;
}

interface GlTFJson {
  meshes?: Array<{
    primitives: Array<{
      attributes: Record<string, number>;
      indices?: number;
      material?: number;
      mode?: number;
    }>;
  }>;
  nodes?: Array<{
    mesh?: number;
    children?: number[];
    matrix?: number[];
    translation?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
  }>;
  scenes?: Array<{ nodes?: number[] }>;
  scene?: number;
  accessors?: Array<{
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
  }>;
  bufferViews?: Array<{
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
  }>;
  materials?: Array<{
    pbrMetallicRoughness?: {
      baseColorFactor?: [number, number, number, number];
    };
  }>;
}

const meshCache = new Map<string, ParsedMesh>();

function parseGlbBuffer(arrayBuffer: ArrayBuffer): ParsedMesh {
  const view = new DataView(arrayBuffer);
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546c67) {
    throw new Error('Невірний заголовок GLB');
  }
  const totalLen = view.getUint32(8, true);
  let offset = 12;
  let json: GlTFJson | null = null;
  let binBuffer: ArrayBuffer | null = null;

  while (offset + 8 <= totalLen && offset + 8 <= arrayBuffer.byteLength) {
    const chunkLen = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;
    if (chunkType === 0x4e4f534a) {
      const jsonBytes = new Uint8Array(arrayBuffer, offset, chunkLen);
      const text = new TextDecoder('utf-8').decode(jsonBytes);
      json = JSON.parse(text) as GlTFJson;
    } else if (chunkType === 0x004e4942) {
      binBuffer = arrayBuffer.slice(offset, offset + chunkLen);
    }
    offset += chunkLen;
  }

  if (!json || !binBuffer) {
    throw new Error('GLB не містить JSON або BIN чанка');
  }

  const accessors = json.accessors ?? [];
  const bufferViews = json.bufferViews ?? [];
  const materials = json.materials ?? [];
  const binView = new DataView(binBuffer);

  function readVec3Array(accIdx: number): Vec3[] {
    const acc = accessors[accIdx];
    if (!acc || acc.bufferView === undefined) return [];
    const bv = bufferViews[acc.bufferView];
    if (!bv) return [];
    const baseOffset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const stride = bv.byteStride ?? 12;
    const out: Vec3[] = [];
    for (let i = 0; i < acc.count; i++) {
      const off = baseOffset + i * stride;
      if (off + 12 > binBuffer!.byteLength) break;
      out.push({
        x: binView.getFloat32(off, true),
        y: binView.getFloat32(off + 4, true),
        z: binView.getFloat32(off + 8, true),
      });
    }
    return out;
  }

  function readIndices(accIdx: number): number[] {
    const acc = accessors[accIdx];
    if (!acc || acc.bufferView === undefined) return [];
    const bv = bufferViews[acc.bufferView];
    if (!bv) return [];
    const baseOffset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const out: number[] = [];
    const cType = acc.componentType;
    const step = cType === 5125 ? 4 : cType === 5123 ? 2 : 1;
    const stride = bv.byteStride ?? step;
    for (let i = 0; i < acc.count; i++) {
      const off = baseOffset + i * stride;
      if (off + step > binBuffer!.byteLength) break;
      if (cType === 5125) out.push(binView.getUint32(off, true));
      else if (cType === 5123) out.push(binView.getUint16(off, true));
      else out.push(binView.getUint8(off));
    }
    return out;
  }

  const rawTriangles: Triangle[] = [];
  let totalVertices = 0;

  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      if (prim.mode !== undefined && prim.mode !== 4) continue;
      const posIdx = prim.attributes['POSITION'];
      if (posIdx === undefined) continue;
      const positions = readVec3Array(posIdx);
      totalVertices += positions.length;

      const mat = prim.material !== undefined ? materials[prim.material] : undefined;
      const baseColor = mat?.pbrMetallicRoughness?.baseColorFactor ?? [0.78, 0.83, 0.92, 1];
      const rgb: [number, number, number] = [
        Math.round(baseColor[0] * 255),
        Math.round(baseColor[1] * 255),
        Math.round(baseColor[2] * 255),
      ];

      const indices =
        prim.indices !== undefined
          ? readIndices(prim.indices)
          : positions.map((_, idx) => idx);

      for (let i = 0; i + 2 < indices.length; i += 3) {
        const v0 = positions[indices[i]!];
        const v1 = positions[indices[i + 1]!];
        const v2 = positions[indices[i + 2]!];
        if (!v0 || !v1 || !v2) continue;

        const ux = v1.x - v0.x;
        const uy = v1.y - v0.y;
        const uz = v1.z - v0.z;
        const vx = v2.x - v0.x;
        const vy = v2.y - v0.y;
        const vz = v2.z - v0.z;
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1;

        rawTriangles.push({
          v0,
          v1,
          v2,
          normal: { x: nx / len, y: ny / len, z: nz / len },
          color: rgb,
        });
      }
    }
  }

  if (rawTriangles.length === 0) {
    throw new Error('GLB не містить трикутників');
  }

  // Даунсемплінг для надто високополігональних моделей NASA, щоб рендер на Canvas був 60 FPS
  const MAX_TRIANGLES = 3500;
  const step = rawTriangles.length > MAX_TRIANGLES ? Math.ceil(rawTriangles.length / MAX_TRIANGLES) : 1;
  const sampled = step > 1 ? rawTriangles.filter((_, idx) => idx % step === 0) : rawTriangles;

  // Нормалізація координат у куб [-1, 1]
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const t of sampled) {
    for (const v of [t.v0, t.v1, t.v2]) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
      if (v.z > maxZ) maxZ = v.z;
    }
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const maxSpan = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.0001);
  const scale = 1.75 / maxSpan;

  const normalized: Triangle[] = sampled.map((t) => ({
    v0: { x: (t.v0.x - cx) * scale, y: (t.v0.y - cy) * scale, z: (t.v0.z - cz) * scale },
    v1: { x: (t.v1.x - cx) * scale, y: (t.v1.y - cy) * scale, z: (t.v1.z - cz) * scale },
    v2: { x: (t.v2.x - cx) * scale, y: (t.v2.y - cy) * scale, z: (t.v2.z - cz) * scale },
    normal: t.normal,
    color: t.color,
  }));

  return {
    triangles: normalized,
    vertexCount: totalVertices,
    triangleCount: rawTriangles.length,
  };
}

export interface GlbCanvasProps {
  readonly url: string;
  readonly width?: number;
  readonly height?: number;
  readonly accentColor?: string;
  readonly onFallback?: () => void;
}

export function GlbModelCanvas({
  url,
  width = 300,
  height = 220,
  accentColor = '#5ca8ff',
  onFallback,
}: GlbCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [meshInfo, setMeshInfo] = useState<{ tris: number; verts: number } | null>(null);
  const rotRef = useRef({ yaw: 0.6, pitch: 0.35, dragging: false, lastX: 0, lastY: 0 });

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    const cached = meshCache.get(url);
    if (cached) {
      setMeshInfo({ tris: cached.triangleCount, verts: cached.vertexCount });
      setStatus('ready');
      return;
    }

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        if (cancelled) return;
        const parsed = parseGlbBuffer(buf);
        meshCache.set(url, parsed);
        setMeshInfo({ tris: parsed.triangleCount, verts: parsed.vertexCount });
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
        onFallback?.();
      });

    return () => {
      cancelled = true;
    };
  }, [url, onFallback]);

  useEffect(() => {
    if (status !== 'ready') return;
    const mesh = meshCache.get(url);
    const canvas = canvasRef.current;
    if (!mesh || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;

    const render = () => {
      if (!rotRef.current.dragging) {
        rotRef.current.yaw += 0.012;
      }
      const { yaw, pitch } = rotRef.current;
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
      const cosX = Math.cos(pitch), sinX = Math.sin(pitch);

      const transform = (v: Vec3): Vec3 => {
        const x1 = v.x * cosY - v.z * sinY;
        const z1 = v.x * sinY + v.z * cosY;
        const y2 = v.y * cosX - z1 * sinX;
        const z2 = v.y * sinX + z1 * cosX;
        return { x: x1, y: y2, z: z2 };
      };

      ctx.clearRect(0, 0, width, height);

      // Сітка фону
      ctx.strokeStyle = 'rgba(92, 168, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < width; gx += 24) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, height);
        ctx.stroke();
      }
      for (let gy = 0; gy < height; gy += 24) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(width, gy);
        ctx.stroke();
      }

      const projected = mesh.triangles.map((t) => {
        const p0 = transform(t.v0);
        const p1 = transform(t.v1);
        const p2 = transform(t.v2);
        const n = transform(t.normal);
        const avgZ = (p0.z + p1.z + p2.z) / 3;
        return { p0, p1, p2, n, avgZ, color: t.color };
      });

      projected.sort((a, b) => a.avgZ - b.avgZ);

      const fov = Math.min(width, height) * 0.52;
      const cx = width / 2;
      const cy = height / 2;
      const lightDir = { x: 0.45, y: 0.65, z: 0.61 };

      for (const tri of projected) {
        const d0 = 3.2 - tri.p0.z;
        const d1 = 3.2 - tri.p1.z;
        const d2 = 3.2 - tri.p2.z;
        if (d0 <= 0.2 || d1 <= 0.2 || d2 <= 0.2) continue;

        const sx0 = cx + (tri.p0.x * fov) / d0;
        const sy0 = cy - (tri.p0.y * fov) / d0;
        const sx1 = cx + (tri.p1.x * fov) / d1;
        const sy1 = cy - (tri.p1.y * fov) / d1;
        const sx2 = cx + (tri.p2.x * fov) / d2;
        const sy2 = cy - (tri.p2.y * fov) / d2;

        const dot = Math.abs(tri.n.x * lightDir.x + tri.n.y * lightDir.y + tri.n.z * lightDir.z);
        const shade = 0.28 + 0.72 * dot;
        const r = Math.min(255, Math.round(tri.color[0] * shade));
        const g = Math.min(255, Math.round(tri.color[1] * shade));
        const b = Math.min(255, Math.round(tri.color[2] * shade));

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.moveTo(sx0, sy0);
        ctx.lineTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.closePath();
        ctx.fill();
      }

      animId = window.requestAnimationFrame(render);
    };

    animId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animId);
  }, [status, url, width, height]);

  if (status === 'error') {
    return null;
  }

  return (
    <div style={{ position: 'relative', width, height, userSelect: 'none' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={(e) => {
          rotRef.current.dragging = true;
          rotRef.current.lastX = e.clientX;
          rotRef.current.lastY = e.clientY;
        }}
        onMouseMove={(e) => {
          if (!rotRef.current.dragging) return;
          const dx = e.clientX - rotRef.current.lastX;
          const dy = e.clientY - rotRef.current.lastY;
          rotRef.current.yaw += dx * 0.01;
          rotRef.current.pitch = Math.max(-1.4, Math.min(1.4, rotRef.current.pitch + dy * 0.01));
          rotRef.current.lastX = e.clientX;
          rotRef.current.lastY = e.clientY;
        }}
        onMouseUp={() => {
          rotRef.current.dragging = false;
        }}
        onMouseLeave={() => {
          rotRef.current.dragging = false;
        }}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 8,
          background: '#090c15',
          cursor: 'grab',
          border: `1px solid ${accentColor}33`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 6,
          left: 8,
          right: 8,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: '#8a90a8',
          pointerEvents: 'none',
        }}
      >
        <span>3D GLB · перетягни мишею</span>
        {meshInfo && <span>{meshInfo.tris.toLocaleString()} tris</span>}
      </div>
    </div>
  );
}

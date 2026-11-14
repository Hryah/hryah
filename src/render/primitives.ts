// primitives.ts — кодові об'єкти світу з примітивів Three.js: планета, кільце орбіти,
// сектор тіні, зорі, коробка пульта. Кольори лише з палітри. Викликати в Scene.mount.
import * as THREE from 'three';
import { flatMaterial, glowMaterial, lineMaterial, palette, type PaletteColor } from './palette';

/** Звільняє геометрії й матеріали всього піддерева та виймає його зі сцени. */
export function disposeObject(object: THREE.Object3D): void {
  object.removeFromParent();
  object.traverse((node) => {
    const item = node as Partial<THREE.Mesh>;
    item.geometry?.dispose();
    const material = item.material;
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
      m.dispose();
    }
  });
}

// Малий детермінований генератор: зорі й материки однакові за кожного запуску.
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Коробка з темним контуром по ребрах (правило вигляду 1). */
export function createBox(width: number, height: number, depth: number, color: PaletteColor): THREE.Group {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, flatMaterial(color)));
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lineMaterial('outline')));
  return group;
}

export interface Planet {
  group: THREE.Group;
  /** Куля, що обертається (материки рухаються). */
  globe: THREE.Mesh;
  atmosphere: THREE.Mesh;
  atmosphereMaterial: THREE.MeshBasicMaterial;
}

/** Низькополігональна планета: океан і плями суші кольором вершин, навколо напівпрозора атмосфера. */
export function createPlanet(radius: number): Planet {
  const geometry = new THREE.IcosahedronGeometry(radius, 3);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const ocean = new THREE.Color(palette.planetDay);
  const land = new THREE.Color(palette.planetLand);
  const random = seeded(7);
  const centers = Array.from({ length: 9 }, () =>
    new THREE.Vector3(random() * 2 - 1, random() * 1.4 - 0.7, random() * 2 - 1).normalize());
  const centroid = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  for (let face = 0; face < position.count; face += 3) {
    centroid.set(0, 0, 0);
    for (let k = 0; k < 3; k += 1) centroid.add(vertex.fromBufferAttribute(position, face + k));
    centroid.normalize();
    const isLand = centers.some((c) => c.dot(centroid) > 0.9);
    const color = isLand ? land : ocean;
    for (let k = 0; k < 3; k += 1) color.toArray(colors, (face + k) * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const globe = new THREE.Mesh(geometry,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const atmosphereMaterial = glowMaterial('atmosphere', 0.14);
  atmosphereMaterial.side = THREE.BackSide;
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.08, 32, 16), atmosphereMaterial);

  const group = new THREE.Group();
  group.add(globe, atmosphere);
  return { group, globe, atmosphere, atmosphereMaterial };
}

/** Кільце орбіти в площині XZ. */
export function createOrbitRing(radius: number, color: PaletteColor = 'starDim', opacity = 0.7): THREE.LineLoop {
  const points: THREE.Vector3[] = [];
  const segments = 128;
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radius, 0, -Math.sin(a) * radius));
  }
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), lineMaterial(color, opacity));
}

/**
 * Плоский сектор кільця в площині XZ (тінь, зона зв'язку). Дуга шириною widthRad із центром у куті centerRad.
 * Кути відлічуються так само, як у motion.onCircle.
 */
export function createArcSector(innerRadius: number, outerRadius: number, centerRad: number, widthRad: number,
  color: PaletteColor, opacity: number): THREE.Mesh {
  const positions = new Float32Array((ARC_SEGMENTS + 1) * 2 * 3);
  const index: number[] = [];
  for (let i = 0; i < ARC_SEGMENTS; i += 1) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(geometry, glowMaterial(color, opacity));
  mesh.frustumCulled = false; // межі міняються через setArc
  mesh.userData = { innerRadius, outerRadius };
  setArc(mesh, centerRad, widthRad);
  return mesh;
}

const ARC_SEGMENTS = 48;

/** Міняє дугу наявного сектора на місці, без нових об'єктів: можна викликати з Scene.update. */
export function setArc(sector: THREE.Mesh, centerRad: number, widthRad: number): void {
  const { innerRadius, outerRadius } = sector.userData as { innerRadius: number; outerRadius: number };
  const width = Math.min(Math.max(widthRad, 0), Math.PI * 2);
  const position = sector.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i <= ARC_SEGMENTS; i += 1) {
    const a = centerRad - width / 2 + (i / ARC_SEGMENTS) * width;
    const cos = Math.cos(a);
    const sin = -Math.sin(a);
    position.setXYZ(i * 2, cos * innerRadius, 0, sin * innerRadius);
    position.setXYZ(i * 2 + 1, cos * outerRadius, 0, sin * outerRadius);
  }
  position.needsUpdate = true;
  sector.visible = width > 0.0001;
}

export interface Stars {
  points: THREE.Points;
  material: THREE.PointsMaterial;
}

/** Зоряне тло: точки на далекій сфері за сценою. */
export function createStars(count: number, radius: number, seed = 1): Stars {
  const random = seeded(seed);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const u = random() * 2 - 1;
    const a = random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    positions[i * 3] = Math.cos(a) * r * radius;
    positions[i * 3 + 1] = u * radius;
    positions[i * 3 + 2] = Math.sin(a) * r * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: palette.star, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false,
  });
  return { points: new THREE.Points(geometry, material), material };
}

/** Промінь між двома точками: одиничний циліндр, який сцена розтягує через setBeam. */
export function createBeam(color: PaletteColor, thickness = 0.04): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(thickness, thickness, 1, 6, 1, true);
  const mesh = new THREE.Mesh(geometry, glowMaterial(color, 0.8));
  mesh.visible = false;
  return mesh;
}

const UP = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();

/** Ставить промінь між точками from і to. Нових об'єктів не створює: можна викликати щокадру. */
export function setBeam(beam: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): void {
  direction.subVectors(to, from);
  const length = direction.length();
  if (length < 0.0001) { beam.visible = false; return; }
  beam.visible = true;
  beam.position.copy(from).addScaledVector(direction, 0.5);
  beam.quaternion.setFromUnitVectors(UP, direction.divideScalar(length));
  beam.scale.set(1, length, 1);
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ROOM_BLUEPRINT, canInteractWithConsole, type RoomFacing, type RoomState } from '../../core/flight/room';
import { parseAstronautTextures, roomAssetUrl } from './room-view';
import { createAstronautBillboard, ROOM_CAMERA_OFFSET } from './billboard';

function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
      geometries.add(node.geometry);
      const nodeMaterials: THREE.Material[] = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of nodeMaterials) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

export class RoomRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 80);
  private readonly target = new THREE.Vector3(0, 0.65, 0);
  private readonly resizeObserver: ResizeObserver;
  private readonly abort = new AbortController();
  private readonly actor = new THREE.Group();
  private readonly consoleModel = new THREE.Group();
  private readonly interactionRing: THREE.Mesh;
  private readonly consoleIndicator: THREE.MeshStandardMaterial;
  private readonly textures = new Map<RoomFacing, THREE.Texture>();
  private actorPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private disposed = false;
  private aspect = 1.6;
  private readonly contextLost: (event: Event) => void;

  constructor(private readonly container: HTMLDivElement, onContextLost: () => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-hidden', 'true');
    this.container.appendChild(this.canvas);
    this.scene.background = new THREE.Color('#0c1622');
    this.scene.fog = new THREE.Fog('#0c1622', 28, 55);
    this.consoleIndicator = new THREE.MeshStandardMaterial({ color: '#7bdfd7', emissive: '#2fa7a1', emissiveIntensity: 1.7 });
    this.interactionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.39, 0.46, 48),
      new THREE.MeshBasicMaterial({ color: '#90f0dc', transparent: true, opacity: 0.66, depthWrite: false }),
    );
    this.interactionRing.rotation.x = -Math.PI / 2;
    this.interactionRing.position.set(ROOM_BLUEPRINT.console.interaction.xM, 0.035, ROOM_BLUEPRINT.console.interaction.zM);
    this.scene.add(this.interactionRing);
    this.buildCabin();
    this.scene.add(this.actor);
    this.contextLost = (event) => { event.preventDefault(); if (!this.disposed) onContextLost(); };
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  private material(color: string, roughness = 0.72, metalness = 0.25) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  private box(parent: THREE.Object3D, size: [number, number, number], at: [number, number, number], material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...at);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private buildCabin() {
    const { bounds, obstacles } = ROOM_BLUEPRINT;
    const width = bounds.maxXM - bounds.minXM;
    const depth = bounds.maxZM - bounds.minZM;
    const floor = this.material('#334452', 0.9, 0.25);
    const wall = this.material('#273948');
    const trim = this.material('#102433', 0.6, 0.55);
    const warm = this.material('#c39a64', 0.6, 0.6);
    this.box(this.scene, [width + 0.32, 0.35, depth + 0.32], [0, -0.22, 0], trim);
    this.box(this.scene, [width, 0.1, depth], [0, -0.05, 0], floor);
    // Only the far walls exist. The two camera-facing sides are open cutaways.
    this.box(this.scene, [width + 0.18, 2.55, 0.18], [0, 1.275, bounds.minZM - 0.09], wall);
    this.box(this.scene, [0.18, 2.55, depth], [bounds.minXM - 0.09, 1.275, 0], wall);
    this.box(this.scene, [width, 0.13, 0.24], [0, 2.55, bounds.minZM], trim);
    this.box(this.scene, [0.24, 0.13, depth], [bounds.minXM, 2.55, 0], trim);

    const lines: number[] = [];
    for (let x = bounds.minXM; x <= bounds.maxXM; x++) lines.push(x, 0.008, bounds.minZM, x, 0.008, bounds.maxZM);
    for (let z = bounds.minZM; z <= bounds.maxZM; z++) lines.push(bounds.minXM, 0.008, z, bounds.maxXM, 0.008, z);
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)),
      new THREE.LineBasicMaterial({ color: '#49616d', transparent: true, opacity: 0.5 })));
    for (let x = -4; x <= 4; x += 2) {
      this.box(this.scene, [0.045, 2.3, 0.055], [x, 1.3, bounds.minZM + 0.025], trim);
    }
    for (let z = -2.5; z <= 2.5; z += 2.5) {
      this.box(this.scene, [0.055, 0.045, 1.45], [bounds.minXM + 0.16, 1.18, z], warm);
      this.box(this.scene, [0.12, 0.13, 0.1], [bounds.minXM + 0.12, 1.18, z - 0.67], trim);
      this.box(this.scene, [0.12, 0.13, 0.1], [bounds.minXM + 0.12, 1.18, z + 0.67], trim);
    }
    // Recessed observation window and a small planet: decorative world geometry.
    this.box(this.scene, [1.8, 1.05, 0.14], [2.8, 1.65, bounds.minZM + 0.055], trim);
    this.box(this.scene, [1.57, 0.83, 0.04], [2.8, 1.65, bounds.minZM + 0.145], this.material('#09213b', 0.3, 0.35));
    const planet = new THREE.Mesh(new THREE.SphereGeometry(0.33, 28, 16), this.material('#4e95aa', 0.8, 0));
    planet.position.set(2.76, 1.68, bounds.minZM + 0.18);
    planet.scale.z = 0.18;
    this.scene.add(planet);

    for (const obstacle of obstacles) {
      if (obstacle.kind === 'console') {
        this.consoleModel.position.set(obstacle.xM, 0, obstacle.zM);
        this.scene.add(this.consoleModel);
        this.buildFallbackConsole(obstacle.widthM, obstacle.depthM, obstacle.heightM);
        this.box(this.scene, [obstacle.widthM + 0.1, 0.075, obstacle.depthM + 0.1], [obstacle.xM, 0.04, obstacle.zM], trim);
        this.box(this.scene, [0.46, 0.055, 0.055], [obstacle.xM, 1.32, obstacle.zM - 0.03], this.consoleIndicator);
      } else {
        const group = new THREE.Group();
        group.position.set(obstacle.xM, 0, obstacle.zM);
        this.scene.add(group);
        this.box(group, [obstacle.widthM, obstacle.heightM, obstacle.depthM], [0, obstacle.heightM / 2, 0], this.material('#65736f', 0.8, 0.35));
        this.box(group, [obstacle.widthM + 0.035, 0.085, obstacle.depthM + 0.035], [0, obstacle.heightM - 0.07, 0], trim);
        this.box(group, [obstacle.widthM + 0.04, 0.06, obstacle.depthM + 0.04], [0, 0.09, 0], trim);
        for (const x of [-0.35, 0.35]) {
          this.box(group, [0.09, obstacle.heightM + 0.02, obstacle.depthM + 0.06], [x * obstacle.widthM, obstacle.heightM / 2, 0], warm);
        }
        this.box(group, [0.22, 0.17, 0.025], [0, obstacle.heightM * 0.63, obstacle.depthM / 2 + 0.02], this.material('#b8cec6'));
      }
    }
    const lightStrip = new THREE.MeshStandardMaterial({ color: '#c7f8fa', emissive: '#95d5ed', emissiveIntensity: 2.2 });
    this.box(this.scene, [3.15, 0.055, 0.06], [-1.2, 2.32, bounds.minZM + 0.15], lightStrip);
    this.scene.add(new THREE.HemisphereLight('#cee7f5', '#36404a', 2));
    const key = new THREE.DirectionalLight('#ffe7bf', 3.3);
    key.position.set(2, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 24 });
    key.shadow.normalBias = 0.035;
    this.scene.add(key);
    const fill = new THREE.PointLight('#73c5f2', 26, 12, 2);
    fill.position.set(-3, 3.4, -1.5);
    this.scene.add(fill);
  }

  private buildFallbackConsole(width: number, depth: number, height: number) {
    const body = this.material('#253f51', 0.6, 0.45);
    this.box(this.consoleModel, [width * 0.9, height * 0.67, depth * 0.88], [0, height * 0.34, 0], body);
    const display = this.box(this.consoleModel, [width * 0.8, height * 0.34, 0.08], [0, height * 0.82, depth * 0.2],
      new THREE.MeshStandardMaterial({ color: '#78c6d2', emissive: '#175b72', emissiveIntensity: 0.8 }));
    display.rotation.x = -0.28;
  }

  async initialize(): Promise<{ consoleFallback: boolean }> {
    const url = (path: string) => roomAssetUrl(path, import.meta.env.BASE_URL, window.location.href);
    const response = await fetch(url('assets/astronaut/runtime-manifest.json'), { signal: this.abort.signal });
    if (!response.ok) throw new Error('Astronaut manifest unavailable');
    const manifest = parseAstronautTextures(await response.json());
    await Promise.all((Object.entries(manifest.frames) as Array<[RoomFacing, string]>).map(async ([direction, frame]) => {
      const texture = await new THREE.TextureLoader().loadAsync(url(frame));
      if (this.disposed) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      this.textures.set(direction, texture);
    }));
    if (this.disposed) return { consoleFallback: false };
    this.actorPlane = createAstronautBillboard(manifest, this.textures.get('front'));
    this.actor.add(this.actorPlane);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.23, 32), new THREE.MeshBasicMaterial({ color: '#071017', transparent: true, opacity: 0.25, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.015;
    shadow.scale.y = 0.65;
    this.actor.add(shadow);
    try {
      const gltf = await new GLTFLoader().loadAsync(url('assets/room/console-power.glb'));
      if (this.disposed) { disposeObject(gltf.scene); return { consoleFallback: false }; }
      const obstacle = ROOM_BLUEPRINT.obstacles.find((item) => item.kind === 'console');
      if (!obstacle) { disposeObject(gltf.scene); return { consoleFallback: true }; }
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = Math.min(obstacle.heightM / size.y, obstacle.widthM / size.x, obstacle.depthM / size.z);
      gltf.scene.scale.setScalar(scale);
      gltf.scene.position.set(-center.x * scale, -bounds.min.y * scale + 0.08, -center.z * scale);
      gltf.scene.traverse((node) => { if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; } });
      disposeObject(this.consoleModel);
      this.consoleModel.clear();
      this.consoleModel.add(gltf.scene);
      return { consoleFallback: false };
    } catch {
      return { consoleFallback: true };
    }
  }

  private resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.aspect = width / height;
    const viewHeight = Math.max(10.3, 14.4 / this.aspect);
    this.camera.left = -viewHeight * this.aspect / 2;
    this.camera.right = viewHeight * this.aspect / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  render(state: RoomState, dtS: number) {
    if (this.disposed) return;
    this.actor.position.set(state.player.xM, 0.025, state.player.zM);
    if (this.actorPlane) {
      const texture = this.textures.get(state.player.facing);
      if (texture && this.actorPlane.material.map !== texture) {
        this.actorPlane.material.map = texture;
        this.actorPlane.material.needsUpdate = true;
      }
    }
    this.interactionRing.visible = !state.console.completed;
    (this.interactionRing.material as THREE.MeshBasicMaterial).opacity = canInteractWithConsole(state) ? 0.8 : 0.3;
    this.consoleIndicator.color.set(state.console.completed ? '#b4f1b5' : '#7bdfd7');
    this.consoleIndicator.emissive.set(state.console.completed ? '#53c56d' : '#2fa7a1');
    const desired = new THREE.Vector3(
      THREE.MathUtils.clamp(state.player.xM * 0.2, -0.7, 0.7), 0.65,
      THREE.MathUtils.clamp(state.player.zM * 0.2, -0.6, 0.6),
    );
    this.target.lerp(desired, 1 - Math.exp(-Math.max(dtS, 0) * 5));
    this.camera.position.copy(this.target).add(new THREE.Vector3(ROOM_CAMERA_OFFSET.x, ROOM_CAMERA_OFFSET.y, ROOM_CAMERA_OFFSET.z));
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    disposeObject(this.scene);
    this.textures.forEach((texture) => texture.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}

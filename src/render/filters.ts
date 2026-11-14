// filters.ts — візуальні фільтри: постобробка готового кадру шейдером.
// Фільтр — це одна GLSL-функція `vec4 filterColor(sampler2D frame, vec2 uv)`, яка повертає колір пікселя.
// Сцени про фільтри нічого не знають: фільтр вмикається ззовні (StageCanvas filters={[...]}) і діє на весь кадр.
// Кілька фільтрів застосовуються по черзі, у порядку списку.
import * as THREE from 'three';

export interface Filter {
  /** Назва для налагодження й для ключа в React. */
  name: string;
  /**
   * GLSL із функцією `vec4 filterColor(sampler2D frame, vec2 uv)`.
   * Доступні: `uResolution` (розмір кадру в пікселях), `uTime` (секунди) і власні uniforms фільтра.
   */
  glsl: string;
  /** Власні параметри фільтра. Значення можна міняти на льоту: `filter.uniforms.uSize.value = 6`. */
  uniforms?: Record<string, { value: number | THREE.Color | THREE.Vector2 | THREE.Vector3 }>;
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const fragment = (glsl: string): string => /* glsl */ `
uniform sampler2D tFrame;
uniform vec2 uResolution;
uniform float uTime;
varying vec2 vUv;
${glsl}
void main() {
  gl_FragColor = filterColor(tFrame, vUv);
  #include <colorspace_fragment>
}`;

interface Pass {
  filter: Filter;
  material: THREE.ShaderMaterial;
}

function createTargets(renderer: THREE.WebGLRenderer, width: number, height: number) {
  // WebGL2 гарантує RGBA8; HDR використовуємо лише з підтримкою рендеру у float-буфер.
  const type = renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const colorFormat = type === THREE.HalfFloatType ? gl.RGBA16F : gl.RGBA8;
  // При втраті контексту WebGL2 повертає null: тоді MSAA просто вимкнено.
  const colorSamples = (gl.getInternalformatParameter(gl.RENDERBUFFER, colorFormat, gl.SAMPLES) as Int32Array | null) ?? new Int32Array(0);
  const depthSamples = (gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES) as Int32Array | null) ?? new Int32Array(0);
  // Ліміт MSAA залежить і від формату кольору, і від формату глибини; нуль вимикає MSAA.
  const samples = Math.max(0, ...Array.from(colorSamples).filter((n) =>
    n <= 4 && n <= renderer.capabilities.maxSamples && depthSamples.includes(n)));
  return {
    scene: new THREE.WebGLRenderTarget(width, height, { samples, type }),
    swap: [
      new THREE.WebGLRenderTarget(width, height, { depthBuffer: false, type }),
      new THREE.WebGLRenderTarget(width, height, { depthBuffer: false, type }),
    ],
  };
}

export interface FilterChain {
  /** Замінює список фільтрів. Ті самі фільтри не перестворює; порожній список вимикає постобробку. */
  set(filters: readonly Filter[]): void;
  isActive(): boolean;
  /** Малює сцену через фільтри. Викликати замість renderer.render, коли isActive(). */
  render(scene: THREE.Scene, camera: THREE.Camera, timeS: number): void;
  /** Розмір у пікселях буфера (з урахуванням щільності екрана). */
  resize(widthPx: number, heightPx: number): void;
  dispose(): void;
}

export function createFilterChain(renderer: THREE.WebGLRenderer): FilterChain {
  let passes: Pass[] = [];
  let width = 1;
  let height = 1;
  // Буфери потрібні лише після першого ввімкнення фільтрів.
  let targets: ReturnType<typeof createTargets> | null = null;
  const resolution = new THREE.Vector2(1, 1);

  // Один трикутник на весь екран.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const quad = new THREE.Mesh(geometry);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const disposePasses = (): void => {
    for (const pass of passes) pass.material.dispose();
    passes = [];
  };

  return {
    set(filters) {
      // StageCanvas синхронізує фільтри і при монтуванні, і при зміні props.
      if (passes.length === filters.length && passes.every((pass, i) => pass.filter === filters[i])) return;
      disposePasses();
      if (filters.length > 0) targets ??= createTargets(renderer, width, height);
      passes = filters.map((filter) => ({
        filter,
        material: new THREE.ShaderMaterial({
          vertexShader: VERTEX,
          fragmentShader: fragment(filter.glsl),
          uniforms: {
            ...filter.uniforms, // ті самі об'єкти: зміна value у фільтрі одразу видна шейдеру
            tFrame: { value: null },
            uResolution: { value: resolution },
            uTime: { value: 0 },
          },
          depthTest: false,
          depthWrite: false,
        }),
      }));
    },
    isActive: () => passes.length > 0,
    render(scene, camera, timeS) {
      if (!targets || passes.length === 0) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      const { scene: sceneTarget, swap } = targets;
      renderer.setRenderTarget(sceneTarget);
      renderer.render(scene, camera);
      let source: THREE.WebGLRenderTarget = sceneTarget;
      passes.forEach((pass, i) => {
        const last = i === passes.length - 1;
        const target = last ? null : swap[i % 2] ?? null;
        const uniforms = pass.material.uniforms;
        if (uniforms.tFrame) uniforms.tFrame.value = source.texture;
        if (uniforms.uTime) uniforms.uTime.value = timeS;
        quad.material = pass.material;
        renderer.setRenderTarget(target);
        renderer.render(quadScene, quadCamera);
        if (target) source = target;
      });
      renderer.setRenderTarget(null);
    },
    resize(widthPx, heightPx) {
      const w = Math.max(1, Math.floor(widthPx));
      const h = Math.max(1, Math.floor(heightPx));
      if (w === width && h === height) return;
      width = w;
      height = h;
      resolution.set(w, h);
      targets?.scene.setSize(w, h);
      for (const target of targets?.swap ?? []) target.setSize(w, h);
    },
    dispose() {
      disposePasses();
      targets?.scene.dispose();
      for (const target of targets?.swap ?? []) target.dispose();
      targets = null;
      geometry.dispose();
    },
  };
}

// ───────────────────────── Готові фільтри ─────────────────────────
// Кожна функція повертає новий фільтр зі своїми параметрами.

/** Великі пікселі: кадр ніби намальований у низькій роздільності. sizePx — сторона «пікселя» в пікселях екрана. */
export const pixelate = (sizePx = 4): Filter => ({
  name: 'pixelate',
  uniforms: { uSize: { value: sizePx } },
  glsl: /* glsl */ `
uniform float uSize;
vec4 filterColor(sampler2D frame, vec2 uv) {
  vec2 cell = uSize / uResolution;
  return texture2D(frame, (floor(uv / cell) + 0.5) * cell);
}`,
});

/** Обмежена кількість відтінків на канал: плоскі «мальовані» переходи. */
export const posterize = (levels = 5): Filter => ({
  name: 'posterize',
  uniforms: { uLevels: { value: levels } },
  glsl: /* glsl */ `
uniform float uLevels;
vec4 filterColor(sampler2D frame, vec2 uv) {
  vec4 c = texture2D(frame, uv);
  // Рахуємо сходинки в «екранній» гамі, щоб темні тони не злипались.
  vec3 g = pow(max(c.rgb, 0.0), vec3(1.0 / 2.2));
  g = floor(g * uLevels + 0.5) / uLevels;
  return vec4(pow(g, vec3(2.2)), c.a);
}`,
});

/** Затемнення до країв кадру. strength 0..1. */
export const vignette = (strength = 0.5): Filter => ({
  name: 'vignette',
  uniforms: { uStrength: { value: strength } },
  glsl: /* glsl */ `
uniform float uStrength;
vec4 filterColor(sampler2D frame, vec2 uv) {
  vec4 c = texture2D(frame, uv);
  float d = distance(uv, vec2(0.5)) * 1.4142;
  return vec4(c.rgb * (1.0 - uStrength * smoothstep(0.45, 1.0, d)), c.a);
}`,
});

/** Рядки розгортки старого монітора, що повільно пливуть. strength 0..1. */
export const scanlines = (strength = 0.25): Filter => ({
  name: 'scanlines',
  uniforms: { uStrength: { value: strength } },
  glsl: /* glsl */ `
uniform float uStrength;
vec4 filterColor(sampler2D frame, vec2 uv) {
  vec4 c = texture2D(frame, uv);
  float line = 0.5 + 0.5 * sin((uv.y * uResolution.y / 3.0 + uTime * 2.0) * 6.2832);
  return vec4(c.rgb * (1.0 - uStrength * line), c.a);
}`,
});

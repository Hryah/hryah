import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createFilterChain, pixelate, posterize, vignette, type Filter } from './filters';

function setup({ halfFloat = true, colorSamples = [4, 2], depthSamples = [4, 2], maxSamples = 4 } = {}) {
  const gl = {
    RENDERBUFFER: 0x8d41, RGBA16F: 0x881a, RGBA8: 0x8058, DEPTH_COMPONENT24: 0x81a6, SAMPLES: 0x80a9,
    getInternalformatParameter: vi.fn((_target: number, format: number, _name: number) =>
      new Int32Array(format === 0x81a6 ? depthSamples : colorSamples)),
  };
  let target: THREE.WebGLRenderTarget | null = null;
  const draws: { target: THREE.WebGLRenderTarget | null; material: THREE.ShaderMaterial | null }[] = [];
  const renderer = {
    extensions: { has: vi.fn(() => halfFloat) },
    capabilities: { maxSamples },
    getContext: vi.fn(() => gl),
    setRenderTarget: vi.fn((next: THREE.WebGLRenderTarget | null) => { target = next; }),
    render: vi.fn((scene: THREE.Scene, _camera: THREE.Camera) => {
      const mesh = scene.children.find((child) => child instanceof THREE.Mesh);
      const material = mesh instanceof THREE.Mesh && mesh.material instanceof THREE.ShaderMaterial ? mesh.material : null;
      draws.push({ target, material });
    }),
  };
  const chain = createFilterChain(renderer as unknown as THREE.WebGLRenderer);
  const render = (timeS = 1) => chain.render(new THREE.Scene(), new THREE.PerspectiveCamera(), timeS);
  return { chain, renderer, gl, draws, render };
}

describe('ланцюжок фільтрів', () => {
  it('порожній список не створює буферів і малює сцену напряму', () => {
    const { chain, renderer, render, draws } = setup();
    chain.set([]);
    chain.resize(600, 400);
    render();
    expect(chain.isActive()).toBe(false);
    expect(renderer.extensions.has).not.toHaveBeenCalled();
    expect(renderer.getContext).not.toHaveBeenCalled();
    expect(draws).toEqual([{ target: null, material: null }]);
    chain.dispose();
  });

  it('зміни числових uniforms потрапляють у матеріал наступного кадру без перекомпіляції', () => {
    const { chain, render, draws } = setup();
    const filter = pixelate(4);
    chain.set([filter]);
    render();
    const material = draws.at(-1)?.material;
    expect(material?.uniforms.uSize?.value).toBe(4);
    filter.uniforms!.uSize!.value = 6;
    render();
    expect(draws.at(-1)?.material).toBe(material);
    expect(material?.uniforms.uSize?.value).toBe(6);
    chain.dispose();
  });

  it('оновлює Color і Vector uniforms та службові розмір і час', () => {
    const { chain, render, draws } = setup();
    const color = new THREE.Color(0.2, 0.3, 0.4);
    const offset = new THREE.Vector2(1, 2);
    const direction = new THREE.Vector3(1, 0, 0);
    const filter: Filter = {
      name: 'custom', glsl: 'vec4 filterColor(sampler2D frame, vec2 uv) { return texture2D(frame, uv); }',
      uniforms: { color: { value: color }, offset: { value: offset }, direction: { value: direction } },
    };
    chain.set([filter]);
    color.setRGB(0.5, 0.6, 0.7);
    offset.set(3, 4);
    direction.set(0, 1, 0);
    chain.resize(800, 600);
    render(12);
    const uniforms = draws.at(-1)?.material?.uniforms;
    expect(uniforms?.color?.value).toEqual(color);
    expect(uniforms?.offset?.value).toEqual(offset);
    expect(uniforms?.direction?.value).toEqual(direction);
    expect(uniforms?.uResolution?.value).toEqual(new THREE.Vector2(800, 600));
    expect(uniforms?.uTime?.value).toBe(12);
    chain.dispose();
  });

  it('повторна синхронізація тих самих фільтрів при mount зберігає матеріали', () => {
    const { chain, render, draws } = setup();
    const filters = [pixelate(), vignette()];
    chain.set(filters);
    render();
    const material = draws.at(-1)?.material;
    if (!material) throw new Error('Немає матеріалу фільтра');
    const dispose = vi.fn();
    material.addEventListener('dispose', dispose);
    chain.set([...filters]);
    render();
    expect(draws.at(-1)?.material).toBe(material);
    expect(dispose).not.toHaveBeenCalled();
    chain.set([posterize()]);
    expect(dispose).toHaveBeenCalledTimes(1);
    render();
    expect(draws.at(-1)?.material).not.toBe(material);
    chain.set([]);
    expect(chain.isActive()).toBe(false);
    chain.dispose();
  });

  it.each([true, false])('усі буфери використовують підтримуваний формат (half-float: %s)', (halfFloat) => {
    const { chain, render, draws, gl } = setup({ halfFloat });
    chain.resize(640, 480);
    chain.set([pixelate(), posterize(), vignette()]);
    render();
    const targets = draws.flatMap((draw) => draw.target ? [draw.target] : []);
    expect(targets).toHaveLength(3);
    for (const target of targets) {
      expect(target.texture.type).toBe(halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType);
      expect([target.width, target.height]).toEqual([640, 480]);
    }
    expect(gl.getInternalformatParameter).toHaveBeenCalledWith(gl.RENDERBUFFER, halfFloat ? gl.RGBA16F : gl.RGBA8, gl.SAMPLES);
    expect(draws.at(-1)?.target).toBeNull();
    chain.dispose();
  });

  it.each([
    { colorSamples: [8, 4, 2], depthSamples: [4, 2], maxSamples: 8, expected: 4 },
    { colorSamples: [4, 2], depthSamples: [2], maxSamples: 4, expected: 2 },
    { colorSamples: [4, 2], depthSamples: [4, 2], maxSamples: 2, expected: 2 },
    { colorSamples: [], depthSamples: [4, 2], maxSamples: 4, expected: 0 },
    { colorSamples: [2], depthSamples: [4], maxSamples: 4, expected: 0 },
  ])('підбирає MSAA для кольору й глибини: $expected', ({ expected, ...options }) => {
    const { chain, render, draws } = setup(options);
    chain.set([pixelate()]);
    render();
    expect(draws[0]?.target?.samples).toBe(expected);
    chain.dispose();
  });

  it('звільняє створені буфери та матеріали', () => {
    const { chain, render, draws } = setup();
    chain.set([pixelate(), posterize(), vignette()]);
    render();
    const disposals: ReturnType<typeof vi.fn>[] = [];
    for (const draw of draws) {
      for (const resource of [draw.target, draw.material]) {
        if (!resource) continue;
        const onDispose = vi.fn();
        resource.addEventListener('dispose', onDispose);
        disposals.push(onDispose);
      }
    }
    chain.dispose();
    for (const onDispose of disposals) expect(onDispose).toHaveBeenCalledTimes(1);
    expect(chain.isActive()).toBe(false);
  });
});

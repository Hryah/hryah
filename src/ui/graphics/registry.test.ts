import { describe, expect, it } from 'vitest';
import { SAMPLE_CATALOG, SAMPLE_DESIGN, SAMPLE_MISSION } from '../../core/stubs';
import { parseGlbBuffer } from './glb-viewer';
import { DEFAULT_TEMPLATES, TemplateRegistry, templateRegistry } from './registry';

function buildTestGlbWithNodeTransforms(): ArrayBuffer {
  // Трикутник у локальних координатах [0,0,0], [1,0,0], [0,1,0]
  const vertices = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);
  const binBytes = new Uint8Array(vertices.buffer);

  // Два вузли, що посилаються на той самий меш 0, але рознесені по осі X через translation
  const gltfJson = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { mesh: 0, translation: [-10, 0, 0] },
      { mesh: 0, translation: [10, 0, 0] },
    ],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0 } }],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
      },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: binBytes.byteLength,
      },
    ],
  };

  const jsonStr = JSON.stringify(gltfJson);
  const jsonPadded = jsonStr + ' '.repeat((4 - (jsonStr.length % 4)) % 4);
  const jsonBytes = new TextEncoder().encode(jsonPadded);

  const totalLen = 12 + 8 + jsonBytes.byteLength + 8 + binBytes.byteLength;
  const buf = new ArrayBuffer(totalLen);
  const view = new DataView(buf);
  const outBytes = new Uint8Array(buf);

  // GLB Header
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLen, true);

  // JSON Chunk
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  outBytes.set(jsonBytes, 20);

  // BIN Chunk
  const binChunkOffset = 20 + jsonBytes.byteLength;
  view.setUint32(binChunkOffset, binBytes.byteLength, true);
  view.setUint32(binChunkOffset + 4, 0x004e4942, true);
  outBytes.set(binBytes, binChunkOffset + 8);

  return buf;
}

describe('TemplateRegistry (Графічний адаптер)', () => {
  it('має прив’язані темплейти для всіх модулів SAMPLE_CATALOG', () => {
    for (const mod of SAMPLE_CATALOG.modules) {
      const tpl = templateRegistry.getModuleTemplate(mod.slot, mod.id);
      expect(tpl.id).toBe(mod.id);
      expect(tpl.slot).toBe(mod.slot);
      expect(tpl.blueprint.label.length).toBeGreaterThan(0);
    }
  });

  it('має темплейти для всіх ракет-носіїв SAMPLE_MISSION', () => {
    for (const launcher of SAMPLE_MISSION.launchers) {
      const tpl = templateRegistry.getLauncherTemplate(launcher.id);
      expect(tpl.id).toBe(launcher.id);
      expect(tpl.category).toBe('launcher');
      expect(tpl.blueprint.label.length).toBeGreaterThan(0);
    }
  });

  it('у DEFAULT_TEMPLATES прописані лише наявні у репозиторії 3D асети без мертвих посилань', () => {
    const committedGlbs = new Set([
      '/assets/models/spacecraft/satellite_bus.glb',
      '/assets/models/modules/solar_medium.glb',
      '/assets/models/modules/antenna_medium.glb',
    ]);
    for (const tpl of DEFAULT_TEMPLATES) {
      if (tpl.model3d) {
        expect(committedGlbs.has(tpl.model3d.url)).toBe(true);
      }
      expect(tpl.sprite2d).toBeUndefined();
      expect(tpl.planetTextures).toBeUndefined();
    }
  });

  it('будує повну візуальну збірку SpacecraftVisualAssembly зі стану гри', () => {
    const assembly = templateRegistry.buildAssembly({
      phase: 'design',
      mission: SAMPLE_MISSION,
      design: SAMPLE_DESIGN,
      damages: [{ system: 'power', severity: 0.5 }],
    });

    expect(assembly.busTemplate.id).toBe('bus:standard');
    expect(assembly.launcherTemplate.id).toBe(SAMPLE_DESIGN.launcherId);
    expect(assembly.bodyTemplate.id).toBe('Earth');
    expect(assembly.attachedModules.engine.moduleId).toBe('eng-chem');
    expect(assembly.attachedModules.solar.damageSeverity).toBe(0.5);
    expect(assembly.attachedModules.battery.damageSeverity).toBe(0.5);
    expect(assembly.attachedModules.instrument.damageSeverity).toBe(0);
  });

  it('безпечно працює з порожнім реєстром new TemplateRegistry([]) без non-null падінь', () => {
    const emptyReg = new TemplateRegistry([]);
    expect(emptyReg.getBusTemplate().id).toBe('bus:standard');
    expect(emptyReg.getLauncherTemplate('custom-lv').id).toBe('custom-lv');
    expect(emptyReg.getBodyTemplate('Mars').id).toBe('Mars');
    expect(emptyReg.getModuleTemplate('engine', 'eng-fusion-x99').id).toBe('eng-fusion-x99');

    const assembly = emptyReg.buildAssembly({
      phase: 'design',
      mission: SAMPLE_MISSION,
      design: SAMPLE_DESIGN,
    });
    expect(assembly.busTemplate.blueprint.shape).toBe('satellite-bus');
    expect(assembly.attachedModules.engine.template.blueprint.shape).toBe('engine-chem');
  });

  it('підтримує персонажів та довільні фігури через getTemplate та register', () => {
    const astronaut = templateRegistry.getTemplate('char:astronaut');
    expect(astronaut.category).toBe('character');
    expect(astronaut.blueprint.shape).toBe('character-astronaut');

    const unknownProp = templateRegistry.getTemplate('prop:custom-crate');
    expect(unknownProp.category).toBe('prop');
    expect(unknownProp.blueprint.shape).toBe('prop-custom');
  });

  it('parseGlbBuffer враховує трансформації вузлів glTF (scenes/nodes translation)', () => {
    const glb = buildTestGlbWithNodeTransforms();
    const parsed = parseGlbBuffer(glb);
    // Обидва вузли з мешем 0 мають бути інстансовані (2 трикутники) і рознесені по осі X
    expect(parsed.triangleCount).toBe(2);
    const t0 = parsed.triangles[0]!;
    const t1 = parsed.triangles[1]!;
    expect(t0.v0.x).toBeLessThan(-0.5);
    expect(t1.v0.x).toBeGreaterThan(0.5);
  });
});

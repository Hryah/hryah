import { describe, expect, it } from 'vitest';
import { SAMPLE_CATALOG, SAMPLE_DESIGN, SAMPLE_MISSION } from '../../core/stubs';
import { TemplateRegistry, templateRegistry } from './registry';

describe('TemplateRegistry (Графічний адаптер)', () => {
  it('має прив’язані темплейти для всіх модулів SAMPLE_CATALOG', () => {
    for (const mod of SAMPLE_CATALOG.modules) {
      const tpl = templateRegistry.getModuleTemplate(mod.slot, mod.id);
      expect(tpl.id).toBe(mod.id);
      expect(tpl.slot).toBe(mod.slot);
      expect(tpl.model3d?.url).toContain('/assets/models/');
      expect(tpl.blueprint.label.length).toBeGreaterThan(0);
    }
  });

  it('має темплейти для всіх ракет-носіїв SAMPLE_MISSION', () => {
    for (const launcher of SAMPLE_MISSION.launchers) {
      const tpl = templateRegistry.getLauncherTemplate(launcher.id);
      expect(tpl.id).toBe(launcher.id);
      expect(tpl.category).toBe('launcher');
      expect(tpl.model3d?.url).toContain('/assets/models/launchers/');
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

  it('безпечно повертає слот-фолбек для нового невідомого модуля з майбутнього catalog.json', () => {
    const reg = new TemplateRegistry();
    const fallback = reg.getModuleTemplate('engine', 'eng-fusion-x99');
    expect(fallback.id).toBe('eng-fusion-x99');
    expect(fallback.slot).toBe('engine');
    expect(fallback.blueprint.label).toBe('ENG-FUSION-X99');
  });

  it('підтримує персонажів та довільні фігури через getTemplate та register', () => {
    const astronaut = templateRegistry.getTemplate('char:astronaut');
    expect(astronaut.category).toBe('character');
    expect(astronaut.model3d?.url).toBe('/assets/models/characters/astronaut.glb');

    const unknownProp = templateRegistry.getTemplate('prop:custom-crate');
    expect(unknownProp.category).toBe('prop');
    expect(unknownProp.blueprint.shape).toBe('prop-custom');
  });
});

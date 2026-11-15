import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SAMPLE_CATALOG, SAMPLE_DESIGN, SAMPLE_MISSION } from '../../core/stubs';
import {
  BlueprintShapeSvg,
  CompositeSpacecraftSvg,
  GraphicsRendererRegistry,
  SpacecraftViewport,
  TemplateUnitView,
} from './index';
import { DEFAULT_TEMPLATES, resolveAssetUrl, TemplateRegistry, templateRegistry } from './registry';

// URL у реєстрі вже з префіксом BASE_URL (напр. /experimental/): для звірки з файлами public/ знімаємо його.
const fromBase = (url: string): string => {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return url.startsWith(prefix) ? `/${url.slice(prefix.length)}` : url;
};

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

  it('у DEFAULT_TEMPLATES усі темплейти працюють виключно на наявних 2D SVG асетах без 3D GLB і мертвих посилань', () => {
    const publicAssetKeys = new Set(
      Object.keys(import.meta.glob('../../../public/assets/**/*', { eager: false })).map(
        (key) => `/${key.replace(/^.*\/public\//, '')}`,
      ),
    );
    for (const tpl of DEFAULT_TEMPLATES) {
      expect(tpl.model3d).toBeUndefined();
      expect(tpl.sprite2d?.url, `Missing sprite2d on ${tpl.id}`).toBeTruthy();
      expect(publicAssetKeys.has(fromBase(tpl.sprite2d!.url)), `Missing sprite2d file: ${tpl.sprite2d!.url}`).toBe(true);
      if (tpl.planetTextures?.dayMapUrl) {
        expect(
          publicAssetKeys.has(fromBase(tpl.planetTextures.dayMapUrl)),
          `Missing planetTextures file: ${tpl.planetTextures.dayMapUrl}`,
        ).toBe(true);
      }
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

  it('resolveAssetUrl є ідемпотентним для повторних викликів з URL реєстру', () => {
    const first = resolveAssetUrl('assets/icons/ui/rocket.svg');
    expect(resolveAssetUrl(first)).toBe(first);
    const tpl = templateRegistry.getModuleTemplate('solar', 'sol-m');
    expect(resolveAssetUrl(tpl.sprite2d!.url)).toBe(tpl.sprite2d!.url);
  });

  it('у режимі Blueprint CompositeSpacecraftSvg не містить <image> (зокрема earth-map.svg) і рендерить векторний контур', () => {
    const assembly = templateRegistry.buildAssembly({
      phase: 'design',
      mission: SAMPLE_MISSION,
      design: SAMPLE_DESIGN,
    });

    const blueprintHtml = renderToStaticMarkup(
      createElement(CompositeSpacecraftSvg, {
        assembly,
        altKm: SAMPLE_DESIGN.altKm,
        fuelKg: SAMPLE_DESIGN.fuelKg,
        mode: 'blueprint',
      }),
    );
    expect(blueprintHtml).not.toContain('<image');
    expect(blueprintHtml).not.toContain('earth-map.svg');
    expect(blueprintHtml).toContain('ORBIT: 500 km (Earth)');
    expect(blueprintHtml).toContain('<circle');
    expect(blueprintHtml).toContain('<ellipse');

    const preferSpritesFalseHtml = renderToStaticMarkup(
      createElement(CompositeSpacecraftSvg, {
        assembly,
        altKm: SAMPLE_DESIGN.altKm,
        fuelKg: SAMPLE_DESIGN.fuelKg,
        preferSprites: false,
      }),
    );
    expect(preferSpritesFalseHtml).not.toContain('<image');

    const spriteHtml = renderToStaticMarkup(
      createElement(CompositeSpacecraftSvg, {
        assembly,
        altKm: SAMPLE_DESIGN.altKm,
        fuelKg: SAMPLE_DESIGN.fuelKg,
        mode: 'sprite',
      }),
    );
    expect(spriteHtml).toContain('<image');
    expect(spriteHtml).toContain('earth');
  });

  it('TemplateUnitView у режимі blueprint прибирає <img> і малює векторну форму', () => {
    const body = templateRegistry.getBodyTemplate('Earth');
    const bpHtml = renderToStaticMarkup(createElement(TemplateUnitView, { template: body, mode: 'blueprint' }));
    expect(bpHtml).not.toContain('<img');
    expect(bpHtml).toContain('<svg');
    expect(bpHtml).toContain('EARTH');

    const spriteHtml = renderToStaticMarkup(createElement(TemplateUnitView, { template: body, mode: 'sprite' }));
    expect(spriteHtml).toContain('<img');
    expect(spriteHtml).toContain('earth');
  });

  it('TemplateRegistry масштабується через aliases, префікси fab-*, cargo-* та фолбеки планет (Mars)', () => {
    // Вбудовані аліаси з маніфесту
    const hall = templateRegistry.getModuleTemplate('engine', 'eng-hall');
    expect(hall.id).toBe('eng-hall');
    expect(hall.blueprint.shape).toBe('engine-ion');
    expect(hall.sprite2d?.url).toContain('eng-ion.svg');

    const roll = templateRegistry.getModuleTemplate('solar', 'sol-roll');
    expect(roll.blueprint.shape).toBe('solar-large');
    expect(roll.sprite2d?.url).toContain('sol-l.svg');

    // Динамічний ланцюговий аліас і захист від циклів
    const customReg = new TemplateRegistry();
    customReg.registerAlias('eng-custom-v2', 'eng-hall');
    customReg.registerAlias('cycle-a', 'cycle-b');
    customReg.registerAlias('cycle-b', 'cycle-a');
    expect(customReg.getModuleTemplate('engine', 'eng-custom-v2').blueprint.shape).toBe('engine-ion');
    expect(customReg.resolveTemplateId('cycle-a')).toBe('cycle-a');

    // Власні згенеровані модулі fab-* наслідують базу без втрати спрайта
    const fabCam = templateRegistry.getModuleTemplate('instrument', 'fab-cam-s-borealis-1');
    expect(fabCam.id).toBe('fab-cam-s-borealis-1');
    expect(fabCam.blueprint.shape).toBe('camera-compact');
    expect(fabCam.sprite2d?.url).toContain('cam-s.svg');

    // Вантажні контейнери cargo-* отримують спеціалізовану форму cargo-container замість камери
    const cargoWater = templateRegistry.getModuleTemplate('instrument', 'cargo-water');
    expect(cargoWater.blueprint.shape).toBe('cargo-container');
    expect(cargoWater.sprite2d).toBeUndefined();

    // Відомі небесні тіла мають окремий векторний контур без підміни ID на Earth
    const mars = templateRegistry.getBodyTemplate('Mars');
    expect(mars.id).toBe('Mars');
    expect(mars.blueprint.shape).toBe('body-mars');

    // Невідомий launcherId у непорожньому реєстрі зберігає переданий id і лейбл
    const unknownLauncher = templateRegistry.getLauncherTemplate('super-heavy-x');
    expect(unknownLauncher.id).toBe('super-heavy-x');
    expect(unknownLauncher.blueprint.label).toBe('SUPER-HEAVY-X');
    expect(unknownLauncher.blueprint.shape).toBe('launcher-medium');

    // Невідоме небесне тіло поза BODY_FALLBACKS у непорожньому реєстрі теж зберігає передані id та label
    const unknownBody = templateRegistry.getBodyTemplate('Europa');
    expect(unknownBody.id).toBe('Europa');
    expect(unknownBody.displayName).toBe('Europa');
    expect(unknownBody.blueprint.label).toBe('EUROPA');
  });

  it('GraphicsRendererRegistry дозволяє підключати нові форми, режими і кнопки у SpacecraftViewport', () => {
    const customRegistry = new GraphicsRendererRegistry();
    customRegistry.registerBlueprintShape('thruster-nuclear', ({ spec }) =>
      createElement('polygon', { points: '50,10 80,85 20,85', fill: spec.accentColor, 'data-custom-shape': 'nuclear' }),
    );
    customRegistry.registerModeOption({ id: 'thermal', label: 'Thermal' });
    customRegistry.registerUnitRenderer('thermal', ({ template }) =>
      createElement('div', { 'data-thermal-unit': template.id }, template.blueprint.label),
    );

    const customHtml = renderToStaticMarkup(
      createElement(BlueprintShapeSvg, {
        spec: {
          shape: 'thruster-nuclear',
          primaryColor: '#111827',
          secondaryColor: '#374151',
          accentColor: '#22d3ee',
          scaleFactor: 1,
          label: 'NTR-1',
        },
        registry: customRegistry,
      }),
    );
    expect(customHtml).toContain('data-custom-shape="nuclear"');

    const viewportHtml = renderToStaticMarkup(
      createElement(SpacecraftViewport, {
        context: { phase: 'design', mission: SAMPLE_MISSION, design: SAMPLE_DESIGN },
        defaultMode: 'thermal',
        registry: customRegistry,
      }),
    );
    expect(viewportHtml).toContain('Thermal');
    expect(viewportHtml).toContain('data-thermal-unit=');
    const buttonTags = viewportHtml.match(/<button\b[^>]*>/g) ?? [];
    expect(buttonTags.length).toBeGreaterThan(0);
    for (const tag of buttonTags) {
      expect(tag).toContain('type="button"');
    }
  });

  it('CompositeSpacecraftSvg огортає слоти у Fragment key={slot}, тому сторонній SlotCompositeRenderer без key не дає React-попереджень', () => {
    const assembly = templateRegistry.buildAssembly({
      phase: 'design',
      mission: SAMPLE_MISSION,
      design: SAMPLE_DESIGN,
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const html = renderToStaticMarkup(
        createElement(CompositeSpacecraftSvg, {
          assembly,
          altKm: SAMPLE_DESIGN.altKm,
          fuelKg: SAMPLE_DESIGN.fuelKg,
          slotRenderers: {
            engine: () => createElement('g', { 'data-custom-slot': 'engine-no-key' }),
            antenna: () => createElement('g', { 'data-custom-slot': 'antenna-no-key' }),
          },
        }),
      );
      expect(html).toContain('data-custom-slot="engine-no-key"');
      expect(html).toContain('data-custom-slot="antenna-no-key"');
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });
});

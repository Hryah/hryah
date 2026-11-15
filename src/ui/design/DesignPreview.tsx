import { useEffect, useState, type ReactNode } from "react";
import type { DesignState } from "../../core/design";
import { CompositeSpacecraftSvg, templateRegistry } from "../graphics";
import { t } from "../text";
import { DesignStage } from "./DesignStage";

const C = { panel: "#141829", line: "#2a2f4a", dim: "#8a90a8", accent: "#5ca8ff", activeBg: "#1b2644" };

export type BuiltinDesignPreviewMode = "stage" | "svg" | "blueprint";
export type DesignPreviewMode = BuiltinDesignPreviewMode | (string & {});

export interface DesignPreviewView {
  readonly id: DesignPreviewMode;
  readonly label: string;
  readonly render: (ctx: { readonly state: DesignState; readonly active: boolean }) => ReactNode;
}

export interface DesignPreviewProps {
  readonly state: DesignState;
  readonly active?: boolean;
  readonly defaultMode?: DesignPreviewMode;
  readonly extraViews?: readonly DesignPreviewView[];
}

function buildAssemblyForDesign(state: DesignState) {
  return templateRegistry.buildAssembly({
    phase: "design",
    mission: state.input.mission,
    design: state.design,
  });
}

/**
 * Єдиний переглядач апарата на екрані проєктування:
 * усуває одночасний подвійний рендер 3D-стенду та 2D-схеми,
 * але дає змогу перемикатися між 3D, 2D SVG та Blueprint і додавати нові режими через extraViews.
 */
export function DesignPreview({
  state,
  active = true,
  defaultMode = "stage",
  extraViews,
}: DesignPreviewProps) {
  const [mode, setMode] = useState<DesignPreviewMode>(defaultMode);
  // Ліниво монтуємо 3D-стенд при першому показі й надалі призупиняємо через active={false},
  // щоб перемикання у 2D SVG/Blueprint не перестворювало WebGL-контекст при поверненні.
  const [stageMounted, setStageMounted] = useState(defaultMode === "stage");

  const selectMode = (nextMode: DesignPreviewMode) => {
    if (nextMode === "stage") setStageMounted(true);
    setMode(nextMode);
  };

  const builtinViews: readonly DesignPreviewView[] = [
    {
      id: "stage",
      label: t("ui.designPreview.stage"),
      render: ({ state: s, active: isActive }) => <DesignStage state={s} active={isActive} />,
    },
    {
      id: "svg",
      label: t("ui.designPreview.svg"),
      render: ({ state: s }) => (
        <CompositeSpacecraftSvg
          assembly={buildAssemblyForDesign(s)}
          altKm={s.design.altKm}
          fuelKg={s.design.fuelKg}
          mode="sprite"
        />
      ),
    },
    {
      id: "blueprint",
      label: t("ui.designPreview.blueprint"),
      render: ({ state: s }) => (
        <CompositeSpacecraftSvg
          assembly={buildAssemblyForDesign(s)}
          altKm={s.design.altKm}
          fuelKg={s.design.fuelKg}
          mode="blueprint"
        />
      ),
    },
  ];

  const views: readonly DesignPreviewView[] = extraViews
    ? [
        ...builtinViews,
        ...extraViews.filter((ext) => !builtinViews.some((base) => base.id === ext.id)),
      ]
    : builtinViews;

  const activeView = views.find((v) => v.id === mode) ?? views[0]!;
  const stageView = views.find((v) => v.id === "stage");
  const isStageActive = activeView.id === "stage";
  const shouldKeepStageMounted = stageMounted || isStageActive;

  useEffect(() => {
    if (isStageActive && !stageMounted) {
      setStageMounted(true);
    }
  }, [isStageActive, stageMounted]);

  return (
    <div style={{ background: C.panel, borderRadius: 12, padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: C.dim, fontSize: 12 }}>{t("ui.designPreview.title")}</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {views.map((view) => {
            const selected = view.id === activeView.id;
            return (
              <button
                key={view.id}
                type="button"
                aria-pressed={selected}
                onClick={() => selectMode(view.id)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: `1px solid ${selected ? C.accent : C.line}`,
                  background: selected ? C.activeBg : "transparent",
                  color: selected ? C.accent : C.dim,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: selected ? 700 : 400,
                }}
              >
                {view.label}
              </button>
            );
          })}
        </div>
      </div>
      {shouldKeepStageMounted && stageView && (
        <div style={{ display: isStageActive ? "block" : "none" }}>
          {stageView.render({ state, active: active && isStageActive })}
        </div>
      )}
      {!isStageActive && activeView.render({ state, active })}
    </div>
  );
}

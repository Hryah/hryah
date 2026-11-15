import { useEffect, useMemo, useRef, useState } from "react";
import type { FlightResult, Mission, MissionOutcome, SpacecraftSpec } from "../../core/contracts";
import { MAX_ORBIT_ACTIONS, sanitizeFlight, type MissionReport } from "../../core/consortium";
import { flightPhase } from "../../core/flight";
import { orbitPhase, type OrbitAction } from "../../core/orbit";
import { FlightScreen } from "../flight";
import { OrbitPrototype } from "../orbit/OrbitPrototype";
import "./campaign-orbit.css";
import { fmt, t } from "../text";
import { cardsEnabled, PhaseCard, useCardsEnabled, type SummaryRow } from "./PhaseCard";

// Виконавець місії в кампанії: гравець сам грає політ і орбіту свого запуску, а наприкінці звіт іде в кімнату.
// Кімната перераховує орбіту з тих самих дій і сіду, тож показане тут збігається з тим, що зарахують.

const C = { panel: "#141829", line: "#2a2f4a", dim: "#8a90a8", ok: "#3ddc84", bad: "#ff5c7a", accent: "#5ca8ff" };
const button = {
  padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.line}`, background: "transparent",
  color: "inherit", cursor: "pointer", fontSize: 15,
} as const;
const overlay = {
  // Знизу ліворуч: правий верхній кут займає мінікарта станції, а внизу по центру — підказка керування.
  position: "fixed", left: 16, bottom: 16, zIndex: 1100, maxWidth: 300, fontSize: 13, gap: 8, display: "grid",
  background: "rgba(20, 24, 41, 0.92)", border: `1px solid ${C.line}`, borderRadius: 12, padding: 12,
} as const;

export interface MissionRunnerProps {
  agencyName: string;
  mission: Mission;
  spec: SpacecraftSpec;
  seeds: { flight: number; orbit: number };
  active: boolean;
  windowNumber?: number;
  onReport: (report: MissionReport) => void;
}

type Stage =
  | { kind: "flight" }
  | { kind: "orbit"; flight: FlightResult };

export function MissionRunner({ agencyName, mission: missionProp, spec: specProp, seeds, active, windowNumber, onReport }: MissionRunnerProps) {
  // Місія й апарат за час одного запуску не змінюються; фіксуємо їх, щоб опитування кімнати не перераховувало орбіту.
  const [{ mission, spec }] = useState(() => ({ mission: missionProp, spec: specProp }));
  const [stage, setStage] = useState<Stage>({ kind: "flight" });
  // Інформаційне вікно перед польотом і перед орбітою. Політ іде в реальному часі, тож поки вікно відкрите, він не змонтований.
  const [card, setCard] = useState<"launch" | "orbit" | null>(() => (cardsEnabled() ? "launch" : null));
  const [flight, setFlight] = useState(() => flightPhase.init({ mission, spec, log: [] }, seeds.flight));
  const [orbitActions, setOrbitActions] = useState<OrbitAction[]>([]);
  // Звіт надіслано й чекаємо, поки кімната його прийме (тоді цей екран зникне). Якщо мережа підвела, кнопка знову активна.
  const [sending, setSending] = useState(false);
  const cardsOn = useCardsEnabled();
  // Звіт надіслано саме з вікна: воно лишається відкритим до відповіді кімнати, навіть якщо гравець щойно вимкнув вікна.
  const [viaCard, setViaCard] = useState(false);
  useEffect(() => {
    if (!sending) return;
    const timer = setTimeout(() => setSending(false), 8000);
    return () => clearTimeout(timer);
  }, [sending]);
  const flightResult = stage.kind === "orbit" ? stage.flight : null;
  const orbit = useMemo(() => {
    if (!flightResult) return null;
    let s = orbitPhase.init({ mission, spec, flight: flightResult, log: [] }, seeds.orbit);
    for (const a of orbitActions) s = orbitPhase.step(s, a);
    return s;
  }, [flightResult, orbitActions, mission, spec, seeds.orbit]);

  // Політ завершився (сам чи кнопкою): переходимо до орбіти, а якщо апарат втрачено, звіт іде одразу.
  const reportRef = useRef(onReport);
  reportRef.current = onReport;
  useEffect(() => {
    if (stage.kind !== "flight" || !flightPhase.isDone(flight)) return;
    const result = sanitizeFlight(mission, spec, flightPhase.finish(flight).result);
    // Втрата апарата: звіт іде кнопкою (можна повторити, якщо мережа підвела), а не автоматично.
    if (result.deploymentStatus !== "lost") {
      setStage({ kind: "orbit", flight: result });
      setCard(cardsEnabled() ? "orbit" : null);
    }
  }, [flight, stage.kind, mission, spec]);
  const cargo = mission.kind === "cargo";

  if (stage.kind === "flight") {
    const lost = flight.gameMode === "GAME_OVER";
    const sendLost = () => {
      setSending(true);
      reportRef.current({ flight: sanitizeFlight(mission, spec, flightPhase.finish(flight).result), orbitActions: [] });
    };
    if (card === "launch") {
      return active ? <PhaseCard id="launch" step={{ n: 2, total: 4 }} summary={launchSummary(mission, spec)} onContinue={() => setCard(null)} /> : null;
    }
    if (lost && flightPhase.isDone(flight) && ((cardsOn && !sending) || viaCard)) {
      const result = flightPhase.finish(flight).result;
      return active ? (
        <PhaseCard
          id="lost" step={{ n: 4, total: 4 }} busy={sending} action={t("ui.campaign.sendReport")} onContinue={() => { setViaCard(true); sendLost(); }}
          summary={[
            { label: t("ui.card.row.status"), value: t("ui.card.lostStatus"), tone: "bad" },
            { label: t("ui.card.row.damageFlight"), value: String(result.damage.length), tone: result.damage.length > 0 ? "bad" : undefined },
          ]}
        />
      ) : null;
    }
    return (
      <>
        {active && (
          <FlightScreen
            state={flight}
            dispatch={(action) => setFlight((s) => flightPhase.step(s, action))}
          />
        )}
        <div data-testid="campaign-flight-overlay" style={{ ...overlay, display: active ? "grid" : "none" }}>
          <strong>{t("ui.campaign.flightOf", { agency: agencyName })}</strong>
          {/* Підказку керування й так показує нижня смуга польоту; тут лише пояснення втрати. */}
          {lost && <div style={{ color: C.dim, fontSize: 13 }}>{t("ui.play.lostFlightHint")}</div>}
          <div>
            <button
              disabled={sending}
              style={button}
              onClick={() => {
                if (lost && flightPhase.isDone(flight)) sendLost();
                else setFlight((s) => flightPhase.step(s, { type: "complete_phase" }));
              }}
            >
              {t(lost ? "ui.play.finishLostFlight" : "ui.play.skipFlight")}
            </button>
          </div>
        </div>
      </>
    );
  }

  if (!orbit || !flightResult) return null;
  const done = orbitPhase.isDone(orbit);
  const send = () => { setSending(true); onReport({ flight: flightResult, orbitActions }); };
  if (card === "orbit") {
    if (!active) return null;
    const target = spec.design.altKm;
    return (
      <PhaseCard
        id={cargo ? "orbitCargo" : "orbit"} step={{ n: 3, total: 4 }} onContinue={() => setCard(null)}
        summary={[
          { label: t("ui.card.row.orbitReached"), value: `${fmt(flightResult.orbit.altKm, 0)} / ${fmt(target, 0)} km`, tone: Math.abs(flightResult.orbit.altKm - target) < 1 ? "ok" : "gold" },
          { label: t("ui.card.row.period"), value: `${fmt(flightResult.orbit.periodS / 60, 1)} min` },
          { label: t("ui.card.row.fuelLeft"), value: `${fmt(flightResult.fuelLeftKg, 1)} kg` },
          { label: t("ui.card.row.damage"), value: flightResult.damage.length > 0 ? String(flightResult.damage.length) : t("ui.card.none"), tone: flightResult.damage.length > 0 ? "bad" : "ok" },
        ]}
      />
    );
  }
  // Місію завершено: підсумок і звіт з одного вікна. Числа лише тоді, коли орбіта дограна (рання відправка дограє автопілотом).
  if (done && ((cardsOn && !sending) || viaCard)) {
    if (!active) return null;
    const outcome = orbitPhase.finish(orbit).result;
    return (
      <PhaseCard
        id="report" step={{ n: 4, total: 4 }} busy={sending} action={t("ui.campaign.sendReport")} onContinue={() => { setViaCard(true); send(); }}
        summary={orbitReportSummary(mission, outcome)}
      />
    );
  }
  if (!active) return null;
  // Повний екран орбіти Нікіти (як #orbit) на весь екран, як і політ. Дії йдуть у звіт: кімната перерахує ту саму орбіту.
  // Звіт приймає не більше MAX_ORBIT_ACTIONS дій: далі решта витків іде автопілотом у кімнаті.
  const full = !done && orbitActions.length >= MAX_ORBIT_ACTIONS;
  return (
    <div className="campaign-orbit-screen" data-testid="campaign-orbit">
      <OrbitPrototype
        campaign={{
          state: orbit,
          windowNumber,
          craftName: agencyName,
          locked: full,
          onAction: (a) => !done && setOrbitActions((list) => (list.length >= MAX_ORBIT_ACTIONS ? list : [...list, a])),
          footer: (
            <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
              <button className={done ? "advance-button" : "undo-button"} disabled={sending} onClick={send}>
                📡 {t(done ? "ui.campaign.sendReport" : "ui.campaign.sendEarly")}
              </button>
              {full && <span role="status" style={{ color: C.bad, fontSize: 12 }}>{t("ui.campaign.actionsFull", { n: MAX_ORBIT_ACTIONS })}</span>}
            </div>
          ),
        }}
      />
    </div>
  );
}

export function orbitReportSummary(mission: Mission, outcome: MissionOutcome): SummaryRow[] {
  const share = mission.requiredDataMb > 0 ? Math.min(999, (outcome.deliveredMb / mission.requiredDataMb) * 100) : 0;
  const deliveryPercent = outcome.orbitSummary ? outcome.orbitSummary.cargoDelivered ? 100 : 0 : share;
  return [
    { label: t("ui.card.row.status"), value: t(outcome.success ? "ui.card.success" : "ui.card.failure"), tone: outcome.success ? "ok" : "bad" },
    mission.kind === "cargo"
      ? { label: t("ui.card.row.supplied"), value: `${fmt(deliveryPercent, 0)}%` }
      : { label: t("ui.card.row.delivered"), value: outcome.orbitSummary?.objectiveType === "flyby"
        ? `${fmt(outcome.deliveredMb, 0)} Mb` : `${fmt(outcome.deliveredMb, 0)} / ${fmt(mission.requiredDataMb, 0)} Mb` },
    { label: t("ui.card.row.survived"), value: `${outcome.survivedOrbits} / ${mission.durationOrbits}` },
    { label: t("ui.card.row.score"), value: fmt(outcome.score, 0) },
  ];
}

function launchSummary(mission: Mission, spec: SpacecraftSpec): SummaryRow[] {
  const launcher = mission.launchers.find((l) => l.id === spec.design.launcherId);
  return [
    { label: t("ui.card.row.mission"), value: t(mission.titleKey) },
    ...(launcher ? [{ label: t("ui.card.row.launcher"), value: t(launcher.nameKey) }] : []),
    { label: t("ui.card.row.mass"), value: `${fmt(spec.wetMassKg, 1)} kg` },
    { label: t("ui.card.row.dv"), value: `${fmt(spec.dvMs, 0)} / ${fmt(mission.dvRequiredMs, 0)} m/s`, tone: spec.dvMs >= mission.dvRequiredMs ? "ok" : "bad" },
    { label: t("ui.card.row.targetOrbit"), value: `${fmt(spec.design.altKm, 0)} km` },
    { label: t("ui.card.row.cost"), value: `${fmt(spec.costMUsd)} M$` },
  ];
}

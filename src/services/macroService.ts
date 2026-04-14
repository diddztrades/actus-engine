import type { MacroSnapshot } from "../types/macro";
import { getManualMacroEventsSource } from "../data/macro/manualEvents";
import { buildMacroEventRisk, normalizeMacroEvents } from "./macroEventAdapter";
import { supabase } from "./supabaseClient";

function buildFallbackMacroSnapshot(eventRisk: Partial<MacroSnapshot>["eventRisk"]): Partial<MacroSnapshot> {
  return {
    session: "London",
    primaryRead: "Momentum is tradable, but only in names showing clean continuation behavior.",
    summary: "Broad market participation is uneven. Quality matters more than quantity.",
    sessionSummary: "Be selective and avoid forcing mediocre setups.",
    disciplineTitle: "Trade the cleanest names only",
    disciplineText: "No need to distribute attention equally across weak and strong markets.",
    volatilityRegime: "normal",
    usdBias: "neutral",
    energyPressure: "normal",
    equityTone: "mixed",
    cryptoTone: "risk-on",
    eventRisk,
  };
}

export async function getMacroSnapshot(): Promise<Partial<MacroSnapshot> | undefined> {
  const eventRisk = buildMacroEventRisk(normalizeMacroEvents(getManualMacroEventsSource()));

  if (!supabase) {
    return buildFallbackMacroSnapshot(eventRisk);
  }

  const { data, error } = await supabase
    .from("macro_snapshots")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return buildFallbackMacroSnapshot(eventRisk);
  }

  return {
    session: data.session,
    primaryRead: data.primary_read,
    summary: data.summary,
    sessionSummary: data.session_summary,
    disciplineTitle: data.discipline_title,
    disciplineText: data.discipline_text,
    volatilityRegime: data.volatility_regime,
    usdBias: data.usd_bias,
    energyPressure: data.energy_pressure,
    equityTone: data.equity_tone,
    cryptoTone: data.crypto_tone,
    eventRisk,
  };
}

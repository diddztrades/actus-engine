import type { MacroEvent, MacroEventRisk } from "../types/macro";
import type { ManualMacroEventSourceItem } from "../data/macro/manualEvents";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatTimeToEvent(diffMs: number) {
  const totalMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (totalMinutes < 60) return `in ${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `in ${hours}h` : `in ${hours}h ${minutes}m`;
}

function buildTimeLabel(eventMs: number, nowMs: number) {
  const diffMs = eventMs - nowMs;
  const todayStart = startOfDay(new Date(nowMs));
  const tomorrowStart = todayStart + 86400000;
  const eventDayStart = startOfDay(new Date(eventMs));

  if (diffMs >= 0 && diffMs <= 6 * 3600000) {
    return formatTimeToEvent(diffMs);
  }
  if (eventDayStart === todayStart) {
    return "today";
  }
  if (eventDayStart === tomorrowStart) {
    return "tomorrow";
  }
  return null;
}

function buildWarning(event: MacroEvent, timeLabel: string | null, isToday: boolean) {
  if (event.impact === "high" && isToday) {
    return `High event risk today: ${event.title}. Reduce conviction near release.`;
  }
  if (timeLabel) {
    return `${event.title} ${timeLabel}. Reduce conviction near release.`;
  }
  return undefined;
}

export function normalizeMacroEvents(sourceEvents: ManualMacroEventSourceItem[]): MacroEvent[] {
  return sourceEvents
    .map((event) => ({
      id: event.id,
      title: event.title,
      datetimeUtc: event.datetimeUtc,
      impact: event.impact,
      country: event.country,
      eventType: event.eventType,
      markets: event.markets,
      tags: event.tags,
    }))
    .filter((event) => Number.isFinite(new Date(event.datetimeUtc).getTime()))
    .sort((a, b) => new Date(a.datetimeUtc).getTime() - new Date(b.datetimeUtc).getTime());
}

export function buildMacroEventRisk(events: MacroEvent[], now = new Date()): MacroEventRisk | undefined {
  const nowMs = now.getTime();
  const upcoming = events
    .map((event) => ({ ...event, eventMs: new Date(event.datetimeUtc).getTime() }))
    .filter((event) => event.eventMs >= nowMs - 30 * 60000)
    .sort((a, b) => a.eventMs - b.eventMs);

  const nextEvent = upcoming[0];
  if (!nextEvent) {
    return undefined;
  }

  const eventDate = new Date(nextEvent.eventMs);
  const isToday = eventDate.toDateString() === now.toDateString();
  const timeLabel = buildTimeLabel(nextEvent.eventMs, nowMs);

  return {
    ...nextEvent,
    timeLabel,
    warning: buildWarning(nextEvent, timeLabel, isToday),
  };
}

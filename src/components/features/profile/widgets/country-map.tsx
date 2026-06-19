import { Globe } from "lucide-react";
import { getName } from "country-list";
import { WidgetCard } from "./widget-card";
import type { ProfileWidgetData } from "./types";

/**
 * "Where your films are from" — a flag + bar breakdown of production/origin
 * countries. Borderless and uncontroversial (no map), instantly recognizable
 * via flags, fully server-rendered. (Replaced an abstract dot-bubble map that
 * read as a blank grid.)
 */

// ISO alpha-2 code → flag emoji (two regional-indicator symbols).
function flag(code: string): string {
  if (!/^[a-zA-Z]{2}$/.test(code)) return "🏳️";
  return code
    .toUpperCase()
    .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

// Friendly short names — country-list returns verbose official names
// ("United States of America (the)"). Fall back to a cleaned official name.
const SHORT_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", KR: "South Korea", KP: "North Korea",
  RU: "Russia", VN: "Vietnam", IR: "Iran", SY: "Syria", LA: "Laos", BO: "Bolivia",
  TZ: "Tanzania", VE: "Venezuela", CZ: "Czechia", MD: "Moldova", TW: "Taiwan",
  AE: "UAE", CD: "DR Congo", CG: "Congo", MK: "North Macedonia",
};

function displayName(code: string): string {
  const c = code.toUpperCase();
  if (SHORT_NAMES[c]) return SHORT_NAMES[c];
  const full = getName(code) ?? code;
  return full.replace(/\s*\(.*?\)\s*$/, "").trim();
}

export function CountryMapWidget({ data }: { data: ProfileWidgetData }) {
  const countries = data.topCountries;
  if (countries.length === 0) return null;
  const max = Math.max(...countries.map((c) => c.count), 1);

  return (
    <WidgetCard title="Where your films are from" icon={<Globe className="h-4 w-4" />}>
      <ul className="space-y-2.5">
        {countries.slice(0, 8).map((c) => (
          <li key={c.code} className="flex items-center gap-2.5">
            <span className="text-lg leading-none" aria-hidden>
              {flag(c.code)}
            </span>
            <span className="w-32 flex-shrink-0 truncate text-xs font-medium">
              {displayName(c.code)}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand/70"
                style={{ width: `${(c.count / max) * 100}%` }}
              />
            </div>
            <span className="w-6 flex-shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
              {c.count}
            </span>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

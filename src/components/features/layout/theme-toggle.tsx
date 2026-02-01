"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useMounted } from "@/hooks/use-mounted";
import {
  usePreferencesStore,
  selectBackgroundStyle,
  selectAccentColor,
  type BackgroundStyle,
  type AccentColor,
} from "@/stores/preferences";

const themes = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

const backgroundStyles: { value: BackgroundStyle; label: string; darkOnly?: boolean; lightOnly?: boolean }[] = [
  { value: "default", label: "Pure Black" },
  { value: "dim", label: "Dim" },
  { value: "charcoal", label: "Charcoal" },
  { value: "slate", label: "Slate" },
  { value: "warm", label: "Warm" },
  { value: "cool", label: "Cool" },
  { value: "cream", label: "Cream", lightOnly: true },
];

const accentColors: { value: AccentColor; label: string; color: string }[] = [
  { value: "default", label: "Cinematic", color: "bg-red-500" },
  { value: "midnight", label: "Midnight", color: "bg-blue-500" },
  { value: "forest", label: "Forest", color: "bg-emerald-500" },
  { value: "golden", label: "Golden", color: "bg-yellow-500" },
  { value: "ocean", label: "Ocean", color: "bg-cyan-500" },
  { value: "sunset", label: "Sunset", color: "bg-orange-500" },
  { value: "violet", label: "Violet", color: "bg-violet-500" },
  { value: "rose", label: "Rose", color: "bg-pink-500" },
];

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const backgroundStyle = usePreferencesStore(selectBackgroundStyle);
  const setBackgroundStyle = usePreferencesStore((state) => state.setBackgroundStyle);
  const accentColor = usePreferencesStore(selectAccentColor);
  const setAccentColor = usePreferencesStore((state) => state.setAccentColor);
  const mounted = useMounted();

  const isDark = resolvedTheme === "dark";

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9">
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  // Filter background styles based on current mode
  const availableStyles = backgroundStyles.filter((s) => {
    if (isDark && s.lightOnly) return false;
    if (!isDark && s.darkOnly) return false;
    return true;
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Mode
        </DropdownMenuLabel>
        {themes.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)} className="gap-2">
            <Icon className="h-4 w-4" />
            {label}
            {theme === value && <span className="ml-auto text-brand">✓</span>}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Style
        </DropdownMenuLabel>
        {availableStyles.map(({ value, label }) => (
          <DropdownMenuItem key={value} onClick={() => setBackgroundStyle(value)} className="gap-2">
            <span className="h-3 w-3 rounded-full bg-muted-foreground/30" />
            {label}
            {backgroundStyle === value && <span className="ml-auto text-brand">✓</span>}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Accent
        </DropdownMenuLabel>
        {accentColors.map(({ value, label, color }) => (
          <DropdownMenuItem key={value} onClick={() => setAccentColor(value)} className="gap-2">
            <span className={`h-3 w-3 rounded-full ${color}`} />
            {label}
            {accentColor === value && <span className="ml-auto text-brand">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

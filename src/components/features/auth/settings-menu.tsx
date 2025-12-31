"use client";

import { useTheme } from "next-themes";
import { Settings, Moon, Sun, Monitor, Palette, LayoutGrid, LayoutList } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { usePreferencesStore, selectCardDisplayMode, type CardDisplayMode } from "@/stores/preferences";

const themes = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

const colorThemes = [
  { value: "dark", label: "Default" },
  { value: "midnight", label: "Midnight Blue" },
  { value: "forest", label: "Forest Green" },
] as const;

const cardDisplayModes = [
  { value: "poster" as CardDisplayMode, label: "Poster Cards", icon: LayoutGrid },
  { value: "wide" as CardDisplayMode, label: "Wide Cards", icon: LayoutList },
] as const;

interface SettingsMenuProps {
  className?: string;
}

export function SettingsMenu({ className }: SettingsMenuProps) {
  const { theme, setTheme } = useTheme();
  const cardDisplayMode = usePreferencesStore(selectCardDisplayMode);
  const setCardDisplayMode = usePreferencesStore((state) => state.setCardDisplayMode);
  const mounted = useMounted();

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className={cn("h-9 w-9", className)}>
        <Settings className="h-4 w-4" />
        <span className="sr-only">Settings</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("h-9 w-9", className)}>
          <Settings className="h-4 w-4" />
          <span className="sr-only">Settings</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Card Display
        </DropdownMenuLabel>
        {cardDisplayModes.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setCardDisplayMode(value)}
            className="gap-2"
          >
            <Icon className="h-4 w-4" />
            {label}
            {cardDisplayMode === value && <span className="ml-auto text-brand">✓</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Appearance
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
          Color Theme
        </DropdownMenuLabel>
        {colorThemes.map(({ value, label }) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)} className="gap-2">
            <Palette className="h-4 w-4" />
            {label}
            {theme === value && <span className="ml-auto text-brand">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


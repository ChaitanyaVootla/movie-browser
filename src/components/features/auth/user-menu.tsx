"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { User, LogOut, Eye, List, Star, Settings, Moon, Sun, Monitor, Palette, LayoutGrid, LayoutList } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks/use-mounted";
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

interface UserMenuProps {
  className?: string;
}

export function UserMenu({ className }: UserMenuProps) {
  const { data: session, status } = useSession();
  const { theme, setTheme } = useTheme();
  const cardDisplayMode = usePreferencesStore(selectCardDisplayMode);
  const setCardDisplayMode = usePreferencesStore((state) => state.setCardDisplayMode);
  const mounted = useMounted();

  // Loading state
  if (status === "loading") {
    return <Skeleton className="h-9 w-9 rounded-full" />;
  }

  // Not authenticated - show nothing (sign in button handled by parent)
  if (status !== "authenticated" || !session?.user) {
    return null;
  }

  const user = session.user;
  const initials = getInitials(user.name || user.email || "U");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative h-9 w-9 rounded-full hover:ring-2 hover:ring-primary/20 transition-all",
            className
          )}
        >
          <Avatar className="h-8 w-8">
            {user.image && (
              <AvatarImage
                src={user.image}
                alt={user.name || "User avatar"}
                referrerPolicy="no-referrer"
              />
            )}
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56" sideOffset={8}>
        {/* User Info Header */}
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            {user.name && (
              <p className="text-sm font-medium leading-none">{user.name}</p>
            )}
            {user.email && (
              <p className="text-xs leading-none text-muted-foreground truncate">
                {user.email}
              </p>
            )}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Profile Actions */}
        <DropdownMenuItem asChild>
          <Link href="/profile" className="cursor-pointer">
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/watchlist" className="cursor-pointer">
            <List className="mr-2 h-4 w-4" />
            <span>Watchlist</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/watched" className="cursor-pointer">
            <Eye className="mr-2 h-4 w-4" />
            <span>Watched</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/ratings" className="cursor-pointer">
            <Star className="mr-2 h-4 w-4" />
            <span>My Ratings</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>

        {/* Theme Toggle Submenu */}
        {mounted && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              {theme === "light" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              <span>Appearance</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-44">
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
                    {cardDisplayMode === value && (
                      <span className="ml-auto text-brand">✓</span>
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Mode
                </DropdownMenuLabel>
                {themes.map(({ value, label, icon: Icon }) => (
                  <DropdownMenuItem
                    key={value}
                    onClick={() => setTheme(value)}
                    className="gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                    {theme === value && (
                      <span className="ml-auto text-brand">✓</span>
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Color Theme
                </DropdownMenuLabel>
                {colorThemes.map(({ value, label }) => (
                  <DropdownMenuItem
                    key={value}
                    onClick={() => setTheme(value)}
                    className="gap-2"
                  >
                    <Palette className="h-4 w-4" />
                    {label}
                    {theme === value && (
                      <span className="ml-auto text-brand">✓</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        )}

        <DropdownMenuSeparator />

        {/* Sign Out */}
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-destructive focus:text-destructive cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}



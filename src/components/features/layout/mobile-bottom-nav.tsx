"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Home,
  Compass,
  Search,
  User,
  List,
  Eye,
  Star,
  LogOut,
  Settings,
  Moon,
  Sun,
  ChevronRight,
  Bookmark,
} from "lucide-react";
import { useState, useCallback } from "react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { Sheet, SheetContent, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearch } from "@/components/features/search";
import { useLoginDialog } from "@/components/features/auth";
import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks/use-mounted";

// =============================================================================
// Types
// =============================================================================

interface NavItem {
  href?: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: () => void;
}

// =============================================================================
// Mobile User Menu Sheet
// =============================================================================

interface MobileUserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function MobileUserSheet({ open, onOpenChange }: MobileUserSheetProps) {
  const { data: session, status } = useSession();
  const { theme, setTheme } = useTheme();
  const { openLoginDialog } = useLoginDialog();
  const mounted = useMounted();

  const user = session?.user;
  const isAuthenticated = status === "authenticated";

  const menuItems = isAuthenticated
    ? [
        { href: "/watchlist", label: "Watchlist", icon: List },
        { href: "/watched", label: "Watched", icon: Eye },
        { href: "/ratings", label: "My Ratings", icon: Star },
        { href: "/settings", label: "Settings", icon: Settings },
      ]
    : [];

  const handleSignIn = () => {
    onOpenChange(false);
    openLoginDialog();
  };

  const handleSignOut = () => {
    onOpenChange(false);
    signOut({ callbackUrl: "/" });
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-8 px-0">
        <SheetHeader className="px-6 pb-4 border-b border-border/30">
          <SheetTitle className="text-left">
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  {user.image && (
                    <AvatarImage
                      src={user.image}
                      alt={user.name || "User"}
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                    {getInitials(user.name || user.email || "U")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start">
                  {user.name && <span className="font-semibold text-base">{user.name}</span>}
                  {user.email && (
                    <span className="text-sm text-muted-foreground">{user.email}</span>
                  )}
                </div>
              </div>
            ) : (
              <span className="text-lg">Menu</span>
            )}
          </SheetTitle>
        </SheetHeader>

        <nav className="flex flex-col py-2">
          {/* Auth-only menu items */}
          {isAuthenticated &&
            menuItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href!}
                onClick={() => onOpenChange(false)}
                className={cn(
                  "flex items-center gap-4 px-6 py-3.5",
                  "text-foreground/90 hover:bg-muted/50",
                  "active:bg-muted transition-colors"
                )}
              >
                <Icon className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1 font-medium">{label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
              </Link>
            ))}

          {/* Theme toggle */}
          {mounted && (
            <button
              onClick={toggleTheme}
              className={cn(
                "flex items-center gap-4 px-6 py-3.5 w-full text-left",
                "text-foreground/90 hover:bg-muted/50",
                "active:bg-muted transition-colors"
              )}
            >
              {theme === "dark" ? (
                <Moon className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Sun className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="flex-1 font-medium">
                {theme === "dark" ? "Dark Mode" : "Light Mode"}
              </span>
              <div
                className={cn(
                  "w-10 h-6 rounded-full relative transition-colors",
                  theme === "dark" ? "bg-brand" : "bg-muted-foreground/30"
                )}
              >
                <div
                  className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                    theme === "dark" ? "translate-x-5" : "translate-x-1"
                  )}
                />
              </div>
            </button>
          )}

          {/* Separator */}
          <div className="h-px bg-border/30 my-2 mx-6" />

          {/* Sign in / Sign out */}
          {isAuthenticated ? (
            <button
              onClick={handleSignOut}
              className={cn(
                "flex items-center gap-4 px-6 py-3.5 w-full text-left",
                "text-destructive hover:bg-destructive/10",
                "active:bg-destructive/20 transition-colors"
              )}
            >
              <LogOut className="h-5 w-5" />
              <span className="font-medium">Sign Out</span>
            </button>
          ) : (
            <button
              onClick={handleSignIn}
              className={cn(
                "flex items-center gap-4 px-6 py-3.5 w-full text-left",
                "text-brand hover:bg-brand/10",
                "active:bg-brand/20 transition-colors"
              )}
            >
              <User className="h-5 w-5" />
              <span className="font-medium">Sign In</span>
            </button>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// Nav Item Component
// =============================================================================

interface NavItemButtonProps {
  item: NavItem;
  isActive: boolean;
}

function NavItemButton({ item, isActive }: NavItemButtonProps) {
  const Icon = item.icon;

  const content = (
    <div className="flex flex-col items-center gap-0.5 relative py-1">
      <Icon
        className={cn(
          "h-5 w-5 transition-colors",
          isActive ? "text-brand" : "text-muted-foreground/70"
        )}
      />
      <span
        className={cn(
          "text-[10px] font-medium transition-colors leading-none",
          isActive ? "text-brand" : "text-muted-foreground/70"
        )}
      >
        {item.label}
      </span>
    </div>
  );

  if (item.href) {
    return (
      <Link href={item.href} className="flex-1 flex justify-center py-2 active:opacity-70">
        {content}
      </Link>
    );
  }

  return (
    <button
      onClick={item.action}
      className="flex-1 flex justify-center py-2 active:opacity-70 cursor-pointer"
      type="button"
    >
      {content}
    </button>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function MobileBottomNav() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { setOpen: setSearchOpen } = useSearch();
  const [isUserSheetOpen, setIsUserSheetOpen] = useState(false);

  const isAuthenticated = status === "authenticated";
  const isLoading = status === "loading";
  const user = session?.user;

  const handleSearchClick = useCallback(() => {
    setSearchOpen(true);
  }, [setSearchOpen]);

  const handleUserClick = useCallback(() => {
    setIsUserSheetOpen(true);
  }, []);

  const isPathActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href);
  };

  const navItems: NavItem[] = [
    { href: "/", label: "Home", icon: Home },
    { href: "/browse", label: "Browse", icon: Compass },
    { label: "Search", icon: Search, action: handleSearchClick },
    { href: "/watchlist", label: "Watchlist", icon: Bookmark },
  ];

  return (
    <>
      {/* Bottom navigation bar - mobile only */}
      <nav
        className={cn(
          "fixed bottom-0 inset-x-0 z-40 md:hidden",
          "overflow-visible" // Allow AI bubble to float above
        )}
      >
        {/* Background bar */}
        <div className="absolute inset-x-0 bottom-0 h-14 bg-background/95 backdrop-blur-xl border-t border-border/30 pointer-events-none" />
        {/* Nav items - z-10 ensures above background */}
        <div className="relative z-10 flex items-end justify-around h-14 px-1">
          {navItems.map((item) => (
            <NavItemButton
              key={item.label}
              item={item}
              isActive={item.href ? isPathActive(item.href) : false}
            />
          ))}

          {/* User avatar button */}
          <button
            onClick={handleUserClick}
            className="flex-1 flex justify-center py-2 active:opacity-70"
            type="button"
          >
            <div className="flex flex-col items-center gap-0.5">
              {isLoading ? (
                <Skeleton className="h-5 w-5 rounded-full" />
              ) : isAuthenticated ? (
                <Avatar className="h-5 w-5 ring-1 ring-border/40">
                  {user?.image && (
                    <AvatarImage
                      src={user.image}
                      alt={user.name || "User"}
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <AvatarFallback className="text-[8px] bg-primary/10 text-primary font-medium">
                    {getInitials(user?.name || "U")}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <User className="h-5 w-5 text-muted-foreground/70" />
              )}
              <span className="text-[10px] font-medium text-muted-foreground/70 leading-none">
                {isAuthenticated ? "You" : "Menu"}
              </span>
            </div>
          </button>
        </div>
      </nav>

      {/* User menu sheet */}
      <MobileUserSheet open={isUserSheetOpen} onOpenChange={setIsUserSheetOpen} />
    </>
  );
}

// =============================================================================
// Utilities
// =============================================================================

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

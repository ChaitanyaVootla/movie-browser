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
  ListChecks,
  Eye,
  Star,
  LogOut,
  Settings,
  Moon,
  Sun,
  ChevronRight,
  Bookmark,
  Download,
  NotebookPen,
  BarChart3,
  Bell,
} from "lucide-react";
import { useState, useCallback } from "react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { UserAvatar } from "@/components/features/profile/user-avatar";
import {
  useUserStore,
  selectViewerAvatarUrl,
  selectViewerAvatarCrop,
  selectViewerAccent,
} from "@/stores/user";
import { useSearch } from "@/components/features/search";
import { useLoginDialog } from "@/components/features/auth";
import { cn } from "@/lib/utils";
import { useHistoryDismiss } from "@/hooks/use-history-dismiss";
import { useMounted } from "@/hooks/use-mounted";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { useUsername } from "@/hooks/use-username";

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
  const { canPrompt, isInstalled, promptInstall } = useInstallPrompt();
  const { username } = useUsername();
  const viewerAvatarUrl = useUserStore(selectViewerAvatarUrl);
  const viewerAvatarCrop = useUserStore(selectViewerAvatarCrop);
  const viewerAccent = useUserStore(selectViewerAccent);

  const user = session?.user;
  const isAuthenticated = status === "authenticated";

  // Mobile Back / swipe-down closes the menu instead of navigating the page.
  useHistoryDismiss(open, () => onOpenChange(false));

  const menuItems = isAuthenticated
    ? [
        {
          href: username ? `/u/${username}` : "/settings",
          label: username ? "Profile" : "Set up profile",
          icon: User,
        },
        { href: "/notifications", label: "Notifications", icon: Bell },
        { href: "/watchlist", label: "Watchlist", icon: List },
        { href: "/lists", label: "Lists", icon: ListChecks },
        { href: "/diary", label: "Diary", icon: NotebookPen },
        { href: "/stats", label: "Stats", icon: BarChart3 },
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
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="rounded-t-3xl px-0 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
        <div className="px-6 pb-4 border-b border-border/30">
          <DrawerTitle className="text-left">
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <UserAvatar
                  src={viewerAvatarUrl ?? user.image}
                  crop={viewerAvatarCrop}
                  accent={viewerAccent ?? "default"}
                  name={user.name || user.email || "U"}
                  alt={user.name || "User"}
                  className="h-12 w-12"
                  fallbackClassName="bg-primary/10 text-primary text-sm font-medium"
                />
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
          </DrawerTitle>
        </div>

        <nav className="flex flex-col py-2">
          {/* Auth-only menu items */}
          {isAuthenticated &&
            menuItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href!}
                prefetch={false}
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

          {/* Install App - only show when installable and not already installed */}
          {canPrompt && !isInstalled && (
            <button
              onClick={() => {
                promptInstall();
                onOpenChange(false);
              }}
              className={cn(
                "flex items-center gap-4 px-6 py-3.5 w-full text-left",
                "text-brand hover:bg-brand/10",
                "active:bg-brand/20 transition-colors"
              )}
            >
              <Download className="h-5 w-5" />
              <span className="font-medium">Install App</span>
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
      </DrawerContent>
    </Drawer>
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
          isActive ? "text-brand" : "text-muted-foreground"
        )}
      />
      <span
        className={cn(
          "text-[11px] font-medium transition-colors leading-none",
          isActive ? "text-brand" : "text-muted-foreground"
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
  const viewerAvatarUrl = useUserStore(selectViewerAvatarUrl);
  const viewerAvatarCrop = useUserStore(selectViewerAvatarCrop);
  const viewerAccent = useUserStore(selectViewerAccent);

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
        <div className="absolute inset-x-0 bottom-0 h-[calc(3.5rem+env(safe-area-inset-bottom,0px))] bg-background/95 backdrop-blur-xl border-t border-border/30 pointer-events-none" />
        {/* Nav items - z-10 ensures above background, pb for home indicator */}
        <div className="relative z-10 flex items-end justify-around h-14 pb-[env(safe-area-inset-bottom,0px)] px-1">
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
            {/* Same structure/metrics as NavItemButton (py-1 + gap-0.5 + fixed
                h-5 w-5 icon slot) so the avatar/icon swap never shifts the
                icon or label baseline relative to the other nav items */}
            <div className="flex flex-col items-center gap-0.5 relative py-1">
              <span className="flex h-5 w-5 items-center justify-center">
                {isLoading ? (
                  // Pre-hydration/loading placeholder: person glyph, not a blank circle
                  <User className="h-5 w-5 text-muted-foreground/50" />
                ) : isAuthenticated ? (
                  <UserAvatar
                    src={viewerAvatarUrl ?? user?.image}
                    crop={viewerAvatarCrop}
                    accent={viewerAccent ?? "default"}
                    ringWidthPx={1.5}
                    name={user?.name || "U"}
                    alt={user?.name || "User"}
                    className="h-5 w-5"
                    fallbackClassName="text-[8px] bg-primary/10 text-primary font-medium"
                  />
                ) : (
                  <User className="h-5 w-5 text-muted-foreground" />
                )}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground leading-none">
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


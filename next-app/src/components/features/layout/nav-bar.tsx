"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search, Menu, Film, Tv, Users, Compass, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu, LoginDialog, useLoginDialog } from "@/components/features/auth";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/movie", label: "Movies", icon: Film },
  { href: "/series", label: "TV Shows", icon: Tv },
  { href: "/browse", label: "Browse", icon: Compass },
  { href: "/topics", label: "Topics", icon: Users },
];

export function NavBar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { isOpen, openLoginDialog, setIsOpen } = useLoginDialog();

  const isAuthenticated = status === "authenticated";
  const isLoading = status === "loading";
  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    // Check initial scroll position
    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 w-full transition-all duration-300",
          isScrolled
            ? "bg-background/95 backdrop-blur-xl border-b border-border/40 shadow-sm"
            : "bg-transparent"
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 md:px-8 lg:px-12">
          {/* Left side: Logo + Navigation */}
          <div className="flex items-center gap-8">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 font-bold text-xl group">
              <Image
                src="/popcorn-lite.png"
                alt="TMB"
                width={28}
                height={28}
                className="group-hover:rotate-6 group-hover:scale-110 transition-all duration-200"
              />
              <span className="hidden sm:inline-block tracking-wider font-extrabold text-white drop-shadow-md">
                TMB
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "gap-2 text-muted-foreground hover:text-foreground hover:bg-white/10",
                      pathname?.startsWith(href) && "text-foreground bg-white/10"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Button>
                </Link>
              ))}
              {/* Admin link - only visible to admins */}
              {isAdmin && (
                <Link href="/admin">
                  <Button
                    variant="ghost"
                    className={cn(
                      "gap-2 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10",
                      pathname?.startsWith("/admin") && "text-amber-400 bg-amber-500/10"
                    )}
                  >
                    <Shield className="h-4 w-4" />
                    Admin
                  </Button>
                </Link>
              )}
            </nav>
          </div>

          {/* Right side: Search & Actions */}
          <div className="flex items-center gap-3">
            {/* Desktop Search */}
            <div className="hidden md:flex relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search movies, shows..."
                className={cn(
                  "w-64 pl-10 border-transparent focus:border-border transition-colors",
                  isScrolled ? "bg-muted/50" : "bg-white/10 placeholder:text-white/60"
                )}
              />
            </div>

            {/* Mobile Search Button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9 hover:bg-white/10"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
            >
              <Search className="h-4 w-4" />
              <span className="sr-only">Search</span>
            </Button>

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Auth: User Menu or Sign In Button */}
            {isAuthenticated ? (
              <UserMenu />
            ) : (
              <Button
                variant="default"
                size="sm"
                className="hidden sm:flex"
                onClick={() => openLoginDialog()}
                disabled={isLoading}
              >
                {isLoading ? "..." : "Sign In"}
              </Button>
            )}

            {/* Mobile Menu */}
            <Sheet>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-white/10">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetTitle className="text-left mb-6">Menu</SheetTitle>
                <nav className="flex flex-col gap-2">
                  {navItems.map(({ href, label, icon: Icon }) => (
                    <Link key={href} href={href}>
                      <Button
                        variant="ghost"
                        className={cn(
                          "w-full justify-start gap-3 text-muted-foreground hover:text-foreground",
                          pathname?.startsWith(href) && "text-foreground bg-accent"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        {label}
                      </Button>
                    </Link>
                  ))}
                  {/* Admin link in mobile menu */}
                  {isAdmin && (
                    <Link href="/admin">
                      <Button
                        variant="ghost"
                        className={cn(
                          "w-full justify-start gap-3 text-amber-500 hover:text-amber-400",
                          pathname?.startsWith("/admin") && "text-amber-400 bg-amber-500/10"
                        )}
                      >
                        <Shield className="h-5 w-5" />
                        Admin
                      </Button>
                    </Link>
                  )}
                  <div className="pt-4 border-t border-border mt-4">
                    {isAuthenticated ? (
                      <UserMenu className="w-full" />
                    ) : (
                      <Button
                        variant="default"
                        className="w-full"
                        onClick={() => openLoginDialog()}
                        disabled={isLoading}
                      >
                        {isLoading ? "Loading..." : "Sign In"}
                      </Button>
                    )}
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Mobile Search Expanded */}
        {isSearchOpen && (
          <div className="md:hidden border-t border-border/40 p-4 bg-background">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search movies, shows, people..."
                className="w-full pl-10"
                autoFocus
              />
            </div>
          </div>
        )}
      </header>

      {/* Login Dialog */}
      <LoginDialog open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}

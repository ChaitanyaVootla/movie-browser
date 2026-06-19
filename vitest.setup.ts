import "@testing-library/jest-dom";
import React from "react";
import { vi } from "vitest";

// Mock next-view-transitions: its dist ESM does `import NextLink from "next/link"`
// (a bare, extensionless specifier) which vitest's node_modules ESM resolver
// can't resolve under happy-dom. The library is purely a navigation wrapper
// (document.startViewTransition around App Router nav) — tests only care about
// the rendered anchor (href/children/aria-label/className), so render a plain
// <a>. Mirrors the existing next/navigation + next-auth global mocks.
vi.mock("next-view-transitions", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string | { toString(): string };
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("a", { href: String(href), ...rest }, children),
  ViewTransitions: ({ children }: { children: React.ReactNode }) => children,
  useTransitionRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next-auth
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: null,
    status: "unauthenticated",
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

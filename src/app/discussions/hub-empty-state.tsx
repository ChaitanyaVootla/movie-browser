"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { Compass, MessagesSquare, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HubTab } from "@/server/actions/discussions-hub";

// The sign-in CTA (button + LoginDialog) only ever shows on the client-only
// Following tab for a signed-out viewer — keep it out of the page's entry JS.
const SignInButton = dynamic(
  () => import("@/components/features/auth/sign-in-button").then((m) => m.SignInButton),
  { ssr: false }
);

const BROWSE_HREF = "/browse";

/**
 * Empty state for a `/discussions` hub tab, with somewhere useful to go next.
 *
 * EDGE-CACHE: the hub is `force-static`, so the Hot tab's empty state can be in
 * the prerendered HTML — Hot/New copy and links are viewer-agnostic. Only the
 * Following variant reads the session, and Following is a client-only tab (the
 * server always renders Hot), so no viewer data reaches cacheable HTML.
 */
export function HubEmptyState({ tab }: { tab: HubTab }) {
  if (tab === "following") return <FollowingEmptyState />;
  return (
    <EmptyShell
      icon={<MessagesSquare className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />}
      title={tab === "hot" ? "No hot threads yet" : "No new threads yet"}
      body="Every movie and TV show has its own spoiler-safe discussion board. Open something you're watching and start the first thread."
    >
      <Button asChild className="min-h-10 gap-2">
        <Link href={BROWSE_HREF}>
          <Compass className="h-4 w-4" />
          Browse trending titles
        </Link>
      </Button>
      <Button asChild variant="outline" className="min-h-10 gap-2">
        <Link href="/search">
          <Search className="h-4 w-4" />
          Find a title
        </Link>
      </Button>
    </EmptyShell>
  );
}

function FollowingEmptyState() {
  const { status } = useSession();
  const signedOut = status === "unauthenticated";
  return (
    <EmptyShell
      icon={<Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />}
      title="Nothing from your circle yet"
      body={
        signedOut
          ? "Sign in to see discussions from people you follow and shows you track."
          : "Follow people or track shows to see their discussions here."
      }
    >
      {signedOut ? (
        <SignInButton message="Sign in to follow discussions" />
      ) : (
        <Button asChild variant="outline" className="min-h-10">
          <Link href="/library">Your library</Link>
        </Button>
      )}
      <Button asChild className="min-h-10 gap-2">
        <Link href={BROWSE_HREF}>
          <Compass className="h-4 w-4" />
          Browse trending titles
        </Link>
      </Button>
    </EmptyShell>
  );
}

function EmptyShell({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-card/50 px-4 py-10 text-center">
      {icon}
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">{body}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{children}</div>
    </div>
  );
}

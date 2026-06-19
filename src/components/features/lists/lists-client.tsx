"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { ListChecks, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { getMyLists } from "@/server/actions/lists";
import { useUsername } from "@/hooks/use-username";
import { ListCard, type ListCardData } from "./list-card";
import { CreateListDialog } from "./create-list-dialog";

type LoadState = "loading" | "ready" | "signedOut" | "error";

export function ListsClient() {
  const { status: authStatus } = useSession();
  const { username } = useUsername();
  const router = useRouter();
  const [lists, setLists] = useState<ListCardData[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [createOpen, setCreateOpen] = useState(false);

  // Fetch lists. `cancelled` is read via the passed ref so a unmount mid-flight
  // skips the setState. Returns nothing — all setState happens inside.
  const load = useCallback(async (isCancelled: () => boolean) => {
    try {
      const res = await getMyLists();
      if (isCancelled()) return;
      if (!res.success) {
        setState("signedOut");
        return;
      }
      // Only REGULAR lists belong here — Four Favorites has its own profile board.
      setLists(
        res.lists
          .filter((l) => l.kind === "REGULAR")
          .map((l) => ({
            slug: l.slug,
            name: l.name,
            itemCount: l.itemCount,
            isPublic: l.isPublic,
            isRanked: l.isRanked,
            posterPaths: l.items
              .map((it) => it.movie?.posterPath ?? it.series?.posterPath)
              .filter((p): p is string => Boolean(p)),
          }))
      );
      setState("ready");
    } catch {
      if (!isCancelled()) setState("error");
    }
  }, []);

  useEffect(() => {
    if (authStatus === "loading") return;
    let cancelled = false;
    const isCancelled = () => cancelled;
    // All setState lives inside this async callback (mirrors use-username.ts) so
    // the no-synchronous-setState-in-effect rule never fires.
    void (async () => {
      if (authStatus === "unauthenticated") {
        setState("signedOut");
        return;
      }
      await load(isCancelled);
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus, load]);

  if (authStatus === "loading" || state === "loading") {
    return <ListsSkeleton />;
  }

  if (state === "signedOut") {
    return (
      <EmptyShell
        title="Sign in to build lists"
        body="Group titles into custom lists — ranked rankings, themed collections, watch-party shortlists."
        action={
          <Button size="lg" onClick={() => signIn("google")}>
            Sign in with Google
          </Button>
        }
      />
    );
  }

  if (state === "error") {
    return (
      <EmptyShell
        title="Couldn't load your lists"
        body="Something went wrong fetching your lists."
        action={
          <Button variant="outline" onClick={() => void load(() => false)}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <SectionHeading icon={<ListChecks className="h-5 w-5 text-brand" />}>
          My Lists
        </SectionHeading>
        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
          <ListPlus className="mr-1.5 h-4 w-4" />
          New list
        </Button>
      </div>

      {lists.length === 0 ? (
        <EmptyShell
          title="No lists yet"
          body="Create your first list to start organizing the films and shows you love."
          action={
            <Button size="lg" onClick={() => setCreateOpen(true)}>
              <ListPlus className="mr-1.5 h-4 w-4" />
              Create a list
            </Button>
          }
        />
      ) : !username ? (
        // Lists exist but no public username yet — they can't be linked to the
        // /u/<username>/list/<slug> route until the profile is claimed.
        <div className="space-y-4">
          <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Pick a username to get a shareable profile, then your lists become public
            links.{" "}
            <Link href="/settings" className="font-medium text-brand hover:underline">
              Set up your profile
            </Link>
            .
          </p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => (
              <li
                key={list.slug}
                className="flex items-center gap-4 rounded-xl border bg-card p-3 opacity-70"
              >
                <div className="flex h-16 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                  <ListChecks className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{list.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {list.itemCount} {list.itemCount === 1 ? "title" : "titles"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <li key={list.slug}>
              <ListCard username={username} list={list} />
            </li>
          ))}
        </ul>
      )}

      <CreateListDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(created) => {
          if (username) {
            router.push(`/u/${username}/list/${created.slug}`);
          } else {
            void load(() => false);
          }
        }}
      />
    </div>
  );
}

function EmptyShell({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="rounded-full bg-muted p-4">
        <ListChecks className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{body}</p>
      </div>
      {action}
    </div>
  );
}

function ListsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border bg-card p-3">
            <Skeleton className="h-16 w-11 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

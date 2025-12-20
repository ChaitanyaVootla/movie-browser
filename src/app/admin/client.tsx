"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import {
  Users,
  Film,
  Tv,
  Clock,
  Eye,
  Heart,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  MapPin,
  Calendar,
  Globe,
  Mail,
  Hash,
} from "lucide-react";
import { useState, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Format a date as relative time (e.g., "2h ago", "3d ago")
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSecs < 60) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  if (diffWeeks < 4) return `${diffWeeks}w`;
  if (diffMonths < 12) return `${diffMonths}mo`;
  return date.toLocaleDateString();
}

interface UserActivity {
  id: string;
  sub: number;
  name: string;
  email: string;
  picture?: string;
  image?: string;
  createdAt?: string;
  lastVisited?: string;
  location?: {
    countryCode?: string;
    country?: string;
    city?: string;
    region?: string;
    timezone?: string;
    lat?: number;
    lng?: number;
  };
  ContinueWatching: number;
  MoviesWatchList: number;
  WatchedMovies: number;
  SeriesList: number;
  recent: number;
  "recent-items"?: Array<{
    itemId: number;
    title?: string;
    name?: string;
  }>;
}

async function fetchUsers(): Promise<UserActivity[]> {
  const res = await fetch("/api/admin/users");
  if (!res.ok) {
    throw new Error("Failed to fetch users");
  }
  return res.json();
}

export function AdminDashboard() {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const {
    data: users,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: fetchUsers,
    staleTime: 60 * 1000,
  });

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const stats = users
    ? {
        total: users.length,
        activeToday: users.filter((u) => {
          if (!u.lastVisited) return false;
          const lastVisit = new Date(u.lastVisited);
          const today = new Date();
          return lastVisit.toDateString() === today.toDateString();
        }).length,
        totalWatched: users.reduce((sum, u) => sum + (u.WatchedMovies || 0), 0),
        totalWatchlist: users.reduce(
          (sum, u) => sum + (u.MoviesWatchList || 0) + (u.SeriesList || 0),
          0
        ),
      }
    : { total: 0, activeToday: 0, totalWatched: 0, totalWatchlist: 0 };

  if (error) {
    return (
      <div className="px-4 md:px-8 lg:px-12 pt-24 pb-8">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">
              Error loading users: {error.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 lg:px-12 pt-24 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
        >
          <RefreshCw
            className={cn("h-4 w-4 mr-2", isRefetching && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {/* Compact Stats */}
      <div className="grid gap-3 grid-cols-4 mb-6">
        <StatCard
          title="Users"
          value={stats.total}
          icon={Users}
          isLoading={isLoading}
        />
        <StatCard
          title="Active"
          value={stats.activeToday}
          icon={Eye}
          isLoading={isLoading}
        />
        <StatCard
          title="Watched"
          value={stats.totalWatched}
          icon={Film}
          isLoading={isLoading}
        />
        <StatCard
          title="Watchlist"
          value={stats.totalWatchlist}
          icon={Heart}
          isLoading={isLoading}
        />
      </div>

      {/* Users Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-12"></TableHead>
                <TableHead>User</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-center">Watched</TableHead>
                <TableHead className="text-center">Watchlist</TableHead>
                <TableHead className="text-center">Series</TableHead>
                <TableHead className="text-center">Continue</TableHead>
                <TableHead className="text-center">Recent</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Last Visit</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton />
              ) : users?.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                users?.map((user) => (
                  <Fragment key={user.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => toggleRow(user.id)}
                    >
                      {/* Avatar */}
                      <TableCell>
                        <Avatar className="h-8 w-8">
                          <AvatarImage
                            src={user.picture || user.image}
                            alt={user.name}
                          />
                          <AvatarFallback className="text-xs">
                            {user.name
                              ?.split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2) || "?"}
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>

                      {/* User Info */}
                      <TableCell>
                        <div className="min-w-[180px]">
                          <p className="font-medium truncate max-w-[200px]">
                            {user.name || "Unknown"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {user.email}
                          </p>
                        </div>
                      </TableCell>

                      {/* Location */}
                      <TableCell>
                        {user.location?.countryCode ? (
                          <div className="flex items-center gap-2">
                            <Image
                              src={`https://flagcdn.com/${user.location.countryCode.toLowerCase()}.svg`}
                              alt={user.location.countryCode}
                              width={20}
                              height={15}
                              className="rounded-sm shrink-0"
                            />
                            <span className="text-sm truncate max-w-[100px]">
                              {user.location.city || user.location.country || user.location.countryCode}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>

                      {/* Stats */}
                      <TableCell className="text-center font-medium">
                        {user.WatchedMovies || 0}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {user.MoviesWatchList || 0}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {user.SeriesList || 0}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {user.ContinueWatching || 0}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {user.recent || 0}
                      </TableCell>

                      {/* Dates */}
                      <TableCell className="text-sm text-muted-foreground">
                        {user.createdAt
                          ? new Date(user.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "2-digit",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "text-sm font-medium",
                            user.lastVisited &&
                              new Date(user.lastVisited).toDateString() ===
                                new Date().toDateString()
                              ? "text-green-500"
                              : "text-muted-foreground"
                          )}
                        >
                          {user.lastVisited
                            ? formatRelativeTime(new Date(user.lastVisited))
                            : "Never"}
                        </span>
                      </TableCell>

                      {/* Expand */}
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          {expandedRows.has(user.id) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>

                    {/* Expanded Row */}
                    {expandedRows.has(user.id) && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={11} className="p-4">
                          <ExpandedUserDetails user={user} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  isLoading,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  isLoading: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {title}
          </p>
          {isLoading ? (
            <Skeleton className="h-7 w-12 mt-1" />
          ) : (
            <p className="text-xl font-bold">{value.toLocaleString()}</p>
          )}
        </div>
        <Icon className="h-6 w-6 text-muted-foreground/40" />
      </div>
    </Card>
  );
}

function ExpandedUserDetails({ user }: { user: UserActivity }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* User Details */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          User Details
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            <span className="truncate">{user.email}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Hash className="h-3.5 w-3.5" />
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
              {user.sub}
            </code>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              Joined{" "}
              {user.createdAt
                ? new Date(user.createdAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Unknown"}
            </span>
          </div>
        </div>
      </div>

      {/* Location Details */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Location
        </h4>
        {user.location ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              {user.location.countryCode && (
                <Image
                  src={`https://flagcdn.com/${user.location.countryCode.toLowerCase()}.svg`}
                  alt={user.location.countryCode}
                  width={20}
                  height={15}
                  className="rounded-sm"
                />
              )}
              <span className="text-muted-foreground">
                {[
                  user.location.city,
                  user.location.region,
                  user.location.country,
                ]
                  .filter(Boolean)
                  .join(", ") || user.location.countryCode}
              </span>
            </div>
            {user.location.timezone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>{user.location.timezone}</span>
              </div>
            )}
            {user.location.lat && user.location.lng && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                <span className="text-xs">
                  {user.location.lat.toFixed(2)}, {user.location.lng.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No location data</p>
        )}
      </div>

      {/* Recent Activity */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Recent Activity
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {user["recent-items"]?.slice(0, 8).map((item, i) => (
            <Link
              key={`${item.itemId}-${i}`}
              href={`/${item.title ? "movie" : "series"}/${item.itemId}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Badge
                variant="secondary"
                className="text-xs hover:bg-secondary/80 cursor-pointer"
              >
                {item.title ? (
                  <Film className="h-3 w-3 mr-1" />
                ) : (
                  <Tv className="h-3 w-3 mr-1" />
                )}
                <span className="truncate max-w-[120px]">
                  {item.title || item.name}
                </span>
              </Badge>
            </Link>
          ))}
          {!user["recent-items"]?.length && (
            <span className="text-sm text-muted-foreground">
              No recent activity
            </span>
          )}
        </div>

        {/* Activity Summary */}
        <div className="flex flex-wrap gap-3 pt-2 text-xs text-muted-foreground border-t">
          <span>
            <strong className="text-foreground">{user.WatchedMovies || 0}</strong>{" "}
            watched
          </span>
          <span>
            <strong className="text-foreground">{user.MoviesWatchList || 0}</strong>{" "}
            movies
          </span>
          <span>
            <strong className="text-foreground">{user.SeriesList || 0}</strong>{" "}
            series
          </span>
          <span>
            <strong className="text-foreground">{user.ContinueWatching || 0}</strong>{" "}
            continue
          </span>
        </div>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-8 w-8 rounded-full" />
          </TableCell>
          <TableCell>
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-36" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-8 mx-auto" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-8 mx-auto" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-8 mx-auto" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-8 mx-auto" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-8 mx-auto" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-12" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-6" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

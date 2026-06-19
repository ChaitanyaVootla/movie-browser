"use client";

import { useState, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Activity,
  Network,
  Building,
  Search,
  Bot,
  DollarSign,
  X,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getPosterSources } from "@/lib/image";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { TimeRange } from "../analytics-types";

// =============================================================================
// Types
// =============================================================================

interface UserLocation {
  countryCode?: string;
  countryName?: string;
  cityName?: string;
  stateName?: string;
  timezone?: string;
  country?: string;
  city?: string;
  region?: string;
  lat?: number;
  lng?: number;
  ip?: string;
  isp?: string;
  org?: string;
  as?: string;
  asname?: string;
  mobile?: boolean;
  proxy?: boolean;
  hosting?: boolean;
}

interface UserActivity {
  id: string;
  sub: number;
  name: string;
  email: string;
  username?: string | null;
  picture?: string;
  image?: string;
  createdAt?: string;
  lastVisited?: string;
  location?: UserLocation;
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

/**
 * AI stats keyed by user name (from ClickHouse ai_usage.user_name)
 * Note: We match by name since that's what's stored in AI tracking
 */
interface UserAIStats {
  [userName: string]: {
    invocations: number;
    cost: number;
    tokens: number;
  };
}

type SortField = "name" | "lastVisited" | "watched" | "watchlist" | "recents" | "aiCost";
type SortDirection = "asc" | "desc";
type ActivityFilter = "all" | "today" | "week" | "month" | "inactive";

// =============================================================================
// Fetch Functions
// =============================================================================

async function fetchUsers(): Promise<UserActivity[]> {
  const res = await fetch("/api/admin/users");
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

async function fetchUserAIStats(range: TimeRange): Promise<UserAIStats> {
  const res = await fetch(`/api/admin/analytics?type=user_ai_stats&range=${range}`);
  if (!res.ok) throw new Error("Failed to fetch user AI stats");
  return res.json();
}

// =============================================================================
// Utility Functions
// =============================================================================

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

function getLastVisitColor(lastVisited?: string): string {
  if (!lastVisited) return "text-muted-foreground";

  const lastVisit = new Date(lastVisited);
  const now = new Date();
  const diffMs = now.getTime() - lastVisit.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (lastVisit.toDateString() === now.toDateString()) return "text-green-500";
  if (diffDays <= 7) return "text-blue-500";
  if (diffDays <= 30) return "text-purple-500";
  return "text-muted-foreground";
}

function matchesActivityFilter(user: UserActivity, filter: ActivityFilter): boolean {
  if (filter === "all") return true;
  if (!user.lastVisited) return filter === "inactive";

  const lastVisit = new Date(user.lastVisited);
  const now = new Date();
  const diffMs = now.getTime() - lastVisit.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  switch (filter) {
    case "today":
      return lastVisit.toDateString() === now.toDateString();
    case "week":
      return diffDays <= 7;
    case "month":
      return diffDays <= 30;
    case "inactive":
      return diffDays > 30;
    default:
      return true;
  }
}

// =============================================================================
// Users Tab Component
// =============================================================================

interface UsersTabProps {
  range: TimeRange;
}

export function UsersTab({ range }: UsersTabProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [sortField, setSortField] = useState<SortField>("lastVisited");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Fetch users from MongoDB
  const {
    data: users,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: fetchUsers,
    staleTime: 60 * 1000,
  });

  // Fetch AI stats from ClickHouse
  const { data: aiStats } = useQuery({
    queryKey: ["admin", "user_ai_stats", range],
    queryFn: () => fetchUserAIStats(range),
    staleTime: 60 * 1000,
  });

  const isRefreshing = isFetching && !isLoading;

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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    if (!users) return [];

    const result = users.filter((user) => {
      // Search filter
      const matchesSearch =
        !searchQuery ||
        user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase());

      // Activity filter
      const matchesActivity = matchesActivityFilter(user, activityFilter);

      return matchesSearch && matchesActivity;
    });

    // Sort
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "name":
          comparison = (a.name || "").localeCompare(b.name || "");
          break;
        case "lastVisited":
          const aDate = a.lastVisited ? new Date(a.lastVisited).getTime() : 0;
          const bDate = b.lastVisited ? new Date(b.lastVisited).getTime() : 0;
          comparison = aDate - bDate;
          break;
        case "watched":
          comparison = (a.WatchedMovies || 0) - (b.WatchedMovies || 0);
          break;
        case "watchlist":
          comparison =
            (a.MoviesWatchList || 0) +
            (a.SeriesList || 0) -
            ((b.MoviesWatchList || 0) + (b.SeriesList || 0));
          break;
        case "recents":
          comparison = (a.recent || 0) - (b.recent || 0);
          break;
        case "aiCost":
          // Match by name (primary) or email (fallback)
          const aCost = aiStats?.[a.name]?.cost || aiStats?.[a.email]?.cost || 0;
          const bCost = aiStats?.[b.name]?.cost || aiStats?.[b.email]?.cost || 0;
          comparison = aCost - bCost;
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [users, searchQuery, activityFilter, sortField, sortDirection, aiStats]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!users)
      return {
        total: 0,
        activeToday: 0,
        activeWeek: 0,
        activeMonth: 0,
        totalWatched: 0,
        totalWatchlist: 0,
        totalAICost: 0,
        totalAIInvocations: 0,
      };

    const totalAIStats = aiStats
      ? Object.values(aiStats).reduce(
          (acc, stats) => ({
            cost: acc.cost + stats.cost,
            invocations: acc.invocations + stats.invocations,
          }),
          { cost: 0, invocations: 0 }
        )
      : { cost: 0, invocations: 0 };

    return {
      total: users.length,
      activeToday: users.filter((u) => {
        if (!u.lastVisited) return false;
        const lastVisit = new Date(u.lastVisited);
        const today = new Date();
        return lastVisit.toDateString() === today.toDateString();
      }).length,
      activeWeek: users.filter((u) => {
        if (!u.lastVisited) return false;
        const lastVisit = new Date(u.lastVisited);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return lastVisit >= weekAgo;
      }).length,
      activeMonth: users.filter((u) => {
        if (!u.lastVisited) return false;
        const lastVisit = new Date(u.lastVisited);
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        return lastVisit >= monthAgo;
      }).length,
      totalWatched: users.reduce((sum, u) => sum + (u.WatchedMovies || 0), 0),
      totalWatchlist: users.reduce(
        (sum, u) => sum + (u.MoviesWatchList || 0) + (u.SeriesList || 0),
        0
      ),
      totalAICost: totalAIStats.cost,
      totalAIInvocations: totalAIStats.invocations,
    };
  }, [users, aiStats]);

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive">Error loading users: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Search and Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-7 w-7"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <Select
            value={activityFilter}
            onValueChange={(v) => setActivityFilter(v as ActivityFilter)}
          >
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              <SelectItem value="today">Active Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
        <StatCard title="Users" value={stats.total} icon={Users} isLoading={isLoading} />
        <ActiveUsersCard
          daily={stats.activeToday}
          weekly={stats.activeWeek}
          monthly={stats.activeMonth}
          isLoading={isLoading}
        />
        <StatCard title="Watched" value={stats.totalWatched} icon={Film} isLoading={isLoading} />
        <StatCard
          title="Watchlist"
          value={stats.totalWatchlist}
          icon={Heart}
          isLoading={isLoading}
        />
        <StatCard
          title="AI Calls"
          value={stats.totalAIInvocations}
          icon={Bot}
          isLoading={isLoading}
        />
        <StatCard
          title="AI Cost"
          value={stats.totalAICost}
          icon={DollarSign}
          isLoading={isLoading}
          format="currency"
        />
      </div>

      {/* Results Count */}
      {searchQuery || activityFilter !== "all" ? (
        <p className="text-sm text-muted-foreground">
          Showing {filteredUsers.length} of {users?.length || 0} users
        </p>
      ) : null}

      {/* Users Table */}
      <Card className="py-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-muted/50 border-b-0">
                <TableHead className="w-12"></TableHead>
                <TableHead>
                  <SortableHeader
                    label="User"
                    field="name"
                    currentField={sortField}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-center">
                  <SortableHeader
                    label="Watched"
                    field="watched"
                    currentField={sortField}
                    direction={sortDirection}
                    onSort={handleSort}
                    centered
                  />
                </TableHead>
                <TableHead className="text-center">
                  <SortableHeader
                    label="Watchlist"
                    field="watchlist"
                    currentField={sortField}
                    direction={sortDirection}
                    onSort={handleSort}
                    centered
                  />
                </TableHead>
                <TableHead className="text-center">
                  <SortableHeader
                    label="Recents"
                    field="recents"
                    currentField={sortField}
                    direction={sortDirection}
                    onSort={handleSort}
                    centered
                  />
                </TableHead>
                <TableHead className="text-center">
                  <SortableHeader
                    label="AI Cost"
                    field="aiCost"
                    currentField={sortField}
                    direction={sortDirection}
                    onSort={handleSort}
                    centered
                  />
                </TableHead>
                <TableHead>
                  <SortableHeader
                    label="Last Visit"
                    field="lastVisited"
                    currentField={sortField}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton />
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    {searchQuery || activityFilter !== "all"
                      ? "No users match your filters"
                      : "No users found"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => {
                  // Match AI stats by name (primary) or email (fallback)
                  const userAiStats = aiStats?.[user.name] || aiStats?.[user.email];
                  return (
                    <Fragment key={user.id}>
                      <UserRow
                        user={user}
                        aiStats={userAiStats}
                        isExpanded={expandedRows.has(user.id)}
                        onToggle={() => toggleRow(user.id)}
                      />
                      {expandedRows.has(user.id) && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={9} className="p-4">
                            <ExpandedUserDetails user={user} aiStats={userAiStats} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface SortableHeaderProps {
  label: string;
  field: SortField;
  currentField: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
  centered?: boolean;
}

function SortableHeader({
  label,
  field,
  currentField,
  direction,
  onSort,
  centered,
}: SortableHeaderProps) {
  const isActive = currentField === field;

  return (
    <button
      className={cn(
        "flex items-center gap-1 hover:text-foreground transition-colors",
        centered && "justify-center w-full",
        isActive ? "text-foreground" : "text-muted-foreground"
      )}
      onClick={() => onSort(field)}
    >
      {label}
      {isActive && <span className="text-[10px]">{direction === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}

interface UserRowProps {
  user: UserActivity;
  aiStats?: { invocations: number; cost: number; tokens: number };
  isExpanded: boolean;
  onToggle: () => void;
}

function UserRow({ user, aiStats, isExpanded, onToggle }: UserRowProps) {
  return (
    <TableRow className="cursor-pointer" onClick={onToggle}>
      <TableCell>
        <Avatar className="h-8 w-8">
          <AvatarImage src={user.picture || user.image} alt={user.name} />
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
      <TableCell>
        <div className="min-w-[180px]">
          <div className="flex items-center gap-1.5">
            <p className="font-medium truncate max-w-[170px]">{user.name || "Unknown"}</p>
            {user.username && (
              <Link
                href={`/u/${user.username}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`View public profile (@${user.username})`}
                aria-label={`Open @${user.username}'s public profile`}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{user.email}</p>
        </div>
      </TableCell>
      <TableCell>
        {user.location?.countryCode ? (
          <div className="flex items-center gap-2">
            <img
              src={`https://flagcdn.com/w40/${user.location.countryCode.toLowerCase()}.png`}
              alt={user.location.countryCode}
              width={20}
              height={15}
              className="rounded-sm shrink-0"
            />
            <span className="text-sm truncate max-w-[100px]">
              {user.location.countryName || user.location.country || user.location.countryCode}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>
      <TableCell className="text-center font-medium">{user.WatchedMovies || 0}</TableCell>
      <TableCell className="text-center font-medium">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>{(user.MoviesWatchList || 0) + (user.SeriesList || 0)}</TooltipTrigger>
            <TooltipContent>
              <p>
                {user.MoviesWatchList || 0} movies, {user.SeriesList || 0} series
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
      <TableCell className="text-center font-medium">{user.recent || 0}</TableCell>
      <TableCell className="text-center">
        {aiStats ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <span
                  className={cn(
                    "font-medium",
                    aiStats.cost > 1 ? "text-amber-500" : aiStats.cost > 0.1 ? "text-blue-500" : ""
                  )}
                >
                  ${aiStats.cost.toFixed(3)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {aiStats.invocations} calls, {aiStats.tokens.toLocaleString()} tokens
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <span className={cn("text-sm font-medium", getLastVisitColor(user.lastVisited))}>
          {user.lastVisited ? formatRelativeTime(new Date(user.lastVisited)) : "Never"}
        </span>
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </TableCell>
    </TableRow>
  );
}

interface ExpandedUserDetailsProps {
  user: UserActivity;
  aiStats?: { invocations: number; cost: number; tokens: number };
}

function ExpandedUserDetails({ user, aiStats }: ExpandedUserDetailsProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{user.sub}</code>
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
                <img
                  src={`https://flagcdn.com/w40/${user.location.countryCode.toLowerCase()}.png`}
                  alt={user.location.countryCode}
                  width={20}
                  height={15}
                  className="rounded-sm"
                />
              )}
              <span className="text-muted-foreground">
                {[
                  user.location.cityName || user.location.city,
                  user.location.stateName || user.location.region,
                  user.location.countryName || user.location.country,
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
            {(user.location.isp || user.location.org) && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building className="h-3.5 w-3.5" />
                <span className="text-xs truncate">{user.location.isp || user.location.org}</span>
              </div>
            )}
            {user.location.asname && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Network className="h-3.5 w-3.5" />
                <span className="text-xs truncate">{user.location.asname}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-1 pt-1">
              {user.location.mobile && (
                <Badge variant="outline" className="text-[10px] h-5">
                  Mobile
                </Badge>
              )}
              {user.location.proxy && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-5 border-amber-500/50 text-amber-500"
                >
                  VPN/Proxy
                </Badge>
              )}
              {user.location.hosting && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-5 border-blue-500/50 text-blue-500"
                >
                  Hosting/DC
                </Badge>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No location data</p>
        )}
      </div>

      {/* AI Usage */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Bot className="h-4 w-4" />
          AI Usage
        </h4>
        {aiStats ? (
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Calls</p>
              <p className="font-medium">{aiStats.invocations}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Cost</p>
              <p className="font-medium">${aiStats.cost.toFixed(3)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Tokens</p>
              <p className="font-medium">{aiStats.tokens.toLocaleString()}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No AI usage</p>
        )}
      </div>

        {/* Library */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Film className="h-4 w-4" />
            Library
          </h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Watched</p>
              <p className="font-medium">{user.WatchedMovies || 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Movie watchlist</p>
              <p className="font-medium">{user.MoviesWatchList || 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Series watchlist</p>
              <p className="font-medium">{user.SeriesList || 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Continue watching</p>
              <p className="font-medium">{user.ContinueWatching || 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Recents</p>
              <p className="font-medium">{user.recent || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity - full width poster cards */}
      <div className="space-y-3 border-t pt-4">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Recent Activity
          {(user.recent || 0) > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({user.recent})</span>
          )}
        </h4>
        {user["recent-items"]?.length ? (
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
            {user["recent-items"].map((item, i) => (
              <RecentItemCard key={`${item.itemId}-${i}`} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No recent activity</p>
        )}
      </div>
    </div>
  );
}

interface RecentItemCardProps {
  item: { itemId: number; title?: string; name?: string };
}

function RecentItemCard({ item }: RecentItemCardProps) {
  const isMovie = Boolean(item.title);
  const [failed, setFailed] = useState(false);
  const poster = getPosterSources({ id: item.itemId, title: item.title, name: item.name });

  return (
    <Link
      href={`/${isMovie ? "movie" : "series"}/${item.itemId}`}
      onClick={(e) => e.stopPropagation()}
      className="group w-24 shrink-0 space-y-1.5"
    >
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted">
        {failed ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            {isMovie ? <Film className="h-6 w-6" /> : <Tv className="h-6 w-6" />}
          </div>
        ) : (
          <img
            src={poster.primary}
            // Decorative: the title renders below; empty alt avoids broken-image
            // text if the error fires before hydration attaches onError.
            alt=""
            loading="lazy"
            ref={(el) => {
              if (el?.complete && el.naturalWidth === 0) setFailed(true);
            }}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            onError={() => setFailed(true)}
          />
        )}
        <div className="absolute top-1 right-1 rounded-full bg-black/60 p-1">
          {isMovie ? (
            <Film className="h-2.5 w-2.5 text-white" />
          ) : (
            <Tv className="h-2.5 w-2.5 text-white" />
          )}
        </div>
      </div>
      <p className="text-xs leading-snug line-clamp-2 text-muted-foreground transition-colors group-hover:text-foreground">
        {item.title || item.name}
      </p>
    </Link>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  isLoading,
  format,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  isLoading: boolean;
  format?: "number" | "currency";
}) {
  const formattedValue = format === "currency" ? `$${value.toFixed(2)}` : value.toLocaleString();

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{title}</p>
          {isLoading ? (
            <Skeleton className="h-6 w-12 mt-1" />
          ) : (
            <p className="text-lg font-bold">{formattedValue}</p>
          )}
        </div>
        <Icon className="h-5 w-5 text-muted-foreground/40" />
      </div>
    </Card>
  );
}

function ActiveUsersCard({
  daily,
  weekly,
  monthly,
  isLoading,
}: {
  daily: number;
  weekly: number;
  monthly: number;
  isLoading: boolean;
}) {
  return (
    <Card className="p-3 col-span-2 md:col-span-1">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
            Active Users
          </p>
          {isLoading ? (
            <Skeleton className="h-5 w-28" />
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <span className="flex items-center gap-0.5">
                <span className="text-base font-bold text-green-500">{daily}</span>
                <span className="text-[9px] text-muted-foreground">d</span>
              </span>
              <span className="text-muted-foreground/30">|</span>
              <span className="flex items-center gap-0.5">
                <span className="text-base font-bold text-blue-500">{weekly}</span>
                <span className="text-[9px] text-muted-foreground">w</span>
              </span>
              <span className="text-muted-foreground/30">|</span>
              <span className="flex items-center gap-0.5">
                <span className="text-base font-bold text-purple-500">{monthly}</span>
                <span className="text-[9px] text-muted-foreground">m</span>
              </span>
            </div>
          )}
        </div>
        <Activity className="h-5 w-5 text-muted-foreground/40" />
      </div>
    </Card>
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
            <Skeleton className="h-4 w-12 mx-auto" />
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

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText, Database, Brain, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// =============================================================================
// Types
// =============================================================================

interface ItemDetailsResponse {
  tmdbId: number;
  mediaType: "movie" | "series";
  aiData: {
    hook: string | null;
    rawInput: string | null;
    mood: {
      pacing: string | null;
      intensity: string | null;
      tone: string | null;
      emotional: string | null;
    } | null;
    insights: {
      spoilerFree: {
        vibes: string[];
        themes: string[];
        bestFor: { subcategory: string; text: string }[];
        highlights: { subcategory: string; text: string }[];
        headsUp: { subcategory: string; text: string }[];
        questions: string[];
      };
      spoilerContent: {
        questions: string[];
        deepDive: { subcategory: string; text: string; spoilerLevel: string }[];
      };
    };
    generatedAt: string | null;
    version: number;
  } | null;
  itemDetails: Record<string, unknown> | null;
  hasAIData: boolean;
  hasItemDetails: boolean;
}

// =============================================================================
// Fetch Function
// =============================================================================

async function fetchItemDetails(
  id: number,
  type: "movie" | "series"
): Promise<ItemDetailsResponse> {
  const res = await fetch(`/api/admin/item-details?id=${id}&type=${type}`);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to fetch item details");
  }
  return res.json();
}

// =============================================================================
// Inspect Tab
// =============================================================================

export function InspectTab() {
  const [tmdbId, setTmdbId] = useState("");
  const [mediaType, setMediaType] = useState<"movie" | "series">("movie");
  const [searchId, setSearchId] = useState<number | null>(null);
  const [searchType, setSearchType] = useState<"movie" | "series">("movie");

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["admin", "item-details", searchId, searchType],
    queryFn: () => fetchItemDetails(searchId!, searchType),
    enabled: searchId !== null,
    staleTime: 60 * 1000,
  });

  const handleSearch = () => {
    const id = parseInt(tmdbId, 10);
    if (!isNaN(id) && id > 0) {
      setSearchId(id);
      setSearchType(mediaType);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Search className="h-4 w-4" />
            Item Inspector
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Enter TMDB ID..."
              value={tmdbId}
              onChange={(e) => setTmdbId(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-zinc-900 border-zinc-800"
            />
            <Select
              value={mediaType}
              onValueChange={(v) => setMediaType(v as "movie" | "series")}
            >
              <SelectTrigger className="w-28 bg-zinc-900 border-zinc-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="movie">Movie</SelectItem>
                <SelectItem value="series">Series</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleSearch}
              disabled={!tmdbId || isFetching}
              className="gap-2"
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Inspect
            </Button>
          </div>
          {error && (
            <p className="text-sm text-red-400 mt-2">
              {error instanceof Error ? error.message : "Failed to fetch"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading && (
        <Card>
          <CardContent className="py-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </CardContent>
        </Card>
      )}

      {data && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                {data.mediaType === "movie" ? "Movie" : "Series"} #{data.tmdbId}
                {data.itemDetails && (
                  <span className="ml-2 text-zinc-400 font-normal">
                    {(data.itemDetails.title || data.itemDetails.name) as string}
                  </span>
                )}
              </CardTitle>
              <div className="flex gap-2">
                <Badge variant={data.hasItemDetails ? "default" : "secondary"}>
                  {data.hasItemDetails ? "In DB" : "Not in DB"}
                </Badge>
                <Badge variant={data.hasAIData ? "default" : "secondary"}>
                  {data.hasAIData ? "AI Enriched" : "No AI Data"}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="ai-input" className="space-y-4">
              <TabsList className="bg-zinc-900 border border-zinc-800">
                <TabsTrigger value="ai-input" className="gap-1.5 text-xs">
                  <FileText className="h-3.5 w-3.5" />
                  AI Input
                </TabsTrigger>
                <TabsTrigger value="ai-insights" className="gap-1.5 text-xs">
                  <Brain className="h-3.5 w-3.5" />
                  AI Insights
                </TabsTrigger>
                <TabsTrigger value="postgres" className="gap-1.5 text-xs">
                  <Database className="h-3.5 w-3.5" />
                  PostgreSQL
                </TabsTrigger>
              </TabsList>

              {/* AI Input Tab - Raw markdown the agent sees */}
              <TabsContent value="ai-input">
                <AIInputView rawInput={data.aiData?.rawInput} />
              </TabsContent>

              {/* AI Insights Tab - Structured insights */}
              <TabsContent value="ai-insights">
                <AIInsightsView aiData={data.aiData} />
              </TabsContent>

              {/* PostgreSQL Tab - Raw database record */}
              <TabsContent value="postgres">
                <PostgresView itemDetails={data.itemDetails} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// AI Input View
// =============================================================================

function AIInputView({ rawInput }: { rawInput: string | null | undefined }) {
  if (!rawInput) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        No AI input data available. Run enrichment first.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          This is what the AI agent receives as context when answering questions.
        </p>
        <Badge variant="outline" className="text-xs">
          {rawInput.length.toLocaleString()} chars
        </Badge>
      </div>
      <pre className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800 max-h-[600px] overflow-y-auto text-xs text-zinc-300 font-mono whitespace-pre-wrap">
        {rawInput}
      </pre>
    </div>
  );
}

// =============================================================================
// AI Insights View
// =============================================================================

function AIInsightsView({
  aiData,
}: {
  aiData: ItemDetailsResponse["aiData"];
}) {
  if (!aiData) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        No AI insights available. Run enrichment first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hook */}
      {aiData.hook && (
        <div>
          <h4 className="text-xs font-medium text-zinc-400 mb-1">Hook</h4>
          <p className="text-sm text-zinc-200 bg-zinc-900/50 rounded p-2 border border-zinc-800">
            {aiData.hook}
          </p>
        </div>
      )}

      {/* Mood */}
      {aiData.mood && (
        <div>
          <h4 className="text-xs font-medium text-zinc-400 mb-2">Mood</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(aiData.mood).map(
              ([key, value]) =>
                value && (
                  <Badge key={key} variant="outline" className="text-xs">
                    {key}: {value}
                  </Badge>
                )
            )}
          </div>
        </div>
      )}

      {/* Spoiler-Free Insights */}
      <div className="grid gap-3 md:grid-cols-2">
        <InsightSection
          title="Vibes"
          items={aiData.insights.spoilerFree.vibes}
        />
        <InsightSection
          title="Themes"
          items={aiData.insights.spoilerFree.themes}
        />
        <InsightSection
          title="Best For"
          items={aiData.insights.spoilerFree.bestFor.map(
            (b) => `${b.subcategory}: ${b.text}`
          )}
        />
        <InsightSection
          title="Highlights"
          items={aiData.insights.spoilerFree.highlights.map(
            (h) => `${h.subcategory}: ${h.text}`
          )}
        />
        <InsightSection
          title="Heads Up"
          items={aiData.insights.spoilerFree.headsUp.map(
            (h) => `${h.subcategory}: ${h.text}`
          )}
        />
        <InsightSection
          title="Questions (Pre-Watch)"
          items={aiData.insights.spoilerFree.questions}
        />
      </div>

      {/* Spoiler Content */}
      {(aiData.insights.spoilerContent.questions.length > 0 ||
        aiData.insights.spoilerContent.deepDive.length > 0) && (
        <div className="border-t border-zinc-800 pt-4 mt-4">
          <h4 className="text-xs font-medium text-amber-400 mb-3">
            Spoiler Content
          </h4>
          <div className="grid gap-3 md:grid-cols-2">
            <InsightSection
              title="Questions (Post-Watch)"
              items={aiData.insights.spoilerContent.questions}
            />
            <InsightSection
              title="Deep Dive"
              items={aiData.insights.spoilerContent.deepDive.map(
                (d) => `[${d.spoilerLevel}] ${d.subcategory}: ${d.text}`
              )}
            />
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="flex gap-4 text-xs text-zinc-500 pt-2 border-t border-zinc-800">
        {aiData.generatedAt && (
          <span>Generated: {new Date(aiData.generatedAt).toLocaleString()}</span>
        )}
        <span>Version: {aiData.version}</span>
      </div>
    </div>
  );
}

function InsightSection({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;

  return (
    <div className="bg-zinc-900/50 rounded p-3 border border-zinc-800">
      <h5 className="text-xs font-medium text-zinc-400 mb-2">{title}</h5>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-zinc-300">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// =============================================================================
// PostgreSQL View
// =============================================================================

function PostgresView({
  itemDetails,
}: {
  itemDetails: Record<string, unknown> | null;
}) {
  if (!itemDetails) {
    return (
      <div className="text-center py-8 text-zinc-500 text-sm">
        Item not found in PostgreSQL database.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Raw PostgreSQL record with relations.
      </p>
      <pre className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800 max-h-[600px] overflow-auto text-xs text-zinc-300 font-mono">
        {JSON.stringify(itemDetails, null, 2)}
      </pre>
    </div>
  );
}

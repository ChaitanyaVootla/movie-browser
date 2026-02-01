"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Brain,
  Database,
  Clock,
  Sparkles,
  Search,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

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

interface AIDataModalProps {
  tmdbId: number;
  mediaType: "movie" | "series";
}

// =============================================================================
// Fetch Function
// =============================================================================

async function fetchItemDetails(
  tmdbId: number,
  mediaType: "movie" | "series"
): Promise<ItemDetailsResponse> {
  const res = await fetch(`/api/admin/item-details?id=${tmdbId}&type=${mediaType}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch item details");
  }
  return res.json();
}

// =============================================================================
// Component
// =============================================================================

export function AIDataModal({ tmdbId, mediaType }: AIDataModalProps) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "item-details", tmdbId, mediaType],
    queryFn: () => fetchItemDetails(tmdbId, mediaType),
    enabled: open,
    staleTime: 60 * 1000,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 px-2 gap-1.5 text-[11px] font-medium",
            "text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/5",
            "border border-transparent hover:border-white/10",
            "transition-all duration-200"
          )}
        >
          <Search className="h-3 w-3" />
          Inspect
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[80vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-brand" />
            Inspect
            {data?.itemDetails && (
              <span className="text-muted-foreground font-normal">
                — {(data.itemDetails.title || data.itemDetails.name) as string}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Status Badges */}
        <div className="flex gap-2 mb-4">
          <Badge variant={data?.hasItemDetails ? "default" : "secondary"}>
            {data?.hasItemDetails ? "In PostgreSQL" : "Not in DB"}
          </Badge>
          <Badge variant={data?.hasAIData ? "default" : "secondary"}>
            {data?.hasAIData ? "AI Enriched" : "No AI Data"}
          </Badge>
          {data?.aiData?.generatedAt && (
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {new Date(data.aiData.generatedAt).toLocaleDateString()}
            </Badge>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load data"}
            </p>
          </div>
        )}

        {isLoading && <LoadingSkeleton />}

        {data && !isLoading && (
          <Tabs defaultValue="ai-input" className="space-y-4">
            <TabsList className="bg-zinc-900 border border-zinc-800">
              <TabsTrigger value="ai-input" className="gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" />
                AI Input
              </TabsTrigger>
              <TabsTrigger value="ai-insights" className="gap-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5" />
                AI Insights
              </TabsTrigger>
              <TabsTrigger value="postgres" className="gap-1.5 text-xs">
                <Database className="h-3.5 w-3.5" />
                PostgreSQL
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ai-input">
              <AIInputView rawInput={data.aiData?.rawInput} />
            </TabsContent>

            <TabsContent value="ai-insights">
              <AIInsightsView aiData={data.aiData} />
            </TabsContent>

            <TabsContent value="postgres">
              <PostgresView itemDetails={data.itemDetails} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// AI Input View
// =============================================================================

function AIInputView({ rawInput }: { rawInput: string | null | undefined }) {
  if (!rawInput) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
        No AI input data available. Run enrichment first.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Markdown context the AI agent receives when answering questions.
        </p>
        <Badge variant="outline" className="text-xs">
          {rawInput.length.toLocaleString()} chars
        </Badge>
      </div>
      <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800 max-h-[500px] overflow-y-auto prose prose-invert prose-sm max-w-none prose-headings:text-zinc-200 prose-p:text-zinc-300 prose-li:text-zinc-300 prose-strong:text-zinc-200 prose-a:text-brand">
        <ReactMarkdown>{rawInput}</ReactMarkdown>
      </div>
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
      <div className="text-center py-8 text-muted-foreground text-sm">
        <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
        No AI insights available. Run enrichment first.
      </div>
    );
  }

  return (
    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
      {/* Hook */}
      {aiData.hook && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1">Hook</h4>
          <p className="text-sm bg-zinc-900/50 rounded p-2 border border-zinc-800">
            {aiData.hook}
          </p>
        </div>
      )}

      {/* Mood */}
      {aiData.mood && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Mood</h4>
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
      <div className="flex gap-4 text-xs text-muted-foreground pt-2 border-t border-zinc-800">
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
      <h5 className="text-xs font-medium text-muted-foreground mb-2">{title}</h5>
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
      <div className="text-center py-8 text-muted-foreground text-sm">
        <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
        Item not found in PostgreSQL database.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Raw PostgreSQL record with relations.
      </p>
      <pre className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800 max-h-[500px] overflow-auto text-xs text-zinc-300 font-mono">
        {JSON.stringify(itemDetails, null, 2)}
      </pre>
    </div>
  );
}

// =============================================================================
// Loading Skeleton
// =============================================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-24" />
      </div>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  );
}

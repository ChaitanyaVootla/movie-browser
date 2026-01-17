/**
 * Person Tool
 *
 * Fetch person details (actors, directors, etc.) for the AI agent.
 * Supports lookup by ID or by name (auto-searches).
 * Answers queries like "What else has X been in?", "Tell me about X"
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getLightPersonDetails, searchPersonAndGetDetails } from "@/server/utils";
import { aiToolLogger } from "@/lib/logger";

// =============================================================================
// Person Details Tool
// =============================================================================

export const getPersonTool = tool(
  async (input: { id?: number; name?: string }) => {
    try {
      let person;

      // If ID provided, fetch directly
      if (input.id) {
        person = await getLightPersonDetails(input.id);
      }
      // If name provided, search first then fetch
      else if (input.name) {
        person = await searchPersonAndGetDetails(input.name);
      } else {
        return JSON.stringify({
          error: "Must provide either id or name",
        });
      }

      if (!person) {
        const identifier = input.id ? `ID ${input.id}` : `"${input.name}"`;
        return JSON.stringify({
          error: `Person ${identifier} not found`,
        });
      }

      // Build response
      const response: Record<string, unknown> = {
        id: person.id,
        name: person.name,
        knownFor: person.knownFor,
        age: person.age,
        bio: person.bio,
      };

      // Upcoming work (IMPORTANT: future releases, what they're "cooking")
      if (person.upcomingWork.length > 0) {
        response.upcomingWork = person.upcomingWork;
      }

      // Recent work (last 3 years)
      if (person.recentWork.length > 0) {
        response.recentWork = person.recentWork;
      }

      // Notable movies (most popular)
      if (person.notableMovies.length > 0) {
        response.notableMovies = person.notableMovies;
      }

      // Notable series (most popular)
      if (person.notableSeries.length > 0) {
        response.notableSeries = person.notableSeries;
      }

      return JSON.stringify(response);
    } catch (error) {
      aiToolLogger.error({
        event: "tool_error",
        tool: "get_person",
        id: input.id,
        name: input.name,
        error: error instanceof Error ? error.message : String(error),
      });
      return JSON.stringify({
        error: "Failed to fetch person details",
      });
    }
  },
  {
    name: "get_person",
    description: `Get an actor/director's filmography, bio, and upcoming work.

Use when: "What else has X been in?", "What's X working on?", "Tell me about [person]"
Prefer name over ID - we'll search: get_person(name: "Brad Pitt")

Returns: bio, age, notable movies/series, recent work, UPCOMING releases.
Use the IDs from results for [MOVIE]/[SERIES]/[PERSON] tags.`,
    schema: z.object({
      id: z.number().optional().describe("TMDB person ID if known"),
      name: z.string().optional().describe("Person name (preferred - we search for you)"),
    }),
  }
);

// =============================================================================
// Export
// =============================================================================

export const personTools = [getPersonTool];

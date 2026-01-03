/**
 * Person Tool
 *
 * Fetch person details (actors, directors, etc.) for the AI agent.
 * Supports lookup by ID or by name (auto-searches).
 * Answers queries like "What else has X been in?", "Tell me about X"
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  getLightPersonDetails,
  searchPersonAndGetDetails,
} from "@/server/utils";

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

      // Notable movies (most popular)
      if (person.notableMovies.length > 0) {
        response.notableMovies = person.notableMovies;
      }

      // Notable series (most popular)
      if (person.notableSeries.length > 0) {
        response.notableSeries = person.notableSeries;
      }

      // Recent work (last 3 years)
      if (person.recentWork.length > 0) {
        response.recentWork = person.recentWork;
      }

      return JSON.stringify(response);
    } catch (error) {
      console.error("get_person error:", error);
      return JSON.stringify({
        error: "Failed to fetch person details",
      });
    }
  },
  {
    name: "get_person",
    description: `Get information about an actor, director, or other film industry person.

Supports TWO ways to look up:
1. By ID: get_person(id: 500) - when you have the TMDB ID from a previous search
2. By name: get_person(name: "Brad Pitt") - searches and returns top match

Use this when:
- User asks "What else has X been in?"
- User asks "Tell me about X" (actor/director)
- User asks about a person's filmography
- User asks "What has X done recently?"

Returns:
- Basic info: name, known for (Acting/Directing), age, bio
- Notable movies: top 5 most popular films with roles
- Notable series: top 5 most popular TV shows with roles
- Recent work: projects from the last 3 years

PREFER using name over ID - we'll search for you!`,
    schema: z.object({
      id: z
        .number()
        .optional()
        .describe("TMDB person ID (if known from a previous search/tool)"),
      name: z
        .string()
        .optional()
        .describe("Person name to search for (preferred - we'll find them!)"),
    }),
  }
);

// =============================================================================
// Export
// =============================================================================

export const personTools = [getPersonTool];


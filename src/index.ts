import { Hono } from "hono";
import { cors } from "hono/cors";

import { SearchResult, SourceMetadata } from "./types";
import { detectInputType } from "./detect";
import { formatAllCitations } from "./formatters";
import {
  searchAll,
  metadataFromSearchResult,
  fetchDOIMetadata,
  fetchISBNMetadata,
  fetchYouTubeMetadata,
  fetchWikipediaMetadata,
  fetchURLMetadata,
} from "./fetchers";

type Bindings = {
  GEMINI_API_KEY: string;
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors());

// Health check
app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

// ============ SEARCH ENDPOINT (For text queries - returns multiple results) ============

app.post("/api/search", async (c) => {
  try {
    const { query } = await c.req.json();

    if (!query) {
      return c.json({ error: "No query provided" }, 400);
    }

    const results = await searchAll(query);
    return c.json({ results });
  } catch (error) {
    console.error("Search error:", error);
    return c.json({ error: "Search failed" }, 500);
  }
});

// ============ CITE FROM SEARCH RESULT ============

app.post("/api/cite/selected", async (c) => {
  try {
    const { result } = await c.req.json();

    if (!result) {
      return c.json({ error: "No result provided" }, 400);
    }

    const today = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const todayShort = new Date().toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const metadata = metadataFromSearchResult(result as SearchResult);
    metadata.accessDate = today;

    const citations = formatAllCitations(metadata, todayShort);
    return c.json({ citations });
  } catch (error) {
    console.error("Cite selected error:", error);
    return c.json({ error: "Failed to generate citation" }, 500);
  }
});

// ============ DIRECT CITE ENDPOINT (For URLs, DOIs, ISBNs - instant) ============

app.post("/api/cite", async (c) => {
  try {
    const { source } = await c.req.json();

    if (!source) {
      return c.json({ error: "No source provided" }, 400);
    }

    const today = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const todayShort = new Date().toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const inputType = detectInputType(source);
    let metadata: SourceMetadata | null = null;

    switch (inputType) {
      case "doi":
        metadata = await fetchDOIMetadata(source);
        break;
      case "isbn":
        metadata = await fetchISBNMetadata(source);
        break;
      case "youtube":
        metadata = await fetchYouTubeMetadata(source);
        break;
      case "wikipedia":
        metadata = await fetchWikipediaMetadata(source);
        break;
      case "url":
        metadata = await fetchURLMetadata(source);
        break;
      case "text":
        // For text queries, return indication to use search
        return c.json({ 
          needsSearch: true, 
          message: "Text queries require search selection" 
        });
    }

    if (!metadata) {
      return c.json({ error: "Could not fetch metadata for this source" }, 400);
    }

    metadata.accessDate = today;
    const citations = formatAllCitations(metadata, todayShort);
    return c.json({ citations });
  } catch (error) {
    console.error("Citation error:", error);
    return c.json({ error: "Failed to generate citation" }, 500);
  }
});

export default app;

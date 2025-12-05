# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PaperCitation is a Cloudflare Workers application that generates academic citations in multiple formats (APA7, MLA9, Chicago, Harvard). It fetches metadata from various sources (DOIs, ISBNs, URLs, YouTube, Wikipedia) and provides both search-based and direct citation generation.

**Tech Stack:**
- **Runtime:** Cloudflare Workers (edge computing platform)
- **Framework:** Hono (lightweight web framework)
- **Language:** TypeScript
- **Deployment:** Wrangler CLI

**Live URLs:**
- Production: https://papercitation.com (custom domain)
- Workers.dev: https://papercitation.stalyn.workers.dev

## Development Commands

```bash
# Install dependencies
npm install

# Local development (starts Wrangler dev server)
npm run dev

# Deploy to Cloudflare Workers
npm run deploy

# Build static assets (copies public/ to dist/)
npm run build
```

## Architecture

### Request Flow

1. **User input** → Frontend (public/index.html) sends request to API
2. **Input detection** → `src/lib/detect.ts` determines input type (DOI, ISBN, URL, YouTube, Wikipedia, or text query)
3. **Route handling** → `src/index.ts` routes to appropriate endpoint:
   - `/api/search` → Text queries (returns multiple results for user selection)
   - `/api/cite` → Direct cite (DOI/ISBN/URL/YouTube/Wikipedia)
   - `/api/cite/selected` → Generate citation from selected search result
4. **Metadata fetching** → `src/lib/fetchers.ts` fetches from external APIs
5. **Citation formatting** → `src/lib/formatters.ts` generates citations in all 4 formats
6. **Response** → Returns Citations object with apa7, mla9, chicago, harvard fields

### Directory Structure

```
src/
├── index.ts              # Main routes and API endpoints (Hono app)
└── lib/
    ├── types.ts          # TypeScript interfaces (SourceMetadata, Citations, SearchResult)
    ├── detect.ts         # Input type detection and parsing
    ├── fetchers.ts       # External API integrations (Google Books, OpenLibrary, CrossRef, etc.)
    ├── formatters.ts     # Citation formatting logic for all 4 styles
    └── authors.ts        # Author name formatting utilities (APA vs MLA)

public/
└── index.html           # Frontend UI (served as static asset)
```

### Key Concepts

**Two-Path Citation Flow:**
1. **Direct cite path:** User provides DOI/ISBN/URL → detect input type → fetch metadata → format citations
2. **Search path:** User provides text query → search multiple APIs → return results → user selects → format citations

**Metadata Sources:**
- **Books:** Google Books API + OpenLibrary API (parallel fetch, merged results)
- **Articles:** CrossRef API (DOI lookup)
- **Videos:** YouTube oEmbed API
- **Encyclopedia:** Wikipedia URL parsing
- **Websites:** HTML meta tag scraping (Open Graph, article metadata)

**Deduplication:** Search results from multiple sources are deduplicated by title + first author before returning to user.

**Author Formatting:**
- APA uses "Last, F. M." format with ampersand before final author
- MLA uses "Last, First" for first author, "et al." for 3+ authors
- Handled by `src/lib/authors.ts` utilities

## Important Implementation Details

### Environment Variables

The app expects a `GEMINI_API_KEY` binding (defined in wrangler.toml or set via Cloudflare dashboard), though it's not currently used in the code. The `ASSETS` binding serves static files from `public/`.

### Import Paths

All library modules are in `src/lib/`. Main routes file imports with `./lib/` prefix:
```typescript
import { detectInputType } from "./lib/detect";
```

### Date Handling

- Access dates use two formats:
  - `today`: "Month DD, YYYY" format (for APA/Chicago/Harvard)
  - `todayShort`: "DD Mon YYYY" format (for MLA)
- Publication dates parsed from API responses with fallback to "n.d." (no date)

### External API Rate Limits

- Google Books API: No key required, but has rate limits
- OpenLibrary: No authentication, public API
- CrossRef: Uses polite User-Agent header
- Generic URLs: Fetches full HTML to parse meta tags

### Citation Format Notes

- HTML `<i>` tags used for italics in all citation formats
- APA7: Omits site name when it matches author name
- MLA9: Always includes access date
- Chicago: Uses title-first for sources without authors
- Harvard: Similar to APA but different punctuation

## Deployment Notes

This is a **Cloudflare Workers** project, not a Pages project. Use `npm run deploy` (which runs `wrangler deploy`), not Cloudflare Pages deployment.

The `wrangler.toml` configuration:
- Sets `main = "src/index.ts"` (TypeScript entry point)
- Configures `[assets]` to serve `public/` directory
- Defines custom domain routes for papercitation.com

When making changes that affect TypeScript types, ensure compatibility with `@cloudflare/workers-types` package.

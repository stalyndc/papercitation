import { Hono } from "hono";
import { cors } from "hono/cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

type Bindings = {
  GEMINI_API_KEY: string;
  ASSETS: Fetcher;
};

interface SourceMetadata {
  authors: string[];
  title: string;
  siteName: string;
  publisher?: string;
  year?: string;
  month?: string;
  day?: string;
  url: string;
  accessDate: string;
  type: "website" | "book" | "article" | "video" | "encyclopedia";
}

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors());

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

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

    let metadata: SourceMetadata | null = null;

    // Detect source type and fetch metadata
    const sourceType = detectSourceType(source);
    console.log("Source type detected:", sourceType);

    switch (sourceType) {
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
    }

    console.log("Metadata fetched:", metadata ? "success" : "null");

    // If we got metadata from APIs, format citations directly
    if (metadata) {
      metadata.accessDate = today;
      const citations = formatAllCitations(metadata, todayShort);
      return c.json({ citations });
    }

    // Fallback to Gemini for unstructured sources
    console.log("Falling back to Gemini");
    const citations = await generateWithGemini(source, today, c.env.GEMINI_API_KEY);
    return c.json({ citations });

  } catch (error) {
    console.error("Citation error:", error);
    return c.json({ error: "Failed to generate citation" }, 500);
  }
});

// ============ SOURCE TYPE DETECTION ============

function detectSourceType(source: string): "doi" | "isbn" | "youtube" | "wikipedia" | "url" | "text" {
  const s = source.trim().toLowerCase();

  // DOI detection
  if (s.startsWith("10.") || s.includes("doi.org/")) {
    return "doi";
  }

  // ISBN detection (10 or 13 digits)
  const isbnClean = source.replace(/[-\s]/g, "");
  if (/^(?:\d{10}|\d{13})$/.test(isbnClean)) {
    return "isbn";
  }

  // YouTube detection
  if (s.includes("youtube.com") || s.includes("youtu.be")) {
    return "youtube";
  }

  // Wikipedia detection
  if (s.includes("wikipedia.org")) {
    return "wikipedia";
  }

  // URL detection
  if (s.startsWith("http://") || s.startsWith("https://")) {
    return "url";
  }

  return "text";
}

// ============ DOI - CrossRef API ============

async function fetchDOIMetadata(source: string): Promise<SourceMetadata | null> {
  try {
    let doi = source;
    if (source.includes("doi.org/")) {
      doi = source.split("doi.org/")[1];
    }
    doi = doi.replace(/^https?:\/\//, "");

    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { "User-Agent": "PaperCitation/1.0 (mailto:contact@papercitation.com)" }
    });

    if (!response.ok) return null;

    const data = await response.json();
    const work = data.message;

    const authors = (work.author || []).map((a: any) => 
      `${a.family}${a.given ? ", " + a.given : ""}`
    );

    const published = work.published?.["date-parts"]?.[0] || 
                      work["published-online"]?.["date-parts"]?.[0] ||
                      work["published-print"]?.["date-parts"]?.[0] || [];
    
    return {
      authors,
      title: work.title?.[0] || "Untitled",
      siteName: work["container-title"]?.[0] || work.publisher || "Unknown Publisher",
      publisher: work.publisher,
      year: published[0]?.toString(),
      month: published[1] ? getMonthName(published[1]) : undefined,
      day: published[2]?.toString(),
      url: `https://doi.org/${doi}`,
      accessDate: "",
      type: "article",
    };
  } catch (e) {
    console.error("CrossRef error:", e);
    return null;
  }
}

// ============ ISBN - OpenLibrary API ============

async function fetchISBNMetadata(source: string): Promise<SourceMetadata | null> {
  try {
    const isbn = source.replace(/[-\s]/g, "");
    
    const response = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
    );

    if (!response.ok) return null;

    const data = await response.json();
    const book = data[`ISBN:${isbn}`];

    if (!book) return null;

    const authors = (book.authors || []).map((a: any) => a.name);
    const publishDate = book.publish_date || "";
    const yearMatch = publishDate.match(/\d{4}/);

    return {
      authors,
      title: book.title || "Untitled",
      siteName: book.publishers?.[0]?.name || "Unknown Publisher",
      publisher: book.publishers?.[0]?.name,
      year: yearMatch ? yearMatch[0] : undefined,
      url: book.url || `https://openlibrary.org/isbn/${isbn}`,
      accessDate: "",
      type: "book",
    };
  } catch (e) {
    console.error("OpenLibrary error:", e);
    return null;
  }
}

// ============ YouTube - oEmbed API ============

async function fetchYouTubeMetadata(source: string): Promise<SourceMetadata | null> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(source)}&format=json`
    );

    if (!response.ok) return null;

    const data = await response.json();

    return {
      authors: [data.author_name || "Unknown"],
      title: data.title || "Untitled",
      siteName: "YouTube",
      url: source,
      accessDate: "",
      type: "video",
    };
  } catch (e) {
    console.error("YouTube error:", e);
    return null;
  }
}

// ============ Wikipedia - Direct parsing ============

async function fetchWikipediaMetadata(source: string): Promise<SourceMetadata | null> {
  try {
    // Extract article title from URL
    const match = source.match(/wikipedia\.org\/wiki\/([^#?]+)/);
    if (!match) return null;

    const articleSlug = match[1];
    const articleTitle = decodeURIComponent(articleSlug.replace(/_/g, " "));
    
    // Wikipedia articles don't have individual authors, use title-first citation
    return {
      authors: [],
      title: articleTitle,
      siteName: "Wikipedia",
      publisher: "Wikimedia Foundation",
      url: source,
      accessDate: "",
      type: "encyclopedia",
    };
  } catch (e) {
    console.error("Wikipedia error:", e);
    return null;
  }
}

// ============ Generic URL - Meta Tags ============

async function fetchURLMetadata(source: string): Promise<SourceMetadata | null> {
  try {
    const response = await fetch(source, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PaperCitation/1.0)" }
    });

    if (!response.ok) return null;

    const html = await response.text();

    const getMetaContent = (name: string): string | undefined => {
      const patterns = [
        new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, "i"),
      ];
      for (const pattern of patterns) {
        const m = html.match(pattern);
        if (m) return m[1];
      }
      return undefined;
    };

    const getTitle = (): string => {
      const ogTitle = getMetaContent("og:title");
      if (ogTitle) return ogTitle;
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      return titleMatch ? titleMatch[1].trim() : "Untitled";
    };

    const dateStr = getMetaContent("article:published_time") || 
                    getMetaContent("datePublished") ||
                    getMetaContent("date");
    
    let year, month, day;
    if (dateStr) {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        year = date.getFullYear().toString();
        month = getMonthName(date.getMonth() + 1);
        day = date.getDate().toString();
      }
    }

    const authorStr = getMetaContent("author") || 
                      getMetaContent("article:author") ||
                      getMetaContent("og:article:author");

    return {
      authors: authorStr ? [authorStr] : [],
      title: getTitle(),
      siteName: getMetaContent("og:site_name") || new URL(source).hostname.replace("www.", ""),
      year,
      month,
      day,
      url: source,
      accessDate: "",
      type: "website",
    };
  } catch (e) {
    console.error("URL fetch error:", e);
    return null;
  }
}

// ============ Gemini Fallback ============

async function generateWithGemini(
  source: string, 
  today: string, 
  apiKey: string
): Promise<Record<string, string>> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

  const prompt = `You are a citation generator. Generate citations for this source in all 4 formats.

Source: ${source}
Today's date: ${today}

Generate citations in these formats:
- APA 7
- MLA 9  
- Chicago
- Harvard

If information is missing, make reasonable inferences or use "n.d." for no date.

Respond ONLY with valid JSON:
{
  "apa7": "citation",
  "mla9": "citation", 
  "chicago": "citation",
  "harvard": "citation"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  throw new Error("Failed to parse Gemini response");
}

// ============ CITATION FORMATTERS ============

function formatAllCitations(meta: SourceMetadata, todayShort: string): Record<string, string> {
  return {
    apa7: formatAPA7(meta),
    mla9: formatMLA9(meta, todayShort),
    chicago: formatChicago(meta),
    harvard: formatHarvard(meta),
  };
}

function formatAPA7(m: SourceMetadata): string {
  const date = m.year 
    ? `(${m.year}${m.month ? ", " + m.month : ""}${m.day ? " " + m.day : ""})`
    : "(n.d.)";

  if (m.type === "encyclopedia") {
    // Wikipedia/Encyclopedia format
    return `${m.title}. ${date}. In ${m.siteName}. Retrieved ${m.accessDate}, from ${m.url}`;
  }
  
  if (m.type === "book") {
    const author = m.authors.length > 0 ? m.authors.join(", ") : "Unknown";
    return `${author} ${date}. ${m.title}. ${m.publisher || m.siteName}.`;
  }
  
  if (m.type === "video") {
    const author = m.authors.length > 0 ? m.authors.join(", ") : "Unknown";
    return `${author} ${date}. ${m.title} [Video]. ${m.siteName}. ${m.url}`;
  }
  
  // Default website/article
  const author = m.authors.length > 0 ? m.authors.join(", ") : m.siteName;
  return `${author} ${date}. ${m.title}. ${m.siteName}. ${m.url}`;
}

function formatMLA9(m: SourceMetadata, todayShort: string): string {
  const date = m.year 
    ? `${m.day ? m.day + " " : ""}${m.month ? m.month + " " : ""}${m.year}`
    : "n.d.";

  if (m.type === "encyclopedia") {
    return `"${m.title}." ${m.siteName}, ${date}, ${m.url}. Accessed ${todayShort}.`;
  }
  
  if (m.type === "book") {
    const author = m.authors.length > 0 ? m.authors.join(", ") + ". " : "";
    return `${author}${m.title}. ${m.publisher || m.siteName}, ${m.year || "n.d."}.`;
  }
  
  if (m.type === "video") {
    const author = m.authors.length > 0 ? m.authors.join(", ") + ". " : "";
    return `${author}"${m.title}." ${m.siteName}, ${date}, ${m.url}. Accessed ${todayShort}.`;
  }
  
  const author = m.authors.length > 0 ? m.authors.join(", ") + ". " : "";
  return `${author}"${m.title}." ${m.siteName}, ${date}, ${m.url}. Accessed ${todayShort}.`;
}

function formatChicago(m: SourceMetadata): string {
  const date = m.year 
    ? `${m.month ? m.month + " " : ""}${m.day ? m.day + ", " : ""}${m.year}`
    : "n.d.";

  if (m.type === "encyclopedia") {
    return `${m.siteName}. "${m.title}." Accessed ${m.accessDate}. ${m.url}.`;
  }

  if (m.type === "book") {
    const author = m.authors.length > 0 ? m.authors.join(", ") + ". " : "";
    return `${author}${m.title}. ${m.siteName}, ${m.year || "n.d."}.`;
  }
  
  const author = m.authors.length > 0 ? m.authors.join(", ") + ". " : "";
  return `${author}"${m.title}." ${m.siteName}. ${date}. ${m.url}.`;
}

function formatHarvard(m: SourceMetadata): string {
  const year = m.year || "n.d.";

  if (m.type === "encyclopedia") {
    return `${m.siteName} (${year}) ${m.title}. Available at: ${m.url} (Accessed: ${m.accessDate}).`;
  }

  if (m.type === "book") {
    const author = m.authors.length > 0 ? m.authors.join(", ") : "Unknown";
    return `${author} (${year}) ${m.title}. ${m.publisher || m.siteName}.`;
  }
  
  if (m.type === "video") {
    const author = m.authors.length > 0 ? m.authors.join(", ") : "Unknown";
    return `${author} (${year}) ${m.title} [Video]. Available at: ${m.url} (Accessed: ${m.accessDate}).`;
  }
  
  const author = m.authors.length > 0 ? m.authors.join(", ") : m.siteName;
  return `${author} (${year}) ${m.title}, ${m.siteName}. Available at: ${m.url} (Accessed: ${m.accessDate}).`;
}

// ============ HELPERS ============

function getMonthName(month: number): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return months[month - 1] || "";
}

export default app;

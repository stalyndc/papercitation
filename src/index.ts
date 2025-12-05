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
      case "text":
        // Try Google Books first, then OpenLibrary
        metadata = await searchGoogleBooks(source);
        if (!metadata) {
          metadata = await searchOpenLibrary(source);
        }
        break;
    }

    console.log("Metadata fetched:", metadata ? "success" : "null");

    if (metadata) {
      metadata.accessDate = today;
      const citations = formatAllCitations(metadata, todayShort);
      return c.json({ citations });
    }

    // Fallback to Gemini
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

  if (s.startsWith("10.") || s.includes("doi.org/")) {
    return "doi";
  }

  const isbnClean = source.replace(/[-\s]/g, "");
  if (/^(?:\d{10}|\d{13})$/.test(isbnClean)) {
    return "isbn";
  }

  if (s.includes("youtube.com") || s.includes("youtu.be")) {
    return "youtube";
  }

  if (s.includes("wikipedia.org")) {
    return "wikipedia";
  }

  if (s.startsWith("http://") || s.startsWith("https://")) {
    return "url";
  }

  return "text";
}

// ============ GOOGLE BOOKS API (Primary for book searches) ============

async function searchGoogleBooks(query: string): Promise<SourceMetadata | null> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5&printType=books`
    );

    if (!response.ok) return null;

    const data = await response.json();

    if (!data.items || data.items.length === 0) return null;

    // Find best match - prefer exact title matches
    const queryLower = query.toLowerCase().trim();
    let bestMatch = data.items[0];
    
    for (const item of data.items) {
      const title = item.volumeInfo?.title?.toLowerCase() || "";
      if (title === queryLower) {
        bestMatch = item;
        break;
      }
    }

    const info = bestMatch.volumeInfo;
    if (!info) return null;

    const authors = info.authors || [];
    
    // Extract year from publishedDate (format: "1958" or "1958-06-17")
    let year: string | undefined;
    if (info.publishedDate) {
      const yearMatch = info.publishedDate.match(/^\d{4}/);
      if (yearMatch) {
        year = yearMatch[0];
      }
    }

    return {
      authors,
      title: info.title || query,
      siteName: info.publisher || "Unknown Publisher",
      publisher: info.publisher,
      year,
      url: info.infoLink || `https://books.google.com/books?id=${bestMatch.id}`,
      accessDate: "",
      type: "book",
    };
  } catch (e) {
    console.error("Google Books error:", e);
    return null;
  }
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

// ============ ISBN - Multiple sources ============

async function fetchISBNMetadata(source: string): Promise<SourceMetadata | null> {
  const isbn = source.replace(/[-\s]/g, "");
  
  // Try Google Books first
  const googleResult = await searchGoogleBooksByISBN(isbn);
  if (googleResult) return googleResult;
  
  // Fallback to OpenLibrary
  return await fetchOpenLibraryByISBN(isbn);
}

async function searchGoogleBooksByISBN(isbn: string): Promise<SourceMetadata | null> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
    );

    if (!response.ok) return null;

    const data = await response.json();

    if (!data.items || data.items.length === 0) return null;

    const info = data.items[0].volumeInfo;
    if (!info) return null;

    let year: string | undefined;
    if (info.publishedDate) {
      const yearMatch = info.publishedDate.match(/^\d{4}/);
      if (yearMatch) year = yearMatch[0];
    }

    return {
      authors: info.authors || [],
      title: info.title || "Untitled",
      siteName: info.publisher || "Unknown Publisher",
      publisher: info.publisher,
      year,
      url: info.infoLink || `https://books.google.com/books?q=isbn:${isbn}`,
      accessDate: "",
      type: "book",
    };
  } catch (e) {
    console.error("Google Books ISBN error:", e);
    return null;
  }
}

async function fetchOpenLibraryByISBN(isbn: string): Promise<SourceMetadata | null> {
  try {
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
    console.error("OpenLibrary ISBN error:", e);
    return null;
  }
}

// ============ OpenLibrary Search (Fallback) ============

async function searchOpenLibrary(query: string): Promise<SourceMetadata | null> {
  try {
    const response = await fetch(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&limit=1`
    );

    if (!response.ok) return null;

    const data = await response.json();
    
    if (!data.docs || data.docs.length === 0) return null;

    const book = data.docs[0];
    
    return {
      authors: book.author_name || [],
      title: book.title || query,
      siteName: book.publisher?.[0] || "Unknown Publisher",
      publisher: book.publisher?.[0],
      year: book.first_publish_year?.toString(),
      url: `https://openlibrary.org${book.key}`,
      accessDate: "",
      type: "book",
    };
  } catch (e) {
    console.error("OpenLibrary search error:", e);
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

// ============ Wikipedia ============

async function fetchWikipediaMetadata(source: string): Promise<SourceMetadata | null> {
  try {
    const match = source.match(/wikipedia\.org\/wiki\/([^#?]+)/);
    if (!match) return null;

    const articleSlug = match[1];
    const articleTitle = decodeURIComponent(articleSlug.replace(/_/g, " "));
    
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

  const prompt = `You are an expert citation generator. Create accurate academic citations.

IMPORTANT: You must provide REAL, ACCURATE bibliographic information from your knowledge.

Source to cite: "${source}"

Research and provide:
- Author's full name
- Exact title
- Publisher name  
- Original publication year (not reprint year)

Generate citations using <i>...</i> for italics:

1. APA 7: Author, A. A. (Year). <i>Title</i>. Publisher.
2. MLA 9: Author. <i>Title</i>. Publisher, Year.
3. Chicago: Author. <i>Title</i>. Place: Publisher, Year.
4. Harvard: Author (Year) <i>Title</i>. Publisher.

DO NOT guess. If you don't know the exact information, respond with this exact JSON:
{"error": "Could not find accurate citation data"}

Otherwise respond with valid JSON only:
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
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    return parsed;
  }

  throw new Error("Failed to parse response");
}

// ============ CITATION FORMATTERS ============

function italic(text: string): string {
  return `<i>${text}</i>`;
}

function formatAllCitations(meta: SourceMetadata, todayShort: string): Record<string, string> {
  return {
    apa7: formatAPA7(meta),
    mla9: formatMLA9(meta, todayShort),
    chicago: formatChicago(meta),
    harvard: formatHarvard(meta),
  };
}

function formatAPA7(m: SourceMetadata): string {
  const date = m.year ? `(${m.year})` : "(n.d.)";

  if (m.type === "encyclopedia") {
    return `${m.title}. ${date}. In ${italic(m.siteName)}. Retrieved ${m.accessDate}, from ${m.url}`;
  }
  
  if (m.type === "book") {
    const author = m.authors.length > 0 ? formatAuthorAPA(m.authors) : "Unknown";
    return `${author} ${date}. ${italic(m.title)}. ${m.publisher || m.siteName}.`;
  }
  
  if (m.type === "video") {
    const author = m.authors.length > 0 ? m.authors.join(", ") : "Unknown";
    return `${author} ${date}. ${italic(m.title)} [Video]. ${m.siteName}. ${m.url}`;
  }

  if (m.type === "article") {
    const author = m.authors.length > 0 ? formatAuthorAPA(m.authors) : "Unknown";
    return `${author} ${date}. ${m.title}. ${italic(m.siteName)}. ${m.url}`;
  }
  
  const author = m.authors.length > 0 ? formatAuthorAPA(m.authors) : m.siteName;
  return `${author} ${date}. ${italic(m.title)}. ${m.siteName}. ${m.url}`;
}

function formatMLA9(m: SourceMetadata, todayShort: string): string {
  if (m.type === "encyclopedia") {
    return `"${m.title}." ${italic(m.siteName)}, ${m.year || "n.d."}, ${m.url}. Accessed ${todayShort}.`;
  }
  
  if (m.type === "book") {
    const author = m.authors.length > 0 ? formatAuthorMLA(m.authors) + ". " : "";
    return `${author}${italic(m.title)}. ${m.publisher || m.siteName}, ${m.year || "n.d."}.`;
  }
  
  if (m.type === "video") {
    const author = m.authors.length > 0 ? formatAuthorMLA(m.authors) + ". " : "";
    return `${author}"${m.title}." ${italic(m.siteName)}, ${m.year || "n.d."}, ${m.url}. Accessed ${todayShort}.`;
  }

  if (m.type === "article") {
    const author = m.authors.length > 0 ? formatAuthorMLA(m.authors) + ". " : "";
    return `${author}"${m.title}." ${italic(m.siteName)}, ${m.year || "n.d."}, ${m.url}. Accessed ${todayShort}.`;
  }
  
  const author = m.authors.length > 0 ? formatAuthorMLA(m.authors) + ". " : "";
  return `${author}"${m.title}." ${italic(m.siteName)}, ${m.year || "n.d."}, ${m.url}. Accessed ${todayShort}.`;
}

function formatChicago(m: SourceMetadata): string {
  if (m.type === "encyclopedia") {
    return `${italic(m.siteName)}. "${m.title}." Accessed ${m.accessDate}. ${m.url}.`;
  }

  if (m.type === "book") {
    const author = m.authors.length > 0 ? formatAuthorMLA(m.authors) + ". " : "";
    return `${author}${italic(m.title)}. ${m.publisher || m.siteName}, ${m.year || "n.d."}.`;
  }

  if (m.type === "article") {
    const author = m.authors.length > 0 ? formatAuthorMLA(m.authors) + ". " : "";
    return `${author}"${m.title}." ${italic(m.siteName)}, ${m.year || "n.d."}. ${m.url}.`;
  }
  
  const author = m.authors.length > 0 ? formatAuthorMLA(m.authors) + ". " : "";
  return `${author}"${m.title}." ${italic(m.siteName)}, ${m.year || "n.d."}. ${m.url}.`;
}

function formatHarvard(m: SourceMetadata): string {
  const year = m.year || "n.d.";

  if (m.type === "encyclopedia") {
    return `${italic(m.siteName)} (${year}) ${m.title}. Available at: ${m.url} (Accessed: ${m.accessDate}).`;
  }

  if (m.type === "book") {
    const author = m.authors.length > 0 ? formatAuthorAPA(m.authors) : "Unknown";
    return `${author} (${year}) ${italic(m.title)}. ${m.publisher || m.siteName}.`;
  }
  
  if (m.type === "video") {
    const author = m.authors.length > 0 ? formatAuthorAPA(m.authors) : "Unknown";
    return `${author} (${year}) ${italic(m.title)} [Video]. Available at: ${m.url} (Accessed: ${m.accessDate}).`;
  }

  if (m.type === "article") {
    const author = m.authors.length > 0 ? formatAuthorAPA(m.authors) : "Unknown";
    return `${author} (${year}) ${m.title}. ${italic(m.siteName)}. Available at: ${m.url} (Accessed: ${m.accessDate}).`;
  }
  
  const author = m.authors.length > 0 ? formatAuthorAPA(m.authors) : m.siteName;
  return `${author} (${year}) ${italic(m.title)}, ${m.siteName}. Available at: ${m.url} (Accessed: ${m.accessDate}).`;
}

// ============ AUTHOR FORMATTERS ============

function formatAuthorAPA(authors: string[]): string {
  if (authors.length === 0) return "Unknown";
  
  return authors.map(name => {
    const parts = name.split(" ");
    if (parts.length === 1) return name;
    const lastName = parts[parts.length - 1];
    const initials = parts.slice(0, -1).map(p => p[0].toUpperCase() + ".").join(" ");
    return `${lastName}, ${initials}`;
  }).join(", & ");
}

function formatAuthorMLA(authors: string[]): string {
  if (authors.length === 0) return "Unknown";
  
  if (authors.length === 1) {
    const parts = authors[0].split(" ");
    if (parts.length === 1) return authors[0];
    const lastName = parts[parts.length - 1];
    const firstName = parts.slice(0, -1).join(" ");
    return `${lastName}, ${firstName}`;
  }
  
  const parts = authors[0].split(" ");
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(" ");
  const firstAuthor = `${lastName}, ${firstName}`;
  
  if (authors.length === 2) {
    return `${firstAuthor}, and ${authors[1]}`;
  }
  
  return `${firstAuthor}, et al.`;
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

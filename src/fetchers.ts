import { SourceMetadata, SearchResult } from "./types";
import { extractDOI, extractISBN } from "./detect";
import { getMonthName } from "./authors";

// ============ SEARCH (Returns multiple results for picker) ============

export async function searchAll(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // Search Google Books and OpenLibrary in parallel
  const [googleResults, openLibResults] = await Promise.all([
    searchGoogleBooks(query),
    searchOpenLibrary(query),
  ]);

  // Add Google Books results
  results.push(...googleResults);

  // Add OpenLibrary results (dedupe by title similarity)
  for (const olResult of openLibResults) {
    const isDupe = results.some(
      (r) => r.title.toLowerCase() === olResult.title.toLowerCase() && 
             r.authors[0]?.toLowerCase() === olResult.authors[0]?.toLowerCase()
    );
    if (!isDupe) {
      results.push(olResult);
    }
  }

  // Sort: prefer results with more complete data
  results.sort((a, b) => {
    const scoreA = (a.year ? 1 : 0) + (a.publisher ? 1 : 0) + (a.authors.length > 0 ? 1 : 0);
    const scoreB = (b.year ? 1 : 0) + (b.publisher ? 1 : 0) + (b.authors.length > 0 ? 1 : 0);
    return scoreB - scoreA;
  });

  return results.slice(0, 10); // Return top 10
}

async function searchGoogleBooks(query: string): Promise<SearchResult[]> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5&printType=books`
    );
    if (!response.ok) return [];

    const data = await response.json();
    if (!data.items) return [];

    return data.items.map((item: any) => {
      const info = item.volumeInfo || {};
      let year: string | undefined;
      if (info.publishedDate) {
        const match = info.publishedDate.match(/^\d{4}/);
        if (match) year = match[0];
      }

      return {
        id: `google_${item.id}`,
        title: info.title || "Untitled",
        authors: info.authors || [],
        year,
        publisher: info.publisher,
        type: "book" as const,
        source: "google_books" as const,
        raw: item,
      };
    });
  } catch (e) {
    console.error("Google Books search error:", e);
    return [];
  }
}

async function searchOpenLibrary(query: string): Promise<SearchResult[]> {
  try {
    const response = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`
    );
    if (!response.ok) return [];

    const data = await response.json();
    if (!data.docs) return [];

    return data.docs.map((doc: any) => ({
      id: `openlibrary_${doc.key}`,
      title: doc.title || "Untitled",
      authors: doc.author_name || [],
      year: doc.first_publish_year?.toString(),
      publisher: doc.publisher?.[0],
      type: "book" as const,
      source: "openlibrary" as const,
      raw: doc,
    }));
  } catch (e) {
    console.error("OpenLibrary search error:", e);
    return [];
  }
}

// ============ FETCH METADATA FROM SEARCH RESULT ============

export function metadataFromSearchResult(result: SearchResult): SourceMetadata {
  return {
    id: result.id,
    authors: result.authors,
    title: result.title,
    siteName: result.publisher || "Unknown Publisher",
    publisher: result.publisher,
    year: result.year,
    url: getUrlFromResult(result),
    accessDate: "",
    type: result.type,
  };
}

function getUrlFromResult(result: SearchResult): string {
  if (result.source === "google_books") {
    return result.raw.volumeInfo?.infoLink || `https://books.google.com/books?id=${result.raw.id}`;
  }
  if (result.source === "openlibrary") {
    return `https://openlibrary.org${result.raw.key}`;
  }
  return "";
}

// ============ DIRECT FETCHERS (For URLs, DOIs, ISBNs) ============

export async function fetchDOIMetadata(source: string): Promise<SourceMetadata | null> {
  try {
    const doi = extractDOI(source);

    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { "User-Agent": "PaperCitation/1.0 (mailto:contact@papercitation.com)" },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const work = data.message;

    const authors = (work.author || []).map(
      (a: any) => `${a.family}${a.given ? ", " + a.given : ""}`
    );

    const published =
      work.published?.["date-parts"]?.[0] ||
      work["published-online"]?.["date-parts"]?.[0] ||
      work["published-print"]?.["date-parts"]?.[0] ||
      [];

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

export async function fetchISBNMetadata(source: string): Promise<SourceMetadata | null> {
  const isbn = extractISBN(source);

  // Try both APIs in parallel
  const [googleResult, openLibResult] = await Promise.all([
    fetchGoogleBooksByISBN(isbn),
    fetchOpenLibraryByISBN(isbn),
  ]);

  if (googleResult && openLibResult) {
    // Use OpenLibrary's first_publish_year if earlier
    const googleYear = parseInt(googleResult.year || "9999");
    const openLibYear = parseInt(openLibResult.year || "9999");

    return {
      ...googleResult,
      year: openLibYear < googleYear ? openLibResult.year : googleResult.year,
      publisher: googleResult.publisher || openLibResult.publisher,
    };
  }

  return googleResult || openLibResult;
}

async function fetchGoogleBooksByISBN(isbn: string): Promise<SourceMetadata | null> {
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
      const match = info.publishedDate.match(/^\d{4}/);
      if (match) year = match[0];
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

export async function fetchYouTubeMetadata(source: string): Promise<SourceMetadata | null> {
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

export async function fetchWikipediaMetadata(source: string): Promise<SourceMetadata | null> {
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

export async function fetchURLMetadata(source: string): Promise<SourceMetadata | null> {
  try {
    const response = await fetch(source, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PaperCitation/1.0)" },
    });
    if (!response.ok) return null;

    const html = await response.text();

    const getMetaContent = (name: string): string | undefined => {
      const patterns = [
        new RegExp(
          `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
          "i"
        ),
        new RegExp(
          `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,
          "i"
        ),
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

    const dateStr =
      getMetaContent("article:published_time") ||
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

    const authorStr =
      getMetaContent("author") ||
      getMetaContent("article:author") ||
      getMetaContent("og:article:author");

    return {
      authors: authorStr ? [authorStr] : [],
      title: getTitle(),
      siteName:
        getMetaContent("og:site_name") || new URL(source).hostname.replace("www.", ""),
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

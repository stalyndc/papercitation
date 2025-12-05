import { InputType } from "./types";

export function detectInputType(source: string): InputType {
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

export function extractDOI(source: string): string {
  let doi = source;
  if (source.includes("doi.org/")) {
    doi = source.split("doi.org/")[1];
  }
  return doi.replace(/^https?:\/\//, "");
}

export function extractISBN(source: string): string {
  return source.replace(/[-\s]/g, "");
}

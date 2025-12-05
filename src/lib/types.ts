export interface SourceMetadata {
  id?: string;
  authors: string[];
  title: string;
  siteName: string;
  publisher?: string;
  year?: string;
  month?: string;
  day?: string;
  url: string;
  accessDate: string;
  type: SourceType;
}

export type SourceType = "website" | "book" | "article" | "video" | "encyclopedia";

export type InputType = "doi" | "isbn" | "youtube" | "wikipedia" | "url" | "text";

export interface SearchResult {
  id: string;
  title: string;
  authors: string[];
  year?: string;
  publisher?: string;
  type: SourceType;
  source: "google_books" | "openlibrary" | "crossref";
  raw: any; // Original API response for later use
}

export interface Citations {
  apa7: string;
  mla9: string;
  chicago: string;
  harvard: string;
}

import { SourceMetadata, Citations } from "./types";
import { formatAuthorAPA, formatAuthorMLA } from "./authors";

function italic(text: string): string {
  return `<i>${text}</i>`;
}

export function formatAllCitations(meta: SourceMetadata, todayShort: string): Citations {
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
    return `${author}. ${date}. ${italic(m.title)}. ${m.publisher || m.siteName}.`;
  }

  if (m.type === "video") {
    const author = m.authors.length > 0 ? m.authors.join(", ") : "Unknown";
    return `${author}. ${date}. ${italic(m.title)} [Video]. ${m.siteName}. ${m.url}`;
  }

  if (m.type === "article") {
    const author = m.authors.length > 0 ? formatAuthorAPA(m.authors) : "Unknown";
    return `${author}. ${date}. ${m.title}. ${italic(m.siteName)}. ${m.url}`;
  }

  // Default website
  const author = m.authors.length > 0 ? formatAuthorAPA(m.authors) : m.siteName;
  const authorIsSiteName = m.authors.length === 0 || author.toLowerCase() === m.siteName.toLowerCase();
  
  // If author is same as site name, omit site name (APA 7 rule)
  if (authorIsSiteName) {
    return `${author}. ${date}. ${italic(m.title)}. ${m.url}`;
  }
  
  return `${author}. ${date}. ${italic(m.title)}. ${m.siteName}. ${m.url}`;
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

  // Default website - MLA starts with title when no author
  if (m.authors.length === 0) {
    return `"${m.title}." ${italic(m.siteName)}, ${m.year || "n.d."}, ${m.url}. Accessed ${todayShort}.`;
  }
  
  const author = formatAuthorMLA(m.authors) + ". ";
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

  // Default website - Chicago starts with title when no author
  if (m.authors.length === 0) {
    return `"${m.title}." ${italic(m.siteName)}. Accessed ${m.accessDate}. ${m.url}.`;
  }
  
  const author = formatAuthorMLA(m.authors) + ". ";
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

  // Default website
  const author = m.authors.length > 0 ? formatAuthorAPA(m.authors) : m.siteName;
  const authorIsSiteName = m.authors.length === 0;
  
  // If no author (using site name), omit redundant site name
  if (authorIsSiteName) {
    return `${author} (${year}) ${italic(m.title)}. Available at: ${m.url} (Accessed: ${m.accessDate}).`;
  }
  
  return `${author} (${year}) ${italic(m.title)}, ${m.siteName}. Available at: ${m.url} (Accessed: ${m.accessDate}).`;
}

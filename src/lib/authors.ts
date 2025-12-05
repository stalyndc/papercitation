/**
 * Format authors for APA style (Last, F. M.)
 */
export function formatAuthorAPA(authors: string[]): string {
  if (authors.length === 0) return "Unknown";

  const formatted = authors.map((name) => {
    const parts = name.split(" ");
    if (parts.length === 1) return name;
    const lastName = parts[parts.length - 1];
    const initials = parts
      .slice(0, -1)
      .map((p) => p[0].toUpperCase() + ".")
      .join(" ");
    return `${lastName}, ${initials}`;
  });

  if (formatted.length === 1) {
    return formatted[0];
  } else if (formatted.length === 2) {
    return `${formatted[0]}, & ${formatted[1]}`;
  } else {
    return `${formatted.slice(0, -1).join(", ")}, & ${formatted[formatted.length - 1]}`;
  }
}

/**
 * Format authors for MLA style (Last, First)
 */
export function formatAuthorMLA(authors: string[]): string {
  if (authors.length === 0) return "Unknown";

  if (authors.length === 1) {
    const parts = authors[0].split(" ");
    if (parts.length === 1) return authors[0];
    const lastName = parts[parts.length - 1];
    const firstName = parts.slice(0, -1).join(" ");
    return `${lastName}, ${firstName}`;
  }

  // First author inverted
  const parts = authors[0].split(" ");
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(" ");
  const firstAuthor = `${lastName}, ${firstName}`;

  if (authors.length === 2) {
    return `${firstAuthor}, and ${authors[1]}`;
  }

  return `${firstAuthor}, et al.`;
}

/**
 * Get month name from number (1-12)
 */
export function getMonthName(month: number): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return months[month - 1] || "";
}

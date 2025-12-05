import { Hono } from "hono";
import { cors } from "hono/cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

type Bindings = {
  GEMINI_API_KEY: string;
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS
app.use("/*", cors());

// Health check
app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

// Citation endpoint
app.post("/api/cite", async (c) => {
  try {
    const { source } = await c.req.json();

    if (!source) {
      return c.json({ error: "No source provided" }, 400);
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(c.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

    // Fetch page content if it's a URL
    let pageContent = "";
    const isURL = source.startsWith("http://") || source.startsWith("https://");
    
    if (isURL) {
      try {
        const response = await fetch(source, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; PaperCitation/1.0)"
          }
        });
        const html = await response.text();
        // Extract text content (basic HTML stripping)
        pageContent = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 5000); // Limit to 5000 chars
      } catch (e) {
        console.error("Failed to fetch URL:", e);
      }
    }

    const today = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long", 
      day: "numeric"
    });

    const prompt = `You are a citation generator. Extract metadata from this source and generate citations in all 4 formats.

Source input: ${source}
${pageContent ? `\nPage content preview:\n${pageContent}` : ""}

Today's date for "Accessed" fields: ${today}

Extract the following if available:
- Author(s) name
- Title of the article/page
- Website/Publication name
- Publication date
- URL

Then generate citations in these exact formats:

APA 7: Author, A. A. (Year, Month Day). Title of article. Site Name. URL
MLA 9: Author. "Title of Article." Site Name, Day Month Year, URL. Accessed ${today}.
Chicago: Author. "Title of Article." Site Name. Month Day, Year. URL.
Harvard: Author (Year) Title of article, Site Name. Available at: URL (Accessed: ${today}).

Rules:
- If author is unknown, start with the title
- If no date, use "n.d." for APA/Harvard, omit for MLA/Chicago
- Always include the URL exactly as provided
- Keep titles in sentence case for APA, title case for others

Respond ONLY with valid JSON in this exact format, no other text:
{
  "apa7": "full citation string",
  "mla9": "full citation string", 
  "chicago": "full citation string",
  "harvard": "full citation string"
}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Parse JSON from response
    let citations;
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        citations = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (e) {
      console.error("Failed to parse Gemini response:", text);
      return c.json({ error: "Failed to parse citation data" }, 500);
    }

    return c.json({ citations });
  } catch (error) {
    console.error("Citation error:", error);
    return c.json({ error: "Failed to generate citation" }, 500);
  }
});

export default app;

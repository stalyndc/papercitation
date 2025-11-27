# Paper Citation - Project Context

## Project Overview
**Paper Citation** is a web application that helps users find academic sources for specific claims and generates citations in multiple formats (APA, MLA, Chicago, Harvard). It leverages AI to translate natural language claims into effective search queries for academic databases.

### Tech Stack
*   **Frontend:** Static HTML, CSS, and Vanilla JavaScript (hosted in `public/`).
*   **Backend:** Cloudflare Worker (Serverless function in `worker/`).
*   **AI:** Google Gemini API (model: `gemini-2.0-flash`) for keyword extraction.
*   **Data Source:** OpenAlex API for academic paper metadata.
*   **Infrastructure:** Cloudflare Workers, Cloudflare KV (for rate limiting).

## Architecture

### Frontend (`public/`)
The frontend is a lightweight, static single-page application.
*   **`index.html`**: The main entry point containing the search form and results container.
*   **`app.js`**: Handles user interaction, manages loading states, sends requests to the Worker API, and renders citation cards dynamically.
*   **`styles.css`**: Custom CSS using a clean, academic aesthetic (IBM Plex Mono + Inter).

### Backend (`worker/`)
The backend is a Cloudflare Worker that acts as an API gateway and logic layer.
*   **Entry Point:** `src/index.js`
*   **Request Flow:**
    1.  **CORS & Method Check:** Only accepts `POST` requests; handles preflight `OPTIONS`.
    2.  **Rate Limiting:** Uses Cloudflare KV (`RATE_LIMIT` binding) to limit IPs to 20 requests/minute.
    3.  **Input Sanitization:** Cleans user input to prevent injection/abuse.
    4.  **Keyword Extraction (AI):** Sends the user's claim to Gemini API to generate 2-4 optimal search keywords.
    5.  **Paper Search:** Queries the OpenAlex API using the generated keywords.
    6.  **Formatting:** Processes the raw OpenAlex data into structured citation objects (APA, MLA, Chicago, Harvard).
    7.  **Response:** Returns a JSON object with the search terms used and the list of formatted papers.

## Development Setup

### Prerequisites
*   Node.js and npm
*   Cloudflare Wrangler CLI (`npm install -g wrangler`)

### Backend (Worker)
1.  Navigate to the worker directory:
    ```bash
    cd worker
    ```
2.  Install dependencies (if any):
    ```bash
    npm install
    ```
3.  **Configuration**:
    *   Ensure you have a `wrangler.toml` file (already present).
    *   You will likely need to set the `GEMINI_API_KEY` secret for local development:
        ```bash
        npx wrangler secret put GEMINI_API_KEY
        # Or use a .dev.vars file for local dev
        ```
4.  **Run Locally**:
    ```bash
    npm run dev
    # or
    wrangler dev
    ```
    The API will typically run at `http://localhost:8787`.

5.  **Deploy**:
    ```bash
    npm run deploy
    ```

### Frontend
The frontend is static. You can serve it using any static file server.
1.  From the project root:
    ```bash
    npx serve public
    ```
2.  **Note on API URL**: The `public/app.js` file points to the production API URL:
    ```javascript
    const API_URL = "https://papercitation-api.stalyn.workers.dev";
    ```
    **For local development**, you may need to change this to `http://localhost:8787` to test against your local worker.

## Key Files & Directories
*   `public/`: Frontend assets.
    *   `app.js`: Client-side logic.
    *   `styles.css`: Styles.
*   `worker/`: Backend logic.
    *   `src/index.js`: Main Worker script containing all API logic.
    *   `wrangler.toml`: Cloudflare Worker configuration.
*   `suggestions.md`: A comprehensive design and feature review document containing high-value recommendations for future improvements.

## Conventions & Notes
*   **Styling**: Uses CSS variables for colors (Orange accent `#FF6D1F`).
*   **Rate Limiting**: Implemented via Cloudflare KV.
*   **Error Handling**: The backend distinguishes between Gemini API errors, OpenAlex errors, and general server errors, returning appropriate 50x codes.
*   **Future Plans**: Refer to `suggestions.md` for a prioritized list of enhancements (UI polish, improved error handling, new features like export options).

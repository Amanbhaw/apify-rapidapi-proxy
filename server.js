/**
 * RapidAPI HTTP proxy for Apify actors.
 *
 * Exposes 4 endpoints that internally call the corresponding Apify actor
 * and return clean JSON responses:
 *
 *   POST /youtube-transcript   → inexhaustible_glass/youtube-transcript-extractor
 *   POST /lead-enrichment      → inexhaustible_glass/linkedin-email-finder
 *   POST /google-trends        → inexhaustible_glass/google-trends-scraper
 *   POST /google-maps-leads    → amanbhawsar/smart-lead-finder-email-extractor
 *
 * Required env vars:
 *   APIFY_TOKEN              - Apify API token (used to run the actors)
 *   RAPIDAPI_PROXY_SECRET    - Optional, if set the server validates the
 *                              X-RapidAPI-Proxy-Secret header on every request
 *   PORT                     - Port to listen on (default 3000)
 */

import express from "express";
import cors from "cors";
import { ApifyClient } from "apify-client";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors());

const PORT = process.env.PORT || 3000;
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const RAPIDAPI_PROXY_SECRET = process.env.RAPIDAPI_PROXY_SECRET;

if (!APIFY_TOKEN) {
  console.error("FATAL: APIFY_TOKEN env var is required");
  process.exit(1);
}

const apify = new ApifyClient({ token: APIFY_TOKEN });

// ─────────────────────────────────────────────
// Actor IDs
// ─────────────────────────────────────────────
const ACTORS = {
  youtube: "inexhaustible_glass/youtube-transcript-extractor",
  linkedin: "inexhaustible_glass/linkedin-email-finder",
  trends: "inexhaustible_glass/google-trends-scraper",
  maps: "amanbhawsar/smart-lead-finder-email-extractor",
};

// ─────────────────────────────────────────────
// Middleware: validate RapidAPI proxy secret
// ─────────────────────────────────────────────
function verifyRapidApi(req, res, next) {
  if (!RAPIDAPI_PROXY_SECRET) return next(); // dev mode - skip
  const got = req.header("X-RapidAPI-Proxy-Secret");
  if (got !== RAPIDAPI_PROXY_SECRET) {
    return res.status(401).json({ error: "Unauthorized — invalid RapidAPI proxy secret" });
  }
  next();
}

// ─────────────────────────────────────────────
// Helper: run an Apify actor and return items
// ─────────────────────────────────────────────
async function runActor(actorId, input, { memory = 512, timeoutSecs = 300 } = {}) {
  const run = await apify.actor(actorId).call(input, {
    memory,
    timeout: timeoutSecs,
  });
  const { items } = await apify.dataset(run.defaultDatasetId).listItems();
  return { runId: run.id, status: run.status, items };
}

// ─────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    name: "Apify RapidAPI Proxy",
    version: "1.0.0",
    status: "healthy",
    endpoints: [
      "POST /youtube-transcript",
      "POST /lead-enrichment",
      "POST /google-trends",
      "POST /google-maps-leads",
    ],
  });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

// ─────────────────────────────────────────────
// 1. YouTube Transcript Scraper
// ─────────────────────────────────────────────
app.post("/youtube-transcript", verifyRapidApi, async (req, res) => {
  try {
    const { urls, language = "en" } = req.body || {};

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        error: "Missing required field: 'urls' must be a non-empty array",
        example: {
          urls: ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
          language: "en",
        },
      });
    }

    if (urls.length > 50) {
      return res.status(400).json({
        error: "Max 50 URLs per request. Split into multiple calls for larger batches.",
      });
    }

    const { items } = await runActor(ACTORS.youtube, { urls, language });

    res.json({
      success: true,
      count: items.length,
      results: items,
    });
  } catch (err) {
    console.error("youtube-transcript error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// 2. B2B Lead Enrichment (Email Finder + LinkedIn)
// ─────────────────────────────────────────────
app.post("/lead-enrichment", verifyRapidApi, async (req, res) => {
  try {
    const { urls, firstName = "", lastName = "" } = req.body || {};

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        error: "Missing required field: 'urls' must be a non-empty array of company websites",
        example: {
          urls: ["https://stripe.com", "https://figma.com"],
          firstName: "John",
          lastName: "Doe",
        },
      });
    }

    if (urls.length > 25) {
      return res.status(400).json({
        error: "Max 25 URLs per request.",
      });
    }

    const { items } = await runActor(
      ACTORS.linkedin,
      { urls, firstName, lastName },
      { memory: 1024, timeoutSecs: 600 }
    );

    res.json({
      success: true,
      count: items.length,
      leads: items,
    });
  } catch (err) {
    console.error("lead-enrichment error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// 3. Google Trends Scraper
// ─────────────────────────────────────────────
app.post("/google-trends", verifyRapidApi, async (req, res) => {
  try {
    const {
      keywords,
      timeframe = "today 3-m",
      geo = "",
      category = 0,
      includeTrending = false,
      trendingCountry = "united_states",
    } = req.body || {};

    if (!Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({
        error: "Missing required field: 'keywords' must be a non-empty array",
        example: {
          keywords: ["AI", "ChatGPT", "Claude"],
          timeframe: "today 3-m",
          geo: "US",
        },
      });
    }

    if (keywords.length > 100) {
      return res.status(400).json({ error: "Max 100 keywords per request." });
    }

    const { items } = await runActor(
      ACTORS.trends,
      { keywords, timeframe, geo, category, includeTrending, trendingCountry },
      { memory: 1024, timeoutSecs: 600 }
    );

    res.json({ success: true, count: items.length, trends: items });
  } catch (err) {
    console.error("google-trends error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// 4. Google Maps Business Leads
// ─────────────────────────────────────────────
app.post("/google-maps-leads", verifyRapidApi, async (req, res) => {
  try {
    const {
      search_query,
      max_results = 20,
      extract_emails = true,
      extract_website = true,
      language = "en",
    } = req.body || {};

    if (!search_query || typeof search_query !== "string") {
      return res.status(400).json({
        error: "Missing required field: 'search_query' (string)",
        example: {
          search_query: "Restaurants in Mumbai",
          max_results: 20,
          extract_emails: true,
        },
      });
    }

    if (max_results > 100) {
      return res.status(400).json({ error: "Max 100 results per request." });
    }

    const { items } = await runActor(
      ACTORS.maps,
      { search_query, max_results, extract_emails, extract_website, language },
      { memory: 1024, timeoutSecs: 900 }
    );

    res.json({ success: true, count: items.length, businesses: items });
  } catch (err) {
    console.error("google-maps-leads error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// Error fallback
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Apify RapidAPI proxy listening on port ${PORT}`);
});

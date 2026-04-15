/**
 * RapidAPI HTTP proxy for all Apify actors (13 endpoints).
 * Deploy to Render.com / Railway — passes through to Apify actors.
 *
 * Required env vars:
 *   APIFY_TOKEN              - Apify API token
 *   RAPIDAPI_PROXY_SECRET    - Optional secret for RapidAPI requests
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
// Actor IDs (all 13)
// ─────────────────────────────────────────────
const ACTORS = {
  // Original 4
  youtube:   "inexhaustible_glass/youtube-transcript-extractor",
  linkedin:  "inexhaustible_glass/linkedin-email-finder",
  trends:    "inexhaustible_glass/google-trends-scraper",
  maps:      "inexhaustible_glass/smart-lead-finder-email-extractor",
  // Social
  instagram: "inexhaustible_glass/instagram-lead-finder",
  skyscout:  "inexhaustible_glass/skyscout",
  shophound: "inexhaustible_glass/shophound",
  // India B2B
  tenderhawk: "inexhaustible_glass/tenderhawk",
  gsthawk:    "inexhaustible_glass/gsthawk",
  mcahawk:    "inexhaustible_glass/mcahawk",
  // Global B2B
  ukhawk:    "inexhaustible_glass/ukhawk",
  frhawk:    "inexhaustible_glass/frhawk",
  dehawk:    "inexhaustible_glass/dehawk",
};

// ─────────────────────────────────────────────
// Middleware: validate RapidAPI proxy secret
// ─────────────────────────────────────────────
function verifyRapidApi(req, res, next) {
  if (!RAPIDAPI_PROXY_SECRET) return next();
  const got = req.header("X-RapidAPI-Proxy-Secret");
  if (got !== RAPIDAPI_PROXY_SECRET) {
    return res.status(401).json({ error: "Unauthorized — invalid RapidAPI proxy secret" });
  }
  next();
}

// ─────────────────────────────────────────────
// Helper: run Apify actor → return items
// ─────────────────────────────────────────────
async function runActor(actorId, input, { memory = 512, timeoutSecs = 300 } = {}) {
  const run = await apify.actor(actorId).call(input, { memory, timeout: timeoutSecs });
  const { items } = await apify.dataset(run.defaultDatasetId).listItems();
  return { runId: run.id, status: run.status, items };
}

// Generic endpoint factory
function makeEndpoint(actorKey, validator, { memory, timeoutSecs, responseKey = "results" } = {}) {
  return async (req, res) => {
    try {
      const input = req.body || {};
      const error = validator(input);
      if (error) return res.status(400).json({ error });

      const { items } = await runActor(ACTORS[actorKey], input, { memory, timeoutSecs });
      res.json({ success: true, count: items.length, [responseKey]: items });
    } catch (err) {
      console.error(`${actorKey} error:`, err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

// ─────────────────────────────────────────────
// Health & discovery
// ─────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    name: "Apify RapidAPI Proxy",
    version: "2.0.0",
    status: "healthy",
    endpoints: [
      // Social/Content
      "POST /youtube-transcript",
      "POST /instagram-profile",
      "POST /bluesky-profile",
      "POST /etsy-shop",
      // B2B Leads
      "POST /lead-enrichment",
      "POST /google-maps-leads",
      "POST /google-trends",
      // India
      "POST /india-tenders",
      "POST /india-gst",
      "POST /india-company",
      // Global B2B
      "POST /uk-company",
      "POST /france-company",
      "POST /germany-company",
    ],
  });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

// ═════════════════════════════════════════════
// ORIGINAL 4 (keep existing for backward compat)
// ═════════════════════════════════════════════

app.post("/youtube-transcript", verifyRapidApi, makeEndpoint(
  "youtube",
  (i) => !Array.isArray(i.urls) || i.urls.length === 0
    ? "'urls' must be a non-empty array" : null,
  { responseKey: "results" }
));

app.post("/lead-enrichment", verifyRapidApi, makeEndpoint(
  "linkedin",
  (i) => !Array.isArray(i.urls) || i.urls.length === 0
    ? "'urls' must be a non-empty array" : null,
  { memory: 1024, timeoutSecs: 600, responseKey: "leads" }
));

app.post("/google-trends", verifyRapidApi, makeEndpoint(
  "trends",
  (i) => !Array.isArray(i.keywords) || i.keywords.length === 0
    ? "'keywords' must be a non-empty array" : null,
  { memory: 1024, timeoutSecs: 600, responseKey: "trends" }
));

app.post("/google-maps-leads", verifyRapidApi, makeEndpoint(
  "maps",
  (i) => !i.search_query || typeof i.search_query !== "string"
    ? "'search_query' required (string)" : null,
  { memory: 1024, timeoutSecs: 900, responseKey: "businesses" }
));

// ═════════════════════════════════════════════
// NEW: Social/Content Actors
// ═════════════════════════════════════════════

app.post("/instagram-profile", verifyRapidApi, makeEndpoint(
  "instagram",
  (i) => !Array.isArray(i.usernames) || i.usernames.length === 0
    ? "'usernames' must be a non-empty array (without @)" : null,
  { memory: 1024, timeoutSecs: 600, responseKey: "profiles" }
));

app.post("/bluesky-profile", verifyRapidApi, makeEndpoint(
  "skyscout",
  (i) => (!Array.isArray(i.handles) || i.handles.length === 0) && !i.searchQuery
    ? "Provide 'handles' array or 'searchQuery' string" : null,
  { memory: 512, timeoutSecs: 300, responseKey: "profiles" }
));

app.post("/etsy-shop", verifyRapidApi, makeEndpoint(
  "shophound",
  (i) => !Array.isArray(i.shops) || i.shops.length === 0
    ? "'shops' must be a non-empty array (shop names)" : null,
  { memory: 1024, timeoutSecs: 600, responseKey: "shops" }
));

// ═════════════════════════════════════════════
// NEW: India B2B
// ═════════════════════════════════════════════

app.post("/india-tenders", verifyRapidApi, makeEndpoint(
  "tenderhawk",
  () => null,  // all optional
  { memory: 512, timeoutSecs: 300, responseKey: "tenders" }
));

app.post("/india-gst", verifyRapidApi, makeEndpoint(
  "gsthawk",
  (i) => {
    if (!Array.isArray(i.gstins) || i.gstins.length === 0)
      return "'gstins' must be a non-empty array of 15-char GSTIN codes";
    if (!i.appyflowKey)
      return "'appyflowKey' required — get free at https://appyflow.in/verify-gst/";
    return null;
  },
  { memory: 512, timeoutSecs: 600, responseKey: "verified" }
));

app.post("/india-company", verifyRapidApi, makeEndpoint(
  "mcahawk",
  (i) => (!Array.isArray(i.cins) || i.cins.length === 0) && (!Array.isArray(i.searchQueries) || i.searchQueries.length === 0)
    ? "Provide 'cins' (CIN codes) or 'searchQueries' (name search)" : null,
  { memory: 512, timeoutSecs: 600, responseKey: "companies" }
));

// ═════════════════════════════════════════════
// NEW: Global B2B (UK, France, Germany)
// ═════════════════════════════════════════════

app.post("/uk-company", verifyRapidApi, makeEndpoint(
  "ukhawk",
  (i) => (!Array.isArray(i.companyNumbers) || i.companyNumbers.length === 0) && (!Array.isArray(i.searchQueries) || i.searchQueries.length === 0)
    ? "Provide 'companyNumbers' or 'searchQueries'" : null,
  { memory: 512, timeoutSecs: 600, responseKey: "companies" }
));

app.post("/france-company", verifyRapidApi, makeEndpoint(
  "frhawk",
  (i) => (!Array.isArray(i.sirens) || i.sirens.length === 0) && (!Array.isArray(i.searchQueries) || i.searchQueries.length === 0)
    ? "Provide 'sirens' (9-digit) or 'searchQueries'" : null,
  { memory: 512, timeoutSecs: 600, responseKey: "companies" }
));

app.post("/germany-company", verifyRapidApi, makeEndpoint(
  "dehawk",
  (i) => !Array.isArray(i.queries) || i.queries.length === 0
    ? "'queries' must be a non-empty array (Northdata URLs or Company+Name,+City/HRB+Number)" : null,
  { memory: 512, timeoutSecs: 600, responseKey: "companies" }
));

// ─────────────────────────────────────────────
// Error fallback
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Apify RapidAPI proxy v2.0 listening on port ${PORT} — 13 endpoints`);
});

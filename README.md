# Apify RapidAPI Proxy

HTTP wrapper that exposes 4 Apify actors as RapidAPI-ready endpoints.

## Endpoints

| Path | Description | Apify Actor |
|---|---|---|
| `POST /youtube-transcript` | Extract YouTube transcripts | `inexhaustible_glass/youtube-transcript-extractor` |
| `POST /lead-enrichment` | B2B lead enrichment | `inexhaustible_glass/linkedin-email-finder` |
| `POST /google-trends` | Google Trends analysis | `inexhaustible_glass/google-trends-scraper` |
| `POST /google-maps-leads` | Google Maps business leads | `amanbhawsar/smart-lead-finder-email-extractor` |

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `APIFY_TOKEN` | Yes | Your Apify API token — get one at https://console.apify.com/account/integrations |
| `RAPIDAPI_PROXY_SECRET` | Recommended | Secret to validate incoming RapidAPI requests. Set to any random string and also configure on RapidAPI side. |
| `PORT` | No | Port to listen on (default 3000) |

## Deployment — Render (easiest, free)

1. Push this folder to a GitHub repo.
2. Go to https://render.com → "New +" → "Web Service".
3. Connect your GitHub repo.
4. Render auto-detects `render.yaml`.
5. Add secret env var: `APIFY_TOKEN` = your Apify token.
6. Click "Create Web Service".
7. After ~2 minutes, your URL will be live at `https://apify-rapidapi-proxy-XXXX.onrender.com`

## Deployment — Railway (alternative)

```bash
npm install -g @railway/cli
railway login
railway init
railway variables set APIFY_TOKEN=your_token_here
railway up
```

## Local testing

```bash
export APIFY_TOKEN=your_token_here
npm install
node server.js
```

Test with:
```bash
curl -X POST http://localhost:3000/youtube-transcript \
  -H "Content-Type: application/json" \
  -d '{"urls":["https://www.youtube.com/watch?v=dQw4w9WgXcQ"],"language":"en"}'
```

## RapidAPI integration

1. Deploy this server (above).
2. Copy the live URL.
3. On RapidAPI Provider Dashboard → your API → Definition → Base URL: paste the live URL.
4. Import `openapi.json` to auto-create all 4 endpoints with descriptions.
5. Set pricing tiers (suggested: Free 100/month, Basic $9, Pro $29, Ultra $99).
6. Publish.

## RapidAPI security — proxy secret

RapidAPI sends every request with `X-RapidAPI-Proxy-Secret` header. To prevent people bypassing RapidAPI and calling your server directly:

1. In RapidAPI Provider Dashboard → your API → Settings → "Secret" → generate a random string.
2. Set same string as `RAPIDAPI_PROXY_SECRET` env var on Render.
3. Server will reject any request without that header.

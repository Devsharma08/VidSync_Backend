# VidSync — AI Stream Intel Terminal (Backend)

[![Deployed on EC2](https://img.shields.io/badge/Deployed-AWS%20EC2-orange?logo=amazon-aws)](https://vidsync.docs.devsharma.dev)
[![Node.js](https://img.shields.io/badge/Node.js-20-green?logo=nodedotjs)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue?logo=docker)](https://docs.docker.com/compose/)

The VidSync backend is a production-grade Express.js API server that orchestrates background YouTube video analysis pipelines using BullMQ, Redis, Ollama local AI, and the xAI Grok API. It streams all progress updates to the frontend via Server-Sent Events (SSE).

---

## Live API

```
https://vidsync.docs.devsharma.dev
```

Interactive API reference (Scalar UI): `https://vidsync.docs.devsharma.dev/reference`

---

## Architecture

```
Client (SSE)  ←──────────────────────────────────────────────┐
                                                              │
Browser ──POST──▶ Express API ──▶ BullMQ Queue ──▶ Redis    │
                                        │                     │
                                        ▼                     │
                                   Video Worker               │
                                  ┌────────────┐              │
                                  │ Transcript │              │
                                  │ Chat/Live  │              │
                                  │ Timeline   │              │
                                  │ Embeddings │              │
                                  │ AI Summary │─────────────▶│
                                  │ Sentiment  │              │
                                  └────────────┘
                                        │
                              Ollama (gemma3:1b) + Grok API
```

---

## Features

- **BullMQ Pipeline** — Background job queue for full video ingest (transcript, chat, embeddings, summary, sentiment)
- **SSE Streaming** — Real-time job progress delivered via Redis Pub/Sub → Express SSE
- **Transcript Service** — Cookie-authenticated InnerTube requests with MWEB client spoofing and proxy fallback
- **AI Summarizer** — Chunked transcript summarization via local Ollama (gemma3:1b) with unlimited token generation
- **Sentiment Analysis** — Grok API (`grok-2-latest`) powered comment sentiment scoring with Redis 12h cache
- **RAG Q&A** — Semantic vector search over timeline embeddings with keyword density fallback
- **Redis Caching** — Summary results (24h TTL) and sentiment results (12h TTL) cached per videoId
- **CORS Secured** — Restricted to `vidsync.devsharma.dev` and `vid-sync-ui.vercel.app`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 |
| Framework | Express.js 5 |
| Language | TypeScript 5 |
| Queue | BullMQ + Redis (ioredis) |
| Local AI | Ollama (`gemma3:1b`) |
| Cloud AI | xAI Grok API (`grok-2-latest`) |
| YouTube API | Google YouTube Data API v3 |
| Containerization | Docker + Docker Compose |
| Deployment | AWS EC2 |

---

## Project Structure

```
VidSync_Backend/
├── src/
│   ├── controllers/
│   │   ├── ai.controller.ts          # /api/ai/* SSE handlers
│   │   ├── archive-chat.controller.ts
│   │   └── video.controller.ts       # /api/video/* SSE handlers
│   ├── queue/
│   │   ├── connection.ts             # BullMQ config + Redis cache singleton
│   │   ├── video.queue.ts            # BullMQ queue definition
│   │   └── video.worker.ts           # Full pipeline job processor
│   ├── routes/
│   │   ├── ai.routes.ts
│   │   ├── transcript.routes.ts
│   │   └── video.routes.ts
│   ├── services/
│   │   ├── ai-summarizer.service.ts  # Chunked Ollama summarization
│   │   ├── embedding.service.ts      # Vector embedding generation
│   │   ├── google.service.ts         # YouTube Data API v3
│   │   ├── local-ai.service.ts       # Progressive SSE summarizer + RAG QA
│   │   ├── search.service.ts         # Semantic + keyword timeline search
│   │   ├── sentiment.service.ts      # Grok API sentiment analysis + cache
│   │   ├── timeline.service.ts       # Timeline compilation + markdown
│   │   └── transcript.service.ts     # InnerTube transcript fetcher
│   ├── utils/
│   │   ├── openapi.ts
│   │   └── youtube-parser.ts
│   └── index.ts                      # Express server entry point
├── Dockerfile
├── docker-compose.yml
└── .env.production                   # (gitignored — never commit)
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/video/detail` | Fetch video metadata (SSE) |
| `POST` | `/api/video/analyze` | Run full BullMQ ingest pipeline (SSE) |
| `POST` | `/api/ai/summarize` | Generate AI summary (SSE, modes: detailed/normal/short) |
| `POST` | `/api/ai/query` | RAG Q&A over video timeline (SSE) |
| `POST` | `/api/transcript` | Fetch and parse closed captions |
| `GET`  | `/api/health` | Health check |
| `GET`  | `/reference` | Interactive Scalar API docs |

---

## Environment Variables

Create a `.env.production` file (never commit this):

```env
PORT=5000
YT_V3_API_KEY=your_youtube_data_api_key
GROK_API_KEY=your_xai_grok_api_key
PROXY_URL=optional_proxy_url
YOUTUBE_COOKIE=your_yt_session_cookie
YOUTUBE_USER_AGENT=Mozilla/5.0 ...
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
OLLAMA_HOST=http://ollama:11434
```

---

## Docker Deployment

```bash
# First time setup on EC2
git clone https://github.com/Devsharma08/VidSync_Backend.git
cd VidSync_Backend

# Pull latest and rebuild containers
git pull origin main
docker compose up -d --build
```

> If the build runs out of memory on a small EC2 instance, add swap space first:
> ```bash
> sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
> ```

---

## Local Development

```bash
pnpm install
pnpm run dev
```

Requires a running Redis instance and Ollama with `gemma3:1b` pulled locally.

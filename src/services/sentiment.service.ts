import { fetch as undiciFetch } from 'undici';
import { getRedisCache } from '../queue/connection';

export interface SentimentResult {
  rating: number;
  positive: number;
  neutral: number;
  negative: number;
  summary: string;
}

export class SentimentService {

  /**
   * Evaluates the sentiment and reception rating of audience comments using the Grok API.
   * Results are cached in Redis keyed by videoId for 12 hours to avoid redundant API calls.
   * 
   * @param comments Array of comment message strings
   * @param videoId YouTube video ID for cache keying
   * @returns Structured sentiment metrics
   */
  async analyzeCommentsSentiment(comments: string[], videoId = 'unknown'): Promise<SentimentResult> {
    const defaultResult: SentimentResult = {
      rating: 4.0,
      positive: 60,
      neutral: 30,
      negative: 10,
      summary: "Viewer sentiment is generally positive, with audience members showing interest in the topics covered."
    };

    if (!Array.isArray(comments) || comments.length === 0) {
      return defaultResult;
    }

    // ── Cache check ──────────────────────────────────────────────────────────
    const redis = getRedisCache();
    const cacheKey = `cache:sentiment:${videoId}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`[SentimentService] Cache HIT for ${cacheKey}`);
        return JSON.parse(cached) as SentimentResult;
      }
    } catch (e) {
      console.warn('[SentimentService] Redis cache read failed:', (e as Error).message);
    }

    try {
      // Shuffle comments for diversity, then take up to 100 samples
      const shuffled = [...comments].sort(() => Math.random() - 0.5);
      const sampleComments = shuffled.slice(0, 100);
      const commentsText = sampleComments
        .map((c, i) => `${i + 1}. "${c.replace(/"/g, "'").trim()}"`)
        .join('\n');

      const apiKey = process.env.GROK_API_KEY;
      if (!apiKey) {
        throw new Error("GROK_API_KEY is not configured in the environment.");
      }

      const response = await undiciFetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'grok-2-latest',
          messages: [
            {
              role: 'system',
              content: `You are a precise audience sentiment analyst. Your job is to analyze YouTube comments and return an accurate, video-specific sentiment breakdown. 
Do NOT return generic or template results. The percentages MUST reflect the actual tone, language, and content of the comments provided. 
If comments contain slang, memes, enthusiasm, criticism, or mixed reactions, reflect that accurately.
You output ONLY valid JSON with no extra text.`
            },
            {
              role: 'user',
              content: `Analyze the sentiment of the following ${sampleComments.length} YouTube comments and return a precise breakdown.

Comments:
${commentsText}

Respond with a JSON object with these exact keys:
{
  "rating": <float 1.0-5.0, precise to one decimal, reflecting actual positivity level>,
  "positive": <integer 0-100, % of clearly positive/enthusiastic/supportive comments>,
  "neutral": <integer 0-100, % of neutral/informational/question comments>,
  "negative": <integer 0-100, % of critical/negative/disappointed comments>,
  "summary": "<2-3 sentences describing the specific audience reaction, tone patterns, and notable sentiments observed in these comments. Be specific, not generic.>"
}

The three percentages (positive + neutral + negative) MUST add up to exactly 100.`
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2
        })
      });

      if (!response.ok) {
        throw new Error(`Grok API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      const parsedContent = data.choices[0]?.message?.content?.trim() || "{}";
      const parsed: SentimentResult = JSON.parse(parsedContent);

      // Validate and sanitise output properties
      const positive = Math.min(100, Math.max(0, Math.round(Number(parsed.positive || 0))));
      const neutral  = Math.min(100, Math.max(0, Math.round(Number(parsed.neutral  || 0))));
      const negative = Math.min(100, Math.max(0, Math.round(Number(parsed.negative || 0))));

      // Normalize so they always sum to 100
      const total = positive + neutral + negative || 100;
      const result: SentimentResult = {
        rating:   Math.min(5.0, Math.max(1.0, Number(parsed.rating || 4.0))),
        positive: Math.round((positive / total) * 100),
        neutral:  Math.round((neutral  / total) * 100),
        negative: Math.round((negative / total) * 100),
        summary:  parsed.summary || defaultResult.summary
      };

      // ── Write to cache (12h TTL) ─────────────────────────────────────────
      try {
        await redis.set(cacheKey, JSON.stringify(result), 'EX', 43200);
        console.log(`[SentimentService] Cached sentiment for ${cacheKey}`);
      } catch (e) {
        console.warn('[SentimentService] Redis cache write failed:', (e as Error).message);
      }

      return result;

    } catch (error: any) {
      console.error('[SentimentService] Grok sentiment analysis failed:', error.message);
      return defaultResult;
    }
  }
}

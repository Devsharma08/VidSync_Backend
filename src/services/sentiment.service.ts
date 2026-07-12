import { Ollama } from 'ollama';
import { fetch as undiciFetch, Agent } from 'undici';

// Initialize a connection agent with 5-minute timeout parameters for the Ollama connection
const ollamaAgent = new Agent({
  connectTimeout: 60000,
  headersTimeout: 300000,
  bodyTimeout: 300000,
});

// Configure the Ollama instance communicating with the local host container
const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
  fetch: ((input: any, init: any) => undiciFetch(input, { ...init, dispatcher: ollamaAgent })) as any
});

export interface SentimentResult {
  rating: number;
  positive: number;
  neutral: number;
  negative: number;
  summary: string;
}

export class SentimentService {
  private modelName = 'gemma3:1b';

  /**
   * Evaluates the sentiment and reception rating of audience comments using the local LLM.
   * 
   * @param comments Array of comment message strings
   * @returns Structured sentiment metrics
   */
  async analyzeCommentsSentiment(comments: string[]): Promise<SentimentResult> {
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

    try {
      // Sample the top 30 comments to respect context limits and run quickly
      const sampleComments = comments.slice(0, 30);
      const commentsText = sampleComments.map((c, i) => `${i + 1}. "${c}"`).join('\n');

      const response = await ollama.chat({
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: 'You are an audience sentiment analyzer. You output ONLY valid JSON representing sentiment analysis results.'
          },
          {
            role: 'user',
            content: `Analyze the overall audience sentiment from the following comments list.
  
  Audience Comments:
  ${commentsText}
  
  Format the output as a valid JSON object with the exact keys:
  {
    "rating": 4.2, // Float score (1.0 to 5.0) reflecting the audience appreciation level
    "positive": 60, // Integer (0 to 100) representing percentage of positive feedback
    "neutral": 30,  // Integer (0 to 100) representing percentage of neutral/inquisitive feedback
    "negative": 10, // Integer (0 to 100) representing percentage of critical or negative feedback
    "summary": "Short 2-sentence description summarizing viewer feedback."
  }
  
  Do not include any notes, formatting backticks, or conversational text outside of the JSON object.`
          }
        ],
        format: 'json',
        options: {
          temperature: 0.1,
          num_ctx: 4096,
          num_predict: 200
        }
      });

      const parsed: SentimentResult = JSON.parse(response.message.content.trim());
      
      // Sanitise and validate the output properties
      return {
        rating: Math.min(5.0, Math.max(1.0, Number(parsed.rating || 4.0))),
        positive: Math.min(100, Math.max(0, Math.round(Number(parsed.positive || 0)))),
        neutral: Math.min(100, Math.max(0, Math.round(Number(parsed.neutral || 0)))),
        negative: Math.min(100, Math.max(0, Math.round(Number(parsed.negative || 0)))),
        summary: parsed.summary || defaultResult.summary
      };

    } catch (error: any) {
      console.error('[SentimentService] Local Q&A sentiment analysis failed:', error.message);
      return defaultResult;
    }
  }
}

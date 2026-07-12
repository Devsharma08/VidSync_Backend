import { Ollama } from 'ollama';
import { fetch as undiciFetch, Agent } from 'undici';
import { getRedisCache } from '../queue/connection';

// Initialize connection agents with 5-minute timeouts to allow local LLM operations to complete
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

/**
 * Service to orchestrate progressive text stream processing, transcript summaries,
 * and contextual natural language question answering (QA) using the local Ollama LLM.
 */
export class LocalAiService {
  private modelName = 'gemma3:1b';

  /**
   * Generates a progressive analytical summary by scanning transcript text in chunks
   * and streaming chunks summary tokens to the client.
   * 
   * @param transcriptText Raw full video transcript text
   * @param chunkToken Callback function triggered on token output or chunk progress
   * @returns Array containing the clean summarized strings
   */
  async summarizeTranscript(
    transcriptText: string,
    mode: 'detailed' | 'normal' | 'short',
    videoId: string,
    chunkToken: (chunkTokenData: { index?: number, chunkText?: string, percentage?: number, status: 'progress' | 'token' }) => void
  ): Promise<string[]> {
    try {
      // ── Cache check ──────────────────────────────────────────────
      const redis = getRedisCache();
      const cacheKey = `cache:summary:${videoId}:${mode}`;
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          console.log(`[LocalAiService] Cache HIT for summary ${cacheKey}`);
          const parsed: string[] = JSON.parse(cached);
          // Stream cached content back token-style so UI renders correctly
          const full = parsed.join('\n\n');
          chunkToken({ chunkText: full, index: 0, percentage: 100, status: 'token' });
          chunkToken({ percentage: 100, status: 'progress' });
          return parsed;
        }
      } catch (e) {
        console.warn('[LocalAiService] Redis cache read failed, continuing without cache:', (e as Error).message);
      }

      const words = transcriptText.split(/\s+/);
      // Larger chunk window so each chunk gets more context → fewer, richer sections
      const chunkSize = mode === 'detailed' ? 1500 : mode === 'short' ? 3000 : 2000;
      const chunks: string[] = [];
      
      for (let i = 0; i < words.length; i += chunkSize) {
        chunks.push(words.slice(i, i + chunkSize).join(' '));
      }

      let finishedChunksCount = 0;
      const summaryResults: string[] = [];

      // Build mode-specific instruction for depth of output
      const depthInstruction = {
        detailed: 'Write a thorough, multi-paragraph analytical summary covering all key points, arguments, examples, and conclusions from this segment. Use markdown bullet points. Be complete — do not stop early.',
        normal:   'Write a concise analytical summary covering the main topics and key takeaways from this segment. Use markdown bullet points.',
        short:    'Write a brief 3-5 bullet point summary of only the most important points from this segment.',
      }[mode];

      for (let index = 0; index < chunks.length; index++) {
        const chunkText = chunks[index];
        let chunkSummary = '';

        // Request streamed chat generation — num_predict -1 means uncapped (complete output)
        const response = await ollama.chat({
          model: this.modelName,
          messages: [
            {
              role: 'system',
              content: `You are an expert video analytics assistant. ${depthInstruction} Never truncate mid-sentence. Never include conversational filler or greetings.`
            },
            {
              role: 'user',
              content: `Summarize this video transcript segment:\n\n${chunkText}`
            }
          ],
          options: {
            temperature: 0.15,
            num_predict: -1,   // unlimited — let the model finish naturally
            top_p: 0.9,
            num_ctx: 4096
          },
          stream: true
        });

        // Stream tokens back to client
        for await (const token of response) {
          const tempText = token.message.content;
          chunkSummary += tempText;
          chunkToken({
            chunkText: tempText,
            index: index,
            percentage: Math.round((index / chunks.length) * 100),
            status: 'token',
          });
        }

        finishedChunksCount++;
        chunkToken({
          percentage: Math.round((finishedChunksCount / chunks.length) * 100),
          status: 'progress',
        });

        const cleanSummary = chunkSummary.trim();
        if (index === 0) {
          summaryResults.push(`--- Stream Summary Notes ---\n${cleanSummary}`);
        } else {
          summaryResults.push(`\n${cleanSummary}`);
        }
      }

      // ── Write to cache (24h TTL) ─────────────────────────────────
      try {
        await redis.set(cacheKey, JSON.stringify(summaryResults), 'EX', 86400);
        console.log(`[LocalAiService] Cached summary ${cacheKey}`);
      } catch (e) {
        console.warn('[LocalAiService] Redis cache write failed:', (e as Error).message);
      }

      return summaryResults;

    } catch (error: any) {
      console.error('Ollama Chunking Pipe Failure:', error.message);
      chunkToken?.({
        percentage: 0,
        status: 'progress'
      });
      throw new Error(`Local inference engine dropped frame processing tasks: ${error.message}`);
    }
  }

  /**
   * Performs natural language question answering against the compiled context.
   * Employs a sliding-window heuristic keyword retrieval filter to narrow down context size
   * if the input raw transcript exceeds 8000 characters.
   * 
   * @param transcriptText Raw transcript or matching blocks
   * @param userQuestion Natural language query
   * @param streamChunks Callback function to stream generated text tokens back
   * @returns The compiled full text response
   */
  async queryVideoContext(
      transcriptText: string, 
      userQuestion: string,
      streamChunks: (streamData: { text?: string, status: 'progress' | 'token' | 'completed' | 'error' }) => void
    ): Promise<string> {
      try {
        let targetedContext = transcriptText.trim();
  
        // Only run keyword-based sliding window retrieval if the input is a large raw transcript.
        // If it is pre-selected blocks (under 8,000 characters), pass it directly.
        if (transcriptText.length > 8000) {
          const stopWords = new Set(['who', 'what', 'where', 'how', 'why', 'is', 'are', 'was', 'were', 'the', 'a', 'an', 'to', 'for', 'in', 'on', 'of', 'and', 'but', 'or', 'you', 'your', 'he', 'she', 'they', 'it', 'did', 'do', 'does', 'about', 'would', 'should', 'could', 'tell', 'me', 'explain', 'discuss']);
          
          const searchTerms = userQuestion.toLowerCase()
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "")
            .split(/\s+/)
            .filter(word => word.length >= 3 && !stopWords.has(word));
  
          if (searchTerms.length > 0) {
            const words = transcriptText.split(/\s+/);
            const chunkSize = 150; // words
            const overlap = 50;    // words
            const chunks: string[] = [];

            for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
              const chunkWords = words.slice(i, i + chunkSize);
              chunks.push(chunkWords.join(' '));
              if (i + chunkSize >= words.length) break;
            }

            const scoredChunks = chunks.map(chunk => {
              const chunkLower = chunk.toLowerCase();
              let score = 0;
              let matchedUniqueTerms = 0;

              searchTerms.forEach(term => {
                const regex = new RegExp(term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
                const matches = chunkLower.match(regex);
                if (matches) {
                  score += matches.length; // Add frequency count
                  matchedUniqueTerms += 1;
                }
              });

              // Boost score significantly if multiple unique keywords co-occur in the same chunk
              if (matchedUniqueTerms > 1) {
                score *= (1 + (matchedUniqueTerms * 0.5));
              }

              return { chunk, score };
            });

            // Sort by score descending and select the top 3 chunks
            scoredChunks.sort((a, b) => b.score - a.score);
            const topChunks = scoredChunks
              .filter(item => item.score > 0)
              .slice(0, 3)
              .map(item => item.chunk);

            targetedContext = topChunks.join('\n\n').trim();
          }

          // Resilient Fallback: If no chunks matched, take the first 6000 characters
          if (!targetedContext) {
            console.log(`[localAi.queryVideoContext] No matches for search terms ${JSON.stringify(searchTerms)}. Falling back to first 6000 chars of transcript.`);
            targetedContext = transcriptText.substring(0, 6000).trim();
          }
        }
  
        if (!targetedContext) {
          const fallbackMsg = "No specific sections matching your question keywords could be indexed in the video recording.";
          streamChunks({ text: fallbackMsg, status: 'completed' });
          return fallbackMsg;
        }
  
        console.log(`[localAi.queryVideoContext] Sending targeted context of size ${targetedContext.length} chars to Ollama.`);
  
        // Stream inference request from local LLM
        const responseStream = await ollama.chat({
          model: this.modelName,
          messages: [
            {
              role: 'user',
              content: `Instructions: Answer the question comprehensively and precisely using ONLY the provided video context. Provide a detailed, complete response (2-4 sentences) explaining the details. If the answer is completely missing, reply with "Information not located in video context". Do not start your response with "Okay", "Sure", or any introductory remarks.
 
 Context:
 """
 ${targetedContext}
 """
 
 Question: ${userQuestion}`
            }
          ],
          options: {
            temperature: 0.1,
            num_predict: 250,
            top_p: 0.9,
            num_ctx: 2048
          },
          stream: true
        });

      let fullResponse = '';

      for await (const tempChunk of responseStream) {
        const textChunk = tempChunk.message.content;
        fullResponse += textChunk;
        
        streamChunks({
          text: textChunk,
          status: 'token'
        });
      }

      streamChunks({ status: 'completed' });
      return fullResponse;

    } catch (error: any) {
      console.error('Ollama Query Error:', error.message);
      streamChunks({ text: "", status: 'error' });
      throw new Error('Local chat processing dropped.');
    }
  }
}

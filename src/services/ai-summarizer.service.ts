import { Ollama } from 'ollama';
import { fetch as undiciFetch, Agent } from 'undici';

// Initialize a connection agent with 5-minute timeout parameters for the Ollama connection
const ollamaAgent = new Agent({
  connectTimeout: 60000,
  headersTimeout: 300000,
  bodyTimeout: 300000,
});

// Configure the Ollama instance to communicate with the local host container
const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
  fetch: ((input: any, init: any) => undiciFetch(input, { ...init, dispatcher: ollamaAgent })) as any
});

/**
 * Service to generate structured, analytical video summaries utilizing local LLM models.
 */
export class AiSummarizerService {
   private modelName = 'gemma3:1b';

    /**
     * Pre-compresses transcript text to remove speech filler words, excessive spaces, and 
     * non-narrative tokens. This maximizes the density of the LLM context window.
     */
    private preCompressText(text: string): string {
       if (!text) return "";
       const fillerWords = new Set([
          'um', 'uh', 'like', 'youknow', 'so', 'just', 'actually', 'basically', 'literally', 'sortof', 'kindof',
          'okay', 'ok', 'right', 'yeah', 'yes', 'yep', 'nah', 'oh', 'ah', 'eh', 'well', 'hey', 'hello', 'hi',
          'really', 'very', 'quite', 'definitely', 'probably', 'maybe', 'perhaps', 'obviously', 'simply', 'totally',
          'essentially', 'generally', 'specifically', 'mostly', 'mean', 'stuff', 'things', 'thing', 'somewhat',
          'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves',
          'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their',
          'theirs', 'themselves', 'a', 'an', 'the', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does',
          'did', 'doing', 'have', 'has', 'had', 'having', 'to', 'from', 'in', 'on', 'at', 'by', 'for', 'with', 'about'
       ]);
       return text
          .split(/\s+/)
          .filter(word => {
             const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');
             return clean.length > 0 && !fillerWords.has(clean);
          })
          .join(' ');
    }

    /**
     * Dynamically segments the input transcript text, generates high-quality summaries per segment,
     * and recursively merges them into a single cohesive summary paragraph.
     * 
     * @param textChunk Full video transcript text
     * @returns Structured 4-5 sentence summary string
     */
    async generateSummary(textChunk: string): Promise<string> {
       if (!textChunk || !textChunk.trim()) {
          return "This video covers key concepts broken down across the timeline milestones detailed below.";
       }

       try {
          // Pre-compress text to strip verbal fillers and optimize context density
          const cleanText = this.preCompressText(textChunk);

          // Segment words into blocks of 4000 words to respect model context constraints
          const words = cleanText.split(/\s+/);
          const chunkSize = 4000;
          const chunks: string[] = [];
          
          for (let i = 0; i < words.length; i += chunkSize) {
             chunks.push(words.slice(i, i + chunkSize).join(' '));
          }

          // Summarize all blocks concurrently using the local LLM model
          const chunkSummaries = await Promise.all(
             chunks.map(async (chunkText) => {
                const response = await ollama.chat({
                   model: this.modelName,
                   messages: [
                      {
                         role: 'user',
                         content: `Instructions: Summarize the following part of a video transcript in 2-3 direct sentences. Focus only on the main events and topics discussed. Do not add conversational introductions or "Okay".
     
     Transcript section:
     """
     ${chunkText}
     """`
                      }
                   ],
                   options: {
                      temperature: 0.1,
                      num_predict: 150,
                      top_p: 0.9,
                      num_ctx: 8192
                   }
                });
                return response.message.content.trim();
             })
          );

          // If we have multiple chunks, merge them into a single cohesive final summary
          if (chunkSummaries.length > 1) {
             const combinedSummaries = chunkSummaries.join("\n\n");
             const finalResponse = await ollama.chat({
                model: this.modelName,
                messages: [
                   {
                      role: 'user',
                      content: `Instructions: Combine the following section summaries into a single, cohesive, and concise summary paragraph (4-5 sentences max). Make sure to distinguish between different stories, topics, or segments mentioned. Do not state that characters from different stories are the same person (e.g. Tom Sawyer is not Aladdin). Do not start with conversational remarks.
  
  Section summaries:
  """
  ${combinedSummaries}
  """`
                   }
                ],
                options: {
                   temperature: 0.1,
                   num_predict: 200,
                   top_p: 0.9,
                   num_ctx: 8192
                }
             });
             return finalResponse.message.content.trim();
          } else {
             return chunkSummaries[0] || "This video covers key concepts broken down across the timeline milestones detailed below.";
          }
       } catch (error: any) {
          console.error('[AiSummarizerService] Local AI chunked summarizer failed:', error.message);
          return "This video covers key concepts broken down across the timeline milestones detailed below.";
       }
    }
}

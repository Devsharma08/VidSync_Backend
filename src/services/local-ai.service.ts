import ollama from 'ollama';

export class LocalAiService {
  private modelName = 'gemma3:1b';

  /**
   * Generates a structural summary cleanly by processing text in steps
   */
async summarizeTranscript(
  transcriptText: string,
  chunkToken: (chunkTokenData: { index?: number, chunkText?: string, percentage?: number, status: 'progress' | 'token' }) => void
): Promise<string[]> {
  try {
    const words = transcriptText.split(/\s+/);
    const chunkSize = 2000;
    const chunks: string[] = [];
    
    for (let i = 0; i < words.length; i += chunkSize) {
      chunks.push(words.slice(i, i + chunkSize).join(' '));
    }

    const totalChunks = chunks.length;
    let SummaryChunk:string='';
    let finishedChunksCount = 0; // Distinct counter variable name to avoid confusion

    const summaryPromises = chunks.map(async (chunkText, index) => {
      const response = await ollama.chat({
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: 'You are an analytics assistant. Provide a detailed summary of the video segment in bullet points. Do not print short conversational replies.'
          },
          {
            role: 'user',
            content: chunkText 
          }
        ],
        options: {
          temperature: 0.1,
          num_predict: 200,
          top_p: 0.9,
          
        },
        stream:true
      });

      
     for await(const token of response){
      let tempText = token.message.content ;
      SummaryChunk += tempText ;
        chunkToken({
          chunkText:tempText,
          index:index,
          percentage:Math.round((index/chunks.length)*100),
          status:'token',
        })
     }

      finishedChunksCount++;
      chunkToken({
        percentage:Math.round((index/chunks.length)*100),
        status:'progress',
      })


      return `\n--- Section ${index + 1} Notes ---\n- ${SummaryChunk.trim()}`;
    });
    
    return await Promise.all(summaryPromises);

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
   * Resilient Question Answering over Context
   */
async queryVideoContext(
    transcriptText: string, 
    userQuestion: string,
    streamChunks: (streamData: { text?: string, status: 'progress' | 'token' | 'completed' | 'error' }) => void
  ): Promise<string> {
    try {
      const searchTerms = userQuestion.toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "")
        .split(/\s+/)
        .filter(word => word.length > 3);

      const sentences = transcriptText.split(/[.!?]+/);
      const matchingSnippets = sentences.filter(sentence => 
        searchTerms.some(term => sentence.toLowerCase().includes(term))
      ).slice(0, 15);

      const targetedContext = matchingSnippets.join('. ').trim();

      if (!targetedContext) {
        const fallbackMsg = "No specific sections matching your question keywords could be indexed in the video recording.";
        streamChunks({ text: fallbackMsg, status: 'completed' });
        return fallbackMsg;
      }

      const responseStream = await ollama.chat({
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: 'Answer the user query precisely using ONLY the provided video snippets context. Keep it direct. If the answer is completely missing, reply with "Information not located in video context".'
          },
          {
            role: 'user',
            content: `Context:\n\"\"\"\n${targetedContext}\n\"\"\"\n\nQuestion: ${userQuestion}`
          }
        ],
        options: { temperature: 0.0 },
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

      streamChunks({ text: fullResponse, status: 'completed' });
      return fullResponse;

    } catch (error: any) {
      console.error('Ollama Query Error:', error.message);
      streamChunks({ text: "", status: 'error' });
      throw new Error('Local chat processing dropped.');
    }
  }
}

export class AiSummarizerService {

   async generateSummary(textChunk: string): Promise<string> {
      const testToSummarize = textChunk.substring(0, 4000);

      try {
         const response = await fetch('https://api-inference.huggingface.co/models/facebook/bart-large-cnn', {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.HF_API_KEY}`
         },
         body: JSON.stringify({
            inputs: testToSummarize
         })
      });

      if (!response.ok) {
         throw new Error('Failed to fetch summary from HF API');
      }

      const summary = await response.json();
      return summary[0].summary_text;
      } catch (error) {
         return "This video covers key concepts broken down across the timeline milestones detailed below.";
      }
   }
}
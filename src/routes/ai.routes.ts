import { Router, Request, Response } from 'express';
import { TranscriptService } from '../services/transcript.service';
import { LocalAiService } from '../services/local-ai.service';
import { SearchService } from '../services/search.service';

const router = Router();
const transcriptService = new TranscriptService();
const localAi = new LocalAiService();
const searchService = new SearchService();

router.post('/summarize', async (req: Request, res: Response): Promise<void> => {
   try {
     const { url } = req.body;
     
     res.setHeader('Content-Type', 'text/event-stream');
     res.setHeader('Cache-Control', 'no-cache');
     res.setHeader('Connection', 'keep-alive');
     
     if (!url) {
       res.write(`data:${JSON.stringify({ status: 'failure', message: 'Missing video url parameter' })}\n\n`);
       res.end();
       return;
     }
 
     res.write(`data:${JSON.stringify({ status: 'progress', message: 'Starting process', percentage: 0, currentChunk: 0, totalChunks: 0 })}\n\n`);
 
     const transcriptData = await transcriptService.getFullVideoTranscript(url);
     
     const summaryResult = await localAi.summarizeTranscript(transcriptData.fullCaptionText, (progress) => {
       res.write(`data:${JSON.stringify(progress)}\n\n`);
       if(progress.status == 'progress' && progress.percentage){
         console.log(progress.percentage + "% progress");
       }
       else if(progress.status == 'token'){
         console.log(progress.chunkText);
       }
     });
 
     res.write(`data:${JSON.stringify({
       status: 'completed',
       videoId: transcriptData.videoId,
       summary: summaryResult
     })}\n\n`);
     
   } catch (error: any) {
     console.error("Route Processing Crash:", error.message);
     res.write(`data:${JSON.stringify({ status: 'failure', message: error.message, percentage: 0, currentChunk: 0, totalChunks: 0 })}\n\n`);
   } finally {
     res.end();
   }
});

router.post('/query', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url, question, timelineBlocks } = req.body;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (!url || !question) {
      res.write(`data: ${JSON.stringify({ status: 'error', text: 'Missing url or question fields' })}\n\n`);
      res.end();
      return;
    }

    let searchContext = "";

    // 1. If timeline blocks are provided, do keyword density search to pinpoint exact sections
    if (Array.isArray(timelineBlocks) && timelineBlocks.length > 0) {
       console.log(`[QUERY] Running keyword density search on timeline for: "${question}"`);
       const matchedResults = searchService.searchTimeline(timelineBlocks, question);
       
       if (matchedResults.length > 0) {
          // Take the top 3 blocks with the highest keyword matching density
          const topBlocks = matchedResults.slice(0, 3).map(item => item.block.combinedText);
          searchContext = topBlocks.join('\n\n');
          console.log(`[QUERY] Using ${topBlocks.length} matching timeline blocks as LLM context.`);
       }
    }

    // 2. Fallback to full transcript if no timeline blocks matched the keywords
    if (!searchContext) {
       console.log(`[QUERY] No direct timeline matches. Falling back to default caption retrieval.`);
       const transcriptData = await transcriptService.getFullVideoTranscript(url);
       searchContext = transcriptData.fullCaptionText;
    }

    // 3. Query the local LLM with density-isolated context
    await localAi.queryVideoContext(searchContext, question, (progress) => {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    });

  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ status: 'error', text: error.message })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;

import { Request, Response } from 'express';
import { TranscriptService } from '../services/transcript.service';
import { LocalAiService } from '../services/local-ai.service';
import { SearchService } from '../services/search.service';

const transcriptService = new TranscriptService();
const localAi = new LocalAiService();
const searchService = new SearchService();

/**
 * Controller to generate an analytical summary of a video transcript, streamed via SSE.
 */
export async function summarizeTranscript(req: Request, res: Response): Promise<void> {
   try {
     const { url } = req.body || {};
     
     res.status(200).writeHead(200, {
       'Content-Type': 'text/event-stream',
       'Cache-Control': 'no-cache, no-store, must-revalidate',
       'Pragma': 'no-cache',
       'Expires': '0',
       'Connection': 'keep-alive',
       'X-Accel-Buffering': 'no'
     });
     if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();
     
     if (!url) {
       res.write(`data:${JSON.stringify({ status: 'failure', message: 'Missing video url parameter' })}\n\n`);
       if (typeof (res as any).flush === 'function') (res as any).flush();
       res.end();
       return;
     }
 
     res.write(`data:${JSON.stringify({ status: 'progress', message: 'Starting process', percentage: 0, currentChunk: 0, totalChunks: 0 })}\n\n`);
     if (typeof (res as any).flush === 'function') (res as any).flush();
 
     const transcriptData = await transcriptService.getFullVideoTranscript(url);
     
     const summaryResult = await localAi.summarizeTranscript(transcriptData.fullCaptionText, (progress) => {
       res.write(`data:${JSON.stringify(progress)}\n\n`);
       if (typeof (res as any).flush === 'function') (res as any).flush();
       if (progress.status === 'progress' && progress.percentage) {
         console.log(`${progress.percentage}% progress`);
       } else if (progress.status === 'token') {
         console.log(progress.chunkText);
       }
     });
 
     res.write(`data:${JSON.stringify({
       status: 'completed',
       videoId: transcriptData.videoId,
       summary: summaryResult.join('\n\n')
     })}\n\n`);
     if (typeof (res as any).flush === 'function') (res as any).flush();
     
   } catch (error: any) {
     console.error("[aiController.summarizeTranscript] Error:", error.message);
     res.write(`data:${JSON.stringify({ status: 'failure', message: error.message, percentage: 0, currentChunk: 0, totalChunks: 0 })}\n\n`);
     if (typeof (res as any).flush === 'function') (res as any).flush();
   } finally {
     res.end();
   }
}

/**
 * Controller to perform RAG semantic query search and stream the LLM response via SSE.
 */
export async function queryVideoTimeline(req: Request, res: Response): Promise<void> {
  try {
    const { url, question, timelineBlocks } = req.body || {};
    
    res.status(200).writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

    if (!url || !question) {
      res.write(`data: ${JSON.stringify({ status: 'error', text: 'Missing url or question fields' })}\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();
      res.end();
      return;
    }

    let searchContext = "";

    if (Array.isArray(timelineBlocks) && timelineBlocks.length > 0) {
       let matchedResults: { block: any; score: number }[] = [];
       const hasEmbeddings = timelineBlocks.some(b => Array.isArray(b.embedding) && b.embedding.length > 0);

       if (hasEmbeddings) {
          console.log(`[aiController.queryVideoTimeline] Running semantic vector search for: "${question}"`);
          matchedResults = await searchService.searchTimelineSemantic(timelineBlocks, question);
       } else {
          console.log(`[aiController.queryVideoTimeline] Running keyword density search for: "${question}"`);
          matchedResults = searchService.searchTimeline(timelineBlocks, question);
       }
       
       if (matchedResults.length > 0) {
          const topBlocks = matchedResults.slice(0, 3).map(item => item.block.combinedText);
          searchContext = topBlocks.join('\n\n');
          console.log(`[aiController.queryVideoTimeline] Using ${topBlocks.length} matching blocks as LLM context.`);
       }
    }

    if (!searchContext) {
       console.log(`[aiController.queryVideoTimeline] No direct matches. Falling back to full transcript.`);
       const transcriptData = await transcriptService.getFullVideoTranscript(url);
       searchContext = transcriptData.fullCaptionText;
     }

    await localAi.queryVideoContext(searchContext, question, (progress) => {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();
    });

  } catch (error: any) {
    console.error("[aiController.queryVideoTimeline] Error:", error.message);
    res.write(`data: ${JSON.stringify({ status: 'error', text: error.message })}\n\n`);
    if (typeof (res as any).flush === 'function') (res as any).flush();
  } finally {
    res.end();
  }
}

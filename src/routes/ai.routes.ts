import { Router, Request, Response } from 'express';
import { TranscriptService } from '../services/transcript.service';
import { LocalAiService } from '../services/local-ai.service';

const router = Router();
const transcriptService = new TranscriptService();
const localAi = new LocalAiService();

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

    // Send initial bootstrap status
    res.write(`data:${JSON.stringify({ status: 'progress', message: 'Starting process', percentage: 0, currentChunk: 0, totalChunks: 0 })}\n\n`);

    const transcriptData = await transcriptService.getFullVideoTranscript(url);
    
    // Process stream metrics dynamically through our callback parameter
    const summaryResult = await localAi.summarizeTranscript(transcriptData.fullCaptionText, (progress) => {
      res.write(`data:${JSON.stringify(progress)}\n\n`);
      if(progress.status == 'progress' && progress.percentage){
        console.log(progress.percentage + "% progress");
      }
      else if(progress.status == 'token'){
        console.log(progress.chunkText);
      }
    });

    // Send final payload completion packet
    res.write(`data:${JSON.stringify({
      status: 'completed',
      videoId: transcriptData.videoId,
      summary: summaryResult
    })}\n\n`);
    
  } catch (error: any) {
    console.error("Route Processing Crash:", error.message);
    res.write(`data:${JSON.stringify({ status: 'failure', message: error.message, percentage: 0, currentChunk: 0, totalChunks: 0 })}\n\n`);
  } finally {
    res.end(); // Safely shut down the connection faucet
  }
});

router.post('/query', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url, question } = req.body;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (!url || !question) {
      res.write(`data: ${JSON.stringify({ status: 'error', text: 'Missing url or question fields' })}\n\n`);
      res.end();
      return;
    }

    const transcriptData = await transcriptService.getFullVideoTranscript(url);
    
    await localAi.queryVideoContext(transcriptData.fullCaptionText, question, (progress) => {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    });

  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ status: 'error', text: error.message })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
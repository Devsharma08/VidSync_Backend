import { Router, Request, Response } from "express";
import { extractVideoId, detectLanguage, translateText } from "../utils/youtube-parser";
import { YoutubeService } from "../services/google.service";
import { TranscriptService } from "../services/transcript.service";
import { getPastStreamerChat } from "../controllers/archive-chat.controller";
import { TimelineService } from "../services/timeline.service";
import { AiSummarizerService } from "../services/ai-summarizer.service";

const route = Router();
const videoService = new YoutubeService();
const transcriptService = new TranscriptService();
const timelineService = new TimelineService();
const aiSummarizer = new AiSummarizerService();

// POST http://localhost:5000/api/video/detail
route.post('/detail', async (req: Request, res: Response): Promise<void> => {
   try {
      const url = req.body.url;
      if (!url) {
         res.status(400).json({ message: "URL is required" });
         return;
      }

      // establish SSE connection header
      res.status(200).writeHead(200, {
         "Content-Type": "text/event-stream",
         "Cache-Control": "no-cache, no-store, must-revalidate",
         "Pragma": "no-cache",
         "Expires": "0",
         "Connection": "keep-alive",
         "X-Accel-Buffering": "no"
      });

      // stream progress message
      res.write(`data:${JSON.stringify({ message: "Extracting video ID..." })}\n\n`);
      const videoId = extractVideoId(url);
      if(!videoId){
         res.write(`data:${JSON.stringify({ status: "error", message: "Invalid URL" })}\n\n`);
         res.end();
         return;
      }

      // stream progress message
      res.write(`data:${JSON.stringify({ message: "Fetching metadata from YouTube Data API..." })}\n\n`);
      const video = await videoService.getVideoById(videoId);

      // sending final data payload and close connection
      res.write(`data:${JSON.stringify({
         success: true,
         video
      })}\n\n`);
      res.end();
      
   } catch (error: any) {
      console.error(error);
      res.write(`data:${JSON.stringify({ status: "error", message: error.message })}\n\n`);
      res.end();
   }
});


// POST http://localhost:5000/api/video/analyze
route.post('/analyze', async (req: Request, res: Response): Promise<void> => {
   try {
      const { url, channelLink } = req.body;
      if (!url) {
         res.status(400).json({ message: "URL is required" });
         return;
      }

      // establish SSE connection headers
      res.status(200).writeHead(200, {
         "Content-Type": "text/event-stream",
         "Cache-Control": "no-cache, no-store, must-revalidate",
         "Pragma": "no-cache",
         "Expires": "0",
         "Connection": "keep-alive",
         "X-Accel-Buffering": "no"
      });

      // stream progress message
      res.write(`data:${JSON.stringify({ message: "Starting analysis..." })}\n\n`);
      const videoId = extractVideoId(url);
      if (!videoId) {
         res.write(`data:${JSON.stringify({ status: "error", message: "Invalid URL" })}\n\n`);
         res.end();
         return;
      }

      // console.log(`[ANALYZE] Triggered analysis for Video ID: ${videoId}`);

      // stream progress message and fetch details
      res.write(`data:${JSON.stringify({ message: "Fetching video details" })}\n\n`);
      const videoDetails = await videoService.getVideoById(videoId);
      const videoStartTime = videoDetails.isLiveStream?.actualStartTime || videoDetails.publishedAt;

      // stream progress message and fetch transcript and chat replay
      res.write(`data:${JSON.stringify({ message: "Fetching transcript and chat replay" })}\n\n`);
      let transcriptData: any = null;
      let commentsOrChat: any[] = [];

      try {
         transcriptData = await transcriptService.getFullVideoTranscript(url);
      } catch (err: any) {
         console.warn(`[ANALYZE] Subtitle scraper fallback warning: ${err.message}`);
      }

      const isLiveStream = !!videoDetails.isLiveStream;
      const activeLiveChatId = videoDetails.isLiveStream?.activeLiveChatId || null;

      // Active Livestream Chat Fetch
      if (activeLiveChatId) {
         try {
            res.write(`data:${JSON.stringify({ message: "Fetching active chat" })}\n\n`);
            const liveMessages = await videoService.getActiveLiveChatMessages(activeLiveChatId);
            commentsOrChat = liveMessages.filter((msg: any) => msg.is_streamer);
         } catch (err: any) {
            console.error(`[ANALYZE] Failed to fetch active chat: ${err.message}`);
         }
      }

      // Completed Livestream Replay Fetch
      if (commentsOrChat.length === 0 && isLiveStream) {
         try {
            res.write(`data:${JSON.stringify({ message: "Fetching completed chat replay" })}\n\n`);
            const chatReplay = await getPastStreamerChat(url);
            commentsOrChat = chatReplay.filter((msg: any) => msg.is_streamer);
         } catch (err: any) {
            console.warn(`[ANALYZE] Failed completed chat scrape: ${err.message}`);
         }
      }

      // Standard Comments Fallback
      if (commentsOrChat.length === 0) {
         try {
            console.log(`[ANALYZE] Fetching standard comments fallback for ID ${videoId}`);
            res.write(`data:${JSON.stringify({ message: "Fetching standard comments" })}\n\n`);
            const regularComments = await videoService.getAllPastLiveComments(videoId, videoDetails.channelId);
            commentsOrChat = regularComments.filter(
               (c: any) => c.isStreamer || (c.replies && c.replies.some((r: any) => r.isStreamer))
            );
         } catch (err: any) {
            console.error(`[ANALYZE] Failed standard comment fallback: ${err.message}`);
         }
      }

      // Compile timeline
      res.write(`data:${JSON.stringify({ message: "Compiling timeline" })}\n\n`);
      let compiledEvents = timelineService.compileTimeline(
         transcriptData?.timelineSegments || [],
         commentsOrChat,
         videoStartTime,
         channelLink
      );

      // Translate compiled events to English if they are not in English
      if (compiledEvents.length > 0) {
         const sampleText = compiledEvents.slice(0, 10).map(e => e.message).join(" ");
         const { language } = detectLanguage(sampleText);
         
         if (language !== 'en') {
            res.write(`data:${JSON.stringify({ message: "Translating timeline to English" })}\n\n`);
            console.log(`[ANALYZE] Non-English language detected: "${language}". Translating timeline to English...`);
            const messagesToTranslate = compiledEvents.map(e => e.message);
            try {
               const delimiter = " || ";
               const combinedText = messagesToTranslate.join(delimiter);
               const translatedTextCombined = await translateText(combinedText, 'en');
               const translatedMessages = translatedTextCombined.split(/\s*\|\|\s*/);
               
               for (let i = 0; i < compiledEvents.length; i++) {
                  if (translatedMessages[i]) {
                     compiledEvents[i].message = translatedMessages[i].trim();
                  }
               }
               console.log(`[ANALYZE] Successfully translated ${compiledEvents.length} events to English.`);
            } catch (err: any) {
               console.error(`[ANALYZE] Timeline translation failed: ${err.message}. Keeping original.`);
            }
         }
      }

      res.write(`data:${JSON.stringify({ message: "Generating timeline blocks" })}\n\n`);
      const timelineBlocks = timelineService.generateTimelineBlocks(compiledEvents);
      const markdownTimeline = timelineService.generateMarkdownTimeline(compiledEvents);

      // Summarize full context
      let summary = "No summary generated.";
      if (transcriptData?.fullCaptionText) {
         try {
            res.write(`data:${JSON.stringify({ message: "Summarizing full context" })}\n\n`);
            summary = await aiSummarizer.generateSummary(transcriptData.fullCaptionText);
         } catch (err: any) {
            console.warn(`[ANALYZE] Summary API failed: ${err.message}`);
         }
      }

      res.write(`data:${JSON.stringify({
         success: true,
         videoId,
         videoDetails,
         summary,
         timelineBlocks,
         markdownTimeline,
         totalEvents: compiledEvents.length
      })}\n\n`);
      res.end();

   } catch (error: any) {
      console.error("[ANALYZE] Ingestion pipeline crashed:", error);
      res.write(`data:${JSON.stringify({ status: "error", message: error.message })}\n\n`);
      res.end();
   }
});

export default route;

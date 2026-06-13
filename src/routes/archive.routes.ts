import { Router, Request, Response } from 'express';
import { getPastStreamerChat } from '../controllers/archive-chat.controller';
import { extractVideoId } from '../utils/youtube-parser';
import { YoutubeService } from '../services/google.service';

const router = Router();
const videoService = new YoutubeService();

// POST http://localhost:5000/api/archive/chat
router.post('/chat-or-comments', async (req: Request, res: Response): Promise<void> => {
   try {
      const { url, channelLink } = req.body;
      const videoId = extractVideoId(url);
      if (!videoId) {
         res.status(400).json({ error: 'Missing standard stream url address parameter' });
         return;
      }

      // Check video details to see if it is an active livestream
      let activeLiveChatId: string | null = null;
      try {
         const videoDetails = await videoService.getVideoById(videoId);
         if (videoDetails.isLiveStream && videoDetails.isLiveStream.activeLiveChatId) {
            activeLiveChatId = videoDetails.isLiveStream.activeLiveChatId;
         }
      } catch (err: any) {
         console.warn(`Could not check video details via API: ${err.message}`);
      }

      // If it's an active live stream, fetch messages directly via YouTube API
      if (activeLiveChatId) {
         try {
            // fetching live messages from youtube live chat api
            const liveMessages = await videoService.getActiveLiveChatMessages(activeLiveChatId);
            // filtering only author (streamer) messages
            const streamerOnly = liveMessages.filter((msg: any) => msg.is_streamer);

            res.json({
               type: "active_live_chat",
               totalChatCount: liveMessages.length,
               streamerCommentCount: streamerOnly.length,
               streamerTimeline: streamerOnly,
               data: liveMessages
            });
            return;
         } catch (liveChatErr: any) {
            console.error(`⚠️ Failed to fetch active live chat: ${liveChatErr.message}`);
            // Fall through to archive downloader / comment parser if API fails
         }
      }

      // check for completed live chat replay logs
      let fullPastChatLogs: any[] = [];
      try {
         fullPastChatLogs = await getPastStreamerChat(url);
      } catch (error: any) {
         console.warn(`Could not fetch past streamer chat: ${error.message}. Proceeding to fallback.`);
      }

      if (Array.isArray(fullPastChatLogs) && fullPastChatLogs.length > 0) {
         const streamerOnly = fullPastChatLogs.filter((msg: any) => msg.is_streamer);

         res.json({
            type: "live chat replay",
            totalChatCount: fullPastChatLogs.length,
            streamerCommentCount: streamerOnly.length,
            streamerTimeline: streamerOnly
         });
         return;
      }

      // Fallback: Fetch standard video comments
      try {
         console.log(`Fallback triggered: Fetching standard video comments for ID ${videoId}`);
         const regularComments = await videoService.getAllPastComments(videoId, channelLink);
         const streamerComments = regularComments.filter((c: any) => c.isStreamer);

         res.json({
            type: 'standard_video_comments',
            totalCommentsScanned: regularComments.length,
            streamerCommentCount: streamerComments.length,
            data: streamerComments
         });
         return;
      } catch (fallbackError: any) {
         console.error("Fallback error:", fallbackError);
         res.status(500).json({ error: fallbackError.message });
         return;
      }

   } catch (error: any) {
      console.error("Route error:", error);
      res.status(500).json({ error: error.message });
      return;
   }
});

export default router;
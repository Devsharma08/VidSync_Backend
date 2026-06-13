import { YoutubeTranscript } from "youtube-transcript";
import { extractVideoId } from "../utils/youtube-parser";

interface TimelineSegment {
   text: string;
   startInSeconds: number;
   durationInSeconds: number;
}

export class TranscriptService {
   async getFullVideoTranscript(url: string): Promise<{ videoId: string, totalTextLength: number, fullCaptionText: string, timelineSegments: TimelineSegment[] }> {
      try {
         const videoId = extractVideoId(url);
         if (!videoId) {
            throw new Error("No valid videoId found");
         }
         // fetch the text array from youtube
         const transcript = await YoutubeTranscript.fetchTranscript(videoId);

         if (!transcript || transcript.length === 0) {
            throw new Error("No transcript found for video id");
         }
         const fullText = transcript.map((item) => {
            return item.text
               .replace(/&#39;/g, "'")
               .replace(/&quot;/g, '"')
               .replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .trim();
         }).join(" ");
         // return required fields only not the whole transcript array
         return {
            videoId,
            totalTextLength: fullText.length,
            fullCaptionText: fullText,
            timelineSegments: transcript.map((segment) => ({
               text: segment.text.replace(/&#39;/g, "'").trim(),
               startInSeconds: Math.floor(segment.offset / 1000),
               durationInSeconds: Math.floor(segment.duration / 1000),
            })),

         }
      } catch (error:any) {
         console.error("Error fetching video transcript:", error);
         throw new Error(error.message || "failed to retrieve captions");
      }
   }
}
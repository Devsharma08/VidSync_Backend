import { generateChannelId } from "../utils/youtube-parser";

export interface TimelineEvent {
  type: 'VOICE' | 'CHAT';
  timestamp: number; // relative offset from stream start in seconds
  author?: string;
  message: string;
}

export interface TimelineBlock {
  startInSeconds: number;
  endInSeconds: number;
  events: TimelineEvent[];
  combinedText: string;
}

export class TimelineService {
  /**
   * Merges voice transcript segments and comments/chat into a sorted event array
   */
  public compileTimeline(
    transcriptSegments: any[],
    commentsOrChat: any[],
    videoStartTimeStr?: string,
    streamerChannelLink?: string
  ): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    // 1. Add Transcript Segments (VOICE)
    if (Array.isArray(transcriptSegments)) {
      for (const segment of transcriptSegments) {
        events.push({
          type: 'VOICE',
          timestamp: segment.startInSeconds || 0,
          message: segment.text || ''
        });
      }
    }

    // Resolve streamer identifier if standard comments fallback was used
    const streamerChannelId = streamerChannelLink ? generateChannelId(streamerChannelLink) : '' ;

    // 2. Add Chat / Comments
    if (Array.isArray(commentsOrChat)) {
      const videoStartMs = videoStartTimeStr ? new Date(videoStartTimeStr).getTime() : 0;

      for (const item of commentsOrChat) {
        let relativeSeconds: number | null = null;

        // A. Check if it's a live chat replay (it already has time_in_video in seconds)
        if (typeof item.time_in_video === 'number') {
          relativeSeconds = item.time_in_video;
        } else if (item.time_in_video !== undefined && item.time_in_video !== null) {
          relativeSeconds = parseFloat(item.time_in_video);
        }
        // B. Check if it's standard comment with publishedAt timestamp (resolve relative time)
        else if (item.publishedAt && videoStartMs > 0) {
          const commentTimeMs = new Date(item.publishedAt).getTime();
          relativeSeconds = Math.max(0, Math.floor((commentTimeMs - videoStartMs) / 1000));
        }

        if (relativeSeconds !== null && !isNaN(relativeSeconds)) {
          const isStreamer = item.is_streamer === true || item.isStreamer === true;
          
          events.push({
            type: 'CHAT',
            timestamp: relativeSeconds,
            author: item.author || (isStreamer ? 'Streamer' : 'User'),
            message: item.message || ''
          });
        }
      }
    }

    // 3. Sort chronologically by timestamp
    return events.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Formats the chronological event list into 30-second window blocks
   */
  public generateTimelineBlocks(events: TimelineEvent[], windowSeconds: number = 30): TimelineBlock[] {
    if (events.length === 0) return [];

    const blocks: TimelineBlock[] = [];
    const maxTimestamp = events[events.length - 1].timestamp;

    for (let start = 0; start <= maxTimestamp; start += windowSeconds) {
      const end = start + windowSeconds;
      
      // Filter events falling inside this window
      const windowEvents = events.filter(e => e.timestamp >= start && e.timestamp < end);

      if (windowEvents.length > 0) {
        const textParts = windowEvents.map(e => {
          const timeLabel = this.formatTimeLabel(e.timestamp);
          if (e.type === 'CHAT') {
            return `[${timeLabel}] [CHAT] ${e.author}: ${e.message}`;
          } else {
            return `[${timeLabel}] [VOICE]: ${e.message}`;
          }
        });

        blocks.push({
          startInSeconds: start,
          endInSeconds: end,
          events: windowEvents,
          combinedText: textParts.join('\n')
        });
      }
    }

    return blocks;
  }

  /**
   * Generates standard markdown format representation of the timeline (master_timeline.md)
   */
  public generateMarkdownTimeline(events: TimelineEvent[]): string {
    let md = "# Master Stream Timeline\n\n";
    for (const e of events) {
      const label = this.formatTimeLabel(e.timestamp);
      if (e.type === 'CHAT') {
        md += `[${label}] [CHAT] **${e.author}**: ${e.message}\n`;
      } else {
        md += `[${label}] [VOICE]: ${e.message}\n`;
      }
    }
    return md;
  }

  private formatTimeLabel(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const pad = (num: number) => num.toString().padStart(2, '0');
    
    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  }
}

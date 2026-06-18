import { TimelineBlock } from "./timeline.service";

export class SearchService {
  /**
   * Search for query terms in the timeline blocks and return them ranked by density
   */
  public searchTimeline(blocks: TimelineBlock[], query: string): { block: TimelineBlock; score: number }[] {
    if (!query || !Array.isArray(blocks) || blocks.length === 0) return [];

    const searchTerms = query.toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "")
      .split(/\s+/)
      .filter(word => word.length > 2); // only match words with length > 2

    if (searchTerms.length === 0) return [];

    const scoredBlocks = blocks.map(block => {
      const text = block.combinedText.toLowerCase();
      let score = 0;

      // Count term frequencies inside this specific block
      for (const term of searchTerms) {
        const occurrences = text.split(term).length - 1;
        if (occurrences > 0) {
          score += occurrences;
        }
      }

      return {
        block,
        score
      };
    });

    // Return only blocks that have a score > 0, sorted in descending order of density
    return scoredBlocks
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }
}

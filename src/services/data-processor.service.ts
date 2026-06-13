export interface TimelineSegment {
  text: string;
  startInSeconds: number;
  durationInSeconds: number;
}

export class DataProcessorService {

  public extractKeywords(text: string, maxTags: number = 8): string[] {
    const stopWords = new Set([
      'the', 'is', 'and', 'a', 'to', 'in', 'it', 'you', 'of', 'for', 'on', 'with', 
      'this', 'that', 'by', 'an', 'your', 'from', 'we', 'are', 'i', 'me', 'my'
    ]);


    const words = text
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "")
      .split(/\s+/);

    const frequencyMap: Record<string, number> = {};

    words.forEach(word => {
      if (word.length > 3 && !stopWords.has(word)) {
        frequencyMap[word] = (frequencyMap[word] || 0) + 1;
      }
    });

    return Object.keys(frequencyMap)
      .sort((a, b) => frequencyMap[b] - frequencyMap[a])
      .slice(0, maxTags);
  }

  public generateAutoChapters(segments: TimelineSegment[]) {
    const structuralChapters = [];
    const transitionPhrases = ['welcome', 'first', 'next', 'let\'s look', 'finally', 'conclusion', 'summary', 'now we'];

    for (const segment of segments) {
      const lowerText = segment.text.toLowerCase();
      const matchesPhrase = transitionPhrases.some(phrase => lowerText.includes(phrase));

      if (matchesPhrase) {
        structuralChapters.push({
          timestamp: this.formatTime(segment.startInSeconds),
          seconds: segment.startInSeconds,
          highlightText: segment.text
        });
      }
    }

    if (structuralChapters.length === 0) {
      for (let i = 0; i < segments.length; i += 50) {
        if(segments[i]) {
          structuralChapters.push({
            timestamp: this.formatTime(segments[i].startInSeconds),
            seconds: segments[i].startInSeconds,
            highlightText: segments[i].text
          });
        }
      }
    }

    return structuralChapters;
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
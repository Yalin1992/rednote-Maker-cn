import { SlideData } from "../types";

export const generateSlidesFromText = async (rawText: string, customTitle?: string, customSubtitle?: string): Promise<SlideData[]> => {
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: rawText,
        title: customTitle,
        subtitle: customSubtitle
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate slides');
    }

    const generatedData = await response.json();


    // --- Advanced Pagination Logic ---
    const MAX_LINES_PER_PAGE = 19; // Adjusted to 19 per user request
    const CHARS_PER_LINE = 22;     // Reduced buffer
    const MAX_CHARS_PER_PARA = 69;

    // Helper: Split text into sentences safely
    const splitIntoSentences = (text: string): string[] => {
      return text.match(/[^。！？.!?]+[。！？.!?]+|[^。！？.!?]+$/g) || [text];
    };

    // Helper: Reflow content to ensure chunks are not too long
    const reflowContent = (content: string[]): string[] => {
      const refined: string[] = [];
      let buffer: string[] = [...content];

      for (let i = 0; i < buffer.length; i++) {
        let current = buffer[i];

        if (current.startsWith('#')) {
          refined.push(current);
          continue;
        }

        while (current.length > MAX_CHARS_PER_PARA) {
          const sentences = splitIntoSentences(current);
          if (sentences.length <= 1) break;

          const lastSentence = sentences.pop();
          const remainder = sentences.join('');

          current = remainder;

          if (i + 1 < buffer.length) {
            buffer[i + 1] = (lastSentence || '') + buffer[i + 1];
          } else {
            buffer.push(lastSentence || '');
          }
        }
        refined.push(current);
      }
      return refined;
    };

    // Helper: Calculate lines cost
    const getLineCost = (text: string): number => {
      if (text.startsWith('## ')) return 3;
      if (text.startsWith('### ')) return 2;
      if (text.trim() === '') return 0;

      const len = text.length;
      return Math.ceil(len / CHARS_PER_LINE) + 1;
    };

    const paginatedSlides: any[] = [];

    generatedData.forEach((slide: any) => {
      if (slide.type !== 'content' || !slide.content || slide.content.length === 0) {
        paginatedSlides.push(slide);
        return;
      }

      const reflowedContent = reflowContent(slide.content as string[]);

      let currentChunk: string[] = [];
      let currentLinesUsed = 0;

      for (let i = 0; i < reflowedContent.length; i++) {
        let paragraph = reflowedContent[i];
        const cost = getLineCost(paragraph);

        if (currentLinesUsed + cost <= MAX_LINES_PER_PAGE) {
          currentChunk.push(paragraph);
          currentLinesUsed += cost;
        } else {
          const remainingLines = MAX_LINES_PER_PAGE - currentLinesUsed;

          if (paragraph.startsWith('#')) {
            if (currentChunk.length > 0) {
              paginatedSlides.push({ ...slide, content: currentChunk });
            }
            currentChunk = [paragraph];
            currentLinesUsed = cost;
          } else {
            if (remainingLines <= 1) {
              paginatedSlides.push({ ...slide, content: currentChunk });
              currentChunk = [paragraph];
              currentLinesUsed = cost;
            } else {
              const availableTextLines = remainingLines - 1;
              const maxChars = availableTextLines * CHARS_PER_LINE;

              const part1 = paragraph.slice(0, maxChars);
              const part2 = paragraph.slice(maxChars);

              currentChunk.push(part1);
              paginatedSlides.push({ ...slide, content: currentChunk });

              currentChunk = [part2];
              currentLinesUsed = getLineCost(part2);
            }
          }
        }
      }

      if (currentChunk.length > 0) {
        paginatedSlides.push({
          ...slide,
          content: currentChunk
        });
      }
    });

    const finalData = paginatedSlides;
    const totalContentSlides = finalData.length;

    // Helper to get category from cover if missing
    const coverCategory = finalData.find((s: any) => s.type === 'cover')?.category || "Knowledge System";

    return finalData.map((slide: any, index: number) => ({
      ...slide,
      id: `slide-${Date.now()}-${index}`,
      pageNumber: index + 1,
      totalPages: totalContentSlides,
      // Fallback category if AI missed it on content slides
      category: slide.category || coverCategory,
      backgroundImage: slide.type === 'cover' ? 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600&auto=format&fit=crop' : undefined,
      tags: slide.tags || ["干货满满", "建议收藏"],
      titleFontSize: slide.type === 'cover' ? 48 : undefined, // Default bigger font for cover
      coverStyle: slide.type === 'cover' ? 'classic' : undefined
    }));

  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
};
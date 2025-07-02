const OpenAI = require('openai');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const axios = require('axios');

class CaptionService {
  constructor() {
    this.openai = null;
    
    // Initialize OpenAI client if API key is available
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      console.log('CaptionService initialized with OpenAI API key');
    } else {
      console.warn('CaptionService: OpenAI API key not configured');
    }
  }

  /**
   * Generate captions from audio file using Whisper AI
   * @param {string} audioFilePath - Path to audio file (local or URL)
   * @param {Object} options - Caption generation options
   * @returns {Promise<Object>} Caption data with timestamps
   */
  async generateCaptionsFromAudio(audioFilePath, options = {}) {
    if (!this.openai) {
      throw new Error('OpenAI API not configured. Please set OPENAI_API_KEY environment variable.');
    }

    try {
      console.log('Generating captions from audio:', audioFilePath);

      const {
        language = 'en',
        format = 'srt',
        includeTimestamps = true,
        maxDuration = 600 // 10 minutes max
      } = options;

      let audioFile;

      // Handle different audio sources
      if (audioFilePath.startsWith('http')) {
        // Download remote audio file
        audioFile = await this.downloadAudioFile(audioFilePath);
      } else if (audioFilePath.startsWith('/uploads/')) {
        // Local uploaded file
        const fullPath = path.join(process.cwd(), audioFilePath);
        audioFile = await fsPromises.readFile(fullPath);
      } else {
        // Direct file path
        audioFile = await fsPromises.readFile(audioFilePath);
      }

      // Check file size (Whisper has a 25MB limit)
      const maxSize = 25 * 1024 * 1024; // 25MB
      if (audioFile.length > maxSize) {
        throw new Error(`Audio file too large (${(audioFile.length / 1024 / 1024).toFixed(1)}MB). Maximum size is 25MB.`);
      }

      // Create a temporary file for Whisper API
      const tempDir = path.join(process.cwd(), 'temp');
      await fsPromises.mkdir(tempDir, { recursive: true });
      
      const tempFileName = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
      const tempFilePath = path.join(tempDir, tempFileName);
      
      await fsPromises.writeFile(tempFilePath, audioFile);

      // Transcribe with Whisper
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-1',
        language: language,
        response_format: includeTimestamps ? 'verbose_json' : 'json',
        timestamp_granularities: includeTimestamps ? ['word', 'segment'] : undefined
      });

      // Clean up temporary file
      await fsPromises.unlink(tempFilePath).catch(console.error);

      // Process transcription into caption format
      const captions = this.processWhisperResponse(transcription, format);

      return {
        success: true,
        captions,
        metadata: {
          language,
          format,
          duration: transcription.duration || null,
          segments: transcription.segments?.length || 0,
          words: transcription.words?.length || 0,
          generatedAt: new Date().toISOString(),
          source: 'whisper-ai'
        }
      };

    } catch (error) {
      console.error('Error generating captions from audio:', error);
      throw error;
    }
  }

  /**
   * Generate captions from story content text
   * @param {string} storyContent - The story text content
   * @param {Object} options - Caption generation options
   * @returns {Promise<Object>} Caption data with estimated timing
   */
  async generateCaptionsFromText(storyContent, options = {}) {
    try {
      console.log('Generating captions from story content...');

      const {
        wordsPerMinute = 150, // Average reading speed
        maxWordsPerCaption = 8,
        format = 'srt',
        language = 'en'
      } = options;

      // Clean and prepare text
      const cleanText = this.cleanStoryText(storyContent);
      
      // Split into sentences and then into caption chunks
      const sentences = this.splitIntoSentences(cleanText);
      const captionChunks = this.createCaptionChunks(sentences, maxWordsPerCaption);

      // Calculate timing for each caption
      const captions = this.calculateCaptionTiming(captionChunks, wordsPerMinute);

      // Format captions according to requested format
      const formattedCaptions = this.formatCaptions(captions, format);

      return {
        success: true,
        captions: formattedCaptions,
        metadata: {
          language,
          format,
          totalDuration: captions[captions.length - 1]?.endTime || 0,
          captionCount: captions.length,
          wordCount: cleanText.split(' ').length,
          wordsPerMinute,
          generatedAt: new Date().toISOString(),
          source: 'story-content'
        }
      };

    } catch (error) {
      console.error('Error generating captions from text:', error);
      throw error;
    }
  }

  /**
   * Generate captions using OpenAI for intelligent text processing
   * @param {string} storyContent - The story text content
   * @param {Object} options - Caption generation options
   * @returns {Promise<Object>} AI-enhanced caption data
   */
  async generateSmartCaptionsFromText(storyContent, options = {}) {
    if (!this.openai) {
      // Fallback to basic text captions if no API
      return this.generateCaptionsFromText(storyContent, options);
    }

    try {
      console.log('Generating smart captions using OpenAI...');

      const {
        maxDuration = 300, // 5 minutes default
        style = 'narrative', // narrative, dialogue, dramatic
        format = 'srt'
      } = options;

      // Use OpenAI to optimize the text for captions
      const prompt = `
Transform the following story content into optimized caption text suitable for video. 
Each caption should be 1-2 lines, easy to read, and naturally paced for storytelling.
Consider emotional beats and natural pauses.

Story style: ${style}
Target duration: ${maxDuration} seconds

Story content:
${storyContent}

Please return the text optimized for captions, maintaining the story's flow and emotional impact.
`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a professional caption writer who creates engaging, readable captions for video content. Focus on natural pacing and emotional flow.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      });

      const optimizedText = completion.choices[0].message.content;

      // Generate captions from the optimized text
      const result = await this.generateCaptionsFromText(optimizedText, {
        ...options,
        wordsPerMinute: this.calculateOptimalWPM(maxDuration, optimizedText)
      });

      // Add AI enhancement metadata
      result.metadata.source = 'openai-enhanced';
      result.metadata.originalWordCount = storyContent.split(' ').length;
      result.metadata.optimizedWordCount = optimizedText.split(' ').length;

      return result;

    } catch (error) {
      console.error('Error generating smart captions:', error);
      // Fallback to basic text captions
      return this.generateCaptionsFromText(storyContent, options);
    }
  }

  /**
   * Process Whisper API response into caption format
   */
  processWhisperResponse(transcription, format) {
    if (!transcription.segments) {
      // Simple response format
      return this.formatCaptions([{
        text: transcription.text,
        startTime: 0,
        endTime: 60 // Default 1 minute if no timing
      }], format);
    }

    // Process segments with timestamps
    const captions = transcription.segments.map((segment, index) => ({
      index: index + 1,
      text: segment.text.trim(),
      startTime: segment.start,
      endTime: segment.end
    }));

    return this.formatCaptions(captions, format);
  }

  /**
   * Download audio file from URL
   */
  async downloadAudioFile(url) {
    try {
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'StoryMaker-CaptionService/1.0'
        }
      });

      return Buffer.from(response.data);
    } catch (error) {
      throw new Error(`Failed to download audio file: ${error.message}`);
    }
  }

  /**
   * Clean story text for caption generation
   */
  cleanStoryText(text) {
    return text
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[""]/g, '"') // Normalize quotes
      .replace(/['']/g, "'") // Normalize apostrophes
      .trim();
  }

  /**
   * Split text into sentences
   */
  splitIntoSentences(text) {
    return text
      .split(/[.!?]+/)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length > 0);
  }

  /**
   * Create caption chunks with word limits
   */
  createCaptionChunks(sentences, maxWordsPerCaption) {
    const chunks = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      const words = sentence.split(' ');
      
      if (words.length <= maxWordsPerCaption) {
        // Sentence fits in one caption
        if (currentChunk && (currentChunk.split(' ').length + words.length) > maxWordsPerCaption) {
          chunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          currentChunk += (currentChunk ? '. ' : '') + sentence;
        }
      } else {
        // Split long sentence into multiple captions
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        
        let tempChunk = '';
        for (const word of words) {
          if ((tempChunk.split(' ').length + 1) > maxWordsPerCaption) {
            chunks.push(tempChunk.trim());
            tempChunk = word;
          } else {
            tempChunk += (tempChunk ? ' ' : '') + word;
          }
        }
        if (tempChunk) {
          currentChunk = tempChunk;
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Calculate timing for caption chunks
   */
  calculateCaptionTiming(chunks, wordsPerMinute) {
    const captions = [];
    let currentTime = 0;

    chunks.forEach((chunk, index) => {
      const wordCount = chunk.split(' ').length;
      const duration = (wordCount / wordsPerMinute) * 60; // Convert to seconds
      const displayDuration = Math.max(duration * 1.2, 2); // Minimum 2 seconds display

      captions.push({
        index: index + 1,
        text: chunk,
        startTime: currentTime,
        endTime: currentTime + displayDuration
      });

      currentTime += displayDuration;
    });

    return captions;
  }

  /**
   * Calculate optimal words per minute based on duration and content
   */
  calculateOptimalWPM(targetDuration, text) {
    const wordCount = text.split(' ').length;
    const targetMinutes = targetDuration / 60;
    return Math.round(wordCount / targetMinutes);
  }

  /**
   * Format captions according to specified format
   */
  formatCaptions(captions, format) {
    switch (format.toLowerCase()) {
      case 'srt':
        return this.formatAsSRT(captions);
      case 'vtt':
        return this.formatAsVTT(captions);
      case 'json':
        return captions;
      case 'txt':
        return this.formatAsText(captions);
      default:
        return captions;
    }
  }

  /**
   * Format as SRT subtitle format
   */
  formatAsSRT(captions) {
    return captions.map(caption => {
      const startTime = this.formatSRTTime(caption.startTime);
      const endTime = this.formatSRTTime(caption.endTime);
      return `${caption.index}\n${startTime} --> ${endTime}\n${caption.text}\n`;
    }).join('\n');
  }

  /**
   * Format as WebVTT format
   */
  formatAsVTT(captions) {
    let vtt = 'WEBVTT\n\n';
    vtt += captions.map(caption => {
      const startTime = this.formatVTTTime(caption.startTime);
      const endTime = this.formatVTTTime(caption.endTime);
      return `${startTime} --> ${endTime}\n${caption.text}`;
    }).join('\n\n');
    return vtt;
  }

  /**
   * Format as plain text
   */
  formatAsText(captions) {
    return captions.map(caption => caption.text).join(' ');
  }

  /**
   * Format time for SRT format (HH:MM:SS,mmm)
   */
  formatSRTTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  }

  /**
   * Format time for VTT format (HH:MM:SS.mmm)
   */
  formatVTTTime(seconds) {
    const srtTime = this.formatSRTTime(seconds);
    return srtTime.replace(',', '.');
  }

  /**
   * Get service status
   */
  getServiceStatus() {
    return {
      whisperAvailable: !!this.openai,
      supportedFormats: ['srt', 'vtt', 'json', 'txt'],
      supportedLanguages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'],
      features: {
        audioTranscription: !!this.openai,
        textCaptions: true,
        smartCaptions: !!this.openai,
        timestampGeneration: true,
        multipleFormats: true
      },
      limits: {
        maxAudioSize: '25MB',
        maxDuration: '10 minutes',
        supportedAudioFormats: ['mp3', 'mp4', 'm4a', 'wav', 'webm']
      }
    };
  }
}

module.exports = CaptionService;

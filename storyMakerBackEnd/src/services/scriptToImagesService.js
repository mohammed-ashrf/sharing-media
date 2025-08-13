const OpenAI = require('openai');

class ScriptToImagesService {
  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('⚠️ OpenAI API key not found. Script-to-Images service will not function properly.');
    }
    
    this.openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY 
    });
  }

  /**
   * Generate images for script with streaming support
   * @param {Object} params - Generation parameters
   * @param {string} params.script - Full text of the narration/audio
   * @param {number} params.duration - Total length of the audio in seconds
   * @param {number} params.maxImagesPerMin - Maximum images per minute (default: 4)
   * @param {string} params.projectId - Unique project identifier
   * @param {Function} params.onImageGenerated - Callback for each generated image
   * @param {Function} params.onProgress - Callback for progress updates
   * @param {Function} params.onError - Callback for errors
   * @returns {Object} Results with final metadata
   */
  async generateScriptImagesStream({ 
    script, 
    duration, 
    maxImagesPerMin = 4, 
    projectId,
    audioDuration, // ✅ NEW: Audio duration constraint
    onImageGenerated,
    onProgress,
    onError 
  }) {
    try {
      console.log(`🎨 Starting streaming script-to-images generation for project ${projectId}`);
      console.log(`📝 Script length: ${script.length} characters`);
      console.log(`⏱️ Duration: ${duration} seconds`);
      console.log(`🖼️ Max images per minute: ${maxImagesPerMin}`);

      // Step 1: Calculate word statistics
      const words = script.trim().split(/\s+/).filter(word => word.length > 0);
      const wordCount = words.length;
      const wps = wordCount / duration; // words per second

      console.log(`📊 Word count: ${wordCount}, Words per second: ${wps.toFixed(2)}`);

      // Step 2: Determine chunking parameters with 15-second minimum interval
      // ✅ MAXIMUM 10 IMAGES PER PROJECT - Hard limit enforced
      // Minimum: one image every 15 seconds for optimal viewing experience
      let targetImagesForDuration;
      
      // Use audio duration if provided (more accurate than script duration)
      const effectiveDuration = audioDuration && audioDuration > 0 ? Math.min(audioDuration, duration) : duration;
      console.log(`⏱️ Using effective duration: ${effectiveDuration}s (audio: ${audioDuration}s, script: ${duration}s)`);
      
      if (effectiveDuration <= 60) {
        // Short videos: minimum 4 images, maximum 6 (every 10-15 seconds)
        targetImagesForDuration = Math.max(4, Math.min(6, Math.ceil(effectiveDuration / 15)));
      } else if (effectiveDuration <= 300) {
        // Medium videos (up to 5 minutes): one image every 15 seconds minimum
        targetImagesForDuration = Math.ceil(effectiveDuration / 15);
      } else {
        // Long videos: respect maxImagesPerMin parameter but ensure 15s minimum
        const basedOnRate = Math.ceil((effectiveDuration / 60) * maxImagesPerMin);
        const basedOnInterval = Math.ceil(effectiveDuration / 15);
        targetImagesForDuration = Math.max(basedOnRate, basedOnInterval);
      }
      
      // ✅ ENFORCE MAXIMUM 10 IMAGES PER PROJECT - Hard limit
      targetImagesForDuration = Math.min(targetImagesForDuration, 10);
      console.log(`🚫 Maximum images enforced: ${targetImagesForDuration} (capped at 10 per project)`);
      
      // Adjust duration to match effective duration for image timing
      const adjustedDuration = effectiveDuration;
      
      // Calculate words per chunk based on target image count
      const chunkWords = Math.floor(wordCount / targetImagesForDuration);
      const actualImagesCount = Math.ceil(wordCount / chunkWords);
      const chunkSec = adjustedDuration / actualImagesCount;

      console.log(`⏰ Target images: ${targetImagesForDuration}, Actual: ${actualImagesCount}`);
      console.log(`⏰ Chunk duration: ${chunkSec.toFixed(1)} seconds (every ${chunkSec.toFixed(1)}s)`);
      console.log(`📝 Words per chunk: ${chunkWords}`);

      // Step 3: Split script into scenes with proper timing
      const scenes = [];
      for (let i = 0; i < words.length; i += chunkWords) {
        const chunk = words.slice(i, i + chunkWords).join(' ');
        const sceneIndex = Math.floor(i / chunkWords);
        const startTime = parseFloat((sceneIndex * chunkSec).toFixed(1));
        
        // ✅ Ensure scene doesn't exceed effective duration
        if (startTime < adjustedDuration) {
          scenes.push({
            start: startTime,
            description: chunk,
            prompt: this.createImagePrompt(chunk, chunkSec)
          });
        }
      }

      console.log(`🎬 Created ${scenes.length} scenes (max 10 per project, within ${adjustedDuration}s)`);
      
      // ✅ Final check: Ensure no more than 10 scenes
      const finalScenes = scenes.slice(0, 10);
      if (scenes.length > 10) {
        console.log(`🚫 Trimmed scenes from ${scenes.length} to 10 (project limit enforced)`);
      }

      // Step 4: Generate images with streaming
      const results = [];
      const failedImages = [];
      let totalSize = 0;

      for (let i = 0; i < finalScenes.length; i++) {
        const scene = finalScenes[i];
        console.log(`🎨 Generating image ${i + 1}/${finalScenes.length} for timestamp ${scene.start}s`);

        // Send progress update
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: finalScenes.length,
            stage: 'generating',
            message: `Generating image ${i + 1}/${finalScenes.length}...`,
            timestamp: scene.start
          });
        }

        try {
          // Generate image using OpenAI DALL-E
          const image = await this.openai.images.generate({
            model: "dall-e-3", // Using DALL-E 3 for better quality
            prompt: scene.prompt,
            size: "1024x1792", // ✅ FIXED: Vertical aspect ratio for mobile/vertical videos
            quality: "standard",
            response_format: "b64_json"
          });

          // Create image data object
          const b64Data = image.data[0].b64_json;
          const filename = `${Math.floor(scene.start)}.png`;
          const imageSize = Math.round((b64Data.length * 3) / 4); // Approximate size in bytes

          const imageData = {
            id: `${projectId}_${filename}`,
            timestamp: scene.start,
            filename: filename,
            base64Data: b64Data, // Base64 image data for frontend
            prompt: scene.prompt,
            description: scene.description,
            size: imageSize,
            mimeType: 'image/png'
          };

          results.push(imageData);
          totalSize += imageSize;

          console.log(`✅ Generated: ${filename} (${Math.round(imageSize / 1024)}KB)`);

          // Stream this image immediately to frontend
          if (onImageGenerated) {
            onImageGenerated(imageData, {
              current: i + 1,
              total: finalScenes.length,
              completed: i + 1,
              remaining: finalScenes.length - (i + 1)
            });
          }

          // Add delay to respect API rate limits and improve performance
          if (i < finalScenes.length - 1) {
            await this.delay(800); // 800ms delay between requests for better performance
          }

        } catch (imageError) {
          console.error(`❌ Error generating image for timestamp ${scene.start}:`, imageError);
          
          const errorData = {
            timestamp: scene.start,
            error: imageError.message,
            prompt: scene.prompt,
            description: scene.description
          };
          
          failedImages.push(errorData);
          
          // Notify frontend of error
          if (onError) {
            onError(errorData);
          }
        }
      }

      // ✅ NEW: Filter images by audio duration constraint if provided
      let filteredResults = results;
      if (audioDuration && audioDuration > 0) {
        const originalCount = results.length;
        filteredResults = results.filter(img => img.timestamp < audioDuration);
        const removedCount = originalCount - filteredResults.length;
        
        if (removedCount > 0) {
          console.log(`🎵 Audio duration constraint (${audioDuration}s) applied: removed ${removedCount} images that exceeded audio duration`);
          console.log(`📸 Images after audio filtering: ${filteredResults.length}/${originalCount}`);
        }
      }

      // Step 5: Return final metadata
      const responseData = {
        projectId,
        script,
        duration,
        audioDuration, // ✅ Include in response
        maxImagesPerMin,
        wordCount,
        wordsPerSecond: wps,
        chunkDuration: chunkSec,
        wordsPerChunk: chunkWords,
        totalImages: filteredResults.length, // ✅ Use filtered count
        originalImages: results.length, // ✅ Include original count
        removedByAudioDuration: results.length - filteredResults.length, // ✅ Track removed images
        failedImages: failedImages.length,
        generatedAt: new Date().toISOString(),
        images: filteredResults, // ✅ Return only filtered images
        failedAttempts: failedImages,
        metadata: {
          totalSize: filteredResults.reduce((sum, img) => sum + img.size, 0), // ✅ Recalculate for filtered images
          averageImageSize: filteredResults.length > 0 ? Math.round(filteredResults.reduce((sum, img) => sum + img.size, 0) / filteredResults.length) : 0,
          estimatedDownloadTime: this.estimateDownloadTime(filteredResults)
        }
      };

      console.log(`✅ Script-to-images streaming generation completed for project ${projectId}`);
      console.log(`📊 Generated ${results.length} images, delivering ${filteredResults.length} after audio duration filtering`);
      console.log(`📦 Final payload size: ${Math.round(filteredResults.reduce((sum, img) => sum + img.size, 0) / 1024)}KB`);

      return {
        success: true,
        data: responseData
      };

    } catch (error) {
      console.error('❌ Error in generateScriptImagesStream:', error);
      if (onError) {
        onError({ error: error.message, stage: 'initialization' });
      }
      throw new Error(`Failed to generate images: ${error.message}`);
    }
  }

  /**
   * Generate images for script with timeline mapping (original method - kept for backwards compatibility)
   * @param {Object} params - Generation parameters
   * @param {string} params.script - Full text of the narration/audio
   * @param {number} params.duration - Total length of the audio in seconds
   * @param {number} params.maxImagesPerMin - Maximum images per minute (default: 4)
   * @param {string} params.projectId - Unique project identifier
   * @param {number} params.audioDuration - Optional audio duration constraint
   * @returns {Object} Results with image data and metadata
   */
  async generateScriptImages({ script, duration, maxImagesPerMin = 4, projectId, audioDuration }) {
    try {
      console.log(`🎨 Starting script-to-images generation for project ${projectId}`);
      console.log(`📝 Script length: ${script.length} characters`);
      console.log(`⏱️ Duration: ${duration} seconds`);
      console.log(`🖼️ Max images per minute: ${maxImagesPerMin}`);

      // Step 1: Calculate word statistics
      const words = script.trim().split(/\s+/).filter(word => word.length > 0);
      const wordCount = words.length;
      const wps = wordCount / duration; // words per second

      console.log(`📊 Word count: ${wordCount}, Words per second: ${wps.toFixed(2)}`);

      // Step 2: Determine chunking parameters with 15-second minimum interval
      // ✅ MAXIMUM 10 IMAGES PER PROJECT - Hard limit enforced
      // Minimum: one image every 15 seconds for optimal viewing experience
      let targetImagesForDuration;
      
      // Use audio duration if provided (more accurate than script duration)
      const effectiveDuration = audioDuration && audioDuration > 0 ? Math.min(audioDuration, duration) : duration;
      console.log(`⏱️ Using effective duration: ${effectiveDuration}s (audio: ${audioDuration}s, script: ${duration}s)`);
      
      if (effectiveDuration <= 60) {
        // Short videos: minimum 4 images, maximum 6 (every 10-15 seconds)
        targetImagesForDuration = Math.max(4, Math.min(6, Math.ceil(effectiveDuration / 15)));
      } else if (effectiveDuration <= 300) {
        // Medium videos (up to 5 minutes): one image every 15 seconds minimum
        targetImagesForDuration = Math.ceil(effectiveDuration / 15);
      } else {
        // Long videos: respect maxImagesPerMin parameter but ensure 15s minimum
        const basedOnRate = Math.ceil((effectiveDuration / 60) * maxImagesPerMin);
        const basedOnInterval = Math.ceil(effectiveDuration / 15);
        targetImagesForDuration = Math.max(basedOnRate, basedOnInterval);
      }
      
      // ✅ ENFORCE MAXIMUM 10 IMAGES PER PROJECT - Hard limit
      targetImagesForDuration = Math.min(targetImagesForDuration, 10);
      console.log(`🚫 Maximum images enforced: ${targetImagesForDuration} (capped at 10 per project)`);
      
      // Adjust duration to match effective duration for image timing
      const adjustedDuration = effectiveDuration;
      
      // Calculate words per chunk based on target image count
      const chunkWords = Math.floor(wordCount / targetImagesForDuration);
      const actualImagesCount = Math.ceil(wordCount / chunkWords);
      const chunkSec = adjustedDuration / actualImagesCount;

      console.log(`⏰ Target images: ${targetImagesForDuration}, Actual: ${actualImagesCount}`);
      console.log(`⏰ Chunk duration: ${chunkSec.toFixed(1)} seconds`);
      console.log(`📝 Words per chunk: ${chunkWords}`);

      // Step 3: Split script into scenes with proper timing
      const scenes = [];
      for (let i = 0; i < words.length; i += chunkWords) {
        const chunk = words.slice(i, i + chunkWords).join(' ');
        const sceneIndex = Math.floor(i / chunkWords);
        const startTime = parseFloat((sceneIndex * chunkSec).toFixed(1));
        
        // ✅ Ensure scene doesn't exceed effective duration
        if (startTime < adjustedDuration) {
          scenes.push({
            start: startTime,
            description: chunk,
            prompt: this.createImagePrompt(chunk, chunkSec)
          });
        }
      }
      
      // ✅ Final check: Ensure no more than 10 scenes
      const finalScenes = scenes.slice(0, 10);
      if (scenes.length > 10) {
        console.log(`🚫 Trimmed scenes from ${scenes.length} to 10 (project limit enforced)`);
      }

      console.log(`🎬 Created ${scenes.length} scenes`);

      // Step 4: Generate images and return base64 data (no file saving)
      const results = [];
      const failedImages = [];

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        console.log(`🎨 Generating image ${i + 1}/${scenes.length} for timestamp ${scene.start}s`);

        try {
          // Generate image using OpenAI DALL-E
          const image = await this.openai.images.generate({
            model: "dall-e-3", // Using DALL-E 3 for better quality
            prompt: scene.prompt,
            size: "1024x1792", // ✅ FIXED: Vertical aspect ratio for mobile/vertical videos
            quality: "standard",
            response_format: "b64_json"
          });

          // Return base64 data directly (no file saving)
          const b64Data = image.data[0].b64_json;
          const filename = `${Math.floor(scene.start)}.png`;

          results.push({
            timestamp: scene.start,
            filename: filename,
            imageData: b64Data, // Base64 image data for frontend
            prompt: scene.prompt,
            description: scene.description,
            size: Math.round((b64Data.length * 3) / 4), // Approximate size in bytes
            mimeType: 'image/png'
          });

          console.log(`✅ Generated: ${filename} (${Math.round((b64Data.length * 3) / 4 / 1024)}KB)`);

          // Add delay to respect API rate limits and improve performance
          if (i < scenes.length - 1) {
            await this.delay(800); // 800ms delay between requests for better performance
          }

        } catch (imageError) {
          console.error(`❌ Error generating image for timestamp ${scene.start}:`, imageError);
          
          failedImages.push({
            timestamp: scene.start,
            error: imageError.message,
            prompt: scene.prompt,
            description: scene.description
          });
        }
      }

      // Step 5: Return complete data package for frontend
      const responseData = {
        projectId,
        script,
        duration,
        maxImagesPerMin,
        wordCount,
        wordsPerSecond: wps,
        chunkDuration: chunkSec,
        wordsPerChunk: chunkWords,
        totalImages: results.length,
        failedImages: failedImages.length,
        generatedAt: new Date().toISOString(),
        images: results,
        failedAttempts: failedImages,
        metadata: {
          totalSize: results.reduce((sum, img) => sum + img.size, 0),
          averageImageSize: results.length > 0 ? Math.round(results.reduce((sum, img) => sum + img.size, 0) / results.length) : 0,
          estimatedDownloadTime: this.estimateDownloadTime(results)
        }
      };

      console.log(`✅ Script-to-images generation completed for project ${projectId}`);
      console.log(`📊 Generated ${results.length} images out of ${scenes.length} attempts`);
      console.log(`📦 Total payload size: ${Math.round(responseData.metadata.totalSize / 1024)}KB`);

      return {
        success: true,
        data: responseData
      };

    } catch (error) {
      console.error('❌ Error in generateScriptImages:', error);
      throw new Error(`Failed to generate images: ${error.message}`);
    }
  }

  /**
   * Create an optimized image generation prompt
   * @param {string} chunk - Text chunk to visualize
   * @returns {string} Optimized prompt for image generation
   */
  createImagePrompt(chunk) {
    // Clean up the chunk text
    const cleanChunk = chunk.trim();
    
    // Create a cinematic prompt with style guidelines optimized for vertical timeline backgrounds
    const prompt = `Create a cinematic, highly detailed, photorealistic image illustrating: "${cleanChunk}". 
Style: Professional cinematography, dramatic lighting, rich colors, detailed composition, 
movie-like quality, high resolution, visually engaging, suitable for vertical video timeline background.
Composition: Vertical format, 9:16 aspect ratio optimized, portrait orientation, mobile-friendly framing.
Focus on visual storytelling, avoid text overlays, center subject for vertical viewing, cinematic depth.`;

    return prompt;
  }

  /**
   * Estimate download time for image data (for performance metrics)
   * @param {Array} images - Array of image objects with size data
   * @returns {Object} Download time estimates
   */
  estimateDownloadTime(images) {
    const totalSize = images.reduce((sum, img) => sum + img.size, 0);
    const totalSizeMB = totalSize / (1024 * 1024);
    
    return {
      totalSizeMB: Math.round(totalSizeMB * 100) / 100,
      estimatedSeconds: {
        fast: Math.round(totalSizeMB / 10), // 10 MB/s (fast connection)
        medium: Math.round(totalSizeMB / 5), // 5 MB/s (medium connection)
        slow: Math.round(totalSizeMB / 1), // 1 MB/s (slow connection)
      }
    };
  }

  /**
   * Utility method to add delay
   * @param {number} ms - Milliseconds to delay
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate script-to-images generation parameters
   * @param {Object} params - Parameters to validate
   * @returns {Object} Validation result
   */
  validateParams({ script, duration, maxImagesPerMin = 4, projectId }) {
    const errors = [];

    if (!script || typeof script !== 'string' || script.trim().length === 0) {
      errors.push('Script is required and must be a non-empty string');
    }

    if (!duration || typeof duration !== 'number' || duration < 10 || duration > 3600) {
      errors.push('Duration must be a number between 10 and 3600 seconds');
    }

    if (!Number.isInteger(maxImagesPerMin) || maxImagesPerMin < 1 || maxImagesPerMin > 10) {
      errors.push('Max images per minute must be an integer between 1 and 10');
    }

    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      errors.push('Project ID is required and must be a non-empty string');
    }

    // Check for valid script length (should have enough content)
    if (script && script.trim().split(/\s+/).length < 10) {
      errors.push('Script should contain at least 10 words for meaningful image generation');
    }

    // Performance warning for large requests
    if (duration > 600 && maxImagesPerMin > 4) {
      errors.push('For durations over 10 minutes, max 4 images per minute recommended for performance');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Create an optimized image prompt from script chunk
   * @param {string} chunk - Text chunk from script
   * @param {number} duration - Duration this image will be shown (in seconds)
   * @returns {string} Optimized DALL-E prompt
   */
  createImagePrompt(chunk, duration = 15) {
    // Clean and preserve the actual script content
    const cleanChunk = chunk.trim();
    
    console.log(`🎨 Creating image prompt for chunk: "${cleanChunk.substring(0, 100)}..."`);
    
    // Extract key nouns, actions, and descriptive elements from the script
    const visualContext = this.extractVisualContextFromScript(cleanChunk);
    
    // Determine style complexity based on duration
    let styleIntensity;
    if (duration <= 10) {
      styleIntensity = "clean, focused";
    } else if (duration <= 20) {
      styleIntensity = "detailed, cinematic";
    } else {
      styleIntensity = "rich, immersive";
    }
    
    // Build prompt that directly represents the script content
    const prompt = `Create a ${styleIntensity} visual representation of: "${cleanChunk}". 
${visualContext}
Style: High-quality, professional photography, dramatic lighting, rich colors.
Format: Vertical 9:16 aspect ratio, mobile-optimized framing, no text overlays.
Focus: Visual storytelling that directly illustrates the narrated content, cinematic composition suitable for video backgrounds.`;
    
    console.log(`✅ Generated prompt: "${prompt.substring(0, 150)}..."`);
    return prompt;
  }

  /**
   * Extract visual context directly from script content for better prompts
   * @param {string} scriptChunk - Clean script text chunk
   * @returns {string} Visual context and scene description
   */
  extractVisualContextFromScript(scriptChunk) {
    // Analyze the script content for visual cues and context
    const lowerChunk = scriptChunk.toLowerCase();
    
    // Determine scene setting and context
    let sceneContext = [];
    let lighting = "natural lighting";
    let mood = "neutral atmosphere";
    let characters = "";
    let setting = "";
    
    // Location/Setting Detection
    if (lowerChunk.includes('home') || lowerChunk.includes('house') || lowerChunk.includes('apartment') || lowerChunk.includes('room')) {
      setting = "cozy indoor residential setting";
    } else if (lowerChunk.includes('office') || lowerChunk.includes('work') || lowerChunk.includes('workplace') || lowerChunk.includes('desk')) {
      setting = "professional office environment";
    } else if (lowerChunk.includes('school') || lowerChunk.includes('classroom') || lowerChunk.includes('university') || lowerChunk.includes('college')) {
      setting = "educational institutional setting";
    } else if (lowerChunk.includes('restaurant') || lowerChunk.includes('cafe') || lowerChunk.includes('diner') || lowerChunk.includes('kitchen')) {
      setting = "culinary dining environment";
    } else if (lowerChunk.includes('hospital') || lowerChunk.includes('doctor') || lowerChunk.includes('medical') || lowerChunk.includes('clinic')) {
      setting = "clean medical facility";
    } else if (lowerChunk.includes('car') || lowerChunk.includes('driving') || lowerChunk.includes('road') || lowerChunk.includes('traffic')) {
      setting = "automotive transportation scene";
    } else if (lowerChunk.includes('park') || lowerChunk.includes('outside') || lowerChunk.includes('outdoor') || lowerChunk.includes('nature') || lowerChunk.includes('tree')) {
      setting = "natural outdoor environment";
    } else if (lowerChunk.includes('store') || lowerChunk.includes('shop') || lowerChunk.includes('mall') || lowerChunk.includes('market')) {
      setting = "commercial retail space";
    }
    
    // Time of Day Detection
    if (lowerChunk.includes('morning') || lowerChunk.includes('dawn') || lowerChunk.includes('sunrise')) {
      lighting = "warm golden morning light";
    } else if (lowerChunk.includes('afternoon') || lowerChunk.includes('day') || lowerChunk.includes('noon')) {
      lighting = "bright natural daylight";
    } else if (lowerChunk.includes('evening') || lowerChunk.includes('sunset') || lowerChunk.includes('dusk')) {
      lighting = "warm amber evening light";
    } else if (lowerChunk.includes('night') || lowerChunk.includes('dark') || lowerChunk.includes('midnight')) {
      lighting = "dramatic night lighting";
    }
    
    // Weather/Atmosphere Detection
    if (lowerChunk.includes('rain') || lowerChunk.includes('storm') || lowerChunk.includes('thunder') || lowerChunk.includes('wet')) {
      mood = "stormy dramatic atmosphere";
    } else if (lowerChunk.includes('sunny') || lowerChunk.includes('bright') || lowerChunk.includes('clear')) {
      mood = "bright cheerful atmosphere";
    } else if (lowerChunk.includes('cloudy') || lowerChunk.includes('overcast') || lowerChunk.includes('grey')) {
      mood = "soft overcast atmosphere";
    } else if (lowerChunk.includes('snow') || lowerChunk.includes('winter') || lowerChunk.includes('cold') || lowerChunk.includes('ice')) {
      mood = "crisp winter atmosphere";
    }
    
    // Character/People Detection
    if (lowerChunk.includes('he ') || lowerChunk.includes('him ') || lowerChunk.includes('man ') || lowerChunk.includes('guy ') || lowerChunk.includes('father') || lowerChunk.includes('husband')) {
      characters = "featuring a male character";
    }
    if (lowerChunk.includes('she ') || lowerChunk.includes('her ') || lowerChunk.includes('woman ') || lowerChunk.includes('girl ') || lowerChunk.includes('mother') || lowerChunk.includes('wife')) {
      if (characters) characters += " and a female character";
      else characters = "featuring a female character";
    }
    if (lowerChunk.includes('they ') || lowerChunk.includes('people ') || lowerChunk.includes('everyone ') || lowerChunk.includes('crowd')) {
      characters = "featuring multiple people";
    }
    if (lowerChunk.includes('child') || lowerChunk.includes('kids') || lowerChunk.includes('baby') || lowerChunk.includes('son') || lowerChunk.includes('daughter')) {
      if (characters) characters += " including children";
      else characters = "featuring children";
    }
    
    // Emotional Context Detection
    if (lowerChunk.includes('happy') || lowerChunk.includes('joy') || lowerChunk.includes('excited') || lowerChunk.includes('celebrating') || lowerChunk.includes('smile')) {
      mood = "joyful uplifting atmosphere";
    } else if (lowerChunk.includes('sad') || lowerChunk.includes('crying') || lowerChunk.includes('tears') || lowerChunk.includes('depressed')) {
      mood = "melancholic emotional atmosphere";
    } else if (lowerChunk.includes('angry') || lowerChunk.includes('mad') || lowerChunk.includes('furious') || lowerChunk.includes('rage')) {
      mood = "tense confrontational atmosphere";
    } else if (lowerChunk.includes('scared') || lowerChunk.includes('afraid') || lowerChunk.includes('terrified') || lowerChunk.includes('worried')) {
      mood = "suspenseful anxious atmosphere";
    }
    
    // Action/Movement Detection
    if (lowerChunk.includes('running') || lowerChunk.includes('chase') || lowerChunk.includes('hurry') || lowerChunk.includes('rush')) {
      sceneContext.push("dynamic motion with urgency");
    } else if (lowerChunk.includes('walking') || lowerChunk.includes('moving') || lowerChunk.includes('going')) {
      sceneContext.push("gentle movement and transition");
    } else if (lowerChunk.includes('sitting') || lowerChunk.includes('relaxing') || lowerChunk.includes('resting')) {
      sceneContext.push("calm stationary composition");
    }
    
    // Build the visual context description
    let contextParts = [];
    if (setting) contextParts.push(setting);
    if (characters) contextParts.push(characters);
    contextParts.push(lighting);
    contextParts.push(mood);
    if (sceneContext.length > 0) contextParts.push(sceneContext[0]);
    
    return `Scene: ${contextParts.join(', ')}.`;
  }

  /**
   * Calculate the expected number of images and estimated processing time
   * @param {Object} params - Generation parameters
   * @returns {Object} Estimation data
   */
  estimateGeneration({ script, duration, maxImagesPerMin = 4 }) {
    const words = script.trim().split(/\s+/).filter(word => word.length > 0);
    const wordCount = words.length;
    
    // Use improved logic for estimation with 15-second minimum interval
    let targetImagesForDuration;
    if (duration <= 60) {
      // Short videos: minimum 4 images, maximum 6 (every 10-15 seconds)
      targetImagesForDuration = Math.max(4, Math.min(6, Math.ceil(duration / 15)));
    } else if (duration <= 300) {
      // Medium videos (up to 5 minutes): one image every 15 seconds minimum
      targetImagesForDuration = Math.ceil(duration / 15);
    } else {
      // Long videos: respect maxImagesPerMin parameter but ensure 15s minimum
      const basedOnRate = Math.ceil((duration / 60) * maxImagesPerMin);
      const basedOnInterval = Math.ceil(duration / 15);
      targetImagesForDuration = Math.max(basedOnRate, basedOnInterval);
    }
    
    const chunkWords = Math.floor(wordCount / targetImagesForDuration);
    const expectedImages = Math.ceil(wordCount / chunkWords);
    
    // Estimate processing time (800ms delay + ~3-5s per image generation)
    const estimatedTimeSeconds = expectedImages * 4.5; // Average 4.5 seconds per image
    
    return {
      expectedImages,
      estimatedProcessingTime: {
        seconds: Math.round(estimatedTimeSeconds),
        minutes: Math.round(estimatedTimeSeconds / 60 * 10) / 10,
        formatted: `${Math.floor(estimatedTimeSeconds / 60)}:${String(Math.round(estimatedTimeSeconds % 60)).padStart(2, '0')}`
      },
      chunking: {
        wordCount,
        wordsPerSecond: Math.round((wordCount / duration) * 100) / 100,
        chunkDuration: Math.round((duration / expectedImages) * 10) / 10,
        wordsPerChunk: chunkWords
      }
    };
  }
}

module.exports = ScriptToImagesService;

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
   * @param {numb      console.log(`⏰ Scene ${i + 1}: ${startTime}s - ${endTime}s (${duration}s) - "${scene.title || scene.description?.substring(0, 30) + '...' || 'Scene'}"`;r} params.duration - Total length of the audio in seconds
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

      // Use audio duration if provided (more accurate than script duration)
      const effectiveDuration = audioDuration && audioDuration > 0 ? Math.min(audioDuration, duration) : duration;
      console.log(`⏱️ Using effective duration: ${effectiveDuration}s (audio: ${audioDuration}s, script: ${duration}s)`);

      // Step 1: Calculate target number of scenes based on duration and max images per minute
      const maxTotalImages = Math.floor((effectiveDuration / 60) * maxImagesPerMin);
      const targetScenes = Math.min(maxTotalImages, 12); // Hard cap at 12 images
      
      console.log(`🎯 Target scenes: ${targetScenes} (${maxImagesPerMin} images/min for ${effectiveDuration}s)`);

      // Step 2: Generate scene descriptions using OpenAI
      if (onProgress) {
        onProgress({
          current: 0,
          total: targetScenes + 1,
          stage: 'analyzing',
          message: 'Analyzing script and generating scene descriptions...',
          timestamp: 0
        });
      }

      console.log(`🤖 Generating scene descriptions for ${targetScenes} scenes...`);
      const sceneDescriptions = await this.generateSceneDescriptions(script, effectiveDuration, targetScenes);
      
      if (!sceneDescriptions || !Array.isArray(sceneDescriptions.scenes)) {
        throw new Error('Failed to generate scene descriptions');
      }

      console.log(`📋 Generated ${sceneDescriptions.scenes.length} scene descriptions`);
      
      // Step 3: Validate and adjust scene timing
      const validationResult = this.validateSceneTiming(sceneDescriptions.scenes, effectiveDuration);
      const validatedScenes = validationResult.scenes;
      
      if (validatedScenes.length === 0) {
        throw new Error(`Scene timing validation failed. Generated ${sceneDescriptions.scenes.length} scenes but none are valid for ${effectiveDuration}s duration. Check scene durations and timing.`);
      }
      
      // Log validation results but don't fail if we have valid scenes
      if (!validationResult.valid) {
        console.log(`⚠️ Scene timing validation notice: ${sceneDescriptions.scenes.length} scenes generated, ${validatedScenes.length} are valid within ${effectiveDuration}s duration`);
      }
      
      console.log(`✅ Validated ${validatedScenes.length} scenes with proper timing (avg: ${validationResult.averageSceneDuration.toFixed(1)}s per scene)`)

      // Step 4: Generate images with streaming
      const results = [];
      const failedImages = [];
      let totalSize = 0;

      for (let i = 0; i < validatedScenes.length; i++) {
        const scene = validatedScenes[i];
        console.log(`🎨 Generating image ${i + 1}/${validatedScenes.length} for timestamp ${scene.startTime}s`);

        // Send progress update
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: validatedScenes.length,
            stage: 'generating',
            message: `Generating image ${i + 1}/${validatedScenes.length}...`,
            timestamp: scene.startTime
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
          const filename = `${Math.floor(scene.startTime)}.png`;
          const imageSize = Math.round((b64Data.length * 3) / 4); // Approximate size in bytes

          const imageData = {
            id: `${projectId}_${filename}`,
            timestamp: scene.startTime,
            filename: filename,
            base64Data: b64Data, // Base64 image data for frontend
            prompt: scene.prompt,
            description: scene.description,
            size: imageSize,
            mimeType: 'image/png',
            // Include scene timing data for frontend
            sceneIndex: scene.scene,
            startTime: scene.startTime,
            endTime: scene.endTime,
            duration: scene.duration
          };

          results.push(imageData);
          totalSize += imageSize;

          console.log(`✅ Generated: ${filename} (${Math.round(imageSize / 1024)}KB)`);

          // Stream this image immediately to frontend
          if (onImageGenerated) {
            onImageGenerated(imageData, {
              current: i + 1,
              total: validatedScenes.length,
              completed: i + 1,
              remaining: validatedScenes.length - (i + 1)
            });
          }

          // Add delay to respect API rate limits and improve performance
          if (i < validatedScenes.length - 1) {
            await this.delay(800); // 800ms delay between requests for better performance
          }

        } catch (imageError) {
          console.error(`❌ Error generating image for timestamp ${scene.startTime}:`, imageError);
          
          const errorData = {
            timestamp: scene.startTime,
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
        totalImages: filteredResults.length, // ✅ Use filtered count
        originalImages: results.length, // ✅ Include original count
        removedByAudioDuration: results.length - filteredResults.length, // ✅ Track removed images
        failedImages: failedImages.length,
        generatedAt: new Date().toISOString(),
        images: filteredResults, // ✅ Return only filtered images
        failedAttempts: failedImages,
        sceneDescriptions: sceneDescriptions, // ✅ Include original scene descriptions
        metadata: {
          totalSize: filteredResults.reduce((sum, img) => sum + img.size, 0), // ✅ Recalculate for filtered images
          averageImageSize: filteredResults.length > 0 ? Math.round(filteredResults.reduce((sum, img) => sum + img.size, 0) / filteredResults.length) : 0,
          estimatedDownloadTime: this.estimateDownloadTime(filteredResults),
          scenesGenerated: validatedScenes.length,
          averageSceneDuration: validatedScenes.length > 0 ? Math.round((effectiveDuration / validatedScenes.length) * 10) / 10 : 0
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
      // ✅ MAXIMUM 12 IMAGES PER PROJECT - Hard limit enforced
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
      
      // ✅ ENFORCE MAXIMUM 12 IMAGES PER PROJECT - Hard limit
      targetImagesForDuration = Math.min(targetImagesForDuration, 12);
      console.log(`🚫 Maximum images enforced: ${targetImagesForDuration} (capped at 12 per project)`);
      
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
      
      // ✅ Final check: Ensure no more than 12 scenes
      const finalScenes = scenes.slice(0, 12);
      if (scenes.length > 12) {
        console.log(`🚫 Trimmed scenes from ${scenes.length} to 12 (project limit enforced)`);
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
   * Generate scene descriptions using OpenAI
   * @param {string} script - The full script text
   * @param {number} duration - Duration in seconds
   * @param {number} targetScenes - Target number of scenes
   * @returns {Object} Scene descriptions with timing
   */
  async generateSceneDescriptions(script, duration, targetScenes) {
    try {
      const durationMinutes = Math.round(duration / 60 * 10) / 10;
      
      const prompt = `This is my script for a ${durationMinutes}-minute video. 
Study the script then break it for me into ${targetScenes} scenes and describe the images to generate for each scene. 
The data you give me will be fed to another AI image generator. 
Produce the image prompt in JSON format. 
The json prompt should be detailed enough in order to generate images that clearly captures the scene. 
Each prompt must include lighting details, scene information, camera & lens quality, camera angle, photo quality and also negative information to avoid. 
Don't say anything else or give advise, just produce the json prompt only. 

Format the response as a JSON object with this exact structure:
{
  "scenes": [
    {
      "scene": 1,
      "title": "Scene Title (2-5 words)",
      "description": "Brief description of what happens in this scene (1-2 sentences)",
      "imagePrompt": "Detailed prompt for image generation including: main scene description, professional lighting details (dramatic/natural/soft), camera specifications (professional camera, high resolution, cinematic), visual style (photorealistic, cinematic, vibrant colors), composition details (vertical format, 9:16 aspect ratio), quality specifications (4K, sharp focus, detailed). Negative prompt: avoid blurry images, low quality, distorted faces, text overlays, logos.",
      "duration": 15.0,
      "startTime": 0.0
    }
  ]
}

IMPORTANT: Only respond with the JSON object. No additional text or explanations.

Here's the video script below:
${script}`;

      console.log(`🤖 Requesting scene descriptions from OpenAI for ${targetScenes} scenes...`);
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are an expert video production assistant. Generate detailed scene breakdowns with precise timing and professional image generation prompts. Always respond with valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 3000
      });

      const responseText = response.choices[0].message.content.trim();
      console.log(`📋 OpenAI response length: ${responseText.length} characters`);
      
      // Parse the JSON response
      let sceneData;
      try {
        // Clean the response to ensure it's valid JSON
        const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        sceneData = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error('❌ Failed to parse OpenAI response as JSON:', parseError);
        console.log('📝 Raw response:', responseText.substring(0, 500) + '...');
        throw new Error('Invalid JSON response from scene generation');
      }

      if (!sceneData.scenes || !Array.isArray(sceneData.scenes)) {
        throw new Error('Invalid scene data structure received');
      }

      console.log(`✅ Successfully parsed ${sceneData.scenes.length} scenes from OpenAI`);
      return sceneData;

    } catch (error) {
      console.error('❌ Error generating scene descriptions:', error);
      throw new Error(`Failed to generate scene descriptions: ${error.message}`);
    }
  }

  /**
   * Validate and adjust scene timing to ensure they fit within duration
   * @param {Array} scenes - Array of scene objects
   * @param {number} totalDuration - Total duration in seconds
   * @returns {Array} Validated scenes with proper timing
   */
  validateSceneTiming(scenes, totalDuration) {
    const validatedScenes = [];
    const sceneDuration = totalDuration / scenes.length;
    let totalCalculatedDuration = 0;
    
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const startTime = parseFloat((i * sceneDuration).toFixed(1));
      const endTime = parseFloat(Math.min((i + 1) * sceneDuration, totalDuration).toFixed(1));
      const duration = parseFloat((endTime - startTime).toFixed(1));
      
      // Skip scenes that would be too short or exceed duration
      if (duration < 5 || startTime >= totalDuration) {
        console.log(`⚠️ Skipping scene ${i + 1}: duration too short (${duration}s) or exceeds total duration`);
        continue;
      }
      
      validatedScenes.push({
        ...scene,
        startTime,
        endTime,
        duration,
        sceneIndex: i + 1,
        prompt: this.sanitizePromptForContentPolicy(scene.imagePrompt || scene.prompt || this.createImagePromptFromDescription(scene.description || scene.title)),
        scene: i + 1 // Add scene number for compatibility
      });
      
      totalCalculatedDuration += duration;
      console.log(`⏰ Scene ${i + 1}: ${startTime}s - ${endTime}s (${duration}s) - "${scene.title || scene.image_prompt?.substring(0, 30) + '...' || 'Scene'}"`);
    }
    
    // Return validation result object
    return {
      valid: validatedScenes.length > 0 && totalCalculatedDuration <= totalDuration,
      scenes: validatedScenes,
      sceneCount: validatedScenes.length,
      totalDuration: totalCalculatedDuration,
      withinAudioDuration: totalCalculatedDuration <= totalDuration,
      averageSceneDuration: validatedScenes.length > 0 ? totalCalculatedDuration / validatedScenes.length : 0
    };
  }

  /**
   * Create comprehensive image prompt from scene description
   * @param {string} description - Scene description
   * @returns {string} Detailed image prompt
   */
  createImagePromptFromDescription(description) {
    if (!description) return 'A high-quality, cinematic scene with professional lighting and composition';
    
    // Clean description to avoid content policy violations
    const cleanDescription = this.sanitizePromptForContentPolicy(description);
    
    return `${cleanDescription}. Professional cinematography, high-quality lighting, detailed composition, 
photorealistic style, cinematic depth of field, vibrant colors, sharp focus, high resolution, 
suitable for vertical video format (9:16 aspect ratio), visually engaging, movie-like quality.`;
  }

  /**
   * Sanitize prompt content to avoid OpenAI content policy violations
   * @param {string} prompt - The original prompt
   * @returns {string} Sanitized prompt
   */
  sanitizePromptForContentPolicy(prompt) {
    if (!prompt) return prompt;
    
    // Remove or replace potentially problematic words/phrases
    const sanitizedPrompt = prompt
      .toLowerCase()
      // Family/relationship conflicts - make more neutral
      .replace(/family.*conflict/gi, 'personal relationship challenges')
      .replace(/family.*betrayal/gi, 'breach of trust situation')
      .replace(/dad.*lying/gi, 'father figure in contemplation')
      .replace(/father.*hiding/gi, 'parent in serious conversation')
      .replace(/stealing|theft|fraud/gi, 'financial difficulty')
      .replace(/anger|rage|fury/gi, 'serious concern')
      .replace(/dark secret/gi, 'hidden challenge')
      .replace(/ruin.*family/gi, 'family facing challenges')
      // Violence or negative emotion words
      .replace(/destroy|devastate|crush/gi, 'impact seriously')
      .replace(/betray|deceive/gi, 'disappoint')
      .replace(/hate|hatred/gi, 'strong disagreement')
      // Make descriptions more abstract and artistic
      .replace(/specific.*details/gi, 'symbolic representation')
      .replace(/realistic.*depiction/gi, 'artistic interpretation');
    
    return sanitizedPrompt.charAt(0).toUpperCase() + sanitizedPrompt.slice(1);
  }

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
${visualContext.fullDescription}
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
    
    // Extract visual keywords for detailed analysis
    const visualKeywords = [];
    
    // Add setting keywords
    if (setting) visualKeywords.push(setting.split(' ')[0]);
    
    // Add lighting keywords
    if (lighting.includes('golden')) visualKeywords.push('golden');
    if (lighting.includes('bright')) visualKeywords.push('bright');
    if (lighting.includes('dramatic')) visualKeywords.push('dramatic');
    
    // Add mood keywords
    if (mood.includes('stormy')) visualKeywords.push('stormy');
    if (mood.includes('cheerful')) visualKeywords.push('cheerful');
    if (mood.includes('winter')) visualKeywords.push('winter');
    
    // Add specific scene elements
    const sceneElements = lowerChunk.match(/\b(car|building|tree|mountain|ocean|river|bridge|castle|tower)\b/g) || [];
    visualKeywords.push(...sceneElements);
    
    // Style hints based on content
    const styleHints = [];
    if (lowerChunk.includes('ancient') || lowerChunk.includes('medieval') || lowerChunk.includes('historical')) {
      styleHints.push('historical');
    }
    if (lowerChunk.includes('modern') || lowerChunk.includes('contemporary') || lowerChunk.includes('today')) {
      styleHints.push('contemporary');
    }
    if (lowerChunk.includes('fantasy') || lowerChunk.includes('magical') || lowerChunk.includes('mystical')) {
      styleHints.push('fantasy');
    }
    if (lowerChunk.includes('realistic') || lowerChunk.includes('real') || lowerChunk.includes('actual')) {
      styleHints.push('photorealistic');
    }
    
    // Default style hints if none found
    if (styleHints.length === 0) {
      styleHints.push('cinematic', 'detailed');
    }
    
    return {
      fullDescription: `Scene: ${contextParts.join(', ')}.`,
      visualKeywords: visualKeywords.filter((keyword, index, arr) => arr.indexOf(keyword) === index), // Remove duplicates
      setting: setting || 'general scene',
      lighting: lighting,
      mood: mood,
      characters: characters || 'no specific characters',
      styleHints: styleHints,
      sceneContext: sceneContext
    };
  }

  /**
   * Calculate the expected number of images and estimated processing time
   * @param {Object} params - Generation parameters
   * @returns {Object} Estimation data
   */
  estimateGeneration({ script, duration, maxImagesPerMin = 4, audioDuration }) {
    // ✅ FIX: Use audio duration if provided (more accurate than script duration)
    const effectiveDuration = audioDuration && audioDuration > 0 ? audioDuration : duration;
    console.log(`⏱️ Estimation using effective duration: ${effectiveDuration}s (audio: ${audioDuration}s, script: ${duration}s)`);
    
    // Calculate target number of scenes based on maxImagesPerMin constraint
    const maxTotalImages = Math.floor((effectiveDuration / 60) * maxImagesPerMin);
    const targetScenes = Math.min(maxTotalImages, 12); // Hard cap at 12 images
    
    console.log(`🎯 Estimation target scenes: ${targetScenes} (${maxImagesPerMin} images/min for ${effectiveDuration}s, capped at 12)`);
    
    const averageSceneDuration = targetScenes > 0 ? Math.round((effectiveDuration / targetScenes) * 10) / 10 : 0;
    
    // Estimate processing time (scene generation + image generation)
    const sceneGenerationTime = 8; // ~8 seconds for OpenAI scene analysis
    const imageGenerationTime = targetScenes * 4.5; // Average 4.5 seconds per image
    const estimatedTimeSeconds = sceneGenerationTime + imageGenerationTime;
    
    return {
      expectedImages: targetScenes,
      estimatedProcessingTime: {
        seconds: Math.round(estimatedTimeSeconds),
        minutes: Math.round(estimatedTimeSeconds / 60 * 10) / 10,
        formatted: `${Math.floor(estimatedTimeSeconds / 60)}:${String(Math.round(estimatedTimeSeconds % 60)).padStart(2, '0')}`
      },
      sceneTiming: {
        totalScenes: targetScenes,
        averageSceneDuration: averageSceneDuration,
        effectiveDuration: effectiveDuration,
        maxImagesPerMin: maxImagesPerMin
      },
      breakdown: {
        sceneGeneration: `${sceneGenerationTime}s`,
        imageGeneration: `${Math.round(imageGenerationTime)}s`,
        total: `${Math.round(estimatedTimeSeconds)}s`
      }
    };
  }
}

module.exports = ScriptToImagesService;

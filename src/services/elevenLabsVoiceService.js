const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ElevenLabsVoiceService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    this.cacheDir = path.join(__dirname, '../../cache/voices');
    this.audioCacheDir = path.join(__dirname, '../../cache/audio');
    this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 hours
    this.initialized = false;
    
    // Initialize cache directories (async but non-blocking)
    this.initializeCacheDirectories().catch(error => {
      console.error('Failed to create cache directories:', error);
    });
  }

  async initializeCacheDirectories() {
    try {
      const fsSync = require('fs');
      
      // Use synchronous methods to ensure directories exist
      if (!fsSync.existsSync(this.cacheDir)) {
        fsSync.mkdirSync(this.cacheDir, { recursive: true });
      }
      if (!fsSync.existsSync(this.audioCacheDir)) {
        fsSync.mkdirSync(this.audioCacheDir, { recursive: true });
      }
      
      this.initialized = true;
      console.log('ElevenLabs cache directories initialized');
    } catch (error) {
      console.error('Failed to create cache directories:', error);
    }
  }

  /**
   * Get all available voices with caching
   */
  async getVoices() {
    try {
      const cacheFile = path.join(this.cacheDir, 'voices.json');
      
      // Check if cache exists and is not expired
      try {
        const stats = await fs.stat(cacheFile);
        const isExpired = Date.now() - stats.mtime.getTime() > this.cacheTimeout;
        
        if (!isExpired) {
          const cachedData = await fs.readFile(cacheFile, 'utf8');
          const voices = JSON.parse(cachedData);
          console.log('✅ Voices loaded from cache');
          return this.processVoices(voices);
        }
      } catch (error) {
        // Cache doesn't exist or is corrupted, fetch fresh data
      }

      // Fetch fresh data from API
      console.log('🔄 Fetching voices from ElevenLabs API...');
      const response = await axios.get(`${this.baseUrl}/voices`, {
        headers: {
          'xi-api-key': this.apiKey
        }
      });

      const voices = response.data.voices || [];
      
      // Cache the data
      await fs.writeFile(cacheFile, JSON.stringify(voices, null, 2));
      console.log(`✅ Cached ${voices.length} voices`);
      
      return this.processVoices(voices);
    } catch (error) {
      console.error('Failed to fetch voices:', error.message);
      
      // Return fallback voices if API fails
      return this.getFallbackVoices();
    }
  }

  /**
   * Process raw voice data to frontend format (V3 compatible voices only)
   */
  processVoices(rawVoices) {
    // Filter for V3 compatible voices
    const v3CompatibleVoices = rawVoices.filter(voice => this.isV3Compatible(voice));
    
    return v3CompatibleVoices.map(voice => ({
      id: voice.voice_id,
      name: voice.name,
      description: voice.description || 'Professional AI voice',
      gender: voice.labels?.gender || 'neutral',
      accent: voice.labels?.accent || 'American',
      age: voice.labels?.age || 'adult',
      category: voice.category || 'professional',
      preview_url: voice.preview_url,
      avatar: this.generateRealAvatar(voice),
      useCases: this.extractUseCases(voice),
      sampleText: this.generateSampleText(voice),
      settings: voice.settings || {
        stability: 0.75,
        similarity_boost: 0.75,
        style: 0,
        use_speaker_boost: true
      },
      labels: voice.labels,
      isOwner: voice.is_owner || false,
      availableForTiers: voice.available_for_tiers || [],
      samples: voice.samples || [],
      fine_tuning: voice.fine_tuning,
      sharing: voice.sharing,
      v3Compatible: true // Mark as V3 compatible
    }));
  }

  /**
   * Check if a voice is compatible with ElevenLabs V3
   */
  isV3Compatible(voice) {
    // V3 compatible models/voices typically have specific model support
    const v3Models = [
      'eleven_multilingual_v2',
      'eleven_turbo_v2_5', 
      'eleven_flash_v2_5',
      'eleven_v2_flash',
      'eleven_v2_5_flash',
      'eleven_turbo_v2',
      'eleven_flash_v2'
    ];
    
    // Check if voice supports any V3 models in fine_tuning state
    if (voice.fine_tuning?.state) {
      const supportedModels = Object.keys(voice.fine_tuning.state);
      const hasV3Model = supportedModels.some(model => v3Models.includes(model));
      if (hasV3Model) return true;
    }
    
    // Check if voice has high_quality_base_model_ids that include V3 models
    if (voice.high_quality_base_model_ids) {
      const hasV3Model = voice.high_quality_base_model_ids.some(model => v3Models.includes(model));
      if (hasV3Model) return true;
    }
    
    // Include all premade voices (they generally support latest features)
    if (voice.category === 'premade') {
      return true;
    }
    
    // Include professional voices that are verified
    if (voice.category === 'professional' && voice.voice_verification?.is_verified) {
      return true;
    }
    
    return false;
  }

  /**
   * Generate realistic avatar for voice based on gender, age, and accent
   */
  generateRealAvatar(voice) {
    const gender = voice.labels?.gender || 'neutral';
    const age = voice.labels?.age || 'adult';
    const accent = voice.labels?.accent || 'american';
    const name = voice.name || 'Voice';
    
    // Create a stable seed for consistent avatars
    const seed = `${name}-${gender}-${age}-${accent}`;
    
    // Return an object with multiple avatar options for fallback
    return {
      primary: this.generateDiceBearAvatar(seed, gender, age),
      fallback: this.generateUiAvatarsAvatar(name, gender),
      initials: this.generateInitialsAvatar(name),
      robohash: this.generateRobohashAvatar(seed)
    };
  }

  /**
   * Generate DiceBear avatar (primary option)
   */
  generateDiceBearAvatar(seed, gender, age) {
    try {
      // Use more reliable DiceBear styles that are less likely to have 400 errors
      const styles = ['adventurer', 'avataaars', 'big-smile', 'bottts-neutral', 'fun-emoji'];
      const style = styles[Math.abs(this.hashCode(seed)) % styles.length];
      
      let avatarUrl = `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
      
      // Add style-specific customizations
      if (style === 'adventurer' || style === 'avataaars') {
        if (gender === 'female') {
          avatarUrl += '&hairColor=brown,black,blonde,auburn&eyesColor=brown,blue,green';
        } else if (gender === 'male') {
          avatarUrl += '&hairColor=brown,black,gray&eyesColor=brown,blue,green';
        }
      }
      
      return avatarUrl;
    } catch (error) {
      console.warn('Failed to generate DiceBear avatar:', error);
      return null;
    }
  }

  /**
   * Generate UI Avatars as fallback
   */
  generateUiAvatarsAvatar(name, gender) {
    try {
      const cleanName = name.replace(/[^a-zA-Z\s]/g, '').trim();
      const initials = cleanName.split(' ').map(word => word.charAt(0)).join('').toUpperCase().slice(0, 2);
      
      // Gender-based color schemes
      const colors = gender === 'female' 
        ? ['FF6B9D', 'A8E6CF', 'FFD93D', 'FF8C94', 'B8A9FF']
        : ['4ECDC4', '556B2F', '6A5ACD', '20B2AA', '4682B4'];
      
      const color = colors[Math.abs(this.hashCode(name)) % colors.length];
      
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${color}&color=ffffff&size=128&font-size=0.6&rounded=true&format=svg`;
    } catch (error) {
      console.warn('Failed to generate UI Avatars avatar:', error);
      return null;
    }
  }

  /**
   * Generate simple initials avatar
   */
  generateInitialsAvatar(name) {
    const cleanName = name.replace(/[^a-zA-Z\s]/g, '').trim();
    return cleanName.split(' ').map(word => word.charAt(0)).join('').toUpperCase().slice(0, 2) || 'AI';
  }

  /**
   * Generate Robohash avatar as creative fallback
   */
  generateRobohashAvatar(seed) {
    try {
      return `https://robohash.org/${encodeURIComponent(seed)}.png?size=128x128&set=set1`;
    } catch (error) {
      console.warn('Failed to generate Robohash avatar:', error);
      return null;
    }
  }

  /**
   * Simple hash function for consistent pseudo-random selection
   */
  hashCode(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  /**
   * Extract use cases from voice data
   */
  /**
   * Extract use cases from voice data
   */
  extractUseCases(voice) {
    const useCases = [];
    
    // Primary use case from labels
    if (voice.labels?.use_case) {
      useCases.push(this.capitalizeFirst(voice.labels.use_case));
    }
    
    // Category
    if (voice.category) {
      useCases.push(this.capitalizeFirst(voice.category));
    }
    
    // Derive use cases from description and characteristics
    const description = (voice.labels?.description || '').toLowerCase();
    const accent = (voice.labels?.accent || '').toLowerCase();
    const age = (voice.labels?.age || '').toLowerCase();
    
    // Age-based use cases
    if (age === 'young') useCases.push('Social Media', 'Gaming');
    if (age === 'middle-aged') useCases.push('Professional', 'Business');
    if (age === 'old') useCases.push('Wisdom', 'Documentary');
    
    // Description-based use cases
    if (description.includes('calm') || description.includes('soothing')) useCases.push('Meditation');
    if (description.includes('energetic') || description.includes('upbeat')) useCases.push('Advertising');
    if (description.includes('authoritative') || description.includes('confident')) useCases.push('Corporate');
    if (description.includes('warm') || description.includes('friendly')) useCases.push('Conversational');
    if (description.includes('dramatic') || description.includes('expressive')) useCases.push('Storytelling');
    if (description.includes('clear') || description.includes('precise')) useCases.push('Education');
    
    // Accent-based use cases
    if (accent.includes('british')) useCases.push('Sophisticated');
    if (accent.includes('american')) useCases.push('Versatile');
    if (accent.includes('australian')) useCases.push('Casual');
    
    // Default use cases if none found
    if (useCases.length === 0) {
      useCases.push('General', 'Versatile');
    }
    
    return [...new Set(useCases)].slice(0, 4); // Limit to 4 unique use cases
  }

  /**
   * Generate sample text based on voice characteristics
   */
  generateSampleText(voice) {
    const name = voice.name;
    const description = voice.labels?.description || '';
    const useCase = voice.labels?.use_case || '';
    
    const templates = {
      'social media': `Hey there! I'm ${name}, and I'm here to bring your social content to life with energy and personality.`,
      'professional': `Welcome to ${name}'s professional voice service. I deliver clear, authoritative narration for your business needs.`,
      'storytelling': `Once upon a time, ${name} discovered the power of storytelling through voice. Let me bring your tales to life.`,
      'meditation': `Take a deep breath and relax. I'm ${name}, here to guide you through peaceful moments of mindfulness.`,
      'default': `Hello, I'm ${name}. ${voice.description || 'I\'m here to help bring your content to life with professional voice narration.'}`
    };
    
    return templates[useCase.toLowerCase()] || templates['default'];
  }

  /**
   * Get voice sample audio with caching
   */
  async getVoiceSample(voiceId) {
    try {
      const cacheKey = crypto.createHash('md5').update(`${voiceId}`).digest('hex');
      const cacheFile = path.join(this.audioCacheDir, `${cacheKey}.mp3`);
      
      // Check if audio cache exists and is not expired
      try {
        const stats = await fs.stat(cacheFile);
        const isExpired = Date.now() - stats.mtime.getTime() > this.cacheTimeout;
        
        if (!isExpired) {
          console.log(`✅ Audio sample served from cache: ${voiceId}`);
          return {
            success: true,
            filePath: cacheFile,
            fromCache: true
          };
        }
      } catch (error) {
        // Cache doesn't exist or is corrupted, fetch fresh data
      }

      console.log(`🔄 Fetching voice sample for ${voiceId}...`);

      // First, try to get the voice details which includes preview_url
      const voiceResponse = await axios.get(`${this.baseUrl}/voices/${voiceId}`, {
        headers: {
          'xi-api-key': this.apiKey
        }
      });

      const voice = voiceResponse.data;
      let audioData = null;
      
      // Method 1: Use preview_url if available
      if (voice.preview_url) {
        console.log(`📥 Using preview URL for ${voiceId}`);
        try {
          const audioResponse = await axios.get(voice.preview_url, {
            responseType: 'arraybuffer',
            timeout: 10000
          });
          audioData = audioResponse.data;
        } catch (error) {
          console.log(`Preview URL failed for ${voiceId}, trying samples...`);
        }
      }
      
      // Method 2: Use samples if preview_url failed or doesn't exist
      if (!audioData && voice.samples && voice.samples.length > 0) {
        const sampleId = voice.samples[0].sample_id;
        console.log(`📥 Using sample ${sampleId} for ${voiceId}`);
        
        try {
          const sampleResponse = await axios.get(`${this.baseUrl}/voices/${voiceId}/samples/${sampleId}/audio`, {
            headers: {
              'xi-api-key': this.apiKey
            },
            responseType: 'arraybuffer',
            timeout: 10000
          });
          audioData = sampleResponse.data;
        } catch (error) {
          console.log(`Sample API failed for ${voiceId}:`, error.message);
        }
      }
      
      // Method 3: Generate a quick sample using TTS
      if (!audioData) {
        console.log(`📥 Generating sample audio for ${voiceId}`);
        try {
          const sampleText = "Hello, this is a voice sample.";
          const ttsResponse = await axios.post(`${this.baseUrl}/text-to-speech/${voiceId}`, {
            text: sampleText,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.5
            }
          }, {
            headers: {
              'xi-api-key': this.apiKey,
              'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer',
            timeout: 15000
          });
          audioData = ttsResponse.data;
        } catch (error) {
          console.log(`TTS generation failed for ${voiceId}:`, error.message);
        }
      }
      
      if (!audioData) {
        throw new Error('No audio sample could be obtained for this voice');
      }
      
      // Save to cache
      await fs.writeFile(cacheFile, audioData);
      console.log(`✅ Audio sample cached: ${voiceId}`);
      
      return {
        success: true,
        filePath: cacheFile,
        fromCache: false
      };
      
    } catch (error) {
      console.error(`Failed to get voice sample for ${voiceId}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get fallback voices when API is unavailable
   */
  getFallbackVoices() {
    return [
      {
        id: 'fallback-sarah',
        name: 'Sarah',
        description: 'Warm and professional voice perfect for business content',
        gender: 'female',
        accent: 'American',
        category: 'professional',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah&backgroundColor=fecaca',
        useCases: ['Business', 'Professional', 'Education'],
        sampleText: 'Welcome to StoryMaker, where your ideas come to life through professional voice narration.',
        preview_url: null
      },
      {
        id: 'fallback-chris',
        name: 'Chris',
        description: 'Natural and clear voice ideal for narration',
        gender: 'male',
        accent: 'American',
        category: 'professional',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Chris&backgroundColor=ddd6fe',
        useCases: ['Narration', 'Documentaries', 'Audiobooks'],
        sampleText: 'In a world where stories matter, every voice has the power to captivate and inspire.',
        preview_url: null
      }
    ];
  }

  /**
   * Utility function to capitalize first letter
   */
  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Clear cache (useful for debugging or forced refresh)
   */
  async clearCache() {
    try {
      const files = await fs.readdir(this.cacheDir);
      for (const file of files) {
        await fs.unlink(path.join(this.cacheDir, file));
      }
      
      const audioFiles = await fs.readdir(this.audioCacheDir);
      for (const file of audioFiles) {
        await fs.unlink(path.join(this.audioCacheDir, file));
      }
      
      console.log('✅ ElevenLabs cache cleared');
      return true;
    } catch (error) {
      console.error('Failed to clear cache:', error);
      return false;
    }
  }
}

module.exports = ElevenLabsVoiceService;

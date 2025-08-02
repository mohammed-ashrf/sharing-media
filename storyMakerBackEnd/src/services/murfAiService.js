const axios = require('axios');
const fs = require('fs');
const path = require('path');

class MurfAiService {
  constructor() {
    // Murf AI API configuration
    this.baseUrl = 'https://api.murf.ai/v1';
    this.apiKey = null;
    this.client = null;
    
    // Initialize API connection
    this.initializeApiConnection();
  }

  /**
   * Initialize API connection with environment variables
   */
  initializeApiConnection() {
    // Get API key from environment
    this.apiKey = process.env.MURF_API_KEY;
    
    // Debug logging for environment variables
    console.log('🔍 Environment Debug:');
    console.log('  - NODE_ENV:', process.env.NODE_ENV);
    console.log('  - MURF_API_KEY present:', !!this.apiKey);
    console.log('  - MURF_API_KEY length:', this.apiKey ? this.apiKey.length : 'N/A');
    
    // Validate API key
    if (!this.apiKey) {
      console.error('❌ MURF_API_KEY not found in environment variables');
      console.error('Available env vars:', Object.keys(process.env).filter(key => key.includes('MURF')));
      return;
    }

    if (this.apiKey.length < 10) {
      console.error('❌ MURF_API_KEY appears to be invalid (too short)');
      return;
    }
    
    // Debug logging
    console.log('✅ MurfAiService initialized with API key:', `${this.apiKey.substring(0, 10)}...`);
    
    // Configure axios instance for Murf AI API
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 60000 // 60 second timeout for voice generation
    });

    // Add request interceptor for debugging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`🌐 Murf AI API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for debugging
    this.client.interceptors.response.use(
      (response) => {
        console.log(`✅ Murf AI API Response: ${response.status} ${response.statusText}`);
        return response;
      },
      (error) => {
        console.error('❌ Murf AI API Error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Ensure API connection is ready
   */
  ensureApiReady() {
    if (!this.apiKey || !this.client) {
      console.log('🔄 Re-initializing Murf AI API connection...');
      this.initializeApiConnection();
    }

    if (!this.apiKey) {
      throw new Error('Murf AI API key is not configured. Please check your environment variables.');
    }

    if (!this.client) {
      throw new Error('Murf AI API client is not initialized.');
    }
  }

  /**
   * Get all available voices from Murf AI
   * @returns {Promise<Array>} List of available voices
   */
  async getVoices() {
    try {
      this.ensureApiReady();

      const response = await this.client.get('/speech/voices');
      const voices = response.data;
      
      // Format voices for frontend consumption
      const formattedVoices = voices.map(voice => ({
        id: voice.voiceId,
        name: voice.displayName || voice.voiceId,
        description: voice.description || 'Professional AI voice',
        gender: voice.gender || 'neutral',
        accent: voice.accent || 'neutral',
        category: voice.category || 'standard',
        language: voice.locale || 'en-US',
        sampleRate: 24000,
        styles: voice.availableStyles || [],
        supportedLocales: voice.supportedLocales || {},
        displayLanguage: voice.displayLanguage || 'English',
        avatar: {
          primary: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(voice.displayName || voice.voiceId)}&backgroundColor=4f46e5,7c3aed,db2777,dc2626,ea580c,d97706,ca8a04&radius=50`,
          fallback: `https://ui-avatars.com/api/?name=${encodeURIComponent((voice.displayName || voice.voiceId).substring(0, 2))}&background=${voice.gender === 'Male' ? '3B82F6' : 'EC4899'}&color=ffffff&size=128&font-size=0.6&rounded=true&format=svg`,
          initials: (voice.displayName || voice.voiceId).substring(0, 2).toUpperCase(),
          robohash: `https://robohash.org/${encodeURIComponent(voice.voiceId)}.png?size=128x128&set=set4&bgset=bg1`
        }
      }));

      console.log(`✅ Retrieved ${formattedVoices.length} voices from Murf AI`);
      return formattedVoices;
    } catch (error) {
      console.error('Error fetching voices from Murf AI:', error.message);
      
      if (error.response?.status === 401) {
        console.warn('❌ Murf AI API authentication failed, returning mock voices');
      } else {
        console.warn('❌ Murf AI API error, returning mock voices');
      }
      
      // Fallback to mock data if API fails
      return this.getMockVoices();
    }
  }

  /**
   * Get mock voices as fallback
   * @returns {Array} Mock voice data
   */
  getMockVoices() {
    return [
      { 
        id: 'en-US-aria', 
        name: 'Aria', 
        gender: 'female', 
        accent: 'American', 
        description: 'Warm and engaging female voice', 
        category: 'standard',
        language: 'en-US',
        styles: ['conversational', 'narrative'],
        avatar: {
          primary: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Aria&backgroundColor=ec4899&radius=50',
          fallback: 'https://ui-avatars.com/api/?name=AR&background=EC4899&color=ffffff&size=128&font-size=0.6&rounded=true&format=svg',
          initials: 'AR',
          robohash: 'https://robohash.org/aria-female.png?size=128x128&set=set4&bgset=bg1'
        }
      },
      { 
        id: 'en-US-davis', 
        name: 'Davis', 
        gender: 'male', 
        accent: 'American', 
        description: 'Professional male voice', 
        category: 'standard',
        language: 'en-US',
        styles: ['professional', 'narrative'],
        avatar: {
          primary: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Davis&backgroundColor=3b82f6&radius=50',
          fallback: 'https://ui-avatars.com/api/?name=DA&background=3B82F6&color=ffffff&size=128&font-size=0.6&rounded=true&format=svg',
          initials: 'DA',
          robohash: 'https://robohash.org/davis-male.png?size=128x128&set=set4&bgset=bg1'
        }
      },
      { 
        id: 'en-US-jane', 
        name: 'Jane', 
        gender: 'female', 
        accent: 'American', 
        description: 'Clear and articulate female voice', 
        category: 'standard',
        language: 'en-US',
        styles: ['clear', 'educational'],
        avatar: {
          primary: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Jane&backgroundColor=10b981&radius=50',
          fallback: 'https://ui-avatars.com/api/?name=JA&background=10B981&color=ffffff&size=128&font-size=0.6&rounded=true&format=svg',
          initials: 'JA',
          robohash: 'https://robohash.org/jane-female.png?size=128x128&set=set4&bgset=bg1'
        }
      },
      { 
        id: 'en-US-jason', 
        name: 'Jason', 
        gender: 'male', 
        accent: 'American', 
        description: 'Friendly male voice', 
        category: 'standard',
        language: 'en-US',
        styles: ['friendly', 'conversational'],
        avatar: {
          primary: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Jason&backgroundColor=f59e0b&radius=50',
          fallback: 'https://ui-avatars.com/api/?name=JA&background=F59E0B&color=ffffff&size=128&font-size=0.6&rounded=true&format=svg',
          initials: 'JA',
          robohash: 'https://robohash.org/jason-male.png?size=128x128&set=set4&bgset=bg1'
        }
      }
    ];
  }

  /**
   * Get voice by ID from Murf AI
   * @param {string} voiceId - Voice ID
   * @returns {Promise<Object>} Voice details
   */
  async getVoiceById(voiceId) {
    try {
      this.ensureApiReady();

      // Get all voices and find the specific one
      const voices = await this.getVoices();
      const voice = voices.find(v => v.id === voiceId);
      
      if (!voice) {
        throw new Error(`Voice ${voiceId} not found`);
      }
      
      return voice;
    } catch (error) {
      console.error(`Error fetching voice ${voiceId} from Murf AI:`, error.message);
      throw new Error(`Voice ${voiceId} not found`);
    }
  }

  /**
   * Generate speech using Murf AI
   * @param {Object} options - Generation options
   * @param {string} options.text - Text to convert to speech
   * @param {string} options.voiceId - Voice ID to use
   * @param {Object} options.voiceSettings - Voice settings (speed, pitch, etc.)
   * @returns {Promise<Buffer>} Audio buffer
   */
  async generateSpeech(options) {
    try {
      this.ensureApiReady();

      const { text, voiceId, voiceSettings = {} } = options;

      // Validate inputs
      if (!text || text.trim().length === 0) {
        throw new Error('Text is required for speech generation');
      }

      if (!voiceId) {
        throw new Error('Voice ID is required for speech generation');
      }

      // Prepare request payload according to Murf AI API spec
      const payload = {
        text: text,
        voiceId: voiceId
      };

      console.log('🎙️ Generating speech with Murf AI:', {
        voiceId,
        textLength: text.length,
        payload
      });

      // Make request to Murf AI
      const response = await this.client.post('/speech/generate', payload);

      // Check if response contains audioFile URL
      if (response.data && response.data.audioFile) {
        // Download the audio file from the URL
        const audioResponse = await axios.get(response.data.audioFile, {
          responseType: 'arraybuffer'
        });
        
        const audioBuffer = Buffer.from(audioResponse.data);
        
        if (!audioBuffer || audioBuffer.length === 0) {
          throw new Error('No audio data received from Murf AI');
        }

        console.log(`✅ Speech generation successful: ${audioBuffer.length} bytes`);
        return audioBuffer;
      } else {
        throw new Error('Invalid response from Murf AI - no audioFile URL provided');
      }

    } catch (error) {
      console.error('❌ Murf AI speech generation error:', error.message);
      
      if (error.response?.status === 401) {
        throw new Error('Murf AI API authentication failed. Please check your API key.');
      } else if (error.response?.status === 402) {
        throw new Error('Murf AI quota exceeded. Please upgrade your plan or try shorter text.');
      } else if (error.response?.status === 429) {
        throw new Error('Murf AI rate limit exceeded. Please try again in a moment.');
      } else if (error.response?.status === 400) {
        throw new Error(`Murf AI request error: ${error.response?.data?.message || 'Bad request'}`);
      } else {
        throw new Error(`Murf AI speech generation failed: ${error.message}`);
      }
    }
  }

  /**
   * Validate and clean voice settings
   * @param {Object} settings - Raw voice settings
   * @returns {Object} Validated settings
   */
  validateVoiceSettings(settings = {}) {
    const validated = {};

    // Speed (0.5 to 2.0)
    if (settings.speed !== undefined) {
      validated.speed = Math.max(0.5, Math.min(2.0, parseFloat(settings.speed) || 1.0));
    }

    // Pitch (-12 to +12 semitones)
    if (settings.pitch !== undefined) {
      validated.pitch = Math.max(-12, Math.min(12, parseFloat(settings.pitch) || 0));
    }

    // Volume (0.0 to 1.0)
    if (settings.volume !== undefined) {
      validated.volume = Math.max(0.0, Math.min(1.0, parseFloat(settings.volume) || 1.0));
    }

    // Style (if supported by voice)
    if (settings.style && typeof settings.style === 'string') {
      validated.style = settings.style;
    }

    // Pronunciation (for custom pronunciations)
    if (settings.pronunciation && Array.isArray(settings.pronunciation)) {
      validated.pronunciation = settings.pronunciation;
    }

    return validated;
  }

  /**
   * Save audio buffer to file
   * @param {Buffer} audioBuffer - Audio data
   * @param {string} filename - Output filename
   * @returns {Promise<string>} File path
   */
  async saveAudioFile(audioBuffer, filename) {
    try {
      // Ensure uploads directory exists
      const uploadsDir = path.join(process.cwd(), 'uploads', 'audio');
      
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      // Write file
      const filePath = path.join(uploadsDir, filename);
      await fs.promises.writeFile(filePath, audioBuffer);

      console.log(`💾 Audio file saved: ${filename} (${audioBuffer.length} bytes)`);
      return filePath;
    } catch (error) {
      console.error('❌ Error saving audio file:', error.message);
      throw new Error(`Failed to save audio file: ${error.message}`);
    }
  }

  /**
   * Get subscription information (if supported by Murf AI)
   * @returns {Promise<Object>} Subscription details
   */
  async getSubscriptionInfo() {
    try {
      this.ensureApiReady();

      const response = await this.client.get('/account/subscription');
      return response.data;
    } catch (error) {
      console.error('Error fetching Murf AI subscription info:', error.message);
      
      // Return mock subscription data if API doesn't support it
      return {
        plan: 'standard',
        charactersUsed: 0,
        charactersLimit: 10000,
        charactersRemaining: 10000,
        resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };
    }
  }

  /**
   * Clone voice (if supported by Murf AI)
   * @param {Object} options - Cloning options
   * @returns {Promise<Object>} Cloned voice details
   */
  async cloneVoice(options) {
    throw new Error('Voice cloning is not currently supported with Murf AI integration');
  }
}

module.exports = MurfAiService;

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class VoiceService {
  constructor() {
    // ElevenLabs API configuration - ensure fresh env vars
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    this.defaultModel = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2'; // Use the universal model
    this.defaultVoiceId = process.env.ELEVENLABS_VOICE_ID || 'ErXwobaYiN019PkySvjV'; // Antoni voice
    
    // Initialize without API key first
    this.apiKey = null;
    this.client = null;
    
    // Initialize API connection
    this.initializeApiConnection();
  }

  /**
   * Initialize API connection with fresh environment variables
   */
  initializeApiConnection() {
    // Get fresh API key from environment
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    
    // Validate API key
    if (!this.apiKey) {
      console.error('❌ ELEVENLABS_API_KEY not found in environment variables');
      console.error('Available env vars:', Object.keys(process.env).filter(key => key.includes('ELEVEN')));
      return;
    }

    if (this.apiKey.length < 10) {
      console.error('❌ ELEVENLABS_API_KEY appears to be invalid (too short)');
      return;
    }
    
    // Debug logging
    console.log('✅ VoiceService initialized with API key:', `${this.apiKey.substring(0, 10)}...`);
    console.log('🔧 Using model:', this.defaultModel);
    console.log('🎙️ Default voice:', this.defaultVoiceId);
    
    // Configure axios instance for ElevenLabs API
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    // Add request interceptor for debugging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`🌐 ElevenLabs API Request: ${config.method?.toUpperCase()} ${config.url}`);
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
        console.log(`✅ ElevenLabs API Response: ${response.status} ${response.statusText}`);
        return response;
      },
      (error) => {
        console.error('❌ ElevenLabs API Error:', {
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
      console.log('🔄 Re-initializing API connection...');
      this.initializeApiConnection();
    }

    if (!this.apiKey) {
      throw new Error('ElevenLabs API key is not configured. Please check your environment variables.');
    }

    if (!this.client) {
      throw new Error('ElevenLabs API client is not initialized.');
    }
  }

  /**
   * Get all available voices from ElevenLabs
   * @returns {Promise<Array>} List of available voices
   */
  async getVoices() {
    try {
      // Ensure API is ready
      this.ensureApiReady();

      const response = await this.client.get('/voices');
      const { voices } = response.data;
      
      // Format voices for frontend consumption
      const formattedVoices = voices.map(voice => ({
        id: voice.voice_id,
        name: voice.name,
        description: voice.description || 'Professional AI voice',
        gender: this.determineGender(voice.labels || {}),
        accent: this.determineAccent(voice.labels || {}),
        category: voice.category || 'premade',
        preview_url: voice.preview_url || null,
        settings: voice.settings || null
      }));

      console.log(`✅ Retrieved ${formattedVoices.length} voices from ElevenLabs`);
      return formattedVoices;
    } catch (error) {
      console.error('Error fetching voices from ElevenLabs:', error.message);
      
      if (error.response?.status === 401) {
        console.warn('❌ ElevenLabs API authentication failed, returning mock voices');
      } else {
        console.warn('❌ ElevenLabs API error, returning mock voices');
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
      { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'male', accent: 'American', description: 'Storytelling voice', category: 'premade' },
      { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', gender: 'female', accent: 'American', description: 'Warm and friendly', category: 'premade' },
      { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'male', accent: 'American', description: 'Professional and clear', category: 'premade' },
      { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', gender: 'female', accent: 'American', description: 'Young and energetic', category: 'premade' },
      { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', gender: 'male', accent: 'American', description: 'Deep and authoritative', category: 'premade' },
      { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'female', accent: 'American', description: 'Calm and soothing', category: 'premade' },
      { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', gender: 'male', accent: 'American', description: 'Casual and friendly', category: 'premade' }
    ];
  }

  /**
   * Generate speech from text using ElevenLabs
   * @param {Object} options - Voice generation options
   * @returns {Promise<Buffer>} Audio buffer
   */
  async generateSpeech(options) {
    const {
      text,
      voiceId = this.defaultVoiceId,
      model = this.defaultModel,
      voiceSettings = {}
    } = options;

    console.log('generateSpeech called with:', { 
      textLength: text?.length, 
      voiceId, 
      model, 
      apiKeyPresent: !!this.apiKey 
    });

    try {
      // Validate required parameters
      if (!text || text.trim().length === 0) {
        throw new Error('Text is required for voice generation');
      }

      if (!voiceId) {
        throw new Error('Voice ID is required');
      }

      if (!this.apiKey) {
        console.warn('ElevenLabs API key not configured, returning mock audio');
        // Return a small mock audio buffer (empty MP3 header)
        const mockAudioBuffer = Buffer.from([
          0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        ]);
        return mockAudioBuffer;
      }

      // Prepare voice settings with defaults
      const settings = {
        stability: voiceSettings.stability || 0.5,
        similarity_boost: voiceSettings.similarity || 0.8,
        style: voiceSettings.styleExaggeration || 0.5,
        use_speaker_boost: true
      };

      const requestData = {
        text: text,
        model_id: model,
        voice_settings: settings
      };

      // Log generation attempt
      console.log(`Generating speech with voice ${voiceId} for ${text.length} characters`);

      // Generate audio using REST API
      const response = await this.client.post(`/text-to-speech/${voiceId}`, requestData, {
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      });

      const audioBuffer = Buffer.from(response.data);
      console.log(`Generated audio: ${audioBuffer.length} bytes`);
      return audioBuffer;

    } catch (error) {
      console.error('Error generating speech:', error.message);
      
      if (error.response?.status === 401) {
        // Log the actual ElevenLabs error for debugging
        if (error.response?.data) {
          let errorData;
          try {
            // Handle both string and buffer responses
            if (Buffer.isBuffer(error.response.data)) {
              errorData = JSON.parse(error.response.data.toString());
            } else if (typeof error.response.data === 'string') {
              errorData = JSON.parse(error.response.data);
            } else {
              errorData = error.response.data;
            }
            
            // Check for specific quota/limit errors
            if (errorData.detail && typeof errorData.detail === 'object') {
              if (errorData.detail.status === 'quota_exceeded') {
                const message = errorData.detail.message || '';
                if (message.includes('credits')) {
                  throw new Error(`ElevenLabs quota exceeded: ${message}`);
                } else {
                  throw new Error('ElevenLabs quota exceeded. Please upgrade your plan or try a shorter text.');
                }
              }
              if (errorData.detail.message?.includes('character limit')) {
                throw new Error('Text exceeds ElevenLabs character limit. Please use shorter text.');
              }
              if (errorData.detail.message?.includes('quota') ||
                  errorData.detail.message?.includes('limit')) {
                throw new Error(`ElevenLabs quota exceeded: ${errorData.detail.message}`);
              }
            }
            
            // Generic quota/limit error for 401s
            throw new Error('ElevenLabs quota exceeded or character limit reached. Please try a shorter text or upgrade your plan.');
          } catch (parseError) {
            // If this is already our custom error, re-throw it
            if (parseError.message.includes('ElevenLabs quota exceeded:')) {
              throw parseError;
            }
            console.error('Failed to parse ElevenLabs error response:', parseError);
            throw new Error('ElevenLabs quota exceeded or character limit reached. Please try a shorter text or upgrade your plan.');
          }
        }
        throw new Error('Invalid ElevenLabs API key');
      } else if (error.response?.status === 429) {
        throw new Error('ElevenLabs rate limit exceeded');
      } else if (error.response?.data) {
        throw new Error(`ElevenLabs API error: ${error.response.data.detail || error.message}`);
      }
      
      throw new Error('Failed to generate speech');
    }
  }

  /**
   * Generate speech using ElevenLabs V3 model (expressive)
   * @param {Object} options - Generation options
   * @param {string} options.text - Text to convert to speech
   * @param {string} options.voiceId - ElevenLabs voice ID
   * @param {Object} options.voiceSettings - Voice settings
   * @returns {Promise<Buffer>} Audio buffer
   */
  async generateSpeechV3(options) {
    const { text, voiceId, voiceSettings = {} } = options;

    // Validate inputs
    if (!text || typeof text !== 'string') {
      throw new Error('Text is required and must be a string');
    }

    if (!voiceId) {
      throw new Error('Voice ID is required');
    }

    if (text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    // Ensure API is ready
    try {
      this.ensureApiReady();
    } catch (error) {
      console.error('❌ API initialization failed:', error.message);
      throw new Error(`ElevenLabs API configuration error: ${error.message}`);
    }

    // V3 specific settings with enhanced expressiveness
    const settings = {
      stability: Math.max(0, Math.min(1, voiceSettings.stability || 0.5)),
      similarity_boost: Math.max(0, Math.min(1, voiceSettings.similarity || 0.8)),
      style: Math.max(0, Math.min(1, voiceSettings.styleExaggeration || 0.3)),
      use_speaker_boost: true
    };

    const requestData = {
      text: text.trim(),
      model_id: this.defaultModel,
      voice_settings: settings,
      output_format: 'mp3_44100_128',
      optimize_streaming_latency: 0
    };

    // Log generation attempt
    console.log(`🎙️ Generating V3 speech with voice ${voiceId} for ${text.length} characters`);
    console.log('🔧 Model:', this.defaultModel);
    console.log('⚙️ Settings:', settings);
    console.log('🔑 API Key present:', !!this.apiKey);
    console.log('📤 Text being sent to ElevenLabs:');
    console.log('┌─────────────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ ELEVENLABS INPUT TEXT:                                                              │');
    console.log('└─────────────────────────────────────────────────────────────────────────────────────┘');
    console.log(text);
    console.log('┌─────────────────────────────────────────────────────────────────────────────────────┐');

    try {
      // Generate audio using REST API
      const response = await this.client.post(`/text-to-speech/${voiceId}`, requestData, {
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey // Explicitly include API key
        },
        responseType: 'arraybuffer',
        timeout: 45000 // 45 second timeout for longer texts
      });

      const audioBuffer = Buffer.from(response.data);
      console.log(`✅ Generated V3 audio: ${audioBuffer.length} bytes`);
      
      // Validate audio buffer
      if (audioBuffer.length < 100) {
        throw new Error('Generated audio file is too small, may be corrupted');
      }

      return audioBuffer;

    } catch (error) {
      console.error('❌ ElevenLabs V3 generation error:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        voiceId,
        textLength: text.length
      });
      
      // Handle specific error cases
      if (error.response?.status === 401) {
        // Re-initialize API connection and try once more
        console.log('🔄 401 error - re-initializing API connection...');
        this.initializeApiConnection();
        
        if (!this.apiKey) {
          throw new Error('ElevenLabs API authentication failed. API key is missing or invalid.');
        }
        
        throw new Error('ElevenLabs API authentication failed. Please check your API key and try again.');
      } else if (error.response?.status === 403) {
        let errorMessage = 'Access denied to ElevenLabs resource';
        
        try {
          const errorData = error.response.data;
          let parsedData;
          
          if (Buffer.isBuffer(errorData)) {
            parsedData = JSON.parse(errorData.toString());
          } else if (typeof errorData === 'string') {
            parsedData = JSON.parse(errorData);
          } else {
            parsedData = errorData;
          }
          
          if (parsedData?.detail?.status === 'model_access_denied') {
            errorMessage = `Model access denied. Your account doesn't have access to model '${this.defaultModel}'. Please upgrade your plan or use a different model.`;
          } else if (parsedData?.detail?.message) {
            errorMessage = parsedData.detail.message;
          }
        } catch (parseError) {
          console.error('Could not parse 403 error response:', parseError);
        }
        
        throw new Error(errorMessage);
      } else if (error.response?.status === 400) {
        let errorMessage = 'Invalid request to ElevenLabs API';
        
        try {
          const errorData = error.response.data;
          if (typeof errorData === 'string') {
            errorMessage = errorData;
          } else if (errorData?.detail) {
            if (typeof errorData.detail === 'string') {
              errorMessage = errorData.detail;
            } else if (errorData.detail?.message) {
              errorMessage = errorData.detail.message;
            }
          }
        } catch (parseError) {
          console.error('Could not parse error response:', parseError);
        }
        
        throw new Error(`ElevenLabs API error: ${errorMessage}`);
      } else if (error.response?.status === 429) {
        throw new Error('ElevenLabs API rate limit exceeded. Please wait a moment and try again.');
      } else if (error.response?.status === 422) {
        throw new Error('Voice or text validation failed. Please check your voice ID and ensure text is valid.');
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout. The text may be too long or the service is temporarily slow.');
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new Error('Cannot connect to ElevenLabs API. Please check your internet connection.');
      } else {
        throw new Error(`ElevenLabs API error: ${error.message}`);
      }
    }
  }

  /**
   * Get voice information by ID
   * @param {string} voiceId - Voice ID
   * @returns {Promise<Object>} Voice information
   */
  async getVoiceById(voiceId) {
    try {
      if (!this.apiKey) {
        // Return mock voice if API key not available
        const mockVoices = this.getMockVoices();
        return mockVoices.find(voice => voice.id === voiceId) || null;
      }

      const response = await this.client.get(`/voices/${voiceId}`);
      const voice = response.data;
      
      return {
        id: voice.voice_id,
        name: voice.name,
        description: voice.description || 'Professional AI voice',
        gender: this.determineGender(voice.labels || {}),
        accent: this.determineAccent(voice.labels || {}),
        category: voice.category || 'premade',
        preview_url: voice.preview_url || null,
        settings: voice.settings || null
      };
    } catch (error) {
      console.error('Error fetching voice by ID:', error.message);
      throw new Error('Failed to fetch voice information');
    }
  }

  /**
   * Clone a voice from audio files
   * @param {Object} options - Voice cloning options
   * @returns {Promise<Object>} Cloned voice information
   */
  async cloneVoice(options) {
    const { name, description, audioFiles } = options;

    try {
      if (!this.apiKey) {
        throw new Error('ElevenLabs API key required for voice cloning');
      }

      if (!audioFiles || audioFiles.length === 0) {
        throw new Error('Audio files are required for voice cloning');
      }

      const formData = new FormData();
      formData.append('name', name);
      if (description) {
        formData.append('description', description);
      }

      // Add audio files to form data
      audioFiles.forEach((file, index) => {
        formData.append('files', file, `sample_${index}.wav`);
      });

      const response = await this.client.post('/voices/add', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      return {
        id: response.data.voice_id,
        name: response.data.name,
        description: response.data.description,
        status: 'processing'
      };
    } catch (error) {
      console.error('Error cloning voice:', error.message);
      throw new Error('Failed to clone voice');
    }
  }

  /**
   * Get user's subscription information
   * @returns {Promise<Object>} Subscription details
   */
  async getSubscriptionInfo() {
    try {
      if (!this.apiKey) {
        throw new Error('ElevenLabs API key required');
      }

      const response = await this.client.get('/user/subscription');
      return response.data;
    } catch (error) {
      console.error('Error fetching subscription info:', error.message);
      throw new Error('Failed to fetch subscription information');
    }
  }

  /**
   * Determine gender from voice labels
   * @param {Object} labels - Voice labels
   * @returns {string} Gender
   */
  determineGender(labels) {
    if (labels.gender) {
      return labels.gender.toLowerCase();
    }
    // Default fallback
    return 'neutral';
  }

  /**
   * Determine accent from voice labels
   * @param {Object} labels - Voice labels
   * @returns {string} Accent
   */
  determineAccent(labels) {
    if (labels.accent) {
      return labels.accent;
    }
    if (labels.language) {
      return labels.language;
    }
    // Default fallback
    return 'American';
  }

  /**
   * Save audio buffer to file
   * @param {Buffer} audioBuffer - Audio data
   * @param {string} filename - Output filename
   * @returns {Promise<string>} File path
   */
  async saveAudioFile(audioBuffer, filename) {
    try {
      const uploadDir = path.join(process.cwd(), 'uploads', 'audio');
      
      // Ensure upload directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filePath = path.join(uploadDir, filename);
      fs.writeFileSync(filePath, audioBuffer);
      
      return filePath;
    } catch (error) {
      console.error('Error saving audio file:', error);
      throw new Error('Failed to save audio file');
    }
  }

  /**
   * Validate and normalize voice settings
   * @param {Object} settings - Voice settings
   * @returns {Object} Normalized settings
   */
  validateVoiceSettings(settings) {
    return {
      stability: this.clampValue(settings.stability, 0, 1, 0.5),
      similarity: this.clampValue(settings.similarity, 0, 1, 0.8),
      styleExaggeration: this.clampValue(settings.styleExaggeration, 0, 1, 0.5),
      speed: this.clampValue(settings.speed, 0.5, 2, 1.0)
    };
  }

  /**
   * Clamp value between min and max
   * @param {number} value - Value to clamp
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @param {number} defaultValue - Default if invalid
   * @returns {number} Clamped value
   */
  clampValue(value, min, max, defaultValue) {
    if (typeof value !== 'number' || isNaN(value)) {
      return defaultValue;
    }
    return Math.max(min, Math.min(max, value));
  }
}

// Export class instead of singleton to avoid environment loading issues
module.exports = VoiceService;

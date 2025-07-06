const mongoose = require('mongoose');
const Template = require('../../models/Template');
const User = require('../../models/User');

// Sample templates for different use cases
const sampleTemplates = [
  {
    name: "YouTube Short - Personal Story",
    description: "Perfect template for sharing personal experiences in vertical format",
    category: "Social Media",
    isPublic: true,
    isPremium: false,
    settings: {
      storyStyle: "vertical",
      storyLength: 60,
      storyTopicTemplate: "A personal experience about {{topic}} that changed my perspective",
      characterDetailsTemplate: "{{protagonist}} - a {{age}} year old {{profession}}",
      settingAtmosphereTemplate: "{{location}} with a {{mood}} atmosphere",
      selectedGenre: "Drama",
      selectedFormat: "Short Film",
      selectedNarrative: "First Person",
      selectedAgeGroup: "Young Adults (18-25)",
      language: "English"
    },
    tags: ["youtube", "personal", "vertical", "short"],
    sampleContent: {
      title: "Personal Growth Story",
      description: "Share a transformative personal experience",
      previewText: "A personal experience about overcoming fear that changed my perspective..."
    }
  },
  {
    name: "Business Presentation Story",
    description: "Professional storytelling template for business presentations",
    category: "Business",
    isPublic: true,
    isPremium: false,
    settings: {
      storyStyle: "landscape",
      storyLength: 180,
      storyTopicTemplate: "A business case study about {{company}} solving {{problem}} through {{solution}}",
      characterDetailsTemplate: "{{ceo_name}} - visionary leader of {{company}}",
      settingAtmosphereTemplate: "Corporate environment with {{atmosphere}} energy",
      selectedGenre: "Documentary",
      selectedFormat: "Commercial",
      selectedNarrative: "Third Person",
      selectedAgeGroup: "Adults (26-40)",
      language: "English"
    },
    tags: ["business", "presentation", "corporate", "case-study"],
    sampleContent: {
      title: "Success Story Template",
      description: "Professional business narrative",
      previewText: "A business case study about TechCorp solving customer retention through innovation..."
    }
  },
  {
    name: "Educational Content",
    description: "Template for creating engaging educational stories",
    category: "Education",
    isPublic: true,
    isPremium: false,
    settings: {
      storyStyle: "square",
      storyLength: 120,
      storyTopicTemplate: "An educational story about {{subject}} that explains {{concept}} in simple terms",
      characterDetailsTemplate: "{{teacher_name}} - passionate educator specializing in {{subject}}",
      settingAtmosphereTemplate: "{{learning_environment}} with an encouraging and curious atmosphere",
      selectedGenre: "Educational",
      selectedFormat: "Documentary",
      selectedNarrative: "Narrator",
      selectedAgeGroup: "Teens (13-17)",
      language: "English"
    },
    tags: ["education", "learning", "tutorial", "square"],
    sampleContent: {
      title: "Science Made Simple",
      description: "Educational storytelling template",
      previewText: "An educational story about physics that explains gravity in simple terms..."
    }
  },
  {
    name: "Horror Short Story",
    description: "Spine-chilling template for horror content creators",
    category: "Entertainment",
    isPublic: true,
    isPremium: true,
    settings: {
      storyStyle: "vertical",
      storyLength: 90,
      storyTopicTemplate: "A terrifying encounter with {{supernatural_element}} in {{scary_location}}",
      characterDetailsTemplate: "{{protagonist}} - unsuspecting victim who encounters the unknown",
      settingAtmosphereTemplate: "{{location}} shrouded in darkness with an ominous, threatening presence",
      selectedGenre: "Horror",
      selectedFormat: "Short Film",
      selectedNarrative: "First Person",
      selectedAgeGroup: "Young Adults (18-25)",
      language: "English"
    },
    tags: ["horror", "scary", "supernatural", "thriller"],
    sampleContent: {
      title: "Midnight Terror",
      description: "Spine-chilling horror template",
      previewText: "A terrifying encounter with shadows in an abandoned hospital..."
    }
  },
  {
    name: "Travel Adventure",
    description: "Share amazing travel experiences and adventures",
    category: "Personal",
    isPublic: true,
    isPremium: false,
    settings: {
      storyStyle: "landscape",
      storyLength: 150,
      storyTopicTemplate: "An unforgettable journey to {{destination}} where {{unexpected_event}} happened",
      characterDetailsTemplate: "{{traveler_name}} - adventure seeker exploring {{destination}}",
      settingAtmosphereTemplate: "{{destination}} with breathtaking scenery and {{weather}} conditions",
      selectedGenre: "Adventure",
      selectedFormat: "Documentary",
      selectedNarrative: "First Person",
      selectedAgeGroup: "Adults (26-40)",
      language: "English"
    },
    tags: ["travel", "adventure", "journey", "exploration"],
    sampleContent: {
      title: "Mountain Adventure",
      description: "Epic travel story template",
      previewText: "An unforgettable journey to Nepal where a storm changed everything..."
    }
  },
  {
    name: "Product Launch Story",
    description: "Marketing template for product launches and brand stories",
    category: "Marketing",
    isPublic: true,
    isPremium: true,
    settings: {
      storyStyle: "square",
      storyLength: 75,
      storyTopicTemplate: "The story behind {{product_name}} and how it solves {{customer_problem}}",
      characterDetailsTemplate: "{{founder_name}} - innovative creator of {{product_name}}",
      settingAtmosphereTemplate: "Modern workspace with creative and innovative energy",
      selectedGenre: "Documentary",
      selectedFormat: "Commercial",
      selectedNarrative: "Third Person",
      selectedAgeGroup: "Adults (26-40)",
      language: "English"
    },
    tags: ["marketing", "product", "brand", "launch"],
    sampleContent: {
      title: "Innovation Story",
      description: "Product launch narrative",
      previewText: "The story behind EcoBottle and how it solves plastic waste..."
    }
  }
];

const seedTemplates = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/storymaker');
    console.log('📊 Connected to MongoDB for seeding templates...');

    // Find or create a system user for public templates
    let systemUser = await User.findOne({ email: 'system@storymaker.com' });
    if (!systemUser) {
      systemUser = await User.create({
        firstName: 'System',
        lastName: 'Templates',
        email: 'system@storymaker.com',
        password: 'not-a-real-password',
        role: 'admin',
        isEmailVerified: true,
        isActive: true
      });
      console.log('✅ Created system user for templates');
    }

    // Clear existing templates (optional - uncomment if you want to reset)
    // await Template.deleteMany({ isPublic: true });
    // console.log('🗑️ Cleared existing public templates');

    // Add system user ID to templates
    const templatesWithUserId = sampleTemplates.map(template => ({
      ...template,
      createdBy: systemUser._id
    }));

    // Insert templates (use insertMany with ordered: false to continue on duplicates)
    const result = await Template.insertMany(templatesWithUserId, { 
      ordered: false,
      // This will skip duplicates if they exist
    }).catch(err => {
      if (err.code === 11000) {
        console.log('⚠️ Some templates already exist, skipping duplicates...');
        return { insertedCount: 0 };
      }
      throw err;
    });

    console.log(`✅ Successfully seeded ${result.insertedCount || sampleTemplates.length} templates`);
    
    // Create indexes
    await Template.createIndexes();
    console.log('📊 Created template indexes');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding templates:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  require('dotenv').config({ path: '.env.local' });
  require('dotenv').config();
  seedTemplates();
}

module.exports = { seedTemplates, sampleTemplates };

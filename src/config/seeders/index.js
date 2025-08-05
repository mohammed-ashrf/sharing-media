const { seedTemplates } = require('./templates');

const runAllSeeders = async () => {
  try {
    console.log('🌱 Starting StoryMaker database seeding process...\n');
    
    // Seed templates
    console.log('📋 Seeding templates...');
    await seedTemplates();
    
    console.log('\n✅ All seeders completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  require('dotenv').config({ path: '.env.local' });
  require('dotenv').config();
  runAllSeeders();
}

module.exports = {
  runAllSeeders,
  seedTemplates
};

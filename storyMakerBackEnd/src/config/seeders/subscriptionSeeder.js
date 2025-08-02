const mongoose = require('mongoose');
const User = require('../../models/User');
const Subuser = require('../../models/Subuser');

// Sample data for testing subscription system
const sampleUsers = [
  {
    firstName: 'John',
    lastName: 'Standard',
    email: 'john.standard@example.com',
    password: 'password123',
    isEmailVerified: true,
    subscription: {
      plan: 'standard',
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      credits: {
        total: 100000,
        used: 5000,
        remaining: 95000
      },
      features: {
        pcLicenses: 1,
        multiUserAccess: 0,
        canConnectOwnAPI: false
      }
    }
  },
  {
    firstName: 'Jane',
    lastName: 'Pro',
    email: 'jane.pro@example.com',
    password: 'password123',
    isEmailVerified: true,
    subscription: {
      plan: 'pro',
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      credits: {
        total: 1000000,
        used: 25000,
        remaining: 975000
      },
      features: {
        pcLicenses: 5,
        multiUserAccess: 0,
        canConnectOwnAPI: false
      }
    }
  },
  {
    firstName: 'Bob',
    lastName: 'Business',
    email: 'bob.business@example.com',
    password: 'password123',
    isEmailVerified: true,
    subscription: {
      plan: 'business_standard',
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      credits: {
        total: 0, // Unlimited with own API
        used: 0,
        remaining: 0
      },
      features: {
        pcLicenses: 100,
        multiUserAccess: 50,
        canConnectOwnAPI: true
      }
    }
  },
  {
    firstName: 'Alice',
    lastName: 'Enterprise',
    email: 'alice.enterprise@example.com',
    password: 'password123',
    isEmailVerified: true,
    subscription: {
      plan: 'business_unlimited',
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      credits: {
        total: 0, // Unlimited with own API
        used: 0,
        remaining: 0
      },
      features: {
        pcLicenses: -1, // Unlimited
        multiUserAccess: 100,
        canConnectOwnAPI: true
      }
    }
  }
];

const seedSubscriptionData = async () => {
  try {
    console.log('🔄 Starting subscription data seeding...');
    
    // Connect to database if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
    
    // Clear existing data (optional - comment out for production)
    await User.deleteMany({ email: { $in: sampleUsers.map(u => u.email) } });
    await Subuser.deleteMany({});
    
    console.log('🗑️  Cleared existing sample data');
    
    // Create sample users
    const createdUsers = [];
    for (const userData of sampleUsers) {
      const user = await User.create(userData);
      createdUsers.push(user);
      console.log(`✅ Created user: ${user.email} (${user.subscription.plan})`);
    }
    
    // Create sample subusers for business accounts
    const businessUser = createdUsers.find(u => u.subscription.plan === 'business_standard');
    const enterpriseUser = createdUsers.find(u => u.subscription.plan === 'business_unlimited');
    
    if (businessUser) {
      const subusers = [
        {
          ownerId: businessUser._id,
          firstName: 'Sarah',
          lastName: 'Employee1',
          email: 'sarah.employee1@example.com',
          password: 'password123',
          status: 'active',
          permissions: {
            canCreateStories: true,
            canEditStories: true,
            canDeleteStories: false,
            canAccessTemplates: true,
            canUseVoiceGeneration: true,
            canExportVideo: true
          }
        },
        {
          ownerId: businessUser._id,
          firstName: 'Mike',
          lastName: 'Employee2',
          email: 'mike.employee2@example.com',
          password: 'password123',
          status: 'active',
          permissions: {
            canCreateStories: true,
            canEditStories: false,
            canDeleteStories: false,
            canAccessTemplates: true,
            canUseVoiceGeneration: false,
            canExportVideo: false
          }
        }
      ];
      
      for (const subuserData of subusers) {
        const subuser = await Subuser.create(subuserData);
        console.log(`👤 Created subuser: ${subuser.email} for ${businessUser.email}`);
      }
    }
    
    if (enterpriseUser) {
      const enterpriseSubuser = await Subuser.create({
        ownerId: enterpriseUser._id,
        firstName: 'Enterprise',
        lastName: 'Manager',
        email: 'manager@enterprise.example.com',
        password: 'password123',
        status: 'active',
        permissions: {
          canCreateStories: true,
          canEditStories: true,
          canDeleteStories: true,
          canAccessTemplates: true,
          canUseVoiceGeneration: true,
          canExportVideo: true
        }
      });
      console.log(`👤 Created enterprise subuser: ${enterpriseSubuser.email} for ${enterpriseUser.email}`);
    }
    
    console.log('🎉 Subscription data seeding completed successfully!');
    console.log('\n📋 Sample Login Credentials:');
    console.log('Standard Plan: john.standard@example.com / password123');
    console.log('Pro Plan: jane.pro@example.com / password123');
    console.log('Business Standard: bob.business@example.com / password123');
    console.log('Business Unlimited: alice.enterprise@example.com / password123');
    console.log('\n👥 Subuser Credentials:');
    console.log('Business Subuser 1: sarah.employee1@example.com / password123');
    console.log('Business Subuser 2: mike.employee2@example.com / password123');
    console.log('Enterprise Subuser: manager@enterprise.example.com / password123');
    
  } catch (error) {
    console.error('❌ Error seeding subscription data:', error);
    throw error;
  }
};

// Export for use in other scripts
module.exports = { seedSubscriptionData };

// Run directly if called from command line
if (require.main === module) {
  require('dotenv').config({ path: '../../../.env.local' });
  require('dotenv').config({ path: '../../../.env' });
  
  seedSubscriptionData()
    .then(() => {
      console.log('✅ Seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}

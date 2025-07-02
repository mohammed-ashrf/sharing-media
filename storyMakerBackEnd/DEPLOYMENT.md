# StoryMaker Backend - DigitalOcean Deployment Guide

This guide will walk you through deploying the StoryMaker backend to DigitalOcean App Platform.

## 📋 Prerequisites

1. DigitalOcean account
2. GitHub repository with your code
3. MongoDB database (Atlas or DigitalOcean Managed Database)
4. Gmail account with App Password (for email functionality)

## 🚀 Deployment Steps

### 1. Prepare Your Repository

Ensure your repository contains:
- ✅ `.env` file with placeholder values (safe for GitHub)
- ✅ `.gitignore` that excludes `.env.local` 
- ✅ `package.json` with all dependencies
- ✅ All source code in `src/` directory

### 2. Set Up Database

**Option A: MongoDB Atlas (Recommended)**
1. Create a free MongoDB Atlas account
2. Create a new cluster
3. Create a database user
4. Get your connection string: `mongodb+srv://username:password@cluster.mongodb.net/storymaker`

**Option B: DigitalOcean Managed Database**
1. Create a MongoDB managed database in DigitalOcean
2. Get the connection string from the database settings

### 3. Deploy to DigitalOcean App Platform

1. **Create New App:**
   - Go to DigitalOcean Apps
   - Click "Create App"
   - Connect your GitHub repository
   - Select the repository and branch

2. **Configure Build Settings:**
   - Source Directory: `/storyMakerBackEnd` (if in subdirectory)
   - Build Command: `npm install`
   - Run Command: `npm start`
   - HTTP Port: `5000` (or use `$PORT`)

3. **Set Environment Variables:**
   In the App Platform dashboard, add these environment variables:

   ```bash
   NODE_ENV=production
   PORT=5000
   
   # Database
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/storymaker
   
   # JWT Secrets (generate strong random strings)
   JWT_SECRET=your-super-secure-jwt-secret-512-chars-long
   JWT_REFRESH_SECRET=your-super-secure-refresh-secret-512-chars-long
   
   # Email Configuration
   EMAIL_FROM=noreply@yourdomain.com
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USERNAME=your-email@gmail.com
   EMAIL_PASSWORD=your-gmail-app-password
   
   # CORS (your domain)
   FRONTEND_URL=tauri://localhost,https://yourdomain.com
   
   # Application
   APP_NAME=StoryMaker
   APP_VERSION=1.0.0
   ```

4. **Deploy:**
   - Review settings
   - Click "Create Resources"
   - Wait for deployment to complete

### 4. Configure Custom Domain (Optional)

1. Add your domain in the App settings
2. Update DNS records as instructed
3. Update `FRONTEND_URL` environment variable

### 5. Test Deployment

Test your deployed API:

```bash
# Health check
curl https://your-app-url.ondigitalocean.app/health

# Register test user
curl -X POST https://your-app-url.ondigitalocean.app/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "password": "Password123!",
    "confirmPassword": "Password123!"
  }'
```

## 🔐 Security Checklist

- [ ] Strong JWT secrets (min 512 characters)
- [ ] Database has authentication enabled
- [ ] Email credentials are secure (use App Passwords)
- [ ] CORS is configured for your domain only
- [ ] All environment variables are set in DigitalOcean (not in code)
- [ ] `.env.local` is in `.gitignore`

## 📊 Monitoring

DigitalOcean App Platform provides:
- Application logs
- Metrics and alerting
- Auto-scaling
- Health checks

## 🚨 Troubleshooting

### Common Issues:

1. **App won't start:**
   - Check environment variables are set correctly
   - Verify database connection string
   - Check application logs

2. **Database connection failed:**
   - Verify MongoDB URI is correct
   - Check database user permissions
   - Ensure IP whitelist includes DigitalOcean IPs

3. **Email not working:**
   - Verify Gmail App Password (not regular password)
   - Check EMAIL_* environment variables
   - Test SMTP settings

### Checking Logs:
```bash
# In DigitalOcean dashboard
Apps > Your App > Runtime Logs
```

## 🔄 Updates

To deploy updates:
1. Push changes to your GitHub repository
2. DigitalOcean will automatically trigger a new deployment
3. Monitor the deployment in the dashboard

## 💰 Costs

DigitalOcean App Platform pricing (as of 2025):
- Basic plan: $5/month
- Professional plan: $12/month (recommended)
- Includes SSL, custom domains, and auto-scaling

## 📱 Tauri App Configuration

Update your Tauri app's API base URL to point to production:

```typescript
// src/environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: 'https://your-app-url.ondigitalocean.app/api/v1'
};
```

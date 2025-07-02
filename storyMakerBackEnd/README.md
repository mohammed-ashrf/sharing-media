# StoryMaker Backend

A secure, scalable Node.js/Express.js backend for the StoryMaker desktop application.

## 🚀 Features

- **Authentication System**: JWT-based auth with refresh tokens
- **Security**: Rate limiting, input sanitization, XSS protection
- **Database**: MongoDB with Mongoose ODM
- **Email**: Password reset and verification emails
- **Validation**: Comprehensive input validation
- **CORS**: Configured for Tauri desktop applications

## 🛠️ Setup

### Prerequisites
- Node.js (v16+)
- MongoDB running locally or cloud instance
- Gmail account for email functionality (optional)

### Installation

1. **Clone and install dependencies:**
```bash
npm install
```

2. **Environment Configuration:**

Create a `.env.local` file for local development (this file is git-ignored):
```bash
cp .env.example .env.local
```

Edit `.env.local` with your actual values:
```env
NODE_ENV=development
PORT=5001
MONGODB_URI=mongodb://localhost:27017/storymaker
JWT_SECRET=your-local-jwt-secret
EMAIL_USERNAME=your-gmail@gmail.com
EMAIL_PASSWORD=your-gmail-app-password
```

3. **Start the development server:**
```bash
npm run dev
```

## 📁 File Structure

```
src/
├── app.js              # Main application entry point
├── config/
│   ├── database.js     # MongoDB connection
│   ├── security.js     # Security middleware
│   └── email.js        # Email service
├── controllers/
│   ├── authController.js
│   └── userController.js
├── middleware/
│   ├── auth.js         # JWT authentication
│   ├── errorHandler.js # Error handling
│   └── validation.js   # Input validation
├── models/
│   └── User.js         # User model
└── routes/
    ├── auth.js         # Authentication routes
    └── users.js        # User management routes
```

## 🌐 Environment Files

- **`.env`**: Production template (safe to commit to GitHub)
- **`.env.local`**: Local development values (git-ignored)
- **`.env.example`**: Example template for team members

## 🔑 Environment Variables

### Required for Production
- `JWT_SECRET`: Strong secret for JWT tokens
- `JWT_REFRESH_SECRET`: Strong secret for refresh tokens
- `MONGODB_URI`: MongoDB connection string
- `EMAIL_USERNAME`: SMTP email username
- `EMAIL_PASSWORD`: SMTP email password

### Optional
- `PORT`: Server port (default: 5000)
- `NODE_ENV`: Environment (development/production)
- `FRONTEND_URL`: CORS allowed origins

## 🚀 Deployment

### DigitalOcean App Platform

1. **Push to GitHub** (the `.env` file with placeholders)

2. **Configure environment variables** in DigitalOcean:
   - Set all required environment variables in the App Platform dashboard
   - These will override the placeholder values in `.env`

3. **Database Setup:**
   - Use DigitalOcean Managed MongoDB or MongoDB Atlas
   - Update `MONGODB_URI` in environment variables

## 🔐 Security Features

- **Rate Limiting**: Prevents brute force attacks
- **Input Sanitization**: MongoDB injection protection
- **XSS Protection**: Cross-site scripting prevention
- **CORS**: Configured for Tauri desktop apps
- **Password Validation**: Strong password requirements
- **Account Locking**: Protection against repeated failed logins

## 🧪 API Testing

### Health Check
```bash
curl http://localhost:5001/health
```

### Register User
```bash
curl -X POST http://localhost:5001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "password": "Password123!",
    "confirmPassword": "Password123!"
  }'
```

### Login
```bash
curl -X POST http://localhost:5001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "Password123!"
  }'
```

## 📝 Development Notes

- The app loads `.env.local` first, then falls back to `.env`
- `.env.local` should contain your actual development secrets
- `.env` contains production-ready placeholders safe for GitHub
- All sensitive data should be set via environment variables in production

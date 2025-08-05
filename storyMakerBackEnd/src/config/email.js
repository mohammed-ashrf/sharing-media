const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = this.createTransporter();
  }

  createTransporter() {
    // Check if email configuration is available
    if (process.env.EMAIL_HOST && process.env.EMAIL_USERNAME && process.env.EMAIL_PASSWORD) {
      // Use real email configuration when available
      console.log('📧 Email service: Using configured SMTP server');
      return nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT || 587,
        secure: process.env.EMAIL_PORT == 465, // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USERNAME,
          pass: process.env.EMAIL_PASSWORD,
        },
        tls: {
          rejectUnauthorized: false
        }
      });
    } else {
      // Development/fallback: Use console logging when no email config
      console.log('📧 Email service: No email configuration found, using console logging');
      console.log('📝 Note: Emails will be logged to console');
      
      // Return a mock transporter for development
      return {
        sendMail: async (mailOptions) => {
          console.log('\n📧 === EMAIL WOULD BE SENT ===');
          console.log('📬 To:', mailOptions.to);
          console.log('📋 Subject:', mailOptions.subject);
          console.log('📄 Text:', mailOptions.text);
          console.log('================================\n');
          
          return {
            messageId: `dev-${Date.now()}@storymaker.dev`,
            accepted: [mailOptions.to],
            rejected: []
          };
        }
      };
    }
  }

  async sendPasswordResetEmail(email, resetToken, firstName) {
    const mailOptions = {
      from: `${process.env.APP_NAME || 'StoryMaker'} <${process.env.EMAIL_FROM || 'noreply@storymaker.com'}>`,
      to: email,
      subject: 'Password Reset Request - StoryMaker',
      html: this.getPasswordResetTemplate(firstName, resetToken),
      text: `Hi ${firstName},\n\nYou requested a password reset for your StoryMaker account.\n\nYour password reset token is: ${resetToken}\n\nOpen the StoryMaker desktop application and enter this token in the password reset form.\n\nThis token will expire in 10 minutes.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nThe StoryMaker Team`
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Password reset email sent:', info.messageId);
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Error sending password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  async sendWelcomeEmail(email, firstName) {
    const mailOptions = {
      from: `${process.env.APP_NAME || 'StoryMaker'} <${process.env.EMAIL_FROM || 'noreply@storymaker.com'}>`,
      to: email,
      subject: 'Welcome to StoryMaker!',
      html: this.getWelcomeTemplate(firstName),
      text: `Hi ${firstName},\n\nWelcome to StoryMaker! We're excited to have you join our community of creative writers.\n\nGet started by creating your first story in the app.\n\nHappy writing!\n\nThe StoryMaker Team`
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Welcome email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Error sending welcome email:', error);
      // Don't throw error for welcome email as it's not critical
      return { success: false, error: error.message };
    }
  }

  async sendVerificationEmail(email, firstName, verificationToken) {
    // Create verification URL that points to backend endpoint
    const verificationUrl = process.env.BACKEND_URL 
      ? `${process.env.BACKEND_URL}/api/v1/auth/verify/${verificationToken}`
      : `http://localhost:3000/api/v1/auth/verify/${verificationToken}`;

    const mailOptions = {
      from: `${process.env.APP_NAME || 'StoryMaker'} <${process.env.EMAIL_FROM || 'noreply@storymaker.com'}>`,
      to: email,
      subject: 'Verify Your Email - StoryMaker',
      html: this.getVerificationTemplate(firstName, verificationUrl),
      text: `Hi ${firstName},\n\nThank you for signing up for StoryMaker!\n\nPlease verify your email address by clicking the link below:\n${verificationUrl}\n\nAfter verification, return to the StoryMaker desktop application and login with your credentials.\n\nThis link will expire in 24 hours.\n\nIf you didn't create this account, please ignore this email.\n\nBest regards,\nThe StoryMaker Team`
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Verification email sent:', info.messageId);
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Error sending verification email:', error);
      throw new Error('Failed to send verification email');
    }
  }

  getPasswordResetTemplate(firstName, resetToken) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset - StoryMaker</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .token { display: inline-block; background: #f0f0f0; color: #333; padding: 15px 25px; font-family: monospace; font-size: 16px; border-radius: 6px; margin: 20px 0; border: 2px dashed #8b5cf6; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          .instructions { background: #e7f3ff; padding: 15px; border-radius: 6px; border-left: 4px solid #2196f3; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🖋️ StoryMaker</h1>
            <h2>Password Reset Request</h2>
          </div>
          <div class="content">
            <p>Hi ${firstName},</p>
            <p>You requested a password reset for your StoryMaker account. Use the token below to reset your password:</p>
            
            <div class="instructions">
              <strong>📱 Instructions:</strong>
              <ol>
                <li>Open the StoryMaker desktop application</li>
                <li>Go to the password reset page</li>
                <li>Enter the token below</li>
                <li>Set your new password</li>
              </ol>
            </div>
            
            <p style="text-align: center;">
              <strong>Your Reset Token:</strong><br>
              <span class="token">${resetToken}</span>
            </p>
            
            <p><strong>Important:</strong> This token will expire in 10 minutes for security reasons.</p>
            <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
          </div>
          <div class="footer">
            <p>Best regards,<br>The StoryMaker Team</p>
            <p>This is an automated email, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getWelcomeTemplate(firstName) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to StoryMaker!</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .feature { background: white; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #8b5cf6; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🖋️ Welcome to StoryMaker!</h1>
          </div>
          <div class="content">
            <p>Hi ${firstName},</p>
            <p>Welcome to StoryMaker! We're thrilled to have you join our community of creative writers.</p>
            
            <h3>🌟 What you can do with StoryMaker:</h3>
            <div class="feature">
              <strong>📝 Create Stories:</strong> Write and organize your stories with our intuitive editor
            </div>
            <div class="feature">
              <strong>💾 Auto-Save:</strong> Never lose your work with automatic saving
            </div>
            <div class="feature">
              <strong>🔐 Secure:</strong> Your stories are safely stored and protected
            </div>
            
            <p>Ready to start your writing journey? Open the StoryMaker app and begin crafting your first story!</p>
            <p>If you have any questions or need help getting started, don't hesitate to reach out.</p>
          </div>
          <div class="footer">
            <p>Happy writing!<br>The StoryMaker Team</p>
            <p>This is an automated email, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getVerificationTemplate(firstName, verificationUrl) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email - StoryMaker</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: linear-gradient(135deg, #8b5cf6, #ec4899); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          .instructions { background: #e7f3ff; padding: 15px; border-radius: 6px; border-left: 4px solid #2196f3; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🖋️ StoryMaker</h1>
            <h2>Verify Your Email Address</h2>
          </div>
          <div class="content">
            <p>Hi ${firstName},</p>
            <p>Thank you for signing up for StoryMaker! To complete your registration, please verify your email address by clicking the button below:</p>
            <p style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </p>
            
            <div class="instructions">
              <strong>📱 Next Steps:</strong>
              <ol>
                <li>Click the verification button above</li>
                <li>You'll see a confirmation page in your browser</li>
                <li>Return to the StoryMaker desktop application</li>
                <li>Login with your email and password</li>
              </ol>
            </div>
            
            <p><strong>Important:</strong> This link will expire in 24 hours for security reasons.</p>
            <p>If you didn't create this account, please ignore this email.</p>
            <p>If you're having trouble clicking the button, copy and paste this URL into your browser:</p>
            <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
          </div>
          <div class="footer">
            <p>Best regards,<br>The StoryMaker Team</p>
            <p>This is an automated email, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports = new EmailService();

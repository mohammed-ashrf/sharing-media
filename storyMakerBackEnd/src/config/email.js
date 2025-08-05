const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = this.createTransporter();
  }

  createTransporter() {
    if (process.env.NODE_ENV === 'production') {
      // Production email configuration
      return nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
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
      // Development: Use Ethereal Email for testing
      return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
          user: 'ethereal.user@ethereal.email',
          pass: 'ethereal.pass'
        }
      });
    }
  }

  async sendPasswordResetEmail(email, resetToken, firstName) {
    const resetUrl = process.env.NODE_ENV === 'production' 
      ? `${process.env.FRONTEND_URL_PRODUCTION}/reset-password?token=${resetToken}`
      : `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `${process.env.APP_NAME} <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: 'Password Reset Request - StoryMaker',
      html: this.getPasswordResetTemplate(firstName, resetUrl),
      text: `Hi ${firstName},\n\nYou requested a password reset for your StoryMaker account.\n\nClick the link below to reset your password:\n${resetUrl}\n\nThis link will expire in 10 minutes.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nThe StoryMaker Team`
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Password reset email sent:', info.messageId);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('📧 Preview URL:', nodemailer.getTestMessageUrl(info));
      }
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Error sending password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  async sendWelcomeEmail(email, firstName) {
    const mailOptions = {
      from: `${process.env.APP_NAME} <${process.env.EMAIL_FROM}>`,
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
    const verificationUrl = process.env.NODE_ENV === 'production' 
      ? `${process.env.FRONTEND_URL_PRODUCTION}/verify-email?token=${verificationToken}`
      : `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    const mailOptions = {
      from: `${process.env.APP_NAME} <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: 'Verify Your Email - StoryMaker',
      html: this.getVerificationTemplate(firstName, verificationUrl),
      text: `Hi ${firstName},\n\nThank you for signing up for StoryMaker!\n\nPlease verify your email address by clicking the link below:\n${verificationUrl}\n\nThis link will expire in 24 hours.\n\nIf you didn't create this account, please ignore this email.\n\nBest regards,\nThe StoryMaker Team`
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Verification email sent:', info.messageId);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('📧 Preview URL:', nodemailer.getTestMessageUrl(info));
      }
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Error sending verification email:', error);
      throw new Error('Failed to send verification email');
    }
  }

  getPasswordResetTemplate(firstName, resetUrl) {
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
          .button { display: inline-block; background: linear-gradient(135deg, #8b5cf6, #ec4899); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
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
            <p>You requested a password reset for your StoryMaker account. Click the button below to reset your password:</p>
            <p style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <p><strong>Important:</strong> This link will expire in 10 minutes for security reasons.</p>
            <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
            <p>If you're having trouble clicking the button, copy and paste this URL into your browser:</p>
            <p style="word-break: break-all; color: #666;">${resetUrl}</p>
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

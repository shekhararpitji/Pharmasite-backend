const nodemailer = require('nodemailer');

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Send verification email
exports.sendVerificationEmail = async (email, token) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  
  const mailOptions = {
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Verify Your Email Address',
    html: `
      <h1>Welcome to Our Platform!</h1>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${verificationUrl}">Verify Email</a>
      <p>This link will expire in 24 hours.</p>
      <p>If you did not create an account, please ignore this email.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw new Error('Failed to send verification email');
  }
};

// Send account creation notification
exports.sendAccountCreationNotification = async (email, createdBy, role) => {
  const mailOptions = {
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Your Account Has Been Created',
    html: `
      <h1>Your Account Has Been Created</h1>
      <p>An account has been created for you by ${createdBy}.</p>
      <p>Account Type: ${role}</p>
      <p>Please check your email for a verification link to activate your account.</p>
      <p>If you have any questions, please contact the administrator.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending account creation notification:', error);
    throw new Error('Failed to send account creation notification');
  }
};

// Send access update notification
exports.sendAccessUpdateNotification = async (email, isActive) => {
  const mailOptions = {
    from: process.env.SMTP_FROM,
    to: email,
    subject: isActive ? 'Your Account Has Been Activated' : 'Your Account Has Been Deactivated',
    html: `
      <h1>${isActive ? 'Account Activated' : 'Account Deactivated'}</h1>
      <p>Your account has been ${isActive ? 'activated' : 'deactivated'} by the administrator.</p>
      ${isActive ? '<p>You can now log in to your account.</p>' : '<p>You will not be able to log in until your account is reactivated.</p>'}
      <p>If you have any questions, please contact the administrator.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending access update notification:', error);
    throw new Error('Failed to send access update notification');
  }
}; 
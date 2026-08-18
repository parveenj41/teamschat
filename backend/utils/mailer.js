const nodemailer = require('nodemailer');

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: false, // true for port 465, false for 587
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

async function sendPasswordResetEmail(toEmail, resetUrl) {
  const transporter = createTransporter();

  const info = await transporter.sendMail({
    from: `"TeamsChat" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Reset your TeamsChat password',
    html: `
      <div style="font-family: Segoe UI, Arial, sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color:#6264A7;">Reset your password</h2>
        <p>We received a request to reset your TeamsChat password. Click the button below to choose a new one. This link expires in 1 hour.</p>
        <p style="text-align:center; margin: 24px 0;">
          <a href="${resetUrl}" style="background:#6264A7;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;display:inline-block;">
            Reset Password
          </a>
        </p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      </div>
    `
  });

  return info;
}

module.exports = { sendPasswordResetEmail };

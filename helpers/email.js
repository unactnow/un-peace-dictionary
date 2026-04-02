const nodemailer = require('nodemailer');

const SMTP_ENABLED = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
if (SMTP_ENABLED) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendResetEmail(toEmail, resetUrl) {
  if (!SMTP_ENABLED) {
    console.log(`\n[PASSWORD RESET] ${toEmail}\n${resetUrl}\n`);
    return true;
  }

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject: 'Password Reset',
      text: `Click the link below to reset your password:\n\n${resetUrl}\n\nThis link expires in 1 hour.`,
    });
    return true;
  } catch (err) {
    console.error('[EMAIL ERROR]', err.message);
    return false;
  }
}

module.exports = { sendResetEmail };

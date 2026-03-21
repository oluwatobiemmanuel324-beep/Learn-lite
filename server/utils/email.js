const nodemailer = require('nodemailer');
const validator = require('validator');

const mailTransporter = nodemailer.createTransport({
  host: 'sandbox.smtp.mailtrap.io',
  port: Number(process.env.MAILTRAP_PORT || 2525),
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.MAILTRAP_USER || 'a4c5437f986340',
    pass: process.env.MAILTRAP_PASS || '57678a7ef09995'
  },
  authMethod: 'LOGIN'
});

mailTransporter.verify((error) => {
  if (error) {
    console.log('EMAIL ERROR:', error);
  } else {
    console.log('✅ Mailtrap SMTP connection is alive');
  }
});

function getFromAddress() {
  const rawFrom = process.env.MAIL_FROM || 'no-reply@yourdomain.com';
  const trimmedFrom = String(rawFrom).trim();

  if (trimmedFrom.includes('<') && trimmedFrom.includes('>')) {
    const extractedEmail = trimmedFrom.split('<')[1].replace('>', '').trim();
    if (!validator.isEmail(extractedEmail)) {
      throw new Error(`Invalid MAIL_FROM format: ${trimmedFrom}`);
    }
    return trimmedFrom;
  }

  if (!validator.isEmail(trimmedFrom)) {
    throw new Error(`Invalid MAIL_FROM format: ${trimmedFrom}`);
  }

  return `Learn Lite <${trimmedFrom}>`;
}

function buildWelcomeTemplate({ username, idNumber }) {
  return {
    subject: 'Welcome to Learn Lite — Your Account ID',
    html: `
      <div style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px; color: #111827;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="padding: 20px 24px; background: #111827; color: #ffffff;">
            <h2 style="margin: 0; font-size: 20px;">Welcome to Learn Lite</h2>
          </div>
          <div style="padding: 24px;">
            <p style="margin: 0 0 12px; font-size: 15px;">Hi ${username},</p>
            <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.5;">
              Your account has been created successfully. Please keep your Account ID safe.
            </p>
            <div style="margin: 16px 0 20px; padding: 16px; border: 1px solid #d1d5db; border-radius: 10px; background: #f9fafb; text-align: center;">
              <div style="font-size: 12px; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 8px;">ACCOUNT ID</div>
              <div style="font-size: 32px; font-weight: 700; letter-spacing: 0.2em; color: #111827;">${idNumber}</div>
            </div>
            <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
              You may need this ID for payment verification and support requests.
            </p>
          </div>
        </div>
      </div>
    `
  };
}

async function sendWelcomeEmail({ email, username, idNumber }) {
  if (idNumber === null || idNumber === undefined) {
    console.warn('Skipping welcome email: idNumber is null/undefined');
    return null;
  }

  try {
    const template = buildWelcomeTemplate({ username, idNumber });

    return await mailTransporter.sendMail({
      from: getFromAddress(),
      to: email,
      subject: template.subject,
      html: template.html
    });
  } catch (error) {
    console.log('EMAIL ERROR:', error);
    throw error;
  }
}

module.exports = {
  sendWelcomeEmail
};

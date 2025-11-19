// backend/controllers/supportController.js
const nodemailer = require('nodemailer');

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@throwback-connect.com';

const transporter = nodemailer.createTransport({
  host: process.env.HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: (process.env.SECURE || 'false').toString().toLowerCase() === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * @desc    Envoyer un message au support
 * @route   POST /api/support/contact
 * @access  Private
 */
exports.contactSupport = async (req, res) => {
  try {
    const { subject, message, email } = req.body;
    const user = req.user || null;

    // Validations simples
    if (!subject || !subject.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Subject is required'
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address'
      });
    }

    const userInfoLines = [];
    if (user) {
      userInfoLines.push(`User ID: ${user.id || user._id}`);
      if (user.username) userInfoLines.push(`Username: ${user.username}`);
      if (user.email) userInfoLines.push(`Account email: ${user.email}`);
    }

    const metaInfo = [
      `From (form): ${email}`,
      `Date: ${new Date().toISOString()}`,
      ...(userInfoLines.length ? ['--- User Info ---', ...userInfoLines] : [])
    ].join('\n');

    const textBody = [
      'New support message from ThrowBack-Connect:',
      '',
      `Subject: ${subject}`,
      '',
      'Message:',
      message,
      '',
      '--- Meta ---',
      metaInfo
    ].join('\n');

    const htmlBody = `
      <h2>New support message from ThrowBack-Connect</h2>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Message:</strong></p>
      <p style="white-space:pre-line;">${message}</p>
      <hr />
      <h3>Meta info</h3>
      <p><strong>From (form):</strong> ${email}</p>
      <p><strong>Date:</strong> ${new Date().toISOString()}</p>
      ${
        user
          ? `<p><strong>User ID:</strong> ${user.id || user._id}</p>
             ${user.username ? `<p><strong>Username:</strong> ${user.username}</p>` : ''}
             ${user.email ? `<p><strong>Account email:</strong> ${user.email}</p>` : ''}`
          : ''
      }
    `;

    const mailOptions = {
      to: SUPPORT_EMAIL,                                      
      replyTo: email,                                         
      subject: `[Support] ${subject}`,
      text: textBody,
      html: htmlBody
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      success: true,
      message: 'Your message has been sent to the support team.'
    });
  } catch (error) {
    console.error('Error sending support email:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while sending your message. Please try again later.'
    });
  }
};

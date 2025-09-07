const nodemailer = require("nodemailer");

module.exports = async (email, url) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.verify();
    console.log("SMTP configuration verified successfully");

    await transporter.sendMail({
      from: `"ThrowBack Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Reset Your Password - ThrowBack",
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset - ThrowBack</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                  <!-- Header -->
                  <tr>
                    <td align="center" style="padding: 40px 40px 20px 40px;">
                      <p style="color: #b31217; font-size: 1.5rem;">THROWBACK-CONNECT</p>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 0 40px 40px 40px;">
                      <h1 style="color: #333333; font-size: 24px; margin-bottom: 20px; text-align: center;">Reset Your Password</h1>
                      <p style="color: #666666; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">You requested to reset your password for your ThrowBack account. Click the button below to create a new password.</p>
                      
                      <div style="text-align: center; margin: 40px 0;">
                        <a href="${url}" style="background-color: #e32929; color: #ffffff; text-decoration: none; padding: 15px 30px; border-radius: 5px; font-size: 16px; font-weight: bold; display: inline-block;">Reset My Password</a>
                      </div>
                      
                      <p style="color: #666666; font-size: 14px; line-height: 1.6;">If you didn't request this password reset, please ignore this email. This link will expire in 1 hour for security reasons.</p>
                      
                      <hr style="border: none; border-top: 1px solid #eeeeee; margin: 30px 0;">
                      
                      <p style="color: #999999; font-size: 12px; text-align: center;">
                        Having trouble? Copy and paste this link into your browser:<br>
                        <a href="${url}" style="color: #e32929; text-decoration: none; word-break: break-all; display: inline-block; margin-top: 10px; padding: 5px; background-color: #f9f9f9; border: 1px solid #eee; border-radius: 3px;">${url}</a>
                      </p>
                      
                      <p style="color: #999999; font-size: 12px; text-align: center; margin-top: 20px;">
                        &copy; 2024 ThrowBack. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    console.log("Password reset email sent successfully");
  } catch (error) {
    console.log("Error sending password reset email");
    console.error(error);
    throw error;
  }
};
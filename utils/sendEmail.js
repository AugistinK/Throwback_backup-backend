// utils/sendEmail.js
const nodemailer = require("nodemailer");

module.exports = async (email, subject, url) => {
	try {
		// CORRECTION : Utiliser createTransport (pas createTransporter)
		const transporter = nodemailer.createTransport({
			service: 'gmail',
			auth: {
				user: process.env.EMAIL_USER, 
				pass: process.env.EMAIL_PASS,
			},
		});

		// Optionnel : Vérifier la configuration
		await transporter.verify();
		console.log("Configuration SMTP vérifiée avec succès");

		await transporter.sendMail({
			from: `"ThrowBack Team" <${process.env.EMAIL_USER}>`,
			to: email,
			subject: subject,
			html: `
				<!DOCTYPE html>
				<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<title>Email Verification - ThrowBack</title>
				</head>
				<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
					<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
						<tr>
							<td align="center" style="padding: 40px 0;">
								<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
									<!-- Header -->
									<tr>
										<td align="center" style="padding: 40px 40px 20px 40px;">
											<p style="color: #b31217; fontSize: 1.5rem">THROWBACK-CONNECT</p>
										</td>
									</tr>
									
									<!-- Content -->
									<tr>
										<td style="padding: 0 40px 40px 40px;">
											<h1 style="color: #333333; font-size: 24px; margin-bottom: 20px; text-align: center;">Welcome to ThrowBack!</h1>
											<p style="color: #666666; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">Thank you for creating an account with us. To complete your registration and access your account, please verify your email address.</p>
											
											<div style="text-align: center; margin: 40px 0;">
												<a href="${url}" style="background-color: #e32929; color: #ffffff; text-decoration: none; padding: 15px 30px; border-radius: 5px; font-size: 16px; font-weight: bold; display: inline-block;">Verify My Account</a>
											</div>
											
											<p style="color: #666666; font-size: 14px; line-height: 1.6;">If you didn't create an account with us, please ignore this email. This link will expire in 24 hours for security reasons.</p>
											
											<hr style="border: none; border-top: 1px solid #eeeeee; margin: 30px 0;">
											
											
											
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

		console.log("Email sent successfully to:", email);
		return { success: true, message: "Email sent" };
	} catch (error) {
		console.log("Email not sent");
		console.error("Detailed error:", error);
		throw error;
	}
};
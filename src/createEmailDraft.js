const nodemailer = require('nodemailer');

async function createEmailDraft(to, subject, text) {
    try {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_SECURE === 'true', // Użyj SSL/TLS
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        const mailOptions = {
            from: process.env.SMTP_USER, // Twój adres e-mail
            to: 'kontakt@invette.dev',
            subject,
            text,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Szkic e-maila został wysłany: ${info.messageId}`);
    } catch (error) {
        console.error('❌ Błąd podczas tworzenia szkicu e-maila:', error.message);
    }
}

module.exports = { createEmailDraft };

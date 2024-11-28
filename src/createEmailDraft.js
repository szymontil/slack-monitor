const nodemailer = require('nodemailer');
const dns = require('dns');

async function createEmailDraft(to, subject, text) {
    try {
        // Testowanie połączenia DNS dla SMTP
        dns.lookup(process.env.SMTP_HOST, (err, address, family) => {
            if (err) {
                console.error(`❌ Błąd DNS dla ${process.env.SMTP_HOST}:`, err.message);
            } else {
                console.log(`📡 Adres DNS dla ${process.env.SMTP_HOST}: ${address} (IPv${family})`);
            }
        });

        // Debugowanie konfiguracji SMTP
        console.log('📧 SMTP Config:', {
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            user: process.env.SMTP_USER,
        });

        // Utworzenie transportu SMTP
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT, 10),
            secure: process.env.SMTP_SECURE === 'true', // Użyj SSL/TLS na podstawie konfiguracji
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        // Utworzenie szkicu e-maila
        const mailOptions = {
            from: process.env.SMTP_USER, // Twój adres e-mail
            to, // Adres odbiorcy
            subject, // Temat wiadomości
            text, // Treść wiadomości
        };

        // Wysłanie e-maila jako szkicu
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Szkic e-maila został wysłany: ${info.messageId}`);
    } catch (error) {
        console.error('❌ Błąd podczas tworzenia szkicu e-maila:', error.message);
    }
}

module.exports = { createEmailDraft };

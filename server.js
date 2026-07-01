import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

// Load Environment variables
dotenv.config();

// Resolve __dirname for ESM modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static files (HTML, CSS, JS, images) from the project root
app.use(express.static(__dirname));

// Redirect root '/' to login page
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// Resolve paths for local SQLite DB
const dbPath = path.join(__dirname, 'hrm_database.db');

// Connect to SQLite Database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database connection failed:', err.message);
    } else {
        console.log('Connected to SQLite HRM Database at hrm_database.db');
    }
});

// Initialize Database Schemas
db.serialize(() => {
    // Users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employeeId TEXT UNIQUE,
            name TEXT,
            email TEXT UNIQUE,
            passwordHash TEXT,
            createdAt TEXT
        )
    `);

    // OTP verification codes table
    db.run(`
        CREATE TABLE IF NOT EXISTS otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            otp TEXT,
            expiresAt INTEGER
        )
    `);
});

/**
 * Encrypts a password using SHA-256
 * @param {string} password 
 * @returns {string} Hashed password
 */
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Checks SMTP connection and returns Mail Transporter
 */
function getMailTransporter() {
    const isPlaceholder = !process.env.SMTP_USER || 
                        process.env.SMTP_USER === 'your-email@gmail.com' ||
                        !process.env.SMTP_PASS || 
                        process.env.SMTP_PASS === 'your-gmail-app-password';

    if (isPlaceholder) {
        return null;
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
}

// -------------------------------------------------------------
// API ROUTES
// -------------------------------------------------------------

/**
 * POST /api/register
 * Registers a new employee
 */
app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Check if email already exists
    db.get('SELECT id FROM users WHERE email = ?', [cleanEmail], (err, row) => {
        if (err) {
            console.error('Database query error:', err.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        if (row) {
            return res.status(400).json({ success: false, message: 'An account with this email address already exists' });
        }

        // Generate dynamic sequential Employee ID starting at 1001
        db.get('SELECT COUNT(*) as count FROM users', [], (err, rowCount) => {
            if (err) {
                console.error('Database count error:', err.message);
                return res.status(500).json({ success: false, message: 'Internal server error' });
            }

            const totalUsers = rowCount.count;
            const employeeId = `HRM-${1001 + totalUsers}`;
            const passwordHash = hashPassword(password);
            const createdAt = new Date().toISOString();

            // Insert new user
            db.run(
                'INSERT INTO users (employeeId, name, email, passwordHash, createdAt) VALUES (?, ?, ?, ?, ?)',
                [employeeId, cleanName, cleanEmail, passwordHash, createdAt],
                function(err) {
                    if (err) {
                        console.error('Database insertion error:', err.message);
                        return res.status(500).json({ success: false, message: 'Failed to create user account' });
                    }

                    res.status(201).json({
                        success: true,
                        message: 'Registration successful',
                        user: { employeeId, name: cleanName, email: cleanEmail }
                    });
                }
            );
        });
    });
});

/**
 * POST /api/login
 * Authenticates user credentials
 */
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ success: false, message: 'Employee ID or Email and password are required' });
    }

    const cleanIdentifier = identifier.trim().toLowerCase();

    db.get(
        'SELECT employeeId, name, email, passwordHash FROM users WHERE email = ? OR LOWER(employeeId) = ?',
        [cleanIdentifier, cleanIdentifier],
        (err, user) => {
            if (err) {
                console.error('Database query error:', err.message);
                return res.status(500).json({ success: false, message: 'Internal server error' });
            }

            if (!user) {
                return res.status(404).json({ success: false, message: 'Employee ID or Email address not found' });
            }

            // Verify password hash
            const inputHash = hashPassword(password);
            if (inputHash !== user.passwordHash) {
                return res.status(401).json({ success: false, message: 'Incorrect password' });
            }

            res.status(200).json({
                success: true,
                message: 'Login successful',
                user: {
                    employeeId: user.employeeId,
                    name: user.name,
                    email: user.email
                }
            });
        }
    );
});

/**
 * POST /api/check-email
 * Checks if email exists in database
 */
app.post('/api/check-email', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: 'Email address is required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    db.get('SELECT id FROM users WHERE email = ?', [cleanEmail], (err, row) => {
        if (err) {
            console.error('Database query error:', err.message);
            return res.status(500).json({ success: false, message: 'Internal database query error' });
        }

        res.status(200).json({ success: true, exists: !!row });
    });
});

/**
 * POST /api/send-otp
 * Generates an OTP, saves it, and dispatches an email
 */
app.post('/api/send-otp', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: 'Email address is required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Verify email is registered first
    db.get('SELECT id FROM users WHERE email = ?', [cleanEmail], (err, row) => {
        if (err) {
            console.error('Database check error:', err.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        if (!row) {
            return res.status(404).json({ success: false, message: 'Email address not found in records' });
        }

        // Generate 6-digit random code
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 300 * 1000; // 5 minutes from now

        // Upsert OTP record
        db.run(
            `INSERT INTO otps (email, otp, expiresAt) VALUES (?, ?, ?)
             ON CONFLICT(email) DO UPDATE SET otp=excluded.otp, expiresAt=excluded.expiresAt`,
            [cleanEmail, otp, expiresAt],
            async function(err) {
                if (err) {
                    console.error('OTP save error:', err.message);
                    return res.status(500).json({ success: false, message: 'Failed to generate verification code' });
                }

                // Check SMTP Config and try to send Email
                const transporter = getMailTransporter();

                if (!transporter) {
                    console.log('---------------------------------------------------------');
                    console.log(`📨 [SIMULATED EMAIL DEVIATION - SMTP NOT CONFIGURED]`);
                    console.log(`To: ${cleanEmail}`);
                    console.log(`Verification Code: ${otp}`);
                    console.log('---------------------------------------------------------');

                    return res.status(200).json({
                        success: true,
                        message: 'Verification code generated! (SMTP is unconfigured, code logged to console)',
                        smtpConfigured: false,
                        devOtp: otp // Returned to frontend as developer helper
                    });
                }

                // Setup elegant email markup
                const mailOptions = {
                    from: `"HRM Portal Security" <${process.env.SMTP_USER}>`,
                    to: cleanEmail,
                    subject: 'HRM Portal - Password Reset OTP Code',
                    html: `
                        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #f1e6ef; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(112, 11, 93, 0.03);">
                            <div style="text-align: center; margin-bottom: 24px; border-bottom: 1px solid #f3f4f6; padding-bottom: 16px;">
                                <h1 style="color: #700b5d; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">HRM Portal</h1>
                                <span style="font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Security Team</span>
                            </div>
                            <div style="color: #2d2d2d; line-height: 1.6; font-size: 15px;">
                                <p style="margin-top: 0;">Hello Employee,</p>
                                <p>We received a request to reset the password for your HRM portal account. Use the following security code to verify your identity:</p>
                                
                                <div style="text-align: center; margin: 28px 0;">
                                    <span style="display: inline-block; background-color: #f7ebf5; border: 2px dashed #700b5d; border-radius: 8px; color: #700b5d; font-family: monospace; font-size: 32px; font-weight: 800; padding: 12px 28px; letter-spacing: 3px;">
                                        ${otp}
                                    </span>
                                </div>
                                
                                <p style="color: #6b7280; font-size: 13px;">This OTP code is valid for exactly <strong>5 minutes</strong>. If you did not make this request, you can safely ignore this email.</p>
                            </div>
                            <div style="margin-top: 36px; border-top: 1px solid #f3f4f6; padding-top: 18px; text-align: center; font-size: 12px; color: #9ca3af;">
                                &copy; ${new Date().getFullYear()} HRM Employee Portal. All rights reserved.
                            </div>
                        </div>
                    `
                };

                try {
                    await transporter.sendMail(mailOptions);
                    console.log(`✉️ Real OTP email dispatched to ${cleanEmail}`);
                    
                    res.status(200).json({
                        success: true,
                        message: 'Verification code sent to your email address!',
                        smtpConfigured: true
                    });
                } catch (mailErr) {
                    console.error('Mail dispatch error:', mailErr.message);
                    console.log('---------------------------------------------------------');
                    console.log(`📨 [SMTP CONNECTION FAILED - LOGGED TO CONSOLE]`);
                    console.log(`To: ${cleanEmail}`);
                    console.log(`Verification Code: ${otp}`);
                    console.log('---------------------------------------------------------');

                    res.status(200).json({
                        success: true,
                        message: 'Failed to send real email. Verification code logged to terminal console.',
                        smtpConfigured: false,
                        devOtp: otp
                    });
                }
            }
        );
    });
});

/**
 * POST /api/verify-otp
 * Verifies if entered OTP matches database records
 */
app.post('/api/verify-otp', (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ success: false, message: 'Email and OTP code are required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    db.get('SELECT otp, expiresAt FROM otps WHERE email = ?', [cleanEmail], (err, row) => {
        if (err) {
            console.error('Database query error:', err.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        if (!row || row.otp !== otp.trim()) {
            return res.status(400).json({ success: false, message: 'Invalid verification code' });
        }

        if (row.expiresAt < Date.now()) {
            return res.status(400).json({ success: false, message: 'Verification code has expired' });
        }

        res.status(200).json({
            success: true,
            message: 'Verification successful'
        });
    });
});

/**
 * POST /api/reset-password
 * Resets the user's password in records
 */
app.post('/api/reset-password', (req, res) => {
    const { email, newPassword, otp } = req.body;

    if (!email || !newPassword || !otp) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Verify OTP one more time for final reset security
    db.get('SELECT otp, expiresAt FROM otps WHERE email = ?', [cleanEmail], (err, row) => {
        if (err) {
            console.error('Database query error:', err.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        if (!row || row.otp !== otp.trim()) {
            return res.status(400).json({ success: false, message: 'Invalid session context or expired verification code' });
        }

        if (row.expiresAt < Date.now()) {
            return res.status(400).json({ success: false, message: 'Verification code has expired' });
        }

        // Hashing password
        const passwordHash = hashPassword(newPassword);

        db.serialize(() => {
            // Update password hash in users table
            db.run('UPDATE users SET passwordHash = ? WHERE email = ?', [passwordHash, cleanEmail], function(err) {
                if (err) {
                    console.error('Database password update error:', err.message);
                    return res.status(500).json({ success: false, message: 'Failed to reset password' });
                }

                // Delete the OTP record
                db.run('DELETE FROM otps WHERE email = ?', [cleanEmail], (err) => {
                    if (err) console.error('Database clean error:', err.message);
                });

                res.status(200).json({
                    success: true,
                    message: 'Password reset successfully'
                });
            });
        });
    });
});

// Launch Server Listener
app.listen(PORT, () => {
    console.log(`=========================================================`);
    console.log(`🚀 HRM Portal Express Backend is running on port ${PORT}`);
    console.log(`=========================================================`);
});

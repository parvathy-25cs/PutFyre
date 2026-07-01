"""
HRM Employee Portal - Python Flask Backend
Replaces the previous Node.js/Express server.
Serves static files and provides REST API for auth, OTP, and password reset.
"""

import os
import hashlib
import random
import smtplib
import sqlite3
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, request, send_from_directory
from flask_cors import CORS

# ── Environment ──────────────────────────────────────────────────────────────
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DB_PATH  = BASE_DIR / 'hrm_database.db'
PORT     = int(os.getenv('PORT', 3000))

# ── Flask App ─────────────────────────────────────────────────────────────────
# Disable Flask's built-in static file handling — we serve files ourselves
app = Flask(__name__, static_folder=None)
CORS(app)

# ── Database Helpers ──────────────────────────────────────────────────────────

def get_db():
    """Open a thread-local SQLite connection with row_factory."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create tables if they do not already exist."""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                employeeId  TEXT    UNIQUE,
                name        TEXT,
                email       TEXT    UNIQUE,
                passwordHash TEXT,
                createdAt   TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS otps (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                email     TEXT    UNIQUE,
                otp       TEXT,
                expiresAt INTEGER
            )
        """)
        conn.commit()
    print('[OK] Connected to SQLite HRM Database at hrm_database.db')


# ── Utility Functions ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """SHA-256 hash — identical algorithm to the previous Node.js implementation."""
    return hashlib.sha256(password.encode()).hexdigest()


def is_smtp_configured() -> bool:
    """Return True only when real SMTP credentials are present."""
    user = os.getenv('SMTP_USER', '')
    pwd  = os.getenv('SMTP_PASS', '')
    placeholders = {'', 'your-email@gmail.com', 'your-gmail-app-password'}
    return user not in placeholders and pwd not in placeholders


def send_otp_email(to_email: str, otp: str) -> bool:
    """
    Attempt to send the OTP via SMTP.
    Returns True on success, False on failure.
    """
    smtp_host   = os.getenv('SMTP_HOST', 'smtp.gmail.com')
    smtp_port   = int(os.getenv('SMTP_PORT', 587))
    smtp_secure = os.getenv('SMTP_SECURE', 'false').lower() == 'true'
    smtp_user   = os.getenv('SMTP_USER')
    smtp_pass   = os.getenv('SMTP_PASS')

    year = time.strftime('%Y')

    html_body = f"""
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                max-width: 600px; margin: 0 auto; padding: 30px;
                border: 1px solid #f1e6ef; border-radius: 12px;
                background-color: #ffffff; box-shadow: 0 4px 12px rgba(112,11,93,0.03);">
        <div style="text-align:center; margin-bottom:24px;
                    border-bottom:1px solid #f3f4f6; padding-bottom:16px;">
            <h1 style="color:#700b5d; margin:0; font-size:28px;
                       font-weight:700; letter-spacing:-0.5px;">HRM Portal</h1>
            <span style="font-size:12px; color:#9ca3af; text-transform:uppercase;
                         letter-spacing:1px; font-weight:600;">Security Team</span>
        </div>
        <div style="color:#2d2d2d; line-height:1.6; font-size:15px;">
            <p style="margin-top:0;">Hello Employee,</p>
            <p>We received a request to reset the password for your HRM portal account.
               Use the following security code to verify your identity:</p>
            <div style="text-align:center; margin:28px 0;">
                <span style="display:inline-block; background-color:#f7ebf5;
                             border:2px dashed #700b5d; border-radius:8px;
                             color:#700b5d; font-family:monospace; font-size:32px;
                             font-weight:800; padding:12px 28px; letter-spacing:3px;">
                    {otp}
                </span>
            </div>
            <p style="color:#6b7280; font-size:13px;">
                This OTP code is valid for exactly <strong>5 minutes</strong>.
                If you did not make this request, you can safely ignore this email.
            </p>
        </div>
        <div style="margin-top:36px; border-top:1px solid #f3f4f6; padding-top:18px;
                    text-align:center; font-size:12px; color:#9ca3af;">
            &copy; {year} HRM Employee Portal. All rights reserved.
        </div>
    </div>
    """

    msg = MIMEMultipart('alternative')
    msg['Subject'] = 'HRM Portal - Password Reset OTP Code'
    msg['From']    = f'"HRM Portal Security" <{smtp_user}>'
    msg['To']      = to_email
    msg.attach(MIMEText(html_body, 'html'))

    try:
        if smtp_secure:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port)
            server.starttls()

        server.login(smtp_user, smtp_pass)
        server.sendmail(smtp_user, to_email, msg.as_string())
        server.quit()
        print(f'[EMAIL SENT] Real OTP email dispatched to {to_email}')
        return True
    except Exception as e:
        print(f'Mail dispatch error: {e}')
        return False


# ── Static File Serving ───────────────────────────────────────────────────────

@app.route('/')
def index():
    """Redirect root to login page — mirrors Express behaviour."""
    return redirect('/login.html')


@app.route('/<path:filename>')
def static_files(filename):
    """Serve any file from the project root directory."""
    return send_from_directory(str(BASE_DIR), filename)


# ── API Routes ────────────────────────────────────────────────────────────────

@app.post('/api/register')
def register():
    """
    POST /api/register
    Registers a new employee with an auto-generated employee ID.
    """
    data = request.get_json() or {}
    name     = data.get('name', '').strip()
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not name or not email or not password:
        return jsonify(success=False, message='All fields are required'), 400

    with get_db() as conn:
        # Check for duplicate email
        existing = conn.execute(
            'SELECT id FROM users WHERE email = ?', (email,)
        ).fetchone()
        if existing:
            return jsonify(
                success=False,
                message='An account with this email address already exists'
            ), 400

        # Generate sequential employee ID (HRM-1001, HRM-1002, …)
        count = conn.execute('SELECT COUNT(*) as cnt FROM users').fetchone()['cnt']
        employee_id   = f'HRM-{1001 + count}'
        password_hash = hash_password(password)
        created_at    = time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())

        conn.execute(
            'INSERT INTO users (employeeId, name, email, passwordHash, createdAt) '
            'VALUES (?, ?, ?, ?, ?)',
            (employee_id, name, email, password_hash, created_at)
        )
        conn.commit()

    return jsonify(
        success=True,
        message='Registration successful',
        user=dict(employeeId=employee_id, name=name, email=email)
    ), 201


@app.post('/api/login')
def login():
    """
    POST /api/login
    Authenticates with Employee ID or email + password.
    """
    data       = request.get_json() or {}
    identifier = data.get('identifier', '').strip().lower()
    password   = data.get('password', '')

    if not identifier or not password:
        return jsonify(
            success=False,
            message='Employee ID or Email and password are required'
        ), 400

    with get_db() as conn:
        user = conn.execute(
            'SELECT employeeId, name, email, passwordHash FROM users '
            'WHERE email = ? OR LOWER(employeeId) = ?',
            (identifier, identifier)
        ).fetchone()

    if not user:
        return jsonify(
            success=False,
            message='Employee ID or Email address not found'
        ), 404

    if hash_password(password) != user['passwordHash']:
        return jsonify(success=False, message='Incorrect password'), 401

    return jsonify(
        success=True,
        message='Login successful',
        user=dict(
            employeeId=user['employeeId'],
            name=user['name'],
            email=user['email']
        )
    ), 200


@app.post('/api/check-email')
def check_email():
    """
    POST /api/check-email
    Returns whether an email is registered.
    """
    data  = request.get_json() or {}
    email = data.get('email', '').strip().lower()

    if not email:
        return jsonify(success=False, message='Email address is required'), 400

    with get_db() as conn:
        row = conn.execute(
            'SELECT id FROM users WHERE email = ?', (email,)
        ).fetchone()

    return jsonify(success=True, exists=row is not None), 200


@app.post('/api/send-otp')
def send_otp():
    """
    POST /api/send-otp
    Generates a 6-digit OTP, persists it, and attempts email delivery.
    Falls back to console logging when SMTP is unconfigured.
    """
    data  = request.get_json() or {}
    email = data.get('email', '').strip().lower()

    if not email:
        return jsonify(success=False, message='Email address is required'), 400

    with get_db() as conn:
        user_row = conn.execute(
            'SELECT id FROM users WHERE email = ?', (email,)
        ).fetchone()

        if not user_row:
            return jsonify(
                success=False,
                message='Email address not found in records'
            ), 404

        # Generate 6-digit OTP and set 5-minute expiry (milliseconds, matching JS)
        otp        = str(random.randint(100000, 999999))
        expires_at = int(time.time() * 1000) + 300_000  # 5 minutes in ms

        # Upsert OTP record
        conn.execute(
            """
            INSERT INTO otps (email, otp, expiresAt) VALUES (?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET otp=excluded.otp, expiresAt=excluded.expiresAt
            """,
            (email, otp, expires_at)
        )
        conn.commit()

    if not is_smtp_configured():
        print('---------------------------------------------------------')
        print('[SIMULATED EMAIL - SMTP NOT CONFIGURED]')
        print(f'To: {email}')
        print(f'Verification Code: {otp}')
        print('---------------------------------------------------------')
        return jsonify(
            success=True,
            message='Verification code generated! (SMTP is unconfigured, code logged to console)',
            smtpConfigured=False,
            devOtp=otp
        ), 200

    # Try to send real email
    sent = send_otp_email(email, otp)
    if sent:
        return jsonify(
            success=True,
            message='Verification code sent to your email address!',
            smtpConfigured=True
        ), 200
    else:
        print('---------------------------------------------------------')
        print('[SMTP FAILED - LOGGED TO CONSOLE]')
        print(f'To: {email}')
        print(f'Verification Code: {otp}')
        print('---------------------------------------------------------')
        return jsonify(
            success=True,
            message='Failed to send real email. Verification code logged to terminal console.',
            smtpConfigured=False,
            devOtp=otp
        ), 200


@app.post('/api/verify-otp')
def verify_otp():
    """
    POST /api/verify-otp
    Checks the supplied OTP against the database record.
    """
    data  = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    otp   = data.get('otp', '').strip()

    if not email or not otp:
        return jsonify(success=False, message='Email and OTP code are required'), 400

    with get_db() as conn:
        row = conn.execute(
            'SELECT otp, expiresAt FROM otps WHERE email = ?', (email,)
        ).fetchone()

    if not row or row['otp'] != otp:
        return jsonify(success=False, message='Invalid verification code'), 400

    # expiresAt is stored as JS Date.now() milliseconds
    if row['expiresAt'] < int(time.time() * 1000):
        return jsonify(success=False, message='Verification code has expired'), 400

    return jsonify(success=True, message='Verification successful'), 200


@app.post('/api/reset-password')
def reset_password():
    """
    POST /api/reset-password
    Verifies OTP a final time, updates the password hash, then deletes the OTP.
    """
    data         = request.get_json() or {}
    email        = data.get('email', '').strip().lower()
    new_password = data.get('newPassword', '')
    otp          = data.get('otp', '').strip()

    if not email or not new_password or not otp:
        return jsonify(success=False, message='All fields are required'), 400

    with get_db() as conn:
        row = conn.execute(
            'SELECT otp, expiresAt FROM otps WHERE email = ?', (email,)
        ).fetchone()

        if not row or row['otp'] != otp:
            return jsonify(
                success=False,
                message='Invalid session context or expired verification code'
            ), 400

        if row['expiresAt'] < int(time.time() * 1000):
            return jsonify(success=False, message='Verification code has expired'), 400

        password_hash = hash_password(new_password)

        conn.execute(
            'UPDATE users SET passwordHash = ? WHERE email = ?',
            (password_hash, email)
        )
        conn.execute('DELETE FROM otps WHERE email = ?', (email,))
        conn.commit()

    return jsonify(success=True, message='Password reset successfully'), 200


# ── Entry Point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    init_db()
    print('=========================================================')
    print(f'[READY] HRM Portal Flask Backend is running on port {PORT}')
    print('=========================================================')
    app.run(host='0.0.0.0', port=PORT, debug=False)

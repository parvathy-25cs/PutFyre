=========================================================
      HRM Employee Portal - Setup & Running Guide
=========================================================

To run this application on another machine, follow these simple steps:

1. PREREQUISITE:
   Make sure Python 3.8 or later is installed on the computer. If not, download
   and install it from:
   https://www.python.org/downloads/

   During installation, tick "Add Python to PATH" so the command is available
   system-wide.

2. STARTING THE BACKEND SERVER:
   - Double-click the "start.bat" file.
   - If this is the first time running the app, it will automatically install
     all required packages (Flask, flask-cors, python-dotenv).
   - Once completed, you will see:
       "🚀 HRM Portal Flask Backend is running on port 3000"
   - Keep this window open while using the application.

3. OPENING THE WEB APPLICATION:
   - The browser should open automatically to http://localhost:3000
   - Alternatively, open any browser and navigate to http://localhost:3000
   - You can now Sign Up, Sign In, and use the portal.

4. EMAIL CONFIGURATION (OPTIONAL):
   - To send verification codes (OTP) to real email addresses, update the
     ".env" file in this directory with your SMTP server / Gmail credentials.
   - If SMTP is not configured in ".env", the server will log simulated OTP
     codes in the "start.bat" command prompt window.

5. DATABASE (OPTIONAL):
   - The application uses a local SQLite database stored in "hrm_database.db".
   - If you want to start with a fresh, clean database, simply delete
     "hrm_database.db". The server will create a new empty one automatically.

=========================================================
      MANUAL INSTALL (if start.bat auto-install fails)
=========================================================

   Open a terminal in this directory and run:

       pip install flask flask-cors python-dotenv

   Then start the server with:

       python server.py

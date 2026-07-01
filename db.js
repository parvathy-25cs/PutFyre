/**
 * HRM Project - Client-Side API Connector & Session Manager
 * Connects browser pages to the Node.js Express backend and manages user sessions.
 */

class HRMDatabase {
    static API_URL = 'http://localhost:3000/api';
    static SESSION_KEY = 'hrm_session';

    /**
     * Helper to make JSON POST requests to the backend API
     * @param {string} endpoint 
     * @param {object} data 
     * @returns {Promise<object>} Response data
     */
    static async apiPost(endpoint, data) {
        try {
            const response = await fetch(`${this.API_URL}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error(`API Error on ${endpoint}:`, error);
            return {
                success: false,
                message: 'Unable to connect to the backend server. Please ensure the server is running.'
            };
        }
    }

    /**
     * Registers a new user via API
     * @param {string} name 
     * @param {string} email 
     * @param {string} password 
     * @returns {Promise<{success: boolean, message: string, user?: object}>}
     */
    static async registerUser(name, email, password) {
        return await this.apiPost('/register', { name, email, password });
    }

    /**
     * Validates credentials and logs in the user via API
     * @param {string} identifier (Employee ID or Email address)
     * @param {string} password 
     * @returns {Promise<{success: boolean, message: string, user?: object}>}
     */
    static async loginUser(identifier, password) {
        const result = await this.apiPost('/login', { identifier, password });

        if (result.success && result.user) {
            // Save active session locally for instant guards checking
            localStorage.setItem(this.SESSION_KEY, JSON.stringify(result.user));
        }

        return result;
    }

    /**
     * Checks if a user with the specified email exists
     * @param {string} email 
     * @returns {Promise<boolean>} True if registered, false otherwise
     */
    static async emailExists(email) {
        const result = await this.apiPost('/check-email', { email });
        return result.success && result.exists;
    }

    /**
     * Generates and dispatches a verification code to the email inbox
     * @param {string} email 
     * @returns {Promise<{success: boolean, message: string, smtpConfigured?: boolean, devOtp?: string}>}
     */
    static async sendOTP(email) {
        return await this.apiPost('/send-otp', { email });
    }

    /**
     * Matches the entered code against records
     * @param {string} email 
     * @param {string} otp 
     * @returns {Promise<{success: boolean, message: string}>}
     */
    static async verifyOTP(email, otp) {
        return await this.apiPost('/verify-otp', { email, otp });
    }

    /**
     * Resets the user password
     * @param {string} email 
     * @param {string} newPassword 
     * @param {string} otp 
     * @returns {Promise<{success: boolean, message: string}>}
     */
    static async resetPassword(email, newPassword, otp) {
        return await this.apiPost('/reset-password', { email, newPassword, otp });
    }

    /**
     * Gets the active session user details synchronously
     * @returns {object|null}
     */
    static getCurrentUser() {
        const session = localStorage.getItem(this.SESSION_KEY);
        return session ? JSON.parse(session) : null;
    }

    /**
     * Terminates the active session
     */
    static logout() {
        localStorage.removeItem(this.SESSION_KEY);
    }

    /**
     * Page guard: Redirects to login if user is not authenticated
     */
    static requireAuth() {
        if (!this.getCurrentUser()) {
            window.location.href = 'login.html';
        }
    }

    /**
     * Page guard: Redirects to dashboard if user is already authenticated
     */
    static requireNoAuth() {
        if (this.getCurrentUser()) {
            window.location.href = 'dashboard.html';
        }
    }
}

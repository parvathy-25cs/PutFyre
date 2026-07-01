import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { Service } = require('node-windows');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the Windows Service
const svc = new Service({
    name: 'HRM Portal Server',
    description: 'Automatically starts the HRM Portal Express backend on Windows boot.',
    script: path.join(__dirname, 'server.js'),
    nodeOptions: [],
    env: [
        { name: 'PORT', value: '3000' }
    ]
});

// Listen for install events
svc.on('install', () => {
    console.log('✅ HRM Portal Server service installed successfully!');
    console.log('🚀 Starting service now...');
    svc.start();
});

svc.on('start', () => {
    console.log('');
    console.log('=========================================================');
    console.log('✅ HRM Portal Server is now running as a Windows Service!');
    console.log('   It will auto-start every time Windows boots.');
    console.log('   Port: 3000');
    console.log('=========================================================');
    console.log('');
    console.log('To manage the service:');
    console.log('  Stop:        sc stop "HRM Portal Server"');
    console.log('  Start:       sc start "HRM Portal Server"');
    console.log('  Uninstall:   node uninstall-service.js');
    console.log('');
});

svc.on('alreadyinstalled', () => {
    console.log('⚠️  HRM Portal Server service is already installed.');
    console.log('   To reinstall, run: node uninstall-service.js first.');
});

svc.on('error', (err) => {
    console.error('❌ Service error:', err);
});

// Install the service
console.log('Installing HRM Portal Server as a Windows Service...');
svc.install();

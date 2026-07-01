import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { Service } = require('node-windows');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Reference the same service
const svc = new Service({
    name: 'HRM Portal Server',
    script: path.join(__dirname, 'server.js')
});

svc.on('uninstall', () => {
    console.log('');
    console.log('=========================================================');
    console.log('✅ HRM Portal Server service has been uninstalled.');
    console.log('   The server will no longer auto-start on Windows boot.');
    console.log('=========================================================');
    console.log('');
    console.log('To reinstall, run: node install-service.js');
});

svc.on('error', (err) => {
    console.error('❌ Service error:', err);
});

console.log('Uninstalling HRM Portal Server Windows Service...');
svc.uninstall();

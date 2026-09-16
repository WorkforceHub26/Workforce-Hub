import { defineConfig } from 'vite';
import { resolve, join } from 'path';
import fs from 'fs';
import tailwindcss from '@tailwindcss/vite';
import { handleCreateLineLink, handleLineWebhook, handleSendNotification, handleClearApproverLine, handleRecordLoginLog, handleGetLoginLogs, handlePurgeLoginLogs, handleOcrScan, handleHrChatbot, handleWebAuthnRegisterVerify, handleWebAuthnGetCredentials, handleWebAuthnDeleteCredential } from './api-handlers.js';

export default defineConfig({
  plugins: [
    tailwindcss(),
    {
      name: 'api-line-handler',
      configureServer(server) {
        server.middlewares.use('/api/create-line-link', (req, res) => {
          if (req.method === 'POST') handleCreateLineLink(req, res);
          else res.end();
        });
        server.middlewares.use('/api/clear-approver-line', (req, res) => {
          if (req.method === 'POST') handleClearApproverLine(req, res);
          else res.end();
        });
        server.middlewares.use('/api/line-webhook', (req, res) => {
          if (req.method === 'POST') handleLineWebhook(req, res);
          else res.end();
        });
        server.middlewares.use('/api/send-notification', (req, res) => {
          if (req.method === 'POST') handleSendNotification(req, res);
          else res.end();
        });
        server.middlewares.use('/api/record-login-log', (req, res) => {
          if (req.method === 'POST') handleRecordLoginLog(req, res);
          else res.end();
        });
        server.middlewares.use('/api/login-logs', (req, res) => {
          if (req.method === 'GET') handleGetLoginLogs(req, res);
          else res.end();
        });
        server.middlewares.use('/api/purge-login-logs', (req, res) => {
          if (req.method === 'POST') handlePurgeLoginLogs(req, res);
          else res.end();
        });
        server.middlewares.use('/api/ocr-scan', (req, res) => {
          if (req.method === 'POST') handleOcrScan(req, res);
          else res.end();
        });
        server.middlewares.use('/api/hr-chatbot', (req, res) => {
          if (req.method === 'POST') handleHrChatbot(req, res);
          else res.end();
        });
        server.middlewares.use('/api/webauthn/register-verify', (req, res) => {
          if (req.method === 'POST') handleWebAuthnRegisterVerify(req, res);
          else res.end();
        });
        server.middlewares.use('/api/webauthn/credentials', (req, res) => {
          if (req.method === 'GET') handleWebAuthnGetCredentials(req, res);
          else if (req.method === 'DELETE') handleWebAuthnDeleteCredential(req, res);
          else res.end();
        });
        server.middlewares.use((req, res, next) => {
          const urlPath = req.url.split('?')[0];
          if (urlPath === '/manifest.json') {
            const manifestDist = resolve(__dirname, 'dist/manifest.json');
            const manifestPub = resolve(__dirname, 'public/manifest.json');
            const manifestRoot = resolve(__dirname, 'manifest.json');
            const targetPath = fs.existsSync(manifestPub) ? manifestPub : (fs.existsSync(manifestDist) ? manifestDist : manifestRoot);
            if (fs.existsSync(targetPath)) {
              const content = fs.readFileSync(targetPath, 'utf8');
              res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
              res.setHeader('Cache-Control', 'no-cache');
              return res.end(content);
            }
          }
          if (urlPath === '/sw.js') {
            const swPub = resolve(__dirname, 'public/sw.js');
            const swDist = resolve(__dirname, 'dist/sw.js');
            const swRoot = resolve(__dirname, 'sw.js');
            let content = '';
            if (fs.existsSync(swPub)) content = fs.readFileSync(swPub, 'utf8');
            else if (fs.existsSync(swRoot)) content = fs.readFileSync(swRoot, 'utf8');
            else if (fs.existsSync(swDist)) content = fs.readFileSync(swDist, 'utf8');
            else content = '// PVT SW\nself.addEventListener("install", e => self.skipWaiting());\nself.addEventListener("activate", e => self.clients.claim());';

            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.setHeader('Service-Worker-Allowed', '/');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.end(content);
          }
          next();
        });
      }
    }
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        userIndex: resolve(__dirname, 'pages/user/index-user.html'),
        userProfile: resolve(__dirname, 'pages/user/profile-user.html'),
        userLeave: resolve(__dirname, 'pages/user/leave-user.html'),
        userLeaveHistory: resolve(__dirname, 'pages/user/leave-history.html'),
        userLeaveRules: resolve(__dirname, 'pages/user/leave-rules.html'),
        userFullGuide: resolve(__dirname, 'pages/user/full-guide.html'),
        userHolidays: resolve(__dirname, 'pages/user/holidays.html'),
        hrHome: resolve(__dirname, 'pages/hr/home.html'),
        hrLeave: resolve(__dirname, 'pages/hr/hr.html'),
        hrManagement: resolve(__dirname, 'pages/hr/management.html'),
      },
    },
  },
});

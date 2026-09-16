import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { handleCreateLineLink, handleLineWebhook, handleSendNotification, handleClearApproverLine, handleRecordLoginLog, handleGetLoginLogs, handlePurgeLoginLogs, handleOcrScan, handleHrChatbot, handleTestLineConnection, handleWebAuthnRegisterVerify, handleWebAuthnGetCredentials, handleWebAuthnDeleteCredential } from './api-handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000;

app.use(express.json());

// API Endpoints
app.post('/api/create-line-link', handleCreateLineLink);
app.post('/api/clear-approver-line', handleClearApproverLine);
app.post('/api/line-webhook', handleLineWebhook);
app.post('/api/send-notification', handleSendNotification);
app.post('/api/test-line-connection', handleTestLineConnection);
app.post('/api/record-login-log', handleRecordLoginLog);
app.get('/api/login-logs', handleGetLoginLogs);
app.post('/api/purge-login-logs', handlePurgeLoginLogs);
app.post('/api/ocr-scan', handleOcrScan);
app.post('/api/hr-chatbot', handleHrChatbot);
app.post('/api/webauthn/register-verify', handleWebAuthnRegisterVerify);
app.get('/api/webauthn/credentials', handleWebAuthnGetCredentials);
app.delete('/api/webauthn/credentials', handleWebAuthnDeleteCredential);

// PWA & Static file explicit routes
app.get('/manifest.json', (req, res) => {
  const distPath = join(__dirname, 'dist', 'manifest.json');
  const pubPath = join(__dirname, 'public', 'manifest.json');
  const rootPath = join(__dirname, 'manifest.json');
  const filePath = fs.existsSync(pubPath) ? pubPath : (fs.existsSync(distPath) ? distPath : rootPath);
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.sendFile(filePath);
});

app.get('/sw.js', (req, res) => {
  const distPath = join(__dirname, 'dist', 'sw.js');
  const pubPath = join(__dirname, 'public', 'sw.js');
  const rootPath = join(__dirname, 'sw.js');
  const filePath = fs.existsSync(pubPath) ? pubPath : (fs.existsSync(distPath) ? distPath : rootPath);
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(filePath);
});

app.get('/metadata.json', (req, res) => {
  const distPath = join(__dirname, 'dist', 'metadata.json');
  const pubPath = join(__dirname, 'public', 'metadata.json');
  const rootPath = join(__dirname, 'metadata.json');
  const filePath = fs.existsSync(pubPath) ? pubPath : (fs.existsSync(distPath) ? distPath : rootPath);
  res.type('application/json');
  res.sendFile(filePath);
});

// Serve assets directly from root or dist
app.use('/assets', express.static(join(__dirname, 'dist', 'assets')));
app.use('/assets', express.static(join(__dirname, 'assets')));

// Serve static files from the 'dist' directory
app.use(express.static(join(__dirname, 'dist')));

// Serve clean HTML URLs (e.g. /pages/hr/management -> /pages/hr/management.html)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.includes('.')) {
    const htmlPath = join(__dirname, 'dist', `${req.path.replace(/\/$/, '')}.html`);
    if (fs.existsSync(htmlPath)) {
      return res.sendFile(htmlPath);
    }
  }
  next();
});

// Guard: API routes & .json requests that reach here must NEVER return HTML fallback
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/api') {
    return res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
  }
  if (req.path.endsWith('.json')) {
    return res.status(404).json({ error: `JSON resource not found: ${req.path}` });
  }
  next();
});

// Fallback to index.html for standard SPA navigation
app.use((req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${port}`);
});

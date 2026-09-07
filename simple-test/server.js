// server.js - Ultra Simple Test Server
const http = require('http');

const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
  if (req.method === 'POST' && req.url === '/test') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        message: 'Server is working!', 
        received: JSON.parse(body || '{}') 
      }));
      console.log('✅ Response sent');
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(3001, () => {
  console.log('🚀 Test server running on http://localhost:3001');
  console.log('Try: POST http://localhost:3001/test');
});
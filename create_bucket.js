const https = require('https');

const req = https.request('https://kvdb.io/', { method: 'POST' }, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log("SUCCESS_BUCKET_ID:", data.trim());
  });
});

req.on('error', (e) => {
  console.error("ERROR:", e);
});

req.end();

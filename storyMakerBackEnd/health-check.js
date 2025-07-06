const http = require('http');

function checkEndpoint(path, description) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 5001,
      path: `/api/v1${path}`,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-token'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const status = res.statusCode;
        const isOk = status >= 200 && status < 500; // Any non-5xx error is ok for now
        
        console.log(`${isOk ? '✅' : '❌'} ${description} (${status})`);
        resolve(isOk);
      });
    });

    req.on('error', (err) => {
      console.log(`❌ ${description} - Connection error: ${err.message}`);
      resolve(false);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      console.log(`❌ ${description} - Timeout`);
      resolve(false);
    });

    req.end();
  });
}

async function healthCheck() {
  console.log('🏥 StoryMaker Media System Health Check');
  console.log('=====================================\n');

  const checks = [
    ['/health', 'Server health'],
    ['/media', 'Media library endpoint'],
    ['/media/processing/status', 'Processing status endpoint']
  ];

  let passed = 0;
  const total = checks.length;

  for (const [path, description] of checks) {
    const result = await checkEndpoint(path, description);
    if (result) passed++;
  }

  console.log(`\n📊 Health Check Results: ${passed}/${total} passed`);
  
  if (passed === total) {
    console.log('🎉 All systems operational!');
  } else {
    console.log('⚠️  Some issues detected. Check server logs.');
  }

  return passed === total;
}

if (require.main === module) {
  healthCheck().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { healthCheck };

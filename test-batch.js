const apiKey = process.env.API_KEY || 'test-key';

fetch('http://localhost:3001/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    apiKey: apiKey,
    prompt: '一只可爱的小猫',
    size: '1024x1024',
    quality: 'auto',
    format: 'png',
    n: 2
  })
})
.then(r => r.json())
.then(data => {
  console.log('Response:', JSON.stringify(data, null, 2));
  console.log('Images count:', data.images?.length);
})
.catch(err => console.error('Error:', err.message));

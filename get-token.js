const fetch = require('node-fetch');

async function getToken() {
  const url = 'http://localhost:9000/auth/user/emailpass';
  const credentials = {
    email: 'admin@astafic.com',
    password: 'Astafic@2024!Secure'
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    const data = await response.json();
    console.log(data.token);
  } catch (error) {
    console.error('Error getting token:', error);
  }
}

getToken();

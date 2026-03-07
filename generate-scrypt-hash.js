const scrypt = require('scrypt-kdf');

async function generateScryptHash() {
  const password = 'Astafic@2024!Secure';

  // Use the same config as Medusa (from emailpass.js line 18)
  const hashConfig = { logN: 15, r: 8, p: 1 };

  console.log('Generating scrypt hash for password:', password);
  console.log('Using config:', hashConfig);

  const passwordHash = await scrypt.kdf(password, hashConfig);
  const base64Hash = passwordHash.toString('base64');

  console.log('\nBase64-encoded scrypt hash:');
  console.log(base64Hash);

  return base64Hash;
}

generateScryptHash().catch(console.error);

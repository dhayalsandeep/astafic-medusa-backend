import bcrypt from 'bcryptjs';

const password = 'Astafic@2024!Secure';
const hash = '$2b$10$PmLdJgapf1O5/CsBpabI0.aK7Uy8WQ6L8j4jHflVBx6bDzaEdeODK';

const isMatch = bcrypt.compareSync(password, hash);

console.log('Password:', password);
console.log('Hash:', hash);
console.log('Match:', isMatch);

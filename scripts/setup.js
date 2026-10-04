import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { openDatabase, passwordHash, token } from '../server/db.js';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const db = openDatabase();
const people = [
  ['د. أحمد رشاد', 'rashad', 'doctor'], ['د. تامر النشار', 'elnashar', 'doctor'],
  ['د. أحمد الألفي', 'elalfy', 'doctor'], ['دنيا', 'donia', 'assistant']
];

try {
  for (const [name, username, role] of people) {
    const existing = await db.query('SELECT id FROM users WHERE LOWER(username)=LOWER(?)', [username]);
    if (existing.rowCount) {
      console.log(`${username}: موجود بالفعل — لم تتغير كلمة المرور`);
      continue;
    }
    const password = token().slice(0, 20);
    await db.query('INSERT INTO users(name,username,password_hash,role) VALUES(?,?,?,?)',
      [name, username, passwordHash(password), role]);
    console.log(`${name} | Login: ${username} | Password: ${password}`);
  }
  console.log('احفظ كلمات المرور في مدير كلمات مرور. لا تشارك حسابات الأطباء.');
} finally {
  await db.close();
}

import { createApp } from '../server/app.js';
import { openDatabase } from '../server/db.js';

const db = openDatabase();
const app = createApp({ db });

export const config = { runtime: 'nodejs' };
export default app;

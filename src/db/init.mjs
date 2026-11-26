import { getDb, closeDb } from './client.mjs';
import { seedDatabase } from './seed.mjs';

const db = getDb();
seedDatabase(db);
console.log('Database schema applied and baseline configuration seeded successfully.');
closeDb();

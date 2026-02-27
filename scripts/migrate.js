#!/usr/bin/env node
// ============================================================================
// Database Migration Script
// ============================================================================
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dbType = args.includes('--postgres') ? 'postgres' : 'sqlite';

async function runMigration() {
  const migrationsDir = path.join(__dirname, '../database/migrations');
  const suffix = dbType === 'postgres' ? '.sql' : '_sqlite.sql';

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith(suffix))
    .sort();

  if (files.length === 0) {
    console.log('No migrations found.');
    return;
  }

  if (dbType === 'sqlite') {
    const Database = require('better-sqlite3');
    const dbPath = args.find(a => a.startsWith('--db='))?.slice(5) || './hospital_transparency.db';
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    for (const file of files) {
      console.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      db.exec(sql);
    }

    db.close();
    console.log('SQLite migrations complete.');
  } else {
    const { Client } = require('pg');
    const client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'hospital_transparency',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
    });

    await client.connect();

    for (const file of files) {
      console.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await client.query(sql);
    }

    await client.end();
    console.log('PostgreSQL migrations complete.');
  }
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

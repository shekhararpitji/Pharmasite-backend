#!/usr/bin/env node
require('dotenv').config();

const { initClickHouse } = require('../config/clickhouse');
const clickhouseUserService = require('../services/clickhouseUserService');

(async () => {
  try {
    const ok = await initClickHouse();
    if (!ok) {
      console.error('Failed to initialize ClickHouse client. Check CLICKHOUSE_URL and credentials.');
      process.exit(1);
    }

    const email = 'super.admin@gmail.com';
    const password = 'super.admin@123';
    const partyName = process.env.CLICKHOUSE_ADMIN_PARTYNAME || 'Pharmasa Analytics';
    const name = process.env.CLICKHOUSE_ADMIN_NAME || 'Admin';

    // Check if user already exists
    const existing = await clickhouseUserService.getUserByEmail(email);
    if (existing) {
      console.log(`ClickHouse admin with email ${email} already exists (id=${existing.id}).`);
      process.exit(0);
    }

    const created = await clickhouseUserService.createUser({
      partyName,
      name,
      email,
      password,
      role: 'admin'
    }, 0);

    console.log('ClickHouse admin created:', created);
    process.exit(0);
  } catch (err) {
    console.error('Failed to seed ClickHouse admin:', err.message || err);
    process.exit(1);
  }
})();

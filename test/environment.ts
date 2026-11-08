import 'dotenv/config';

// Integration tests own isolated data; only demo tests explicitly enable seeding.
process.env.DEMO_MODE = 'false';

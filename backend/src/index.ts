import { Elysia } from "elysia";

import { createSchema, populateChampionStats } from "./db/migrations/champion-stats";
import { migrationsSync } from "./cron/migrations-sync";

async function start() {
  // Create schema synchronously (fast, needed before server starts)
  console.log('🗄️  Initializing database schema...');
  await createSchema();
  console.log('✅ Schema ready');

  // Start server immediately
  const app = new Elysia();
  app.use(migrationsSync)
  
  app.listen(3000);

  console.log(
    `🚀 Rez Backend is running at ${app.server?.hostname}:${app.server?.port}`
  );

  // Populate data in background (non-blocking)
  populateChampionStats().catch((err) => {
    console.error('⚠️  Background migration failed (server still running):', err);
  });
}

start().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});

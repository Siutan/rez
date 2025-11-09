import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { migrationsSync } from "./cron/migrations-sync";
import { userStatsRoute } from "./routes/user-stats";
import { rankRoute } from "./routes/rank";
import { startUserStatsWorker, stopUserStatsWorker } from "./workers/user-stats-worker";

// Start server immediately
const app = new Elysia();
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.use(migrationsSync);
app.use(userStatsRoute);
app.use(rankRoute);

// Start background worker
startUserStatsWorker();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await stopUserStatsWorker();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await stopUserStatsWorker();
  process.exit(0);
});

app.listen(3000);

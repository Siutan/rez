import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { migrationsSync } from "./cron/migrations-sync";
import { userStatsRoute } from "./routes/user-stats";

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

app.listen(3000);

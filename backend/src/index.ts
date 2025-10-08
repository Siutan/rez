import { Elysia } from "elysia";
import { migrationsSync } from "./cron/migrations-sync";
import { userStatsRoute } from "./routes/user-stats";

// Start server immediately
const app = new Elysia();
app.use(migrationsSync);
app.use(userStatsRoute);

app.listen(3000);

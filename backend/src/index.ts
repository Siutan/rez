import { Elysia } from "elysia";
import { migrationsSync } from "./cron/migrations-sync";

// Start server immediately
const app = new Elysia();
app.use(migrationsSync)

app.listen(3000);

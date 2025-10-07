import { cron } from '@elysiajs/cron';
import { createSchema, populateChampionStats } from "../db/migrations/champion-stats";


export const migrationsSync = cron({
    name: 'migrations-sync',
    pattern: '0 0 * * *',
    async run() {
        console.log('Running Migrations Sync')
        await createSchema();
        await populateChampionStats();
        console.log('Migrations Sync Complete')
    }
})
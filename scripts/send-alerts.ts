import "./_env";
import { runAlerts } from "../lib/alerts/run";
import { db } from "../lib/db";

/** `npm run send-alerts [-- --force]` — send due alert digests now (--force ignores the schedule). */
runAlerts({ force: process.argv.includes("--force") })
  .then((s) => console.log("Alerts:", s))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

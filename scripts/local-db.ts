// Local development Postgres (real Postgres binaries via the `embedded-postgres` dev dependency).
// No Docker or system install needed. Data lives in ./.local-pg (git-ignored).
//   npm run db:local            -> starts Postgres on localhost:54329 and keeps running
// Then, in another terminal, point Prisma / the app at it (this never touches .env.local's remote DB):
//   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:54329/pilanilabs"; $env:DIRECT_URL=$env:DATABASE_URL
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";

const PORT = Number(process.env.LOCAL_PG_PORT ?? 54329);
const DIR = ".local-pg";

async function main() {
  const fresh = !fs.existsSync(`${DIR}/PG_VERSION`);
  const pg = new EmbeddedPostgres({ databaseDir: DIR, user: "postgres", password: "postgres", port: PORT, persistent: true });
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase("pilanilabs");
  console.log(`Local Postgres ready: postgresql://postgres:postgres@localhost:${PORT}/pilanilabs`);
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

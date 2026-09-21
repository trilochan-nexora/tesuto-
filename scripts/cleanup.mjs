import "dotenv/config"

// Dynamic imports ensure dotenv has populated DATABASE_URL before db.ts builds
// its connection pool (static ESM dependencies are otherwise evaluated first).
const [{ runMaintenance }, { closeDatabase }] = await Promise.all([
  import("../lib/maintenance.ts"),
  import("../lib/db.ts"),
])

try {
  const result = await runMaintenance()
  console.log(JSON.stringify(result))
} finally {
  await closeDatabase()
}

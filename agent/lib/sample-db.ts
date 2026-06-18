// A toy SQLite-in-memory stand-in. Swap for your real warehouse in Step 4.
import initSqlJs from "sql.js";

const SEED = `
  CREATE TABLE orders (id INTEGER, customer_id INTEGER, amount_cents INTEGER, created_at TEXT);
  INSERT INTO orders VALUES
    (1, 10, 4200, '2026-05-01'), (2, 10, 1500, '2026-05-03'),
    (3, 11, 9900, '2026-05-04'), (4, 12,  800, '2026-05-06');
  CREATE TABLE customers (id INTEGER, name TEXT, plan TEXT);
  INSERT INTO customers VALUES
    (10, 'Acme', 'pro'), (11, 'Globex', 'enterprise'), (12, 'Initech', 'free');
`;

let dbPromise: Promise<import("sql.js").Database> | null = null;

async function db() {
  dbPromise ??= initSqlJs().then((SQL) => {
    const database = new SQL.Database();
    database.run(SEED);
    return database;
  });
  return dbPromise;
}

export async function runReadOnlySql(sql: string) {
  const database = await db();
  const [result] = database.exec(sql);
  if (!result) return { columns: [], rows: [] as unknown[][] };
  return { columns: result.columns, rows: result.values };
}

import { defineTool } from "eve/tools";
import { z } from "zod";
import { runReadOnlySql } from "../lib/sample-db.ts";

export default defineTool({
  description:
    "Run a read-only SQL query against the analytics tables (orders, customers) " +
    "and return the columns and rows.",
  inputSchema: z.object({
    sql: z.string().describe("A single read-only SELECT statement."),
  }),
  async execute({ sql }) {
    const { columns, rows } = await runReadOnlySql(sql);
    // Bound the output so a wide query can't flood the model's context.
    return { columns, rows: rows.slice(0, 500), truncated: rows.length > 500 };
  },
});

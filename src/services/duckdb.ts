import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

let db: AsyncDuckDB | null = null;
let conn: AsyncDuckDBConnection | null = null;
let initPromise:
    | Promise<{ db: AsyncDuckDB; conn: AsyncDuckDBConnection }>
    | null = null;

const MAX_IDENTIFIER_LENGTH = 256;
const MAX_STRING_LITERAL_LENGTH = 4096;

function quoteIdentifier(identifier: string): string {
    if (identifier.includes("\0")) {
        throw new Error("Identifier contains invalid null byte");
    }
    if (identifier.length > MAX_IDENTIFIER_LENGTH) {
        throw new Error("Identifier is too long");
    }
    return `"${identifier.replace(/"/g, '""')}"`;
}

function sqlStringLiteral(value: string): string {
    if (value.includes("\0")) {
        throw new Error("String literal contains invalid null byte");
    }
    if (value.length > MAX_STRING_LITERAL_LENGTH) {
        throw new Error("String literal is too long");
    }
    return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Initialize DuckDB-WASM with automatic bundle selection
 */
export async function initDuckDB(): Promise<{
    db: AsyncDuckDB;
    conn: AsyncDuckDBConnection;
}> {
    if (db && conn) {
        return { db, conn };
    }

    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        const duckdb = await import("@duckdb/duckdb-wasm");

        // Use JsDelivr CDN bundles
        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

        // Select the best bundle for the browser
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

        const workerUrl = URL.createObjectURL(
            new Blob([`importScripts("${bundle.mainWorker}");`], {
                type: "text/javascript",
            })
        );

        let worker: Worker | null = null;
        let nextDb: AsyncDuckDB | null = null;
        let nextConn: AsyncDuckDBConnection | null = null;

        try {
            // Create worker and logger
            worker = new Worker(workerUrl);
            const logger = new duckdb.ConsoleLogger();

            // Instantiate DuckDB
            nextDb = new duckdb.AsyncDuckDB(logger, worker);
            await nextDb.instantiate(bundle.mainModule, bundle.pthreadWorker);

            // Create connection
            nextConn = await nextDb.connect();

            db = nextDb;
            conn = nextConn;

            return { db: nextDb, conn: nextConn };
        } catch (error) {
            if (nextConn) {
                await nextConn.close();
            }
            if (nextDb) {
                await nextDb.terminate();
            }
            if (worker) {
                worker.terminate();
            }
            throw error;
        } finally {
            URL.revokeObjectURL(workerUrl);
        }
    })();

    try {
        return await initPromise;
    } finally {
        initPromise = null;
    }
}

/**
 * Get the current DuckDB connection
 */
export async function getConnection(): Promise<AsyncDuckDBConnection> {
    if (!conn) {
        await initDuckDB();
    }
    return conn!;
}

/**
 * Execute a SQL query and return the result as an Arrow table
 */
export async function query(sql: string) {
    const connection = await getConnection();
    return connection.query(sql);
}

/**
 * Execute a SQL query and return results as JavaScript objects
 */
export async function queryAsObjects<T = Record<string, unknown>>(
    sql: string
): Promise<T[]> {
    const result = await query(sql);
    return result.toArray().map((row: { toJSON: () => T }) => row.toJSON());
}

/**
 * Get list of all tables in the database
 */
export async function getTables(): Promise<string[]> {
    const result = await queryAsObjects<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
    );
    return result.map((row) => row.table_name);
}

/**
 * Get schema information for a table
 */
export async function getTableSchema(
    tableName: string
): Promise<{ column_name: string; data_type: string }[]> {
    const quotedTableName = quoteIdentifier(tableName);
    return queryAsObjects<{ column_name: string; data_type: string }>(
        `DESCRIBE ${quotedTableName}`
    );
}

/**
 * Get row count for a table
 */
export async function getTableRowCount(tableName: string): Promise<number> {
    const quotedTableName = quoteIdentifier(tableName);
    const result = await queryAsObjects<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${quotedTableName}`
    );
    return result[0]?.count ?? 0;
}

/**
 * Column summary statistics from SUMMARIZE
 */
export interface ColumnSummary {
    column_name: string;
    column_type: string;
    min: string | null;
    max: string | null;
    approx_unique: number | bigint;
    avg: number | null;
    std: number | null;
    q25: string | null;
    q50: string | null;
    q75: string | null;
    count: number | bigint;
    null_percentage: number;
}

/**
 * Get summary statistics for a table using DuckDB's SUMMARIZE
 */
export async function summarizeTable(tableName: string): Promise<ColumnSummary[]> {
    const quotedTableName = quoteIdentifier(tableName);
    const result = await queryAsObjects<ColumnSummary>(
        `SUMMARIZE SELECT * FROM ${quotedTableName}`
    );
    return result;
}

/**
 * Load a CSV file from a browser File object into DuckDB
 */
export async function loadCSVFile(
    file: File,
    tableName: string
): Promise<{ rowCount: number; columns: { column_name: string; data_type: string }[] }> {
    if (!db) {
        await initDuckDB();
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Register the file in DuckDB's virtual file system
    await db!.registerFileBuffer(file.name, uint8Array);

    const connection = await getConnection();
    const quotedTableName = quoteIdentifier(tableName);
    const fileNameLiteral = sqlStringLiteral(file.name);
    await connection.query(
        `CREATE OR REPLACE TABLE ${quotedTableName} AS SELECT * FROM read_csv_auto(${fileNameLiteral})`
    );

    const columns = await getTableSchema(tableName);
    const rowCount = await getTableRowCount(tableName);

    return { rowCount, columns };
}

/**
 * Load a Parquet file from a browser File object into DuckDB
 */
export async function loadParquetFile(
    file: File,
    tableName: string
): Promise<{ rowCount: number; columns: { column_name: string; data_type: string }[] }> {
    if (!db) {
        await initDuckDB();
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    await db!.registerFileBuffer(file.name, uint8Array);

    const connection = await getConnection();
    const quotedTableName = quoteIdentifier(tableName);
    const fileNameLiteral = sqlStringLiteral(file.name);
    await connection.query(
        `CREATE OR REPLACE TABLE ${quotedTableName} AS SELECT * FROM read_parquet(${fileNameLiteral})`
    );

    const columns = await getTableSchema(tableName);
    const rowCount = await getTableRowCount(tableName);

    return { rowCount, columns };
}

/**
 * Load a JSON file from a browser File object into DuckDB
 */
export async function loadJSONFile(
    file: File,
    tableName: string
): Promise<{ rowCount: number; columns: { column_name: string; data_type: string }[] }> {
    if (!db) {
        await initDuckDB();
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    await db!.registerFileBuffer(file.name, uint8Array);

    const connection = await getConnection();
    const quotedTableName = quoteIdentifier(tableName);
    const fileNameLiteral = sqlStringLiteral(file.name);
    await connection.query(
        `CREATE OR REPLACE TABLE ${quotedTableName} AS SELECT * FROM read_json_auto(${fileNameLiteral})`
    );

    const columns = await getTableSchema(tableName);
    const rowCount = await getTableRowCount(tableName);

    return { rowCount, columns };
}

/**
 * Load a data file (CSV, Parquet, or JSON) based on file extension
 */
export async function loadDataFile(
    file: File,
    tableName?: string
): Promise<{
    tableName: string;
    rowCount: number;
    columns: { column_name: string; data_type: string }[];
    fileType: "csv" | "parquet" | "json";
}> {
    const extension = file.name.split(".").pop()?.toLowerCase();

    // Generate table name from file name if not provided
    const finalTableName =
        tableName ||
        file.name
            .replace(/\.[^/.]+$/, "") // Remove extension
            .replace(/[^a-zA-Z0-9_]/g, "_") // Replace special chars with underscore
            .replace(/^(\d)/, "_$1"); // Prefix with underscore if starts with number

    let result;
    let fileType: "csv" | "parquet" | "json";

    switch (extension) {
        case "csv":
            result = await loadCSVFile(file, finalTableName);
            fileType = "csv";
            break;
        case "parquet":
            result = await loadParquetFile(file, finalTableName);
            fileType = "parquet";
            break;
        case "json":
            result = await loadJSONFile(file, finalTableName);
            fileType = "json";
            break;
        default:
            throw new Error(`Unsupported file type: ${extension}`);
    }

    return {
        tableName: finalTableName,
        ...result,
        fileType,
    };
}

/**
 * Drop a table from the database
 */
export async function dropTable(tableName: string): Promise<void> {
    const connection = await getConnection();
    const quotedTableName = quoteIdentifier(tableName);
    await connection.query(`DROP TABLE IF EXISTS ${quotedTableName}`);
}

/**
 * Close the DuckDB connection and terminate the worker
 */
export async function closeDuckDB(): Promise<void> {
    if (conn) {
        await conn.close();
        conn = null;
    }
    if (db) {
        await db.terminate();
        db = null;
    }
    initPromise = null;
}

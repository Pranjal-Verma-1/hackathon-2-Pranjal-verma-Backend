/**
 * Type declarations for pg (node-postgres)
 */
declare module "pg" {
  import { EventEmitter } from "events";

  export interface PoolConfig {
    connectionString?: string;
    user?: string;
    password?: string | (() => string | Promise<string>);
    host?: string;
    port?: number;
    database?: string;
    ssl?: boolean | { rejectUnauthorized?: boolean; ca?: string; cert?: string; key?: string };
    max?: number;
    min?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    allowExitOnIdle?: boolean;
  }

  export interface QueryResultRow {
    [column: string]: any;
  }

  export interface QueryResult<R extends QueryResultRow = any> {
    rows: R[];
    fields: Array<{ name: string; dataTypeID: number }>;
    rowCount: number | null;
    command: string;
    oid: number;
  }

  export interface PoolClient extends EventEmitter {
    query<R extends QueryResultRow = any, I extends any[] = any[]>(
      queryTextOrConfig: string,
      values?: I
    ): Promise<QueryResult<R>>;
    release(err?: Error | boolean): void;
  }

  export class Pool extends EventEmitter {
    constructor(config?: PoolConfig);
    connect(): Promise<PoolClient>;
    query<R extends QueryResultRow = any, I extends any[] = any[]>(
      queryTextOrConfig: string,
      values?: I
    ): Promise<QueryResult<R>>;
    end(): Promise<void>;
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  }
}


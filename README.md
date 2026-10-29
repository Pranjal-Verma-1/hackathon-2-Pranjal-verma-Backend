# BizPilot — Business Operations Kernel (Backend)

BizPilot Backend is a robust, production-ready REST API service powering the BizPilot SMB operations copilot. It manages multi-tenant sales billing, real-time inventory management, wholesale procurement, customer Khata ledgers, and application-level authentication backed by PostgreSQL.

---

## Architectural Highlights

- **Runtime & Framework:** Node.js, Express, TypeScript.
- **Database Engine:** Standard PostgreSQL via node-postgres (`pg.Pool`) with connection pooling and SSL encryption.
- **Zero Proprietary Lock-In:** Strictly standard PostgreSQL. Does NOT use Supabase Auth, Storage, Realtime, Edge Functions, or PostgREST.
- **Tenant Isolation:** Enforced on every database read and write (`tenant_id = $1`).
- **Atomic Multi-Table Transactions:** POS billing, stock deduction, and PO restocking execute inside atomic transaction blocks (`BEGIN ... COMMIT / ROLLBACK`).
- **Khata Ledger Consistency:** Customer ledger updates use row-level locking (`SELECT ... FOR UPDATE`) to prevent race conditions during rapid counter payments.
- **Application-Managed Auth:** Salted password hashing via Node.js standard `crypto.scrypt` and HMAC-signed session tokens.

---

## Database Schema & Migrations

The database schema is defined in declarative, idempotent SQL migrations inside `/migrations`:
- `20261029000001_initial_schema.sql` — Core tables and constraints
- `20261029000002_auth_and_memberships.sql` — Tenant memberships and user models
- `20261029000003_standard_postgres.sql` — Canonical standard PostgreSQL tables, indexes, and default tenant
- `seed.sql` — Default seed catalog and suppliers for **Shree Ganesh Kirana Store**

---

## Getting Started

### Prerequisites

- Node.js 20+ (Node 24 recommended)
- PostgreSQL database (or Supabase hosted PostgreSQL)
- `npm` or `pnpm`

### Installation

```bash
# Clone the repository
git clone https://github.com/Pranjal-Verma-1/hackathon-2-Pranjal-verma-Backend.git
cd hackathon-2-Pranjal-verma-Backend

# Install dependencies
npm install
```

### Environment Configuration

Copy the example environment template:

```bash
cp .env.example .env.local
```

Configure your variables in `.env.local`:

```env
PORT=4000
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@[YOUR-HOST]:5432/postgres
SESSION_SECRET=your-random-32-character-session-secret-here
CORS_ORIGIN=http://localhost:3000
NEXT_PUBLIC_DEMO_MODE=false
```

### Apply Migrations

Run the automated migration runner to apply schema and seed data to your PostgreSQL database:

```bash
npm run migrate
```

### Start the Server

```bash
# Development mode (with live reload)
npm run dev

# Production build and run
npm run build
npm run start
```

The server will be available at [http://localhost:4000](http://localhost:4000).

---

## REST API Documentation

### Health & Diagnostics
- `GET /` — Service status and sitemap.
- `GET /api/health` — PostgreSQL ping, roundtrip latency, migration status, and isolation mode.

### Authentication & Sessions
- `GET /api/session` — Verifies user session and tenant memberships.
- `POST /api/auth/signup` — Registers new store operator with scrypt password hashing.
- `POST /api/auth/login` — Authenticates user credentials and issues secure cookie.
- `POST /api/auth/logout` — Clears active session.

### Inventory & Products
- `GET /api/products` — Returns inventory items with search, category, and status filters.
- `POST /api/products/stock` — Adjusts stock level with delta calculation.

### Customers & Khata Udhaar
- `GET /api/customers` — Returns customer records and outstanding balances.
- `POST /api/customers/ledger` — Records atomic debit (credit purchase) or credit (payment received) with row locks.

### Wholesale Purchase Orders
- `GET /api/purchase-orders` — Returns wholesale procurement orders.
- `POST /api/purchase-orders` — Creates new purchase order draft.
- `POST /api/purchase-orders/status` — Updates status (`APPROVED`, `RECEIVED`, etc.). Receiving automatically restocks inventory.

### Counter POS Billing
- `POST /api/sales` — Processes counter sale: creates receipt, line items, deducts inventory stock, and debits customer Khata ledger if payment is Udhaar.

---

## Repository Links

- **Frontend Repository:** [https://github.com/Pranjal-Verma-1/hackathon-2-Pranjal-verma-frontend](https://github.com/Pranjal-Verma-1/hackathon-2-Pranjal-verma-frontend)
- **Backend Repository:** [https://github.com/Pranjal-Verma-1/hackathon-2-Pranjal-verma-Backend](https://github.com/Pranjal-Verma-1/hackathon-2-Pranjal-verma-Backend)

---

## License

MIT License. Designed and built for Hackathon 2026.

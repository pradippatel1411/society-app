# Society Maintenance App

Multi-tenant SaaS for housing society maintenance collection.

## Stack
- Frontend: React + Vite
- API: tRPC on Cloudflare Workers
- Database: Neon Postgres
- Storage: Cloudflare R2
- OTP: MSG91
- Payments: Razorpay UPI

## Hierarchy
Owner → Super Admins → Societies → Committee + Members

CommandWhat it runs
pnpm dev:web 
React frontend http://localhost:5173

pnpm dev:api
API backend http://localhost:8787
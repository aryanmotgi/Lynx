.PHONY: db-up db-down db-reset seed typecheck

db-up:
	docker compose up -d
	@echo "Waiting for Postgres..."
	@until docker exec lynx-postgres pg_isready -U lynx >/dev/null 2>&1; do sleep 1; done
	@echo "Postgres ready on localhost:5433"

db-down:
	docker compose down

db-reset:
	docker compose down -v
	$(MAKE) db-up

seed:
	cp -n .env.example .env 2>/dev/null || true
	pnpm --filter @lynx/db-scripts seed

typecheck:
	pnpm -r typecheck

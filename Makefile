.PHONY: seed typecheck dev.control dev.worker

seed:
	cp -n .env.example .env 2>/dev/null || true
	pnpm --filter @lynx/db-scripts seed

typecheck:
	pnpm -r typecheck

dev.control:
	pnpm --filter @lynx/control dev

dev.worker:
	pnpm --filter @lynx/worker dev

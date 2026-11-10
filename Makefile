SHELL := /bin/bash

.PHONY: install dev api web test lint typecheck build clean stack-up stack-down stack-logs

install:
	npm install

dev:
	npm run dev

api:
	npm run dev -w api

web:
	npm run dev -w web

test:
	npm run test

lint:
	npm run lint

typecheck:
	npm run typecheck

build:
	npm run build

clean:
	rm -rf api/.data web/dist api/dist mcp/dist

stack-up:
	docker compose up --build -d

stack-down:
	docker compose down

stack-logs:
	docker compose logs -f api web

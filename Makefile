ifeq ($(OS), Windows_NT)
	PATH := ./node_modules/.bin;$(PATH)
else
	PATH := ./node_modules/.bin:$(PATH)
endif

run: build
	node out/main

opts += --bundle
opts += --format=esm
opts += --platform=node
opts += --packages=external

build:
	esbuild src/main.ts $(opts) --outfile=out/main.js

migrate~%:
	esbuild migrate/$*.ts $(opts) --outfile=out/migrate/$*.js
	node out/migrate/$*

typecheck:
	tsc --noEmit

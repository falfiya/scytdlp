ifeq ($(OS), Windows_NT)
	PATH := ./node_modules/.bin;$(PATH)
else
	PATH := ./node_modules/.bin:$(PATH)
endif

dev: build
	node tmp/js/main

opts += --bundle
opts += --format=esm
opts += --platform=node
opts += --packages=external

build:
	esbuild src/main.ts $(opts) --outfile=tmp/js/main.js

migrate~%:
	esbuild migrate/$*.ts $(opts) --outfile=tmp/js/migrate/$*.js
	node tmp/js/migrate/$*

typecheck:
	tsc --noEmit

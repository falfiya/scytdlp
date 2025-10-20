ifeq ($(OS), Windows_NT)
	PATH := ./node_modules/.bin;$(PATH)
else
	PATH := ./node_modules/.bin:$(PATH)
endif

export NODE_OPTIONS:=--enable-source-maps

dev: build
	node tmp/js/main

opts += --bundle
opts += --sourcemap
opts += --format=esm
opts += --platform=node
opts += --packages=external

build:
	esbuild src/main.ts $(opts) --outfile=tmp/js/main.js

cache~clear_m3u8: tmp/js/scripts/index.js
	node $< clear_m3u8

migrate~%:
	esbuild migrate/$*.ts $(opts) --outfile=tmp/js/migrate/$*.js
	node tmp/js/migrate/$*

typecheck:
	tsc --noEmit

tmp/js/scripts/%.js: src/scripts/%.ts
	esbuild $< $(opts) --outfile=$@

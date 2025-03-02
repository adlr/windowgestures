#!/bin/sh

## compile schemas
mkdir -p build
cd build
grep -v '@girs' ../src/extension.js > extension.js
cp -p ../src/metadata.json ./
#cp -Rp ../src/pixelProcessor.* ./
cp -Rp ../src/schemas ./schemas

## Remove compiled schemas
rm schemas/gschemas.compiled

## Zip whole files
zip -r ../windowgestures@extension.amarullz.com.zip ./*

## Recompile schemas
glib-compile-schemas schemas/

cd ..

#!/bin/bash

grep -v "@girs" runTests.js > runTests.exec.js
gjs -m runTests.exec.js "$@"

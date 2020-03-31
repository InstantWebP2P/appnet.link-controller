#!/usr/bin/env bash
find . -type f -print0 -name "*.js" -o -name "README.md" -o -name "package.json" | \
xargs -0 sed -i 's/appnet.io/appnet.io/g; s/AppNet.io/AppNet.io/g; s/appnet.io-ws/appnet.io-ws/g; s/AppNet/AppNet/g'


#!/usr/bin/env bash
find . -type f -name "*.js" -print0 | \
xargs -0 sed -i 's/iwebpp@gmail.com/appnet.link@gmail.com/g; s/iwebpp.io/appnet.io/g; s/iWebPP.io/AppNet.io/g; s/iwebpp.io-ws/appnet.io-ws/g; s/iWebPP/AppNet/g'

find . -type f -name "README.md" -print0 | \
xargs -0 sed -i 's/iwebpp@gmail.com/appnet.link@gmail.com/g; s/iwebpp.io/appnet.io/g; s/iWebPP.io/AppNet.io/g; s/iwebpp.io-ws/appnet.io-ws/g; s/iWebPP/AppNet/g'

find . -type f -name "package.json" -print0 | \
xargs -0 sed -i 's/iwebpp@gmail.com/appnet.link@gmail.com/g; s/iwebpp.io/appnet.io/g; s/iWebPP.io/AppNet.io/g; s/iwebpp.io-ws/appnet.io-ws/g; s/iWebPP/AppNet/g'


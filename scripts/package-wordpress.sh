#!/bin/sh
# Builds installable WordPress ZIPs into dist/: the plugin bundles the static dashboard
# from public/ (no Markdown, no source maps) and the optional theme.
set -eu
VERSION=$(node -p "require('./package.json').version")
rm -rf dist build/wordpress && mkdir -p dist build/wordpress
cp -R wordpress/plugin/cll-earthquake-lab build/wordpress/
mkdir -p build/wordpress/cll-earthquake-lab/assets/lab
cp -R public/. build/wordpress/cll-earthquake-lab/assets/lab/
find build/wordpress -name '*.md' -delete
sed -i.bak "s/Version: [0-9.]*/Version: $VERSION/; s/'[0-9]\.[0-9]\.[0-9]'/'$VERSION'/g" build/wordpress/cll-earthquake-lab/cll-earthquake-lab.php && rm build/wordpress/cll-earthquake-lab/cll-earthquake-lab.php.bak
cp -R wordpress/theme/cll-assurance-lab build/wordpress/
sed -i.bak "s/Version: [0-9.]*/Version: $VERSION/; s/'[0-9]\.[0-9]\.[0-9]'/'$VERSION'/g" build/wordpress/cll-assurance-lab/style.css build/wordpress/cll-assurance-lab/functions.php && rm build/wordpress/cll-assurance-lab/*.bak
(cd build/wordpress && zip -qr -X "../../dist/cll-earthquake-lab-$VERSION.zip" cll-earthquake-lab && zip -qr -X "../../dist/cll-assurance-lab-$VERSION.zip" cll-assurance-lab)
(cd dist && sha256sum ./*.zip > SHA256SUMS.txt && cat SHA256SUMS.txt)

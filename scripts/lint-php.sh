#!/bin/sh
set -e
find wordpress -name '*.php' -print0 | xargs -0 -n1 php -l

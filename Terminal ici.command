#!/bin/bash
cd "$(dirname "$0")"
echo "Terminal ouvert dans : $(pwd)"
echo ""
exec $SHELL -l

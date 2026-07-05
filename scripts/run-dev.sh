#!/bin/bash
# Persistent dev server wrapper — survives parent shell exit
cd /home/z/my-project
exec node node_modules/.bin/next dev -p 3000

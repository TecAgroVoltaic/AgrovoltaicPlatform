#!/usr/bin/env sh
# Activa los hooks versionados del repo (.githooks) en este clon.
# Hay que correrlo una vez por clon: git no activa hooks solo, por seguridad.
set -e
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath .githooks
chmod +x .githooks/*
echo "hooks activados: $(ls .githooks | tr '\n' ' ')"

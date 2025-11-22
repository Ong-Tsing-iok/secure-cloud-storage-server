#!/usr/bin/env bash

# Usage:
#  sudo bash ./manage_server.sh <deployment_name> [pod_name]

set -e

if [ -z "$1" ]; then
  echo "Usage: sudo bash $0 <deployment_name> [pod_name]"
  exit 1
fi

DEPLOYMENT="$1"
POD_NAME="$2"

# If pod name not provided, auto-detect the first pod of the deployment
if [ -z "$POD_NAME" ]; then
  echo "No pod specified. Looking up pods for deployment: $DEPLOYMENT"

  POD_NAME=$(sudo kubectl get pods \
    --selector=app="server" \
    -o jsonpath='{.items[0].metadata.name}')

  if [ -z "$POD_NAME" ]; then
    echo "Error: No pods found for deployment '$DEPLOYMENT'."
    exit 1
  fi

  echo "Auto-selected pod: $POD_NAME"
fi

# Exec into the pod
echo "Connecting to pod '$POD_NAME'..."
sudo kubectl exec -it "$POD_NAME" -- ./manage
#!/bin/bash

# Pull the latest ChromaDB image
docker pull chromadb/chroma

# Pull the latest MongoDB image
docker pull mongo

# Run ChromaDB container with port mapping
docker run -d \
  --name chroma \
  -p 8000:8000 \
  --restart unless-stopped \
  chromadb/chroma

# Run MongoDB container with port mapping
docker run -d \
  --name mongodb \
  -p 27017:27017 \
  --restart unless-stopped \
  mongo
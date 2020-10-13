#!/bin/sh

docker run -it --expose 8080 -v ~/Code/abcd/:/app deno deno run --unstable --allow-write --allow-net --allow-read main.ts "$@"
FROM ubuntu:latest

RUN apt update
RUN apt install -y unzip curl
RUN curl -fsSL https://deno.land/x/install/install.sh | sh

ENV PATH="/root/.deno/bin:${PATH}"

# Necessary until they fix the TLA in Worker bug
RUN deno upgrade --version 1.4.6

EXPOSE 8080

WORKDIR /app
COPY . /app

CMD deno run --unstable --allow-write --allow-net --allow-read main.ts
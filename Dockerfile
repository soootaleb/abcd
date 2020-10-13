FROM ubuntu:latest

WORKDIR /app
VOLUME [ "/app" ]

EXPOSE 8080

RUN apt update
RUN apt install -y unzip curl
RUN curl -fsSL https://deno.land/x/install/install.sh | sh

ENV PATH="/root/.deno/bin:${PATH}"

CMD deno run --unstable --allow-write --allow-net --allow-read main.ts 8080
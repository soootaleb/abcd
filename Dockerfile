FROM ubuntu:latest

RUN apt update
RUN apt install -y unzip curl
RUN curl -fsSL https://deno.land/x/install/install.sh | sh

ENV PATH="/root/.deno/bin:${PATH}"

EXPOSE 8080

WORKDIR /app
COPY . /app

CMD deno run --unstable --allow-write --allow-net --allow-read main.ts
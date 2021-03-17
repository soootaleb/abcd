FROM ubuntu:latest

RUN apt update
RUN apt install -y unzip curl
RUN curl -fsSL https://deno.land/x/install/install.sh | sh

ENV PATH="/root/.deno/bin:${PATH}"

EXPOSE 8080 8888

WORKDIR /app
COPY . /app

RUN deno cache --reload --unstable main.ts

EXPOSE 8080 8888

ENTRYPOINT ["deno", "run", "--unstable", "--allow-all"]

CMD ["main.ts", "--console-messages", "--data-dir", "/root"]
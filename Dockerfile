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

RUN deno cache --reload --unstable main.ts

RUN export ABCD_NODE_IP=$(hostname -i)

EXPOSE 8080 8888

ENTRYPOINT ["deno", "run", "--unstable", "--allow-all"]

CMD ["main.ts", "--console-messages", "--data-dir", "/root"]
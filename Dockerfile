FROM ubuntu as builder

RUN apt update
RUN apt install -y unzip curl
RUN curl -fsSL https://deno.land/x/install/install.sh | sh

ENV PATH="/root/.deno/bin:${PATH}"

WORKDIR /app
COPY . /app

RUN deno compile \
    --unstable \
    --allow-all \
    --target x86_64-unknown-linux-gnu \
    --output abcd \
    --lite \
    main.ts

FROM scratch

COPY --from=builder /lib/x86_64-linux-gnu/libdl.so.2 /lib/
COPY --from=builder /lib/x86_64-linux-gnu/libstdc++.so.6 /lib/
COPY --from=builder /lib/x86_64-linux-gnu/libgcc_s.so.1 /lib/
COPY --from=builder /lib/x86_64-linux-gnu/librt.so.1 /lib/
COPY --from=builder /lib/x86_64-linux-gnu/libpthread.so.0 /lib/
COPY --from=builder /lib/x86_64-linux-gnu/libm.so.6 /lib/
COPY --from=builder /lib/x86_64-linux-gnu/libc.so.6 /lib/
COPY --from=builder /lib64/ld-linux-x86-64.so.2 /lib64/    

COPY --from=builder /app/abcd /

EXPOSE 8080

ENTRYPOINT ["/abcd"]

CMD ["--console-messages", "--data-dir", "/"]
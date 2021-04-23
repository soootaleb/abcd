FROM ubuntu as builder

FROM scratch

COPY --from=builder /lib/x86_64-linux-gnu/libdl.so.2 /lib/
COPY --from=builder /lib/x86_64-linux-gnu/libstdc++.so.6 /lib/
COPY --from=builder /lib/x86_64-linux-gnu/libgcc_s.so.1 /lib/
COPY --from=builder /lib/x86_64-linux-gnu/librt.so.1 /lib/
COPY --from=builder /lib/x86_64-linux-gnu/libpthread.so.0 /lib/
COPY --from=builder /lib/x86_64-linux-gnu/libm.so.6 /lib/
COPY --from=builder /lib/x86_64-linux-gnu/libc.so.6 /lib/
COPY --from=builder /lib64/ld-linux-x86-64.so.2 /lib64/    

EXPOSE 8080

ADD abcd /

ENTRYPOINT ["/abcd"]

CMD ["--console-messages", "--data-dir", "/"]
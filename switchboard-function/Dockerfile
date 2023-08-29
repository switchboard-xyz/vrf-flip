# syntax=docker/dockerfile:1.4
FROM switchboardlabs/sgx-function AS builder

WORKDIR /home/root/switchboard-function/vrf-flip
COPY ./Cargo.toml  ./
COPY ./src ./src

RUN --mount=type=cache,target=/usr/local/cargo/registry,id=${TARGETPLATFORM} \
    --mount=type=cache,target=target,id=${TARGETPLATFORM} \
    cargo build --release && \
    cargo strip && \
    mv target/release/vrf-flip /sgx/app

FROM switchboardlabs/sgx-function

# Copy the binary
WORKDIR /sgx
COPY --from=builder /sgx/app /sgx

# Get the measurement from the enclave
RUN rm -f /measurement.txt && \
    /get_measurement.sh && \
    cat /measurement.txt

ENTRYPOINT ["bash", "/boot.sh"]

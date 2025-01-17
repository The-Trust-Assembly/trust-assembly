FROM denoland/deno:2.1.1 AS migrator

WORKDIR /migrate

ARG POSTGRES_HOST

ENV POSTGRES_HOST=$POSTGRES_HOST

COPY ./apps/webapp/api/nessie.config.ts .
COPY ./apps/webapp/api/db ./db

RUN deno install  --allow-read=${POSTGRES_HOST}:5432 --allow-write=nessie.config.ts,db -f  https://deno.land/x/nessie/cli.ts --global

FROM python:3.9-alpine AS transform_builder

# Copy headline_transform dir
WORKDIR headline_transform/
COPY headline_transform/ headline_transform/

# Build headline_transform package
RUN pip install --no-cache-dir pip setuptools wheel build && \
    cd headline_transform && \
    python -m build --wheel

FROM denoland/deno:2.1.1

EXPOSE 8000

WORKDIR /app

# Install pipx
RUN apt-get update && \
    apt-get install -y --no-install-recommends pipx && \
    rm -rf /var/lib/apt/lists/*

# Prefer not to run as root.
# USER deno

# These steps will be re-run upon each file change in your working directory:
COPY ./apps/webapp/ .

# Install headline_transform package
COPY --from=transform_builder /headline_transform/headline_transform/dist/*.whl /tmp/
RUN pipx install /tmp/*.whl && \
    pipx ensurepath && \
    rm /tmp/*.whl
RUN deno install

# Compile the main app so that it doesn't need to be compiled each startup/entry.
# RUN deno cache main.ts

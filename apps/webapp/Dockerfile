FROM denoland/deno:2.1.1

EXPOSE 8000

WORKDIR /app

# Prefer not to run as root.
# USER deno

# These steps will be re-run upon each file change in your working directory:
COPY . .
RUN deno install

# Compile the main app so that it doesn't need to be compiled each startup/entry.
# RUN deno cache main.ts

CMD ["task", "serve"]
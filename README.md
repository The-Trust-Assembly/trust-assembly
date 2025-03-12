# The Trust Assembly

Building an [Information Super Weapon](https://trustassembly.substack.com/p/what-is-a-trust-assembly)

## Project Layout

This is a monorepo, containing a browser extension, [Deno](https://deno.com/) backend, React frontend, and a Python CLI interface for headline transformation.

Directory structure:

* apps - Applications for user interface
  * browser-extension - browser extension
  * webapp - Deno + React application
    * api - Deno backend serving the Wiki and the browser extension
      * db - Database migrations and seed data. Uses the [Nessie database interface](https://deno.land/x/nessie@2.0.11)
* headline-transform - A Python CLI that calls an LLM to transform headlines. This is built as an executable in the docker image and called from the Deno backend.
* infra - Infrastructure (not used yet)

## Running locally with Docker

Install [Docker](https://docs.docker.com/get-docker/) and [docker-compose](https://docs.docker.com/compose/install/) on your local machine.

To build and run the Docker container for the first time, run:

```bash
docker-compose -f docker-compose.dev.yml --profile seed up --build
```

This will build the Docker image and run the container. The `--profile seed` flag is used to populate the database with initial data. You can omit this flag on subsequent runs.

TODO: set up live reload when making changes to the code. Right now, you will have to rebuild the Docker image and restart the container when making changes.

Confirm the container is running by visiting `http://localhost:5173` in your browser. Confirm the database is connected to the backend and seeded with data by visiting `http://localhost:5173/api/db-test`.

## Browser extension development

For instructions on how to develop the browser extension, refer to the [README.md](apps/browser-extension/README.md) file in the `apps/browser-extension` directory.

## Contributing

Refer to the [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines on contributing to this project.

Join the conversation on Discord

## Work in progress

If you're looking for a place to start, check out the [Issues](https://github.com/The-Trust-Assembly/trust-assembly/issues) page for a list of tasks that need to be completed.

# Publish to Docker Hub

The workflow builds the committed Dockerfile and publishes on every push to
`main`. It can also be run manually from the Actions tab on `main`.

In the GitHub repository, open **Settings → Secrets and variables → Actions**:

| Type | Name | Value |
| --- | --- | --- |
| Variable | `DOCKERHUB_USERNAME` | Your Docker Hub login name |
| Variable | `DOCKERHUB_IMAGE` | Full repository name, such as `your-name/momento` |
| Secret | `DOCKERHUB_TOKEN` | Docker Hub access token with Read & Write permission |

Use a token for an account allowed to push to the image repository. Never commit
the token or put it in a workflow variable.

Push the project and workflow to GitHub. Successful runs publish `latest` and
`sha-<full-commit-hash>` tags. The default runner builds a Linux AMD64 image.

Publishing an image does not update running containers. To deploy the new image,
replace `your-name/momento` with your repository name and run:

```sh
docker pull your-name/momento:latest
docker stop lofi-pomodoro
docker rm lofi-pomodoro
docker run -d --name lofi-pomodoro --restart unless-stopped -p 8080:8080 your-name/momento:latest
```

Skip stopping and removing the container on the first deployment.

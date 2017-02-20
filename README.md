# dco-bot
GitHub webhook for a AWS Lambda Bot to check commits for DCO sign-off

# Usage
If you are a member of deptofdefense, add `https://1iexi2zo5a.execute-api.us-east-1.amazonaws.com/dev/dco-bot` as a webhook on your repo with `Pull Request` triggers. Anyone else will have to proceed with installation on your own AWS account as outlined below.

# Installation
```
npm install serverless -g
```
Ensure your aws credentials are set up at `~/.aws/credentials`. These allow the deployment of the AWS Lambda function to your account.

To secure GitHub to Lambda communication: GITHUB_WEBHOOK_SECRET in serverless.yml shall be set to whatever the webook uses.

To secure Lambda to GitHub communication: GITHUB_SECRET in serverless.yaml shall be set to a GitHub access token - comments will be made in this accounts name.

Rename `serverless.yml.template` to `serverless.yml` once your edits are complete.

# Deploy
```bash
serverless deploy
```

This will upload your function to CloudFormation, S3, and Lambda. The output will contain an endpoint which looks like:
```bash
Service Information
service: dco-bot
stage: dev
region: us-east-1
api keys:
  None
endpoints:
  POST - https://SOMEENDPOINT.execute-api.us-east-1.amazonaws.com/dev/dco-bot
functions:
  dco-bot-dev-dcobot
```

# Configure GitHub webhook
(following instructions adopted from: https://raw.githubusercontent.com/serverless/examples/master/aws-node-github-webhook-listener/README.md, unknown license)
Paste the endpoint as the webhook in GitHub as follows:

Configure your webhook in your github repository settings. [Setting up a Webhook](https://developer.github.com/webhooks/creating/#setting-up-a-webhook)

1. Plugin your API POST endpoint. (`https://abcdefg.execute-api.us-east-1.amazonaws.com/dev/webhook` in this example). Run `sls info` to grab your endpoint if you don't have it handy.
2. Plugin your secret from `GITHUB_WEBHOOK_SECRET` environment variable.
3. Choose the types of events you want the github webhook to fire on. For the DCO-bot we recommend, `Pull Request` events.

  ![webhook-steps](https://cloud.githubusercontent.com/assets/532272/21461773/db7cecd2-c922-11e6-9362-6bbf4661fe14.jpg)

# Test and convenient logging
Manually trigger/test the webhook from settings or do something in your github repo to trigger a webhook.

You can tail the logs of the lambda function with the below command to see it running.
```bash
serverless logs -f dcobot -t
```

You should see the event from github in the lambda functions logs.

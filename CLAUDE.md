# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A single-stack AWS CloudFormation solution for hosting a personal game server (Valheim by default). There is no build system, test suite, or package manager — everything is deployed by uploading [mcCFNGamingServerSolution.YAML](mcCFNGamingServerSolution.YAML) to AWS CloudFormation. The template is ~2100 lines and contains the full solution: VPC, EC2, Cognito, API Gateway, Lambdas, Step Functions, CloudFront, and S3.

Accompanying documentation: https://aws.amazon.com/blogs/gametech//hosting-your-own-dedicated-valheim-server-in-the-cloud/

## How updates are delivered to a deployed stack

Ongoing deploys are handled by GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)), triggered on pushes to `main` under `FrontEnd/**` or `Lambda/**`. It authenticates to AWS via an OIDC role (`mcGitHubDeployRole`, output `mcGitHubDeployRoleArn`), reads the target resource names from stack outputs, and:
- `aws s3 sync FrontEnd/ s3://$bucket --exclude "js/config.js" --delete` → `cloudfront create-invalidation /*`
- For each file in [Lambda/](Lambda/): zip as `lambda_function.py` and `aws lambda update-function-code`

Required repo configuration (one-time, after first stack deploy):
- Variable `AWS_REGION`, variable `AWS_STACK_NAME`
- Secret `AWS_DEPLOY_ROLE_ARN` (copy from stack output `mcGitHubDeployRoleArn`)

**To ship a change**: just push to `main`. No stack update, no parameter bumps.

**Bootstrap-only custom resources (still in the template)**: `mcCopyFrontEndFiles`, `mcCopyLambdaFiles`, and `mcUpdateConfig` continue to fetch code from `raw.githubusercontent.com/${GitHubRepo}/main/...` on stack **create**. They run once to seed S3 and Lambda, then stay dormant on future stack updates (their properties don't change). They exist for the first-ever deploy before CI/CD has run. CI/CD overwrites their output on subsequent pushes.

The `REPLACE-WITH-*` sentinels in [FrontEnd/js/config.js](FrontEnd/js/config.js) are **intentional** — the `mcUpdateConfigLambda` substitutes them on stack create. The CI workflow `--exclude`s `js/config.js` from the S3 sync so the substituted version in S3 is not overwritten.

### OIDC provider gotcha
`AWS::IAM::OIDCProvider` for `token.actions.githubusercontent.com` is an account-global resource. The stack parameter `CreateGitHubOidcProvider` (default `yes`) controls whether the template creates it. If the account already has one (from another project), set this to `no` before deploying or the stack will fail. The `mcGitHubDeployRole` trust policy still resolves correctly either way.

### What CI/CD does NOT cover
[Bash/valheim.sh](Bash/valheim.sh) is still fetched only once at EC2 UserData time ([mcCFNGamingServerSolution.YAML:291](mcCFNGamingServerSolution.YAML#L291)). Changes to it require terminating and recreating the EC2 instance. There is no SSM Run Command path; flag this if the user edits the bash script expecting automatic deployment.

## Runtime architecture

Request flow for server control actions:

1. User → CloudFront → S3-hosted static site ([FrontEnd/index.html](FrontEnd/index.html), [FrontEnd/js/index.js](FrontEnd/js/index.js))
2. Cognito Hosted UI → JWT → `Authorization` header on API Gateway calls (`mcControlApi`, authorized by `mcCognitoAuthoriser`)
3. API routes map to three Lambdas:
   - [Lambda/gaming_server_start_stop-v1_0.py](Lambda/gaming_server_start_stop-v1_0.py) — backs `getinfo`, `start`, `stop`, `reSize`. Resize maps `micro/small/medium/large` → instance types via env vars set in the template. On `start`, invokes the `mcStateMachineDNS` Step Function.
   - [Lambda/mcUpdateDNS-v1_0.py](Lambda/mcUpdateDNS-v1_0.py) — invoked by the Step Function in a retry loop (public IP is not assigned instantly after `start_instances`); on success UPSERTs a Route53 A record with TTL 5.
   - [Lambda/admin_list-v1_0.py](Lambda/admin_list-v1_0.py) — list/add/remove Valheim admin Steam IDs by running `cat`/`grep`/`sed` via SSM `AWS-RunShellScript` against the running EC2 instance. Hard-coded path `/usr/games/serverconfig/valheim/saves/adminlist.txt`.
4. An `AWS::Events::Rule` ([mcCFNGamingServerSolution.YAML:1992](mcCFNGamingServerSolution.YAML#L1992)) fires daily at the configured `ShutdownTimeHours`/`ShutdownTimeMins` (UTC!) to auto-stop the instance.

Tag-based instance discovery: every Lambda finds "the" gaming server by filtering EC2 on `tag:${mcTagName}=${mcTagValue}`, passed in the request from the frontend's `query_string`. Multiple instances can share the same tag, in which case `getInfo` returns them all but the frontend only renders `data[1]["Instances"][0]`.

## Game-server install is pluggable

[mcCFNGamingServerSolution.YAML:291](mcCFNGamingServerSolution.YAML#L291) — the EC2 `UserData` downloads whatever URL is in the `GameServer` parameter and executes it. [Bash/valheim.sh](Bash/valheim.sh) is the default (installs Docker + `mbround18/valheim` image, writes a random password to SSM Parameter Store as `mcValheimPW-${StackName}`). Replacing `GameServer` with another shell script URL is the supported way to host a different game — the rest of the stack is game-agnostic **except** for the hard-coded Valheim admin file path in [Lambda/admin_list-v1_0.py:8](Lambda/admin_list-v1_0.py#L8).

## Editing the CloudFormation template

- Lambda code that lives inline in the template (via `ZipFile:`) runs as **custom resources** during stack create/update: `mcCopyToS3Lambda`, `mcUpdateConfigLambda`, `mcgetSrcIpsLambda`. Changes to these take effect on the next stack update.
- The three runtime Lambdas (start/stop, DNS, admin list) are *not* inline — their code is deployed by the CI/CD workflow (or, on first deploy, seeded by the bootstrap custom resources). See the "How updates are delivered" section above.
- [FrontEnd/js/config.js](FrontEnd/js/config.js)'s `REPLACE-WITH-*` sentinel list must stay in sync with the string replacements in `mcUpdateConfigLambda`. Adding a new sentinel requires edits in both places.
- `mcGitHubDeployRole`'s inline policy scopes permissions to specific resources. When adding a new frontend asset or Lambda function, verify its ARN is reachable under the existing statements — CI deploys will 403 otherwise.

## Testing

There is no automated test suite. Changes are validated by deploying (or updating) a real stack in AWS. The user should do this themselves — do not attempt to deploy on their behalf without being asked.

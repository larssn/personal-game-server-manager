## Personal Gamer Server Manager

Hosting your own personal gaming server is increasingly common given all the benefits and flexibility it provides, however, doing so in a secure, flexible, and cost-effective manner is not simple. To achieve low cost many people host a server on their home computer, requiring them to open up their home network firewall ports in the process and exposing their computer to the wider internet and the associated security risks. Playing a game while also hosting the server for it can be a heavy task for any computer, so often players see the best performance while running a server and client on separate machines. To overcome these challenges players often look to dedicated game-server companies which provide varying degrees of control over the underlying server such as requiring fixed server sizes, giving limited access to mods, or simply charging you a flat monthly fee no matter how much you utilize the server. 

In the below blog post we will show you how to achieve both a low cost and high security solution while also providing the added benefit of flexibility to resize the server from a single core and 0.5 GiB of memory all the way to the biggest servers AWS has to offer and back down again.  

More details and instructions on this solution can be found on the AWS Gametech blog here: https://aws.amazon.com/blogs/gametech//hosting-your-own-dedicated-valheim-server-in-the-cloud/

## Changes in this fork

This fork has diverged meaningfully from `aws-samples/personal-game-server-manager`. Highlights:

**Web UI**
- Dark theme redesign focused on Valheim.
- In-browser admin list management (add/remove Steam IDs from `adminlist.txt` via SSM Run Command).
- Billing panel showing account-wide AWS costs via Cost Explorer.
- Copy-to-clipboard buttons for DNS and IP values.
- Custom management domain support (CloudFront + ACM), with CORS locked to the configured domain.

**CI/CD**
- GitHub Actions workflow deploys frontend and Lambda changes on every push to `main`, authenticating via OIDC — no long-lived AWS credentials.
- The old `FrontEndVersion` stack parameter is gone. The `mcCopy*` custom resources now run only once at initial stack create (bootstrap), then CI/CD owns updates.

**CloudFormation fixes and hardening**
- Lambda bucket no longer gets emptied on stack updates (fixed a custom-resource fall-through bug).
- Stable `PhysicalResourceId` on the S3 copy custom resource so CloudFormation tracks it correctly across updates.
- All cost-generating resources tagged with `mcServerFinder`.
- Default AMI upgraded to Ubuntu 22.04; AWS Backup frequency reduced.
- Removed the `PublicIp` stack output that failed when the instance was stopped.
- Resize Lambda validates input instead of trusting the caller.

**Operational**
- Admin list Lambda extracted into its own file with parallel fetching, optimistic UI updates, and proper SSM timeout/error handling.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.


# configs/edge - public-edge vhost source

This product does NOT own the public edge. It only contributes the vhost source
artifact(s) here; an operator installs them on the shared vxture public edge host
(which terminates TLS with the `*.vxture.com` wildcard cert and reverse-proxies
over tailscale to the app on the deploy host).

- `yucer.vxture.com.conf` - prod vhost. Set `$upstream` to
  `vx-worker-02:<APP_PUBLISH_PORT>` (this product's assigned port).

## Install (operator, on the edge / vxture project repo)

1. Copy the `.conf` into the vxture project repository's edge nginx config dir.
2. Run the edge nginx-sync script and reload nginx.
3. Verify: `curl https://<code>.vxture.com/api/health` returns the app's payload
   (`status`/`product`/`gitSha`/`time`), not a generic edge stub.

The app itself runs on the deploy host tailnet (`APP_PUBLISH_PORT`); there is no
on-host TLS or nginx in this repo.

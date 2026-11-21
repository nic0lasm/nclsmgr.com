---
titre: Security from day one, applied to this site
description: The security trade-offs behind nclsmgr.com, from architecture to private links, explained by the project manager who made them.
date: 2026-11-19
statut: valide
---

In my line of work, security often arrives too late. It shows up during acceptance testing as a list of gaps to fix, when every fix is expensive. I ran this site like a client project to do the opposite: write the security requirements before the first line of code, then check them at every milestone.

The site is small. The choices are those of a large project. The repository is public, so anyone can check what follows in the [source code](https://github.com/nic0lasm/nclsmgr.com).

## Start from requirements, not tools

The first milestone produced no code. It set the target audiences, the site structure, how the private area works, the architecture and the security requirements. Its exit criterion fitted in one sentence: architecture and hosting choices settled.

Every milestone after that had a verifiable criterion. The technical foundation was only closed once it scored A+ on both Mozilla Observatory and SSL Labs. The private area was only closed once it was shown that an expired or revoked link no longer gave access to anything. These are tests, not intentions.

## Reduce what needs defending

The first decision was to remove rather than protect.

- **No third-party scripts or trackers.** Analytics run on Umami, hosted on the same server and cookie-free. Its dashboard can only be reached through an SSH tunnel.
- **No exposed admin interface.** Private links are created and revoked with a command run on the server, not from a web page.
- **No personal contact details in public.** The full CV is kept for the private area.

I ruled out a content management system with a back office. It would have made publishing more comfortable, but it added a login page to defend, for a site I am the only one to edit.

## Put the browser to work

### A strict CSP, with a nonce

The Content Security Policy (CSP) tells the browser what it may execute. The easy version allows inline scripts with `'unsafe-inline'`, which cancels out much of the protection. I ruled it out.

On every request, the site draws a random 16-byte nonce. Only scripts carrying that nonce run, along with those they load themselves thanks to `'strict-dynamic'`. Everything else is closed: `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, forms limited to the site itself.

This has a cost: a fresh nonce on every request makes caching harder and demands discipline with every change. I accept it, because script injection is the most likely risk for a site of this kind.

### Headers set at the front end

Caddy, the front-end server, adds the same headers to every response: two-year HSTS with preload, `nosniff`, a strict referrer policy, camera, microphone, geolocation and payment disabled, and origin isolation. The header that announces the server software is removed, and Caddy's admin API is disabled.

Two settings answer known vulnerabilities. Caddy strips the internal `X-Middleware-Subrequest` header before it reaches Next.js, to guard against the CVE-2025-29927 family. The application only reads the visitor's address from a header set by Caddy, never from `X-Forwarded-For`, which anyone can forge.

## Cloudflare in front, and only Cloudflare

DNS, the web application firewall and caching go through Cloudflare. The trade-off is deliberate: I depend on a third party, and in return the server does not absorb internet traffic on its own.

That choice only makes sense if Cloudflare cannot be bypassed. Only port 443 is published, and the server's firewall opens it to Cloudflare's address ranges alone. Caddy only trusts the visitor address passed on by Cloudflare if the request really comes from those ranges. A script updates the list every week from the official sources and refuses to write it if it looks incomplete: an empty list would take the site down, a list that is too broad would reopen the door.

## Private links that are worthless if leaked

Each contact receives a personal link that can expire and be revoked. It is the most sensitive part of the site, and the one where I weighed the most trade-offs.

- **The token is never stored.** It is 256 random bits, and the database keeps only its SHA-256 fingerprint. A copy of the database opens no link.
- **No slow hashing.** Slow hashing protects passwords chosen by people. A secret that is already 256 random bits does not need it, and verification stays fast.
- **The token is exchanged for a session.** The cookie carries the `__Host-` prefix, which requires HTTPS and forbids sharing across subdomains. The session ends after 14 days of inactivity.
- **Revocation is immediate.** Revoking a link closes all its sessions in the same transaction.
- **Failure reveals nothing.** Unknown, expired or revoked token: the visitor gets the same response.

Data follows the same logic. A link lasts 30 days by default, 180 at most. The access log is purged after 90 days, notification emails after 7. Deleted rows are overwritten in the file, not just removed from the index. These periods are the ones stated in the privacy policy, and the code enforces them.

## A delivery chain that can be audited

A site that is secure on launch day can stop being so a month later. So I treated the delivery chain as part of the product.

- **Every change goes through the same checks**: formatting, static analysis, types, unit tests, end-to-end tests with accessibility checks, and validation of the Caddy configuration.
- **The code is analysed by CodeQL** on every change, with the extended security rules.
- **GitHub Actions are pinned by commit hash**, not by a version number that a third party could move.
- **Dependabot checks every week** for updates to dependencies, Docker images and actions.
- **The image is only tagged after scanning.** It is published by digest, with an SBOM and provenance, then scanned by Trivy. A critical or high vulnerability with an available fix blocks publication.
- **The deployment key can do only one thing.** On the server, it is bound to a forced command that only accepts a 12-character hexadecimal image tag.

## Images that contain only what is needed

The production image is built in several stages on a base image pinned by digest. Tools not needed at runtime, such as npm, are removed. The application runs under an unprivileged account, on a read-only file system, with no Linux capabilities. The web container only has access to an internal network with no route to the internet: Caddy alone is exposed.

Images are built for amd64 and arm64, each on a native machine. Emulation made builds too slow, and arm64 keeps open a step already on the roadmap: a self-hosted server behind Cloudflare Tunnel, with no open port at all.

## What I take from it

None of this is exotic. The difference lies in when the decisions are made. Written down at the start, they cost a few lines of configuration. Discovered during an audit, they cost a delayed milestone.

The work does not stop at launch. Every month, an external audit checks the headers, the published pages and both A+ ratings from the internet, and alerts me to any gap. The full approach is described in the [portfolio](/portfolio) case study.

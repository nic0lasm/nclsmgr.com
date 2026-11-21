---
titre: Moving servers without losing anything
description: On launch day, I moved this site from Canada to France. An account of a short migration, prepared like a project.
date: 2026-11-20
statut: valide
---

On 30 October, the day this site launched, I moved it from a server in Canada to a server in France, with the same hosting provider. The reason was simple: I wanted the site's data, from the contact form and from the private area alike, to stay in France and under European law alone.

The operation is small compared with a government information system. The method, though, is the same as for a much larger move. That method is what I describe here.

## Write the procedure before touching the server

A migration that relies on the memory of the person running it cannot be repeated. Before the switchover, I wrote two scripts and a procedure.

- **A hardening script** reproduces the old machine's configuration on a fresh one: key-only SSH access, firewall, protection against repeated login attempts, automatic updates, and Docker installed from its official repository after checking its signing key.
- **A restore script** puts back the configuration, then the data, from the latest backup. It stops at the first failure, checks the database before stopping anything, and only replaces data when given an explicit option. Run without it, it shows what it would do and touches nothing.
- **The procedure** sets the order of the steps, what to check after each one, and the point at which rollback is given up.

These scripts are public, in the site's repository. They will serve for the next move, and they document this one better than a report would.

## The backup as the only path

I could have copied files from one server to the other. Instead, I chose to route all data through the encrypted backup that runs every night, and to build the new server from that backup alone.

This detour has a benefit: the migration becomes a real disaster recovery exercise. If the new server works, the backup is proven able to rebuild the site without the old one. Every restored file is compared with the fingerprint taken at backup time. A single mismatch stops the operation.

A backup that has never been restored is only an assumption. This one stopped being one that day.

## Two traps found along the way

The first showed up during the run. Backup storage only accepts connections from authorised addresses. I had added the new server's address, yet access was denied. The server also had an IPv6 address, which the backup tool used first, and which was not on the list. The hardening script now disables IPv6, and the procedure requires checking the address actually used for outbound traffic before the first call.

The second was caught before it happened. If the new server runs its first backup before restoring the data, that empty backup becomes the latest one, and the next restore would start from nothing. The procedure therefore enforces the opposite order: restore first, enable backups afterwards, and stop the old server's backups as soon as the switch is made, so the two do not overwrite each other.

Neither point is spectacular. They are, however, exactly the kind of thing that makes a migration fail.

## A short switchover, with rollback available until the end

The site sits behind Cloudflare. For visitors, the switchover came down to changing one DNS record. As long as the old server was running, rolling back meant changing that same line again.

I only gave up that option after a full set of checks: pages served, security headers, A+ ratings on Mozilla Observatory and SSL Labs, automatic deployment, contact form, private area, the nightly backup and a test restore. Once all of that was green, I revoked the old server's access to backup storage, then terminated it.

## What I take from it for larger projects

- **A migration is proven by restoring.** Going through the backup costs a little time and proves that you can rebuild.
- **The point of no return is decided in advance.** Before starting, you write down what must be verified before giving up rollback, and you do not cross that line without the evidence.
- **Filtered access is checked before it is used.** An allow-list must match the address actually in use, not the one you think you are using.
- **Every surprise becomes a rule.** The two traps above are now written into the procedure and the script. The next move will not run into them.

The full procedure is in the [site's source code](https://github.com/nic0lasm/nclsmgr.com), along with the scripts it calls.

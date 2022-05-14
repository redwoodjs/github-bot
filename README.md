# GitHub Bot

Redwood's GitHub bot.

## Usage

Although this repo is named `github-bot`, it has a script that you can run locally to validate all of [redwoodjs/redwood](https://github.com/redwoodjs/redwood)'s open issues and pull requests:

```
yarn validate
```

> You'll need to a personal-access token (PAT—provision one [here](https://github.com/settings/tokens)) set to `GITHUB_TOKEN` in your env with the appropriate permissions to run this.

https://user-images.githubusercontent.com/32992335/168442274-f2604922-b2c3-4b22-a058-39709b52459b.mov

The [github.ts](./api/src/functions/github/github.ts) function does as much as it can to process issues and pull requests as they're opened, and responds to all the events it can to keep them in sync.
But there's just some events—like an issue being linked to a pull request—that it can't listen to.
And even if it could listen to everything, things will still get out of sync anyway.

That's where this script comes in: it'll sort out most of the inconsistencies on its own, and will prompt you to handle issues or pull requests that require your attention (because they're unprioritized or stale).

## Architecture

This repo is basically just a backend right now. It makes heavy use of Redwood's services.

All the logic for processing a webhook is in [github.ts](./api/src/functions/github/github.ts).
That function mostly contains routing logic—it calls out to the services as much as it can.

## Contributing

Contributing to this is a bit tricky.
To test your changes, you have to fork this repo, [make a GitHub app](https://github.com/settings/apps), and install it on one of your repos.

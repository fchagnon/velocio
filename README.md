# Velocio

Velocio cheers on Randonneurs Ontario riders. Once an hour he reads the club's results pages and posts to Slack:

- **One rider** (a permanent, or a brevet ridden solo): a personal "look who just finished" post.
- **Two or more riders**: an event completion post listing everyone alphabetically by last name, DNFs included.

Velocio is hosted by Slack itself (Run on Slack infrastructure), so there is no server to look after.

## When things get announced

- **Permanents:** as soon as a result appears and isn't PENDING.
- **Brevets and populaires:** only when all of these are true:
  - 12 hours have passed since the event's first result appeared.
  - The latest possible cutoff has passed (the start date, plus a day for a late start, plus the ACP time limit).
  - No rider is PENDING.
- **A lone rider who didn't finish:** no post.
- **The very first run:** records everything already on the site and announces nothing.

## Where things are

| File | What it holds |
| --- | --- |
| lib/config.ts | Settings: test channel, chapter-to-channel map, badges, timing rules |
| lib/messages.ts | Velocio's voice: all the message templates |
| lib/parse.ts | Reads the results pages |
| lib/poll.ts | Decides what's new or finished |
| functions/poll_results.ts | The Slack function that ties it together |
| workflows/, triggers/ | The hourly schedule and the "post a sample" link |
| datastores/announcements.ts | Velocio's memory of what he's already seen |
| assets/icon.png | His avatar |

## One-time setup

1. **Install Deno.** The Slack CLI needs it for apps like this one.

   ```bash
   curl -fsSL https://deno.land/install.sh | sh
   ```

   Then run `slack doctor` to confirm the CLI can see Deno.

2. **Unzip this folder** into your home directory (for example, ~/velocio) and cd into it.

## Testing on your own machine

Run the tests:

```bash
deno task test
```

Read the live site and print what Velocio would post, without touching Slack:

```bash
deno task dry-run
```

## Trying him in Slack before going live

```bash
slack run
```

This creates a development copy called "Velocio (local)" that runs from your laptop. In a second terminal, create a link that makes him post a sample:

```bash
slack trigger create --trigger-def triggers/sample_post_link.ts
```

Choose the local app when asked. The command prints a link. Paste it into #app-testing and click it: Velocio posts the latest permanent and the latest group brevet. Press Ctrl+C in the first terminal to stop.

## Going live

```bash
slack deploy
slack trigger create --trigger-def triggers/every_hour.ts
```

- **Choosing the app:** both commands ask which app to use. Choose the deployed one, not "(local)".
- **Approval:** the workspace admin may need to approve the install.
- **The schedule:** the trigger starts a minute after you create it and repeats every hour.
- **A sample link:** to have one in production too, run the sample trigger command again for the deployed app.

## After going live

- **Watch what he's doing:** `slack activity --tail`
- **Change wording or settings:** edit lib/messages.ts or lib/config.ts, then run `slack deploy` again. You don't need to recreate the trigger.
- **Look at his memory:** `slack datastore query '{"datastore": "announcements"}'`
- **Channels:** he can post in public channels without being invited. A private channel needs `/invite @Velocio`.

## Retiring the Python version

Run only one Velocio at a time, or rides get announced twice. Once the hosted version is posting, stop the old Python version's `slack run`. You can then remove the old app by running `slack delete` from the Python version's folder.

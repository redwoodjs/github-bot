import { execSync } from 'child_process'

import { addIdsToProcessEnv } from 'api/src/services/github'
import {
  getMainProjectTriageItems,
  getMainProjectBacklogItems,
  getMainProjectItems,
  getField,
} from 'api/src/services/projects'
import { Cli, Command, Option } from 'clipanion'
import prompts from 'prompts'

export default async () => {
  const [_node, _rwCli, _execCommand, _scriptName, _prismaFlag, ...args] =
    process.argv

  const cli = new Cli()
  cli.register(BirdByBirdCommand)
  cli.runExit(args)
}

class BirdByBirdCommand extends Command {
  status = Option.String('--status')
  priority = Option.String('--priority')
  stale = Option.Boolean('--stale')
  needsDiscussion = Option.Boolean('--needs-discussion')

  async execute() {
    await addIdsToProcessEnv({ owner: 'redwoodjs', name: 'redwood' })

    let birds = []

    switch (this.status) {
      case 'triage':
        birds = await getMainProjectTriageItems()
        break

      case 'backlog':
        birds = await getMainProjectBacklogItems()
        break

      default:
        birds = await getMainProjectItems()
    }

    switch (this.priority) {
      case 'urgent':
        birds = birds.filter((item) => {
          const statusField = getField(item, 'Priority')
          return statusField?.value === process.env.URGENT_PRIORITY_FIELD_ID
        })
        break

      case 'high':
        birds = birds.filter((item) => {
          const statusField = getField(item, 'Priority')
          return statusField?.value === process.env.HIGH_PRIORITY_FIELD_ID
        })
        break

      case 'medium':
        birds = birds.filter((item) => {
          const statusField = getField(item, 'Priority')
          return statusField?.value === process.env.MEDIUM_PRIORITY_FIELD_ID
        })
        break

      case 'low':
        birds = birds.filter((item) => {
          const statusField = getField(item, 'Priority')
          return statusField?.value === process.env.LOW_PRIORITY_FIELD_ID
        })
        break

      default:
        break
    }

    if (this.stale) {
      birds = birds.filter((item) => {
        const statusField = getField(item, 'Stale')
        return statusField?.value === process.env.CHECK_STALE_FIELD_ID
      })
    }

    if (this.needsDiscussion) {
      birds = birds.filter((item) => {
        const statusField = getField(item, 'Stale')
        return (
          statusField?.value === process.env.CHECK_NEEDS_DISCUSSION_FIELD_ID
        )
      })
    }

    if (!birds.length) {
      this.context.stdout.write(
        `There aren't any ${this.priority} ${this.status} issues or PRs`
      )
      return
    }

    birds = birds.map((backlogItem) => backlogItem.content.url).filter(Boolean)

    await birdByBird(birds)
  }
}

async function birdByBird(birds, { start = 0 } = {}) {
  let i = start

  // eslint-disable-next-line no-constant-condition
  while (true) {
    execSync(`open ${birds[i]}`)

    const { res } = await prompts(
      {
        name: 'res',
        type: 'select',
        message: `${i}/${birds.length} what would you like to do next?`,
        choices: [{ value: 'next' }, { value: 'previous' }, { value: 'quit' }],
        initial: 0,
      },
      {
        onCancel: true,
      }
    )

    if (res === 'quit') {
      break
    }

    if (res === 'next') {
      if (!birds[i + 1]) {
        console.log("You're at the end")
        continue
      }

      i++
      continue
    }

    if (res === 'previous') {
      if (!birds[i - 1]) {
        console.log("You're at the beginning")
        continue
      }

      i--
      continue
    }
  }
}

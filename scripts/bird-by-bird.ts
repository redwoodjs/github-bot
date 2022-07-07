import { execSync } from 'child_process'

// FIXME
import {
  getProjectFieldAndValueNamesToIds,
  getProjectItems,
} from 'api/src/services/projects/projects'
import prompts from 'prompts'

export default async ({ args: _args }) => {
  process.env.OWNER = 'redwoodjs'

  await getProjectFieldAndValueNamesToIds()

  let birds = []

  birds = await getProjectItems('Triage')

  if (!birds.length) {
    console.log("There aren't any issues or PRs")
    return
  }

  birds = birds
    .sort(
      (a, b) => new Date(a.content.updatedAt) - new Date(b.content.updatedAt)
    )
    .map((bird) => bird.content.url)

  await birdByBird(birds)
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
        onCancel: () => process.exit(0),
      }
    )

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

    if (res === 'quit') {
      break
    }
  }
}

import { execSync } from 'child_process'

import { octokit } from 'api/src/lib/github'
import * as dateFns from 'date-fns'
import prompts from 'prompts'

const DATE_FORMAT = 'yyyy-MM-dd'

const START_OF_FIRST_CYCLE = new Date('2022-04-18')

let startOfNearestCycle
let start = START_OF_FIRST_CYCLE
const now = new Date()

while (!startOfNearestCycle) {
  const end = dateFns.addWeeks(start, 2)

  if (dateFns.isWithinInterval(now, { start, end })) {
    startOfNearestCycle = dateFns.format(start, DATE_FORMAT)
  } else {
    start = end
  }
}

let query: string[] | string = [
  'repo:redwoodjs/redwood',
  '-author:app/renovate',
  'sort:created-asc',
  `updated:>=${startOfNearestCycle}`,
]

export default async ({ args }) => {
  if (args['is-closed']) {
    ;(query as string[]).push('is:closed')
  }

  query = args.query ? args.query : (query as string[]).join(' ')

  console.log({ query })

  if (args.open) {
    execSync(
      `open https://github.com/redwoodjs/redwood/issues?q=${encodeURIComponent(
        query
      )}`
    )
  }

  if (args.interactive) {
    const {
      search: { nodes },
    } = await octokit.graphql(
      `
      query search($_query: String!, $after: String) {
        search(
          type: ISSUE
          query: $_query
          first: 100
          after: $after
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ... on Issue {
              id
              number
              title
              url
            }
            ... on PullRequest {
              id
              number
              title
              url
            }
          }
        }
      }
    `,
      {
        _query: query,
      }
    )

    let i = 0

    while (true) {
      execSync(`open ${nodes[i].url}`)

      const { res } = await prompts(
        {
          name: 'res',
          type: 'select',
          message: `${i}/${nodes.length} what would you like to do next?`,
          choices: [
            { value: 'next' },
            { value: 'previous' },
            { value: 'quit' },
          ],
          initial: 0,
        },
        {
          onCancel: true,
        }
      )

      // Todo here: prompt to update fields ("Last triaged", Cycle, etc.)

      if (res === 'quit') {
        break
      }

      if (res === 'next') {
        if (!nodes[i + 1]) {
          console.log("You're at the end")
          continue
        }

        i++
        continue
      }

      if (res === 'previous') {
        if (!nodes[i - 1]) {
          console.log("You're at the beginning")
          continue
        }

        i--
        continue
      }
    }
  }
}

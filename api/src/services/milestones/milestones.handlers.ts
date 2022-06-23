import fs from 'node:fs'
import path from 'node:path'

import { graphql } from 'msw'

import { content } from 'src/functions/github/github.handlers'

const handlers = [
  graphql.query('GetMilestoneIdsQuery', (_req, res, ctx) => {
    return res(
      ctx.data(
        JSON.parse(
          fs.readFileSync(
            path.join(__dirname, 'payloads', 'GetMilestoneIdsQuery.json'),
            'utf-8'
          )
        )
      )
    )
  }),
  graphql.mutation<any, { pullRequestId: string; milestoneId: string }>(
    'UpdatePullRequestMutation',
    (req, res, _ctx) => {
      const { milestoneId } = req.variables

      content.milestone = milestoneId

      return res()
    }
  ),
]

export default handlers

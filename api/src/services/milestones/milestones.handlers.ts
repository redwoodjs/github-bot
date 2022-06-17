import fs from 'node:fs'
import path from 'node:path'

import { graphql } from 'msw'

import { GetMilestoneIdsQueryRes } from './milestones'

export const pullRequest = {
  id: 'pull_request',
  milestones: [],
  clear() {
    this.milestones = []
  },
}

const handlers = [
  graphql.query<GetMilestoneIdsQueryRes, any>(
    'GetMilestoneIdsQuery',
    (_req, res, ctx) => {
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
    }
  ),
  graphql.mutation<any, { pullRequestId: string; milestoneId: string }>(
    'UpdatePullRequestMutation',
    (req, res, _ctx) => {
      const { milestoneId } = req.variables

      pullRequest.milestones.push(milestoneId)

      return res()
    }
  ),
]

export default handlers

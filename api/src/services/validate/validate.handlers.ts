import { graphql } from 'msw'

import { issuesOrPullRequests } from 'src/services/projects/projects.handlers'

const handlers = [
  graphql.query('GetIssueOrPullRequestQuery', (req, res, ctx) => {
    const { id } = req.variables

    const issueOrPullRequest = issuesOrPullRequests.find(
      (issueOrPullRequest) => issueOrPullRequest.id === id
    )

    return res(
      ctx.data({
        node: issueOrPullRequest,
      })
    )
  }),
]

export default handlers

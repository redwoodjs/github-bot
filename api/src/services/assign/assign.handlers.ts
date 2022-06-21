import { graphql } from 'msw'

export const issue = {
  id: 'issue',
  assignees: [],
}

export const pullRequest = {
  id: 'pull request',
  assignees: [],
}

export const issuesOrPullRequests = [issue, pullRequest]

const handlers = [
  graphql.mutation('AddAssigneesToAssignableMutation', (req, res, _ctx) => {
    const { assignableId, assigneeIds } = req.variables

    const content = issuesOrPullRequests.find(
      (issuesOrPullRequest) => issuesOrPullRequest.id === assignableId
    )

    content.assignees.push(...assigneeIds)

    return res()
  }),
]

export default handlers

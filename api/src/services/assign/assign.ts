import { octokit } from 'src/lib/github'

export function addAssigneesToAssignable({
  assignableId,
  assigneeIds,
}: {
  assignableId: string
  assigneeIds: string[]
}) {
  return octokit.graphql<{
    addAssigneesToAssignable: {
      clientMutationId: string
    }
  }>(
    `
      mutation AddAssigneesToAssignable($assignableId: ID!, $assigneeIds: [ID!]!) {
        addAssigneesToAssignable(
          input: { assignableId: $assignableId, assigneeIds: $assigneeIds }
        ) {
          clientMutationId
        }
      }
    `,
    {
      assignableId,
      assigneeIds,
    }
  )
}

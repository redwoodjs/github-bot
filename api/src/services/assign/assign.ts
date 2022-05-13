import { octokit, coreTeamTriage, coreTeamTriageLogins } from 'src/lib/github'
import { getMainProjectTriageItems } from 'src/services/projects'

/**
 * Assign a core team triage member based on who has the least amount of things assigned to them.
 */
export async function assignCoreTeamTriageMember({
  assignableId,
}: {
  assignableId: string
}) {
  const assigneeId = await getNextCoreTeamTriageAssigneeId()

  return addAssigneesToAssignable({
    assignableId,
    assigneeIds: [assigneeId],
  })
}

export async function getNextCoreTeamTriageAssigneeId() {
  const triageProjectItems = await getMainProjectTriageItems()

  const coreTeamTriageNoAssigned = coreTeamTriageLogins.map((login) => {
    const noAssigned = triageProjectItems.reduce(
      (noAssigned: number, needsTriageItem) => {
        const isAssigned = needsTriageItem.content.assignees?.nodes?.some(
          (assignee) => assignee.login === login
        )

        if (!isAssigned) {
          return noAssigned
        }

        return noAssigned + 1
      },
      0
    )

    return [login, noAssigned]
  })

  const [nextCoreTeamTriageAssignee] = coreTeamTriageNoAssigned.reduce(
    ([prevLogin, prevAssigned], [nextLogin, nextAssigned]) => {
      if (prevAssigned < nextAssigned) {
        return [prevLogin, prevAssigned]
      }
      return [nextLogin, nextAssigned]
    }
  )

  return coreTeamTriage[nextCoreTeamTriageAssignee].id
}

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
  }>(MUTATION, {
    assignableId,
    assigneeIds,
  })
}

export const MUTATION = `
  mutation AddAssigneesToAssignable($assignableId: ID!, $assigneeIds: [ID!]!) {
    addAssigneesToAssignable(
      input: { assignableId: $assignableId, assigneeIds: $assigneeIds }
    ) {
      clientMutationId
    }
  }
`

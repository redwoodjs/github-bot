import {
  octokit,
  coreTeamTriage,
  coreTeamMaintainersUsernamesToIds,
  coreTeamTriageUsernamesToIds,
} from 'src/lib/github'
import type { CoreTeamMaintainers } from 'src/lib/github'
import { getProjectItems } from 'src/services/projects'

/**
 * Assign a maintainer
 */

export async function assign({
  assignableId,
  to,
}: {
  assignableId: string
  to: CoreTeamMaintainers | 'Core Team/Triage'
}) {
  let assigneeId

  if (to === 'Core Team/Triage') {
    assigneeId = await getNextTriageTeamMember()
  }

  assigneeId = coreTeamMaintainersUsernamesToIds[to]

  return octokit.graphql(addAssigneesToAssignableMutation, {
    assignableId,
    assigneeId,
  })
}

export async function getNextTriageTeamMember() {
  const triageItems = await getProjectItems('Triage')

  const noAssigned = coreTeamTriage.map((username) => {
    const noAssigned = triageItems.reduce((noAssigned: number, triageItem) => {
      const isAssigned = triageItem.content.assignees?.nodes?.some(
        (assignee) => assignee.login === username
      )

      return noAssigned + isAssigned ? 1 : 0
    }, 0)

    return [username, noAssigned]
  })

  const [username] = noAssigned.reduce(
    ([previousUsername, previousAssigned], [nextLogin, nextAssigned]) => {
      if (previousAssigned < nextAssigned) {
        return [previousUsername, previousAssigned]
      }

      return [nextLogin, nextAssigned]
    }
  )

  return coreTeamTriageUsernamesToIds[username]
}

export const addAssigneesToAssignableMutation = `
  mutation AddAssigneesToAssignableMutation($assignableId: ID!, $assigneeIds: [ID!]!) {
    addAssigneesToAssignable(
      input: { assignableId: $assignableId, assigneeIds: $assigneeIds }
    ) {
      clientMutationId
    }
  }
`

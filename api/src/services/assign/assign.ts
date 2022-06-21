import {
  octokit,
  coreTeamMaintainers,
  coreTeamMaintainersUsernamesToIds,
  coreTeamTriage,
} from 'src/lib/github'
import type { CoreTeamMaintainers } from 'src/lib/github'
import { getProjectItems } from 'src/services/projects'

export async function assign(
  assignableId: string,
  {
    to,
  }: {
    to: 'Core Team/Triage' | CoreTeamMaintainers
  }
) {
  if (to !== 'Core Team/Triage' && !coreTeamMaintainers.includes(to)) {
    throw new Error(`Can't assign to ${to}`)
  }

  if (to === 'Core Team/Triage') {
    to = await getNextTriageTeamMember()
  }

  const assigneeId = coreTeamMaintainersUsernamesToIds[to]

  return octokit.graphql(addAssigneesToAssignableMutation, {
    assignableId,
    assigneeIds: [assigneeId],
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

  return username
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

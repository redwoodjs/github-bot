import { octokit } from 'src/lib/github'

export async function getRepositoryId({
  owner,
  name,
}: {
  owner: string
  name: string
}) {
  const {
    repository: { id },
  } = await octokit.graphql<{ repository: { id: string } }>(QUERY, {
    owner,
    name,
  })

  return id
}

export const QUERY = `
  query GetRepositoryId($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      id
    }
  }
`

export function getRedwoodJSRepositoryId(name: string) {
  return getRepositoryId({ owner: 'redwoodjs', name })
}

/**
 * get vars
 */
export const GET_PROJECT_NEXT_TITLES_AND_IDS = `
  query getProjectsNextTitlesAndIds($login: String!) {
    organization(login: $login) {
      projectsNext(first: 100) {
        nodes {
          title
          id
        }
      }
    }
  }
`

export type GetProjectNextTitlesAndIdsRes = {
  organization: {
    projectsNext: { nodes: Array<{ title: string; id: string }> }
  }
}

export const GET_PROJECT_NEXT_FIELDS = `
  query getProjectNextFields($projectId: ID!) {
    node(id: $projectId) {
      ... on ProjectNext {
        fields(first: 100) {
          nodes {
            name
            id
            settings
          }
        }
      }
    }
  }
`

export type GetProjectNextFieldsRes = {
  node: {
    fields: { nodes: Array<{ name: string; id: string; settings: string }> }
  }
}

function getProjectNextFields(projectId: string) {
  return octokit.graphql<GetProjectNextFieldsRes>(GET_PROJECT_NEXT_FIELDS, {
    projectId,
  })
}

export const GET_LABEL_IDS = `
  query getLabelIds($login: String!, $name: String!) {
    repository(owner: $login, name: $name) {
      labels(first: 100) {
        nodes {
          name
          id
        }
      }
    }
  }
`

export type GetLabelIdsRes = {
  repository: { labels: { nodes: Array<{ name: string; id: string }> } }
}

export const GET_MILESTONE_IDS = `
  query getMilestoneIds($login: String!, $name: String!) {
    repository(owner: $login, name: $name) {
      milestones(first: 100) {
        nodes {
          title
          id
        }
      }
    }
  }
`

export type GetMilestoneIdsRes = {
  repository: { milestones: { nodes: Array<{ title: string; id: string }> } }
}

export async function getIds({ owner, name }: { owner: string; name: string }) {
  /**
   * project ids
   */
  const { organization } = await octokit.graphql<GetProjectNextTitlesAndIdsRes>(
    GET_PROJECT_NEXT_TITLES_AND_IDS,
    {
      login: owner,
    }
  )

  const [RELEASE_PROJECT_ID, TRIAGE_PROJECT_ID] = ['Release', 'Triage'].map(
    (title) => {
      const { id } = organization.projectsNext.nodes.find(
        (projectNext) => projectNext.title === title
      )
      return id
    }
  )

  /**
   * release field and value ids
   */
  const { node: releaseNode } = await getProjectNextFields(RELEASE_PROJECT_ID)

  let releaseSettings

  const { id: RELEASE_STATUS_FIELD_ID } = releaseNode.fields.nodes.find(
    (field) => {
      if (field.name === 'Status') {
        releaseSettings = field.settings
        return true
      }
    }
  )

  const [IN_PROGRESS_STATUS_FIELD_ID, NEW_PRS_STATUS_FIELD_ID] = [
    'In progress',
    'New PRs',
  ].map((name) => {
    const { id } = JSON.parse(releaseSettings).options.find(
      (option: { id: string; name: string }) => option.name === name
    )
    return id
  })

  /**
   * triage field and value ids
   */
  const { node: triageNode } = await getProjectNextFields(TRIAGE_PROJECT_ID)

  let triageSettings

  const { id: TRIAGE_STATUS_FIELD_ID } = triageNode.fields.nodes.find(
    (field) => {
      if (field.name === 'Status') {
        triageSettings = field.settings
        return true
      }
    }
  )

  const [NEEDS_TRIAGE_STATUS_FIELD_ID, NEEDS_DISCUSSION_STATUS_FIELD_ID] = [
    'Needs triage',
    'Needs discussion',
  ].map((name) => {
    const { id } = JSON.parse(triageSettings).options.find(
      (option: { id: string; name: string }) => option.name === name
    )
    return id
  })

  const { id: TRIAGE_PRIORITY_FIELD_ID } = triageNode.fields.nodes.find(
    (field) => {
      if (field.name === 'Priority') {
        triageSettings = field.settings
        return true
      }
    }
  )

  const { id: TP1_PRIORITY_FIELD_ID } = JSON.parse(triageSettings).options.find(
    (option: { id: string; name: string }) => option.name === 'TP1'
  )

  /**
   * label ids
   */
  const {
    repository: { labels },
  } = await octokit.graphql<GetLabelIdsRes>(GET_LABEL_IDS, {
    login: owner,
    name,
  })

  const [ADD_TO_RELEASE_LABEL_ID, ADD_TO_CTM_DISCUSSION_QUEUE_LABEL_ID] = [
    'action/add-to-release',
    'action/add-to-ctm-discussion-queue',
  ].map((name) => {
    const { id } = labels.nodes.find((label) => label.name === name)
    return id
  })

  /**
   * milestone id
   */
  const {
    repository: { milestones },
  } = await octokit.graphql<GetMilestoneIdsRes>(GET_MILESTONE_IDS, {
    login: owner,
    name,
  })

  const [NEXT_RELEASE_MILESTONE_ID, CHORE_MILESTONE_ID] = [
    'next-release',
    'chore',
  ].map((title) => {
    const { id } = milestones.nodes.find(
      (milestone) => milestone.title === title
    )
    return id
  })

  return {
    // projects
    RELEASE_PROJECT_ID,
    TRIAGE_PROJECT_ID,
    // release
    RELEASE_STATUS_FIELD_ID,
    IN_PROGRESS_STATUS_FIELD_ID,
    NEW_PRS_STATUS_FIELD_ID,
    // triage
    TRIAGE_STATUS_FIELD_ID,
    NEEDS_TRIAGE_STATUS_FIELD_ID,
    NEEDS_DISCUSSION_STATUS_FIELD_ID,
    TRIAGE_PRIORITY_FIELD_ID,
    TP1_PRIORITY_FIELD_ID,
    // labels
    ADD_TO_RELEASE_LABEL_ID,
    ADD_TO_CTM_DISCUSSION_QUEUE_LABEL_ID,
    // milestones
    NEXT_RELEASE_MILESTONE_ID,
    CHORE_MILESTONE_ID,
  }
}

export async function addIdsToProcessEnv({
  owner,
  name,
}: {
  owner: string
  name: string
}) {
  const ids = await getIds({ owner, name })
  Object.entries(ids).forEach(([key, value]) => (process.env[key] = value))
}

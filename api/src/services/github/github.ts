import { octokit } from 'src/lib/github'

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

export async function getIds({ owner, name }: { owner: string; name: string }) {
  const [PROJECT_ID] = await getProjectIds(owner, ['Main'])

  const { node } = await getProjectNextFields(PROJECT_ID)

  // ------------------------

  let statusSettings

  const { id: STATUS_FIELD_ID } = node.fields.nodes.find((field) => {
    if (field.name === 'Status') {
      statusSettings = field.settings
      return true
    }
  })

  const [
    TRIAGE_STATUS_FIELD_ID,
    BACKLOG_STATUS_FIELD_ID,
    TODO_STATUS_FIELD_ID,
    IN_PROGRESS_STATUS_FIELD_ID,
    DONE_STATUS_FIELD_ID,
    ARCHIVED_STATUS_FIELD_ID,
  ] = ['Triage', 'Backlog', 'Todo', 'In Progress', 'Done', 'Archived'].map(
    (name) => {
      const { id } = JSON.parse(statusSettings).options.find(
        (option: { id: string; name: string }) => option.name === name
      )
      return id
    }
  )

  // ------------------------

  let cycleSettings

  const { id: CYCLE_FIELD_ID } = node.fields.nodes.find((field) => {
    if (field.name === 'Cycle') {
      cycleSettings = field.settings
      return true
    }
  })

  const [{ id: CURRENT_CYCLE_FIELD_ID }] =
    JSON.parse(cycleSettings).configuration.iterations

  // ------------------------

  let staleSettings

  const { id: STALE_FIELD_ID } = node.fields.nodes.find((field) => {
    if (field.name === 'Stale') {
      staleSettings = field.settings
      return true
    }
  })

  const [{ id: CHECK_STALE_FIELD_ID }] = JSON.parse(staleSettings).options

  // ------------------------

  let needsDiscussion

  const { id: NEEDS_DISCUSSION_FIELD_ID } = node.fields.nodes.find((field) => {
    if (field.name === 'Needs discussion') {
      needsDiscussion = field.settings
      return true
    }
  })

  const [{ id: CHECK_NEEDS_DISCUSSION_FIELD_ID }] =
    JSON.parse(needsDiscussion).options

  // ------------------------

  let prioritySettings

  const { id: PRIORITY_FIELD_ID } = node.fields.nodes.find((field) => {
    if (field.name === 'Priority') {
      prioritySettings = field.settings
      return true
    }
  })

  const [
    URGENT_PRIORITY_FIELD_ID,
    HIGH_PRIORITY_FIELD_ID,
    MEDIUM_PRIORITY_FIELD_ID,
    LOW_PRIORITY_FIELD_ID,
  ] = ['🚨 Urgent', '1️⃣ High', '2️⃣ Medium', '3️⃣ Low'].map((name) => {
    const { id } = JSON.parse(prioritySettings).options.find(
      (option: { id: string; name: string }) => option.name === name
    )
    return id
  })

  // ------------------------

  const [
    ADD_TO_CYCLE_LABEL_ID,
    ADD_TO_DISCUSSION_QUEUE_LABEL_ID,
    ADD_TO_BACKLOG_LABEL_ID,
  ] = await getLabelIds(owner, name, [
    'action/add-to-cycle',
    'action/add-to-discussion-queue',
    'action/add-to-backlog',
  ])

  const [NEXT_RELEASE_MILESTONE_ID, CHORE_MILESTONE_ID] = await getMilestoneIds(
    owner,
    name,
    ['next-release', 'chore']
  )

  return {
    // projects
    PROJECT_ID,
    // status
    STATUS_FIELD_ID,
    TRIAGE_STATUS_FIELD_ID,
    BACKLOG_STATUS_FIELD_ID,
    TODO_STATUS_FIELD_ID,
    IN_PROGRESS_STATUS_FIELD_ID,
    DONE_STATUS_FIELD_ID,
    ARCHIVED_STATUS_FIELD_ID,
    // cycle
    CYCLE_FIELD_ID,
    CURRENT_CYCLE_FIELD_ID,
    // stale
    STALE_FIELD_ID,
    CHECK_STALE_FIELD_ID,
    // needs discussion
    NEEDS_DISCUSSION_FIELD_ID,
    CHECK_NEEDS_DISCUSSION_FIELD_ID,
    // priority
    PRIORITY_FIELD_ID,
    URGENT_PRIORITY_FIELD_ID,
    HIGH_PRIORITY_FIELD_ID,
    MEDIUM_PRIORITY_FIELD_ID,
    LOW_PRIORITY_FIELD_ID,
    // labels
    ADD_TO_CYCLE_LABEL_ID,
    ADD_TO_DISCUSSION_QUEUE_LABEL_ID,
    ADD_TO_BACKLOG_LABEL_ID,
    // milestones
    NEXT_RELEASE_MILESTONE_ID,
    CHORE_MILESTONE_ID,
  }
}

// ------------------------

async function getProjectIds(owner: string, projectTitles: string[]) {
  const { organization } = await octokit.graphql<GetProjectNextTitlesAndIdsRes>(
    GET_PROJECT_NEXT_TITLES_AND_IDS,
    {
      login: owner,
    }
  )

  return projectTitles.map((title) => {
    const { id } = organization.projectsNext.nodes.find(
      (projectNext) => projectNext.title === title
    )
    return id
  })
}

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

// ------------------------

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

// ------------------------

async function getLabelIds(owner: string, name: string, labelTitles: string[]) {
  const {
    repository: { labels },
  } = await octokit.graphql<GetLabelIdsRes>(GET_LABEL_IDS, {
    login: owner,
    name,
  })

  return labelTitles.map((name) => {
    const { id } = labels.nodes.find((label) => label.name === name)
    return id
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

// ------------------------

async function getMilestoneIds(
  owner: string,
  name: string,
  milestoneTitles: string[]
) {
  const {
    repository: { milestones },
  } = await octokit.graphql<GetMilestoneIdsRes>(GET_MILESTONE_IDS, {
    login: owner,
    name,
  })

  return milestoneTitles.map((title) => {
    const { id } = milestones.nodes.find(
      (milestone) => milestone.title === title
    )
    return id
  })
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

// ------------------------

export async function getRepositoryId({
  owner,
  name,
}: {
  owner: string
  name: string
}) {
  const {
    repository: { id },
  } = await octokit.graphql<{ repository: { id: string } }>(GET_REPOSITORY_ID, {
    owner,
    name,
  })

  return id
}

export const GET_REPOSITORY_ID = `
  query GetRepositoryId($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      id
    }
  }
`

export function getRedwoodJSRepositoryId(name: string) {
  return getRepositoryId({ owner: 'redwoodjs', name })
}

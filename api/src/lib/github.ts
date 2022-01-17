import fs from 'fs'
import path from 'path'

import { App, Octokit } from 'octokit'
import SmeeClient from 'smee-client'

export const app = new App({
  appId: process.env.GITHUB_APP_ID,
  privateKey: fs.readFileSync(
    path.resolve(__dirname, '../../../private-key.pem'),
    'utf-8'
  ),
})

export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})

/**
 * This is the preferred strategy,
 * but it isn't viable till GitHub allows apps to access projects beta.
 */
// let redwoodInstallation

// const full_name =
//   process.env.NODE_ENV === 'development'
//     ? process.env.DEV_REPO
//     : 'redwoodjs/redwood'

// export async function getRedwoodInstallation() {
//   if (redwoodInstallation) {
//     return redwoodInstallation
//   }

//   for await (const { octokit, repository } of app.eachRepository.iterator()) {
//     if (repository.full_name === full_name) {
//       redwoodInstallation = {
//         octokit,
//         repository,
//       }
//       return redwoodInstallation
//     }
//   }
// }

/**
 * For routing webhooks to localhost in local dev.
 */
export const startSmeeClient = () => {
  const smee = new SmeeClient({
    source: 'https://smee.io/AyeWlHVe8FLb25OU',
    target: 'http://localhost:8911/github',
    logger: console,
  })

  const events = smee.start()

  process.on('exit', () => {
    events.close()
  })
}

export const coreTeamTriage = {
  callingmedic911: {
    id: 'MDQ6VXNlcjI2Mjk5MDI',
  },
  jtoar: {
    id: 'MDQ6VXNlcjMyOTkyMzM1',
  },
  simoncrypta: {
    id: 'MDQ6VXNlcjE4MDEzNTMy',
  },
}

export const coreTeamTriageLogins = Object.keys(coreTeamTriage)

export const coreTeamMaintainers = {
  cannikin: {
    id: 'MDQ6VXNlcjMwMA==',
  },
  dac09: {
    id: 'MDQ6VXNlcjE1MjE4Nzc=',
  },
  dthyresson: {
    id: 'MDQ6VXNlcjEwNTE2MzM=',
  },
  mojombo: {
    id: 'MDQ6VXNlcjE=',
  },
  peterp: {
    id: 'MDQ6VXNlcjQ0ODQ5',
  },
  thedavidprice: {
    id: 'MDQ6VXNlcjI5NTE=',
  },
  Tobbe: {
    id: 'MDQ6VXNlcjMwNzkz',
  },
  ...coreTeamTriage,
}

export const coreTeamMaintainerLogins = Object.keys(coreTeamMaintainers)

export async function getIds() {
  const login =
    process.env.NODE_ENV === 'development' ? process.env.DEV_LOGIN : 'redwoodjs'

  /**
   * RELEASE_PROJECT_ID
   * TRIAGE_PROJECT_ID
   */
  const { organization } = await octokit.graphql<{
    organization: { projectsNext: { nodes: [{ title: string; id: string }] } }
  }>(
    `
      query getProjectsNextIds($login: String!) {
        organization(login: $login) {
          projectsNext(first: 100) {
            nodes {
              title
              id
            }
          }
        }
      }
    `,
    {
      login,
    }
  )

  const { id: RELEASE_PROJECT_ID } = organization.projectsNext.nodes.find(
    (projectNext) => projectNext.title === 'Release'
  )

  const { id: TRIAGE_PROJECT_ID } = organization.projectsNext.nodes.find(
    (projectNext) => projectNext.title === 'Triage'
  )

  /**
   * RELEASE_STATUS_FIELD_ID
   * IN_PROGRESS_STATUS_FIELD_ID
   * NEW_PRS_STATUS_FIELD_ID
   */
  const { node: releaseNode } = await octokit.graphql<{
    node: {
      fields: { nodes: [{ name: string; id: string; settings: string }] }
    }
  }>(
    `
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
    `,
    {
      projectId: RELEASE_PROJECT_ID,
    }
  )

  let releaseSettings

  const { id: RELEASE_STATUS_FIELD_ID } = releaseNode.fields.nodes.find(
    (field) => {
      if (field.name === 'Status') {
        releaseSettings = field.settings
        return true
      }
    }
  )

  const { id: IN_PROGRESS_STATUS_FIELD_ID } = JSON.parse(
    releaseSettings
  ).options.find(
    (option: { id: string; name: string }) => option.name === 'In progress'
  )

  const { id: NEW_PRS_STATUS_FIELD_ID } = JSON.parse(
    releaseSettings
  ).options.find(
    (option: { id: string; name: string }) => option.name === 'New PRs'
  )

  /**
   * TRIAGE_STATUS_FIELD_ID
   * TRIAGE_PRIORITY_FIELD_ID
   * NEEDS_TRIAGE_STATUS_FIELD_ID
   * NEEDS_DISCUSSION_STATUS_FIELD_ID
   * TP1_PRIORITY_FIELD_ID
   */
  const { node: triageNode } = await octokit.graphql<{
    node: {
      fields: { nodes: [{ name: string; id: string; settings: string }] }
    }
  }>(
    `
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
    `,
    {
      projectId: TRIAGE_PROJECT_ID,
    }
  )

  let triageSettings

  const { id: TRIAGE_STATUS_FIELD_ID } = triageNode.fields.nodes.find(
    (field) => {
      if (field.name === 'Status') {
        triageSettings = field.settings
        return true
      }
    }
  )

  const { id: NEEDS_TRIAGE_STATUS_FIELD_ID } = JSON.parse(
    triageSettings
  ).options.find(
    (option: { id: string; name: string }) => option.name === 'Needs triage'
  )

  const { id: NEEDS_DISCUSSION_STATUS_FIELD_ID } = JSON.parse(
    triageSettings
  ).options.find(
    (option: { id: string; name: string }) => option.name === 'Needs discussion'
  )

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
   * ADD_TO_RELEASE_LABEL_ID
   */
  const repo =
    process.env.NODE_ENV === 'development' ? process.env.DEV_REPO : 'redwood'

  const { repository } = await octokit.graphql<{
    repository: { labels: { nodes: [{ name: string; id: string }] } }
  }>(
    `
      query getLabelIds($login: String!, $repo: String!) {
        repository(owner: $login, name: $repo) {
          labels(first: 100) {
            nodes {
              name
              id
            }
          }
        }
      }
    `,
    {
      login,
      repo,
    }
  )

  const { id: ADD_TO_RELEASE_LABEL_ID } = repository.labels.nodes.find(
    (label) => label.name === 'action/add-to-release'
  )

  const { id: ADD_TO_CTM_DISCUSSION_QUEUE_LABEL_ID } =
    repository.labels.nodes.find(
      (label) => label.name === 'action/add-to-ctm-discussion-queue'
    )

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
  }
}

export async function addIdsToProcessEnv() {
  const ids = await getIds()
  Object.entries(ids).forEach(([key, value]) => (process.env[key] = value))
}

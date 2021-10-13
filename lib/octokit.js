const { cache, makeKey } = require('./cache')

const milestonesQuery = `
  query ($owner: String!, $repo: String! $title: String!) {
    repository(owner: $owner, name: $repo) {
      milestones(states: OPEN, query: $title, first: 10) {
        nodes {
          title
          id
        }
      }
    }
  }
`

const getMilestoneId = ({ title }) => async (context) => {
  const { owner, repo } = context.repo()

  const key = makeKey({ owner, repo, resource: title })

  if (cache.has(key)) {
    return cache.get(key)
  } 

  const { 
    repository: { milestones } 
  } = await context.octokit.graphql(milestonesQuery, { owner, repo, title })

  const milestone = milestones.nodes.find((milestone) => milestone.title === title)

  cache.set(key, milestone.id)

  return milestone.id
}

// ------------------------ 

const projectColumnQuery = `
  query ($owner: String!, $repo: String! $name: String!) {
    repository(owner: $owner, name: $repo) {
      projects(search: $name, first: 10) {
        nodes {
          name
          columns(first: 10) {
            nodes {
              name
              id
            }
          }
        }
      }
    }
  }
`

const getProjectColumnId = ({ projectName, columnName }) => async (context) => {
  const { owner, repo } = context.repo()

  const key = makeKey({ owner, repo, resource: [projectName, columnName].join(':') })
  
  if (cache.has(key)) {
    return cache.get(key)
  }

  const { 
    repository: { projects } 
  } = await context.octokit.graphql(projectColumnQuery, {
    owner,
    repo,
    name: projectName
  })

  const project = projects.nodes.find((project) => project.name === projectName)
  const column = project.columns.nodes.find((column) => column.name === columnName)

  cache.set(key, column.id)

  return column.id
}

// ---

const projectNextIdQuery = `
  {
    organization(login: "redwoodjs") {
      projectNext(number: 4) {
        id
      }
    }
  }
`

const getProjectNextId = async (context) => {
  const { owner, repo } = context.repo()

  const key = makeKey({ owner, repo, resource: ['projectNextId'].join(':') })
  
  if (cache.has(key)) {
    return cache.get(key)
  }

  const { 
    organization: { projectNext } 
  } = await context.octokit.graphql(projectNextIdQuery, {
    headers: {
      'GraphQL-Features': 'projects_next_graphql'
    }
  })

  cache.set(key, projectNext.id)

  return projectNext.id
}

const projectNextFieldQuery = `
  query ($projectId: ID!) {
    node(id: $projectId) {
      ... on ProjectNext {
        fields(first: 10) {
          nodes {
            id
            name
          }
        }
      }
    }
  }
`

const getProjectNextFieldId = ({ projectId }) => async (context) => {
  const { owner, repo } = context.repo()

  const fieldName = "Status"

  const key = makeKey({ owner, repo, resource: [projectNextId, fieldName].join(':') })
  
  if (cache.has(key)) {
    return cache.get(key)
  }

  const { 
    organization: { projectNext } 
  } = await context.octokit.graphql(projectNextFieldQuery, { 
    projectId, 
    headers: {
      'GraphQL-Features': 'projects_next_graphql'
    }
   })

  const statusField = projectNext.fields.nodes.find((field) => field.name === fieldName)

  cache.set(key, statusField.id)

  return stausField.id
}

//------------------------ 

const projectCardQuery = `
  query ($id: ID!) {
    node(id: $id) {
      ... on Issue {
        projectCards(first: 10) {
          nodes {
            id
          }
        }
      }
      ... on PullRequest {
        projectCards(first: 10) {
          nodes {
            id
          }
        }
      }
    }
  }
`

const getProjectCardId = ({ id }) => async (context) => {
  const data = await context.octokit.graphql(projectCardQuery, { id })
  return data.node.projectCards.nodes[0]?.id
}

//------------------------ 

module.exports = {
  getMilestoneId,
  getProjectCardId,
  getProjectColumnId,
  getProjectNextId,
  getProjectNextFieldId
}
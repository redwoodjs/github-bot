/**
 * This is the main entrypoint
 * @param {import('probot').Probot} app
 */
module.exports = (app) => {
  // on pr closed
  // -> merged? -> add "next-release" milestone
  // -> closed? -> remove milestone
  app.on("pull_request.closed", changeMilestone)

  // on issue|pr opened
  // -> add to Current-Release-Sprint, New issues 
  app.on(["issues.opened", "pull_request.opened"], addToProjectColumn)

  // on future-release
  // -> On deck
  // on next-release-priority
  // -> In progress
  app.on("issues.milestoned", addToProjectMilestoneColumn)

  // on demilestoned
  // -> if it's on the board, take it off
  app.on('issues.demilestoned', removeFromProject)
}

// ------------------------ 

const fileName = 'config.yml'

const defaultConfig = {
  projectName: 'Current-Release-Sprint',
  newIssuesColumn: 'New issues',
  mergedMilestone: 'next-release',
  milestoneToColumn: {
    'future-release': 'On deck (help-wanted)',
    'next-release-priority': 'In progress (priority)',
  }
}

// we use the same update function,
// just passing an actualy milestone number or null
// for merged or closed respectively
const changeMilestone = async (context) => {
  const { pull_number, ...params } = context.pullRequest()

  let milestoneNumber = null

  if (context.payload.pull_request.merged) {
    const milestones = await context.octokit.issues.listMilestones(params)
    config = await context.config(fileName, defaultConfig)
    const milestone = milestones.data.find((milestone) => milestone.title === config.mergedMilestone)
    milestoneNumber = milestone.number
  }

  return context.octokit.issues.update({
    ...params,
    issue_number: pull_number,
    milestone: milestoneNumber
  })
}

// definitely feels like there's a better way to do this.
// namely, content_type--it's pretty annoying
const addToProjectColumn = async (context) => {
  config = await context.config(fileName, defaultConfig)

  const column_id = await getProjectColumnId({ 
    projectName: config.projectName, 
    columnName: config.newIssuesColumn
  })(context)

  // an example of content type
  // https://github.com/probot/probot/issues/931#issuecomment-489813390

  switch (context.name) {
    case 'issues':
      return context.octokit.projects.createCard({
        column_id,
        content_type: 'Issue',
        content_id: context.payload.issue.id,
      })

    case 'pull_request':
      return context.octokit.projects.createCard({
        column_id,
        content_type: 'PullRequest',
        content_id: context.payload.pull_request.id,
      })
  }
}

const addToProjectMilestoneColumn = async (context) => {
  const milestone = context.payload.issue.milestone.title
  const config = await context.config(fileName, defaultConfig)

  if (milestone in config.milestoneToColumn) {
    const card_id = await getProjectCardDatabaseId(context)

    const column_id = await getProjectColumnId({ 
      projectName: config.projectName, 
      columnName: config.milestoneToColumn[milestone] 
    })(context)

    // if it's on the board -> move it
    if (card_id) {
      return context.octokit.projects.moveCard({
        card_id, 
        column_id,
        position: 'bottom'
      })
    } 

    // if it's not on the board -> put it on the board
    return context.octokit.projects.createCard({
      column_id,
      content_type: 'Issue',
      content_id: context.payload.issue.id,
    })
  }
}

const removeFromProject = async (context) => {
  // this check's here b/c, if we change the milestone, 
  // e.g. future-release -> next-release-priority
  // github still sends a "demilestoned" event, even though we only changed the milestone.
  // if the milestone truly was removed, this property === null
  if (!context.payload.issue.milestone) {
    const card_id = await getProjectCardDatabaseId(context)
    if (card_id) {
      return context.octokit.projects.deleteCard({ card_id })
    }
  }
}

// ------------------------ 

const getProjectColumnId = ({ projectName, columnName }) => async (context) => {
  const params = context.repo()

  const projects = await context.octokit.projects.listForRepo(params)
  const project = projects.data.find((project) => project.name === projectName)

  const columns = await context.octokit.projects.listColumns({
    ...params,
    project_id: project.id
  })
  const column = columns.data.find((column) => column.name === columnName)

  return column.id
}

const getProjectCardDatabaseId = async (context) => {
  const data = await context.octokit.graphql(
    `
      query ($id: ID!) {
        node(id: $id) {
          ... on Issue {
            projectCards(first: 100) {
              nodes {
                databaseId
              }
            }
          }
          ... on PullRequest {
            projectCards(first: 100) {
              nodes {
                databaseId
              }
            }
          }
        }
      }
    `,
    {
      id: context.payload.issue.node_id
    }
    )

  return data.node.projectCards.nodes[0]?.databaseId
}

const { getMilestoneId, getProjectColumnId, getProjectCardId } = require('./lib/octokit')
const { fileName, defaultConfig } = require('./lib/config')

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

// change milestone
// ------------------------ 

const updatePRMilestoneMutation = `
  mutation ($pullRequestId: ID!, $milestoneId: ID) {
    updatePullRequest(input: { 
      pullRequestId: $pullRequestId,
      milestoneId: $milestoneId
    }) {
      clientMutationId
    }
  }
`

// we use the same update function,
// just passing an actual milestone number or null
// for merged or closed respectively
const changeMilestone = async (context) => {
  let milestoneId = null

  if (context.payload.pull_request.merged) {
    const config = await context.config(fileName, defaultConfig)
    milestoneId = await getMilestoneId({ title: config.mergedMilestone })(context)
  }

  return context.octokit.graphql(updatePRMilestoneMutation, {
    pullRequestId: context.payload.pull_request.node_id,
    milestoneId,
  })
}

// ------------------------ 

const addProjectCardMutation = `
  mutation ($projectColumnId: ID!, $contentId: ID!) {
    addProjectCard(input: {
      projectColumnId: $projectColumnId, 
      contentId: $contentId
    }) {
      clientMutationId
    }
  }
`

const addToProjectColumn = async (context) => {
  const config = await context.config(fileName, defaultConfig)

  const projectColumnId = await getProjectColumnId({ 
    projectName: config.projectName, 
    columnName: config.newIssuesColumn
  })(context)

  return context.octokit.graphql(addProjectCardMutation, {
    projectColumnId,
    contentId: context.payload[context.name === 'pull_request' ? 'pull_request': 'issue'].node_id
  })
}

// ------------------------ 

const moveProjectCardMutation = `
  mutation ($cardId: ID!, $columnId: ID!) {
    moveProjectCard(input: {
      cardId: $cardId, 
      columnId: $columnId
    }) {
      clientMutationId
    }
  }
`

const addToProjectMilestoneColumn = async (context) => {
  const milestone = context.payload.issue.milestone.title
  const config = await context.config(fileName, defaultConfig)

  if (milestone in config.milestoneToColumn) {
    // it's a milestone we can handle
    // - get the card id
    // - get the column id

    const cardId = await getProjectCardId({ id: context.payload.issue.node_id  })(context)

    const columnId = await getProjectColumnId({ 
      projectName: config.projectName, 
      columnName: config.milestoneToColumn[milestone] 
    })(context)

    // - if it's on the board -> move it
    // - if it's not on the board -> put it on the board

    if (cardId) {
      return context.octokit.graphql(moveProjectCardMutation, { cardId, columnId })
    } 

    return context.octokit.graphql(addProjectCardMutation, {
      projectColumnId: columnId,
      contentId: context.payload.issue.node_id,
    })
  }
}

// ------------------------ 

const removeProjectCardMutation = `
  mutation ($cardId: ID!) {
    deleteProjectCard(input: { 
      cardId: $cardId 
    }) {
      clientMutationId
    }
  }
`

const removeFromProject = async (context) => {
  // this check's here b/c, if we change the milestone, 
  // e.g. future-release -> next-release-priority
  // github still sends a "demilestoned" event, even though we only changed the milestone.
  // if the milestone truly was removed, this property === null
  if (!context.payload.issue.milestone) {
    const cardId = await getProjectCardId({ id: context.payload.issue.node_id })(context)
    if (cardId) {
      return context.octokit.graphql(removeProjectCardMutation, { cardId })
    }
  }
}
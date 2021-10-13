const { getMilestoneId, getProjectColumnId, getProjectCardId, getProjectNextId, getProjectNextFieldId } = require('./lib/octokit')
const { fileName, defaultConfig } = require('./lib/config')
const { postSlackMessage } = require('./lib/slack')

/**
 * This is the main entrypoint
 * @param {import('probot').Probot} app
 */
module.exports = (app) => {
  // on pr closed
  // -> merged? -> add "next-release" milestone
  // -> closed? -> remove milestone
  app.on("pull_request.closed", withPostSlackMessage(changeMilestone))

  // on issue|pr opened
  // -> add to Current-Release-Sprint, New issues 
  app.on(["issues.opened", "pull_request.opened"], withPostSlackMessage(addToProjectColumn))
  app.on(["pull_request.opened"], withPostSlackMessage(addToProjectNext))

  // on future-release
  // -> On deck
  // on next-release-priority
  // -> In progress
  app.on("issues.milestoned", withPostSlackMessage(addToProjectMilestoneColumn))

  // on demilestoned
  // -> if it's on the board, take it off
  app.on('issues.demilestoned', withPostSlackMessage(removeFromProject))
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
    // if it has a milestone that starts with a 'v', e.g., 'v0.34.0' -> leave it be
    const hasVersionMilestone = (
      context.payload.pull_request.milestone && context.payload.pull_request.milestone.title.startsWith('v')
    )

    if (hasVersionMilestone) {
      return
    }

    const config = await context.config(fileName, defaultConfig)
    milestoneId = await getMilestoneId({ title: config.mergedMilestone })(context)
  }

  return context.octokit.graphql(updatePRMilestoneMutation, {
    pullRequestId: context.payload.pull_request.node_id,
    milestoneId,
  })
}

// add to project column 
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

// ---

const addToProjectNext = async (context) => {
  const projectId = await getProjectNextId(context)
  const fieldId = await getProjectNextFieldId({ projectId })(context)

  const itemId = await context.octokit.graphql(addProjectNextItemMutation, {
    projectId,
    contentId: context.payload[context.name === 'pull_request' ? 'pull_request': 'issue'].node_id,
    headers: {
      'GraphQL-Features': 'projects_next_graphql'
    }
  })

  return context.octokit.graphql(setProjectNextFieldMutation, { 
    projectId, 
    itemId, 
    fieldId,
    headers: {
      'GraphQL-Features': 'projects_next_graphql'
    }
  })
}

const addProjectNextItemMutation = `
  mutation ($projectId: ID!, $contentId: ID!) {
    addProjectNextItem(input: {projectId: $projectId, contentId: $contentId}) {
      projectNextItem {
        id
      }
    }
  }
`

const setProjectNextFieldMutation = `
  mutation ($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
    updateProjectNextItemField(input: {projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: "New issues"}) {
      projectNextItem {
        id
      }
    }
  }
`

// add to project milestone column 
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

// remove from project 
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

// some middleware for posting to slack
// ------------------------ 

const postSlackMessage_ = (text) => postSlackMessage({ 
  blocks: [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text,
        }
      }
    ]
  })

const withPostSlackMessage = (fn) => async (context) => {
  const res = context.payload[context.name === 'pull_request' ? 'pull_request': 'issue']

  try {
    await fn(context)
  } catch(e) {
    await postSlackMessage_(
      `:x: ${fn.name} <${res.html_url}|#${res.number}>\`\`\`${e}\`\`\``
    )
  }

  await postSlackMessage_(
    `:white_check_mark: ${fn.name} <${res.html_url}|#${res.number}>`
    )
}

        
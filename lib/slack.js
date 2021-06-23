const fetch = require('node-fetch')

const postSlackMessage = async (body) => {
  try {
    const res = await fetch(process.env.SLACK_WEBHOOK_SECRET, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body)
    })
    return res
  } catch (e) {
    console.log(e)
  }
}

module.exports = {
  postSlackMessage
}